#!/usr/bin/env node
// The API reference's index: what the pages under /docs/api/ need beyond the
// recording itself.
//
// The surfaces are `records/api.json`, which `scripts/records.mjs` has already
// held to the release by the time this runs, and their tokens are the
// compiler's, out of `records/highlight.json`. Neither is touched here. This
// adds three things a page cannot read off a recording without parsing it,
// and parses them once, here, so every page and every index agrees:
//
// A ONE-SENTENCE SUMMARY per entry, quoted rather than written. A prelude
// type's is the first sentence of the doc comment `iyi doc` printed above it.
// A std module's is the first sentence of the comment its file opens with, at
// the tag, because `iyi doc` prints a module's declarations and not its
// header. An entry whose text has no such comment gets no summary, and the
// index says nothing for it rather than something of ours.
//
// AN ANCHOR PER DECLARATION, so a method can be linked to. Each type, impl,
// def, macro and alias line of a surface gets an id built from where it sits:
// `Set.add`, `Set.self.new`, `Eiy.Buffer.print`. The parse is by indentation,
// which is how `iyi doc` lays a surface out; it reads the printed text and
// never the language, so it cannot disagree with the compiler about what a
// declaration is, only about where to put a link.
//
// THE FILE AT THE TAG, for a std module, so a reader can go from the surface
// to the source in the release it describes.
//
// It fails rather than falling back: a surface the record does not hold, or a
// module file the tag does not have, stops the build by name.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CODE_SPAN, inline } from "./markdown.mjs";
import { blobAt, releaseRef } from "./release-ref.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated", "api.json");

const die = (message) => {
  throw new Error(`api: ${message}`);
};

const record = JSON.parse(readFileSync(resolve(site, "records", "api.json"), "utf8"));
const release = releaseRef(repo);
if (record.recorded?.commit !== release.commit) {
  die(
    `records/api.json was recorded at ${String(record.recorded?.commit).slice(0, 9)} ` +
      `and ${release.tag} is ${release.commit.slice(0, 9)}. scripts/records.mjs ` +
      `refuses that record; run it first, and regenerate with npm run record:api.`,
  );
}

// `repo="iyilang/iyi"` in install.sh, at the tag: the slug the installer
// downloads from, read the way scripts/releases.mjs reads it.
const slug = (() => {
  const installer = blobAt(repo, release.tag, "install.sh");
  const line = installer?.toString("utf8").split("\n").find((row) => /^repo="/.test(row));
  if (!line) die(`install.sh at ${release.tag} has no repo="owner/name" line, which is where this script learns where to link.`);
  return /^repo="([^"]+)"/.exec(line)[1];
})();
const blob = `https://github.com/${slug}/blob/${release.tag}`;

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/** The comment a text opens with, `# ` stripped, up to its first line that is
 * not a comment. Empty where the text does not open on one. */
function leadingComment(text) {
  const lines = [];
  for (const line of text.split("\n")) {
    const match = /^#(?: (.*))?$/.exec(line);
    if (!match) break;
    lines.push(match[1] ?? "");
  }
  return lines;
}

/* The first paragraph of a comment, then its first sentence: a full stop,
 * question or exclamation mark followed by a space or the end. Code spans are
 * blanked first, keeping every offset, so the dot in `File.read` is not an
 * end; the same reading scripts/releases.mjs gives a changelog. */
function firstSentence(comment) {
  const paragraph = [];
  for (const line of comment) {
    if (line.trim() === "") {
      if (paragraph.length) break;
      continue;
    }
    // An indented line is an example, set as code in the comment, and a
    // summary does not run into one.
    if (/^\s{2,}/.test(line)) break;
    paragraph.push(line.trim());
  }
  // A run of box-drawing characters is a rule drawn across the comment,
  // `── Channel — III.4.6 ──`, which is decoration and not words. The words
  // between the rules are kept as written.
  const text = paragraph.join(" ").replace(/[\u2500-\u257f]+/g, "").trim();
  if (text === "") return null;
  const masked = text.replace(CODE_SPAN, (span) => "`" + "x".repeat(span.length - 2) + "`");
  const end = /[.!?](?:["')\]])*(?=\s|$)/.exec(masked);
  return end ? text.slice(0, end.index + end[0].length) : text;
}

/* A summary as HTML. A path the comment names, `src/iyi/object.iyi`, is a
 * path in the release, so a link in one goes to the tag. */
const render = (sentence) =>
  sentence === null
    ? null
    : inline(sentence, {
        link: (href) => (/^[a-z]+:/i.test(href) || href.startsWith("#") ? href : `${blob}/${href.replace(/^\.\//, "")}`),
      });

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

const MODIFIERS = String.raw`(?:(?:pub|private|protected|abstract)\s+)*`;
const CONTAINER = new RegExp(
  String.raw`^(\s*)${MODIFIERS}(class|struct|module|trait|enum|metaclass|function|tuple|lib|annotation)\s+(?:::)?([A-Z][\w:]*)`,
);
const IMPL = /^(\s*)impl\s+(.+?)\s+for\s+(.+?)(?:\s+forall\b.*)?\s*$/;
const MEMBER = new RegExp(String.raw`^(\s*)${MODIFIERS}(def|macro)\s+(self\.)?([^\s(]+?)(?=\(|\s|$)`);
const ALIAS = new RegExp(String.raw`^(\s*)${MODIFIERS}alias\s+([A-Z]\w*)`);

/**
 * Every declaration line of one surface, with the id it is linked by, and the
 * contents a page lists above it: each type or impl with its members, one link
 * per member name (an overload's later lines carry ids of their own, and the
 * contents link the first).
 */
function anchorsOf(text) {
  const anchors = {};
  const groups = [];
  const used = new Set();
  const stack = [];

  /* An id is written into an attribute and read back by scripts/links.mjs
   * from the raw HTML, so a character the HTML would escape, `&` in `Set.&`
   * or `<` in `<=>`, is spelled by its code instead: `Set._26`. Everything
   * else an operator uses is kept, and a link percent-encodes it. */
  const unique = (raw) => {
    const id = raw.replace(/[&<>"'%#\s]/g, (c) => `_${c.charCodeAt(0).toString(16)}`);
    let candidate = id;
    for (let n = 2; used.has(candidate); n += 1) candidate = `${id}-${n}`;
    used.add(candidate);
    return candidate;
  };

  const lines = text.replace(/\n$/, "").split("\n");
  lines.forEach((line, index) => {
    if (line.trim() === "" || /^\s*#/.test(line)) return;
    const indent = /^\s*/.exec(line)[0].length;
    // A line at or left of an open container's indentation is past its
    // members: its `end`, or the next declaration beside it.
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const owner = stack[stack.length - 1] ?? null;
    const within = (name) => (owner ? `${owner.id}.${name}` : name);

    const container = CONTAINER.exec(line);
    const impl = container ? null : IMPL.exec(line);
    if (container || impl) {
      const label = container ? container[3] : `impl ${impl[2]} for ${impl[3]}`;
      const id = unique(within(container ? container[3].replace(/::/g, ".") : label.replace(/\s+/g, "-")));
      anchors[index] = id;
      const group = { id, label: owner ? `${owner.label}::${label}` : label, members: [] };
      groups.push(group);
      stack.push({ indent, id, label: group.label, group });
      return;
    }

    const member = MEMBER.exec(line);
    const alias = member ? null : ALIAS.exec(line);
    if (!member && !alias) return;
    const name = member ? `${member[3] ?? ""}${member[4]}` : alias[2];
    const id = unique(within(name));
    anchors[index] = id;

    let group = owner?.group;
    if (!group) {
      // A def at the top of a module belongs to no type, and the contents
      // list it under the module's own functions.
      group = groups.find((entry) => entry.id === null);
      if (!group) {
        group = { id: null, label: null, members: [] };
        groups.unshift(group);
      }
    }
    if (!group.members.some((entry) => entry.label === name)) {
      group.members.push({ id, label: name });
    }
  });

  return { anchors, contents: groups, lines: lines.length };
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const entries = record.surfaces.map((surface) => {
  let summary = null;
  let source = null;
  if (surface.kind === "std") {
    const file = blobAt(repo, release.tag, surface.path);
    if (file === null) die(`records/api.json records ${surface.name} and ${release.tag} has no ${surface.path}.`);
    summary = firstSentence(leadingComment(file.toString("utf8")));
    source = `${blob}/${surface.path}`;
  } else if (surface.exitCode === 0) {
    summary = firstSentence(leadingComment(surface.stdout));
  }

  const surfaced = surface.exitCode === 0 ? anchorsOf(surface.stdout) : null;
  return {
    name: surface.name,
    slug: surface.slug,
    kind: surface.kind,
    path: surface.path ?? null,
    source,
    command: surface.command,
    exitCode: surface.exitCode,
    // The compiler's sentence, where it would not print a surface. The page
    // prints it in place of one.
    refusal: surface.exitCode === 0 ? null : surface.stderr,
    summary: render(summary),
    lines: surfaced?.lines ?? 0,
    anchors: surfaced?.anchors ?? {},
    contents: surfaced?.contents ?? [],
  };
});

const prelude = entries.filter((entry) => entry.kind === "prelude");
const std = entries.filter((entry) => entry.kind === "std");
if (prelude.length === 0 || std.length === 0) {
  die(`records/api.json holds ${prelude.length} prelude types and ${std.length} std modules; the reference needs both.`);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(
    {
      provenance: {
        generator: "scripts/api.mjs",
        record: "records/api.json",
        tag: release.tag,
        ...record.recorded,
      },
      prelude,
      std,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const summarised = entries.filter((entry) => entry.summary !== null).length;
const anchored = entries.reduce((sum, entry) => sum + Object.keys(entry.anchors).length, 0);
console.log(
  `api: ${prelude.length} prelude types and ${std.length} std modules, ` +
    `${summarised} with a summary, ${anchored} declarations anchored, at ${release.tag}`,
);
