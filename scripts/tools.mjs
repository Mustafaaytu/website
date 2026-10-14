#!/usr/bin/env node
// What the two working-with-iyi pages say: /docs/tools/ and /docs/from-crystal/.
//
// WHAT THEY ARE FOR. A reader who has just run the installer's hello has the
// whole toolchain in one binary and no page telling them what is in it: how a
// project starts, how it is tested, formatted, checked, fixed and documented,
// where a dependency comes from, and how an editor reaches the language. A
// reader arriving from Crystal has the README's table of what moved and two
// verbs, `iyi migrate` and `iyi bind`, that the site never mentioned.
//
// THE OBVIOUS WRONG FIX is a getting-started page written from memory. Every
// sentence on one is a claim about a command line, and a command line typed
// into a page drifts from the compiler the first time a flag is renamed. The
// site already deleted a tools section once (`git show da420cd`); a second one
// that restated the repository less exactly would deserve the same.
//
// So the pages are made of three things the iyi tree states, read out of the
// release CHANGELOG.md names, at its tag, with `git cat-file` - the same tree
// the install page tells a reader to download:
//
//   1. The help the compiler prints. `iyi help` is the USAGE heredoc in
//      `src/compiler/iyi.cr`, and each verb's own help is a heredoc in
//      `src/compiler/iyi/command/<verb>.cr` opening with its `Usage:` line.
//      They are read as source rather than recorded off a binary, because CI
//      has no compiler and a heredoc's text is the text it prints: the only
//      evaluation a heredoc does is dedent and interpolation, and this script
//      does exactly those two, refusing an interpolation it cannot resolve
//      rather than printing `#{...}` at a reader or guessing its value.
//   2. Passages of README.md, editors/README.md, editors/vim/README.md,
//      editors/vscode/README.md and SPEC.md, found by an anchor string that
//      has to sit in exactly one block of the file, and carried with the
//      lines they came from so the page cites rather than asserts.
//   3. Two URLs the repository publishes, the issue tracker and the
//      repository, read off the extension's own README, and the slug every
//      repository link is built from, read off install.sh.
//
// IT FAILS LOUDLY. A verb whose help moved, a passage whose anchor no longer
// matches exactly one block, a section added to the editors guide that no
// passage claims, a heredoc with an interpolation this script cannot evaluate:
// each stops the build with a sentence naming the file and what is missing.
// A silent fallback here would publish a command line nobody can run.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "./markdown.mjs";
import { blobAt, releaseRef } from "./release-ref.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated", "tools.json");

const die = (message) => {
  throw new Error(message);
};

const release = releaseRef(repo);

/** A file as the release ships it, or a sentence saying it does not. */
const read = (path) => {
  const bytes = blobAt(repo, release.tag, path);
  if (bytes === null) {
    die(`${release.tag} has no ${path}, which scripts/tools.mjs reads for /docs/tools/ and /docs/from-crystal/`);
  }
  return bytes.toString("utf8");
};

const span = (from, to) => (to > from ? `lines ${from} to ${to}` : `line ${from}`);

// `repo="iyilang/iyi"` in install.sh, as scripts/project.mjs reads it: the
// slug the installer downloads from, so a link into the repository goes where
// the tarball came from.
const slug = (() => {
  const found = /^repo="([^"]+)"/m.exec(read("install.sh"));
  if (!found) die(`install.sh at ${release.tag} no longer opens with a repo="owner/name" line, which is where this script learns where to link`);
  return found[1];
})();

// Every link into the repository names the tag, so a cited line range keeps
// pointing at the text that was quoted after master moves on.
const tree = `https://github.com/${slug}/blob/${release.tag}`;

/** A link to a range of a file at the tag. Markdown is rendered by GitHub
 * unless asked for plainly, and only the plain view has line anchors. */
const lineUrl = (file, from, to) =>
  `${tree}/${file}${file.endsWith(".md") ? "?plain=1" : ""}#L${from}${to > from ? `-L${to}` : ""}`;

/** A document's own link, resolved: a scheme is the document's, a fragment is
 * a heading in the file on GitHub, and a relative path is a path in the tree,
 * relative to the document that wrote it. The site publishes none of these
 * files, so a link left relative would be a 404 under our own domain. */
const linker = (file) => (href) => {
  if (/^[a-z]+:/i.test(href)) return href;
  if (href.startsWith("#")) return `${tree}/${file}${href}`;
  const [path, fragment] = href.split("#");
  const target = posix.normalize(posix.join(posix.dirname(file), path)).replace(/\/$/, "");
  return `${tree}/${target}${fragment ? `#${fragment}` : ""}`;
};

// The help --------------------------------------------------------------------

const ENTRY = "src/compiler/iyi.cr";
const entryLines = read(ENTRY).split("\n");

// The name the delegated verbs print in their usage, which is what every
// `#{Command.program_name}` in their heredocs evaluates to.
const programName = (() => {
  const hits = entryLines
    .map((line, i) => [/Iyi::Command\.program_name = "([^"]+)"/.exec(line), i])
    .filter(([found]) => found);
  if (hits.length !== 1) {
    die(`${ENTRY} at ${release.tag} sets Iyi::Command.program_name ${hits.length} times, and the verbs' help is printed under that one name`);
  }
  return hits[0][0][1];
})();

/**
 * One Crystal heredoc, evaluated as Crystal evaluates it.
 *
 * `<<-MARK` strips from every line the indentation of the closing `MARK`, and
 * `#{...}` interpolates. The only interpolation the help uses is the program
 * name; anything else is refused by name. So is a backslash, which a heredoc
 * reads as an escape this script does not evaluate.
 *
 * `opener` is the 0-based index of the line holding `<<-MARK`. Returns the
 * text and its 1-based line range, the opening and closing lines excluded.
 */
function heredoc(file, lines, opener) {
  const mark = /<<-(\w+)/.exec(lines[opener]);
  if (!mark) die(`${file}:${opener + 1} opens no heredoc`);
  let close = opener + 1;
  while (close < lines.length && lines[close].trim() !== mark[1]) close++;
  if (close >= lines.length) die(`${file}:${opener + 1}: the heredoc ${mark[1]} is never closed`);
  const indent = /^\s*/.exec(lines[close])[0].length;
  const body = lines.slice(opener + 1, close).map((line, i) => {
    const at = opener + 2 + i;
    if (line.trim() !== "" && /^\s*/.exec(line)[0].length < indent) {
      die(`${file}:${at} sits left of its heredoc's closing ${mark[1]}, which Crystal refuses`);
    }
    if (line.includes("\\")) {
      die(`${file}:${at} carries a backslash, an escape this script does not evaluate, so it cannot say what the line prints`);
    }
    const text = line.slice(indent).replaceAll("#{Command.program_name}", programName);
    if (text.includes("#{")) {
      die(`${file}:${at} interpolates something other than the program name, so the printed line is not in the source to quote`);
    }
    return text;
  });
  return { text: body.join("\n"), from: opener + 2, to: close };
}

// `iyi help`: the USAGE constant, and the two lists inside it.
const usage = (() => {
  const opener = entryLines.findIndex((line) => /^\s*USAGE = <<-USAGE\s*$/.test(line));
  if (opener < 0) die(`${ENTRY} at ${release.tag} has no USAGE = <<-USAGE, which is what \`iyi help\` prints`);
  const block = heredoc(ENTRY, entryLines, opener);
  const lines = block.text.split("\n");

  // A list is the indented `name  description` lines under its title, up to
  // the first blank line. Each entry keeps the line it sits at in the file.
  const list = (title) => {
    const start = lines.findIndex((line) => line.trim() === title);
    if (start < 0) die(`\`iyi help\` (${ENTRY}, ${span(block.from, block.to)}) has no "${title}" list`);
    const entries = [];
    for (let i = start + 1; i < lines.length && lines[i].trim() !== ""; i++) {
      const found = /^\s+(\S+(?: [A-Z]+)?)\s{2,}(\S.*)$/.exec(lines[i]);
      if (!found) die(`${ENTRY}:${block.from + i} is in \`iyi help\`'s "${title}" list and is not a name and a description`);
      entries.push({ name: found[1], text: found[2], line: block.from + i });
    }
    if (entries.length === 0) die(`\`iyi help\`'s "${title}" list is empty`);
    return entries;
  };

  // The paragraph after the switches: what `--crystal` does to an entry file,
  // which /docs/from-crystal/ quotes.
  const last = lines.length - lines.slice().reverse().findIndex((line) => line.trim() === "");
  const note = { text: lines.slice(last).join("\n"), from: block.from + last, to: block.to };
  if (!note.text.includes("--crystal")) {
    die(`\`iyi help\` no longer closes on the paragraph that says what --crystal gives an entry file (${ENTRY}, ${span(block.from, block.to)})`);
  }

  return {
    file: ENTRY,
    text: block.text,
    from: block.from,
    to: block.to,
    cite: `${ENTRY}, ${span(block.from, block.to)}`,
    url: lineUrl(ENTRY, block.from, block.to),
    commands: list("Command:"),
    switches: list("Switches worth knowing:"),
    note: { ...note, cite: `${ENTRY}, ${span(note.from, note.to)}`, url: lineUrl(ENTRY, note.from, note.to) },
  };
})();

const commandNames = new Set(usage.commands.map((entry) => entry.name));

// Each verb a page walks through, and the file its own help is written in.
// `usage` is what follows the program name on the help's first line, which is
// how the heredoc is found: `fmt` is `tool format` there, because `iyi fmt`
// is that verb under the name other toolchains spell it (src/compiler/iyi.cr,
// FORMAT_VERBS).
const VERBS = {
  init: { file: "src/compiler/iyi/command/init.cr" },
  get: { file: "src/compiler/iyi/command/get.cr" },
  test: { file: "src/compiler/iyi/command/test.cr" },
  fmt: { file: "src/compiler/iyi/command/format.cr", usage: "tool format" },
  check: { file: "src/compiler/iyi/command/check.cr" },
  fix: { file: "src/compiler/iyi/command/fix.cr" },
  doc: { file: "src/compiler/iyi/command/doc.cr" },
  lsp: { file: "src/compiler/iyi/command/lsp.cr" },
  mcp: { file: "src/compiler/iyi/command/mcp.cr" },
  migrate: { file: "src/compiler/iyi/command/migrate.cr" },
  bind: { file: "src/compiler/iyi/command/bind.cr" },
};

const verbs = {};
for (const [verb, want] of Object.entries(VERBS)) {
  if (!commandNames.has(verb)) {
    die(`\`iyi help\` at ${release.tag} no longer lists \`${verb}\` (${usage.cite}), and /docs/ walks a reader through it`);
  }
  const lines = read(want.file).split("\n");
  const first = new RegExp(`^\\s*Usage: #\\{Command\\.program_name\\} ${want.usage ?? verb}(\\s|$)`);
  const openers = lines
    .map((line, i) => (first.test(line) && /<<-\w+/.test(lines[i - 1] ?? "") ? i - 1 : -1))
    .filter((i) => i >= 0);
  if (openers.length !== 1) {
    die(
      `${want.file} at ${release.tag} has ${openers.length} heredocs opening ` +
        `"Usage: ${programName} ${want.usage ?? verb}", and the site quotes exactly ` +
        `one as \`${programName} help ${verb}\``,
    );
  }
  const block = heredoc(want.file, lines, openers[0]);

  // `tool format`'s banner ends on "Options:", the title of a list the
  // option parser prints after it and the heredoc does not hold. Quoting the
  // title without the list would quote a heading over nothing, so the
  // excerpt stops above it and says so in its caption.
  let text = block.text.replace(/\s+$/, "");
  let to = block.from + text.split("\n").length - 1;
  let caption = `${programName} help ${verb}`;
  if (/\nOptions:$/.test(text)) {
    text = text.replace(/\n+Options:$/, "");
    to = block.from + text.split("\n").length - 1;
    caption = `${caption}, up to its options`;
  }

  const listed = usage.commands.find((entry) => entry.name === verb);
  verbs[verb] = {
    verb,
    usage: { text: listed.text, line: listed.line, cite: `${ENTRY}, line ${listed.line}`, url: lineUrl(ENTRY, listed.line, listed.line) },
    help: { text, caption, file: want.file, from: block.from, to, cite: `${want.file}, ${span(block.from, to)}`, url: lineUrl(want.file, block.from, to) },
  };
}

// The passages ----------------------------------------------------------------

// Each entry claims that one block of the file contains `anchor`, and the
// passage is that block and the `count - 1` after it. The anchor is matched
// against the block's source, never a line number, because a line number is a
// guess about a file nobody edits with this site in mind. `lang` asserts the
// fence a code block opens with: a stanza whose fence changed language is a
// stanza somebody rewrote.
const PASSAGES = {
  // /docs/tools/
  init_run: { file: "README.md", anchor: "iyi init kemal", lang: "sh" },
  project: { file: "README.md", anchor: "`iyi init MODULE [DIR]` writes two files" },
  packages: { file: "README.md", anchor: "Looking for a package?" },
  first_module: { file: "README.md", anchor: "pub def polite(name : String) : String\n", lang: "crystal", before: 1, count: 4 },
  first_build: { file: "README.md", anchor: "rm -r app", lang: "console", count: 2 },
  editors: { file: "editors/README.md", anchor: "`iyi lsp` speaks the Language Server Protocol over stdio", count: 2 },
  vscode: { file: "editors/README.md", anchor: "published as `iyilang.iyi`" },
  vim: { file: "editors/README.md", anchor: "The plugin in [`vim/`](vim/)" },
  vim_install: { file: "editors/vim/README.md", anchor: "mkdir -p ~/.vim/pack/iyi/start", lang: "sh", count: 3, before: 1 },
  neovim: { file: "editors/README.md", anchor: 'vim.lsp.config("iyi"', lang: "lua", before: 1 },
  helix: { file: "editors/README.md", anchor: "[language-server.iyi]", lang: "toml", before: 1 },
  sublime: { file: "editors/README.md", anchor: '"command": ["iyi", "lsp"]', lang: "json", before: 1 },
  zed: { file: "editors/README.md", anchor: "Zed registers new languages" },
  trouble: { file: "editors/vscode/README.md", anchor: "**`spawn iyi ENOENT`**", count: 3 },

  // /docs/from-crystal/
  kept: { file: "SPEC.md", anchor: "local inference and Ruby syntax are" },
  compatible: { file: "README.md", anchor: '**Both directions of "compatible", stated first.**' },
  moved: { file: "README.md", anchor: "What moved is where things may be written" },
  cr_files: { file: "README.md", anchor: "A `.cr` file still compiles" },
  traits: { file: "README.md", anchor: "**Traits, and impls for a generic type.**", count: 3 },
  library: { file: "README.md", anchor: "**`iyi build --crystal` gives a program Crystal's standard library**", count: 3 },
  unchanged: { file: "README.md", anchor: "**Nothing about the language changes.**" },
  bang: { file: "README.md", anchor: "**One name is unreachable, and it is a class of names.**", count: 3 },
  cost: { file: "README.md", anchor: "**What it costs is R-1, for that dependency.**" },
  migrate: { file: "README.md", anchor: "$ iyi migrate src --out iyi --annotate --check", lang: "console", count: 3 },
  flag: { file: "README.md", anchor: "**Is this Crystal with a flag?**" },
  shards: { file: "README.md", anchor: "**Can I use shards?**" },
  stable: { file: "README.md", anchor: "**Is the syntax stable?**" },
};

// Every level-two section of the editors guide has to be claimed by a
// passage above. An editor added to the guide and missing from the page looks
// exactly like a complete page, which is the failure this exists for.
const CLAIMED_IN_FULL = ["editors/README.md"];

// Sections of a claimed guide that are deliberately not on the page, each
// with the reason. Building and publishing the extension is the maintainers'
// procedure, not a reader's setup.
const UNCLAIMED = {
  "editors/README.md": { "Publishing it": "how the extension is released, which is the maintainers' work" },
};

const documents = new Map();
const document = (file) => {
  if (!documents.has(file)) {
    const text = read(file);
    const lines = text.replace(/\n$/, "").split("\n");
    const parsed = parseDocument(text, { link: linker(file) });
    // Each block's raw source, which is what an anchor is matched against,
    // and the heading it sits under, which is a code block's caption.
    let heading = null;
    const blocks = parsed.blocks.map((block) => {
      if (block.kind === "heading") heading = block.text;
      return { ...block, source: lines.slice(block.from - 1, block.to).join("\n"), under: heading };
    });
    documents.set(file, blocks);
  }
  return documents.get(file);
};

/** A listing's caption. A module's path is its file's path, so a listing that
 * opens on its module header names its own file; anything else is captioned
 * by the section of the document it sits in. */
const captionOf = (block) => {
  const header = /^module (\S+)\n/.exec(block.text ?? "");
  return header ? `${header[1]}.iyi` : block.under;
};

const passages = {};
for (const [id, want] of Object.entries(PASSAGES)) {
  const blocks = document(want.file);
  const hits = blocks.filter((block) => block.kind !== "heading" && block.source.includes(want.anchor));
  if (hits.length !== 1) {
    die(
      `${want.file} at ${release.tag} has ${hits.length} blocks containing ` +
        `${JSON.stringify(want.anchor)}, and the passage "${id}" quotes exactly one. ` +
        (hits.length === 0
          ? "Either the passage moved and the anchor needs updating, or the page is claiming something the file no longer says."
          : `Narrow the anchor (lines ${hits.map((hit) => hit.from).join(", ")}).`),
    );
  }
  const at = blocks.indexOf(hits[0]);
  if (want.lang !== undefined && (hits[0].kind !== "code" || hits[0].lang !== want.lang)) {
    die(`"${id}" expected a ${want.lang} block at ${want.file}:${hits[0].from}, and it is ${hits[0].lang || hits[0].kind}`);
  }
  const start = at - (want.before ?? 0);
  const taken = blocks.slice(start, at + (want.count ?? 1));
  if (start < 0 || taken.length !== (want.before ?? 0) + (want.count ?? 1)) {
    die(`"${id}" runs past an end of ${want.file}`);
  }
  const crossing = taken.find((block) => block.kind === "heading");
  if (crossing) {
    die(`"${id}" in ${want.file} now runs across the heading "${crossing.text}" at line ${crossing.from}, so the passage is no longer one stretch of one section`);
  }
  const unrendered = taken.find((block) => !["paragraph", "list", "code"].includes(block.kind));
  if (unrendered) die(`"${id}" in ${want.file} takes a ${unrendered.kind} block at line ${unrendered.from}, which the page does not render`);

  const from = taken[0].from;
  const to = taken[taken.length - 1].to;
  passages[id] = {
    id,
    file: want.file,
    // The heading the passage sits under, which a page sets over it rather
    // than naming an editor or a section in its own words.
    heading: taken[0].under,
    from,
    to,
    cite: `${want.file}, ${span(from, to)}`,
    url: lineUrl(want.file, from, to),
    blocks: taken.map((block) => {
      const cite = `${want.file}, ${span(block.from, block.to)}`;
      return block.kind === "code"
        ? { kind: "code", lang: block.lang, text: block.text, caption: captionOf(block), from: block.from, to: block.to, cite, url: lineUrl(want.file, block.from, block.to) }
        : block.kind === "list"
          ? { kind: "list", ordered: block.ordered, items: block.items, from: block.from, to: block.to, cite }
          : { kind: "paragraph", html: block.html, from: block.from, to: block.to, cite };
    }),
  };
}

for (const file of CLAIMED_IN_FULL) {
  const blocks = document(file);
  const skipped = UNCLAIMED[file] ?? {};
  const headings = blocks.filter((block) => block.kind === "heading" && block.level >= 2);
  for (const heading of headings) {
    if (heading.text in skipped) continue;
    const next = headings.find((other) => other.from > heading.from);
    const end = next ? next.from : Infinity;
    const claimed = Object.values(passages).some(
      (passage) => passage.file === file && passage.from > heading.from && passage.from < end,
    );
    if (!claimed) {
      die(
        `${file} at ${release.tag} has a section "${heading.text}" (line ${heading.from}) ` +
          `that no passage in scripts/tools.mjs quotes. A section added to the guide ` +
          `and absent from /docs/tools/ is invisible; claim it in PASSAGES, or name it ` +
          `in UNCLAIMED with the reason it is not a reader's.`,
      );
    }
  }
  for (const name of Object.keys(skipped)) {
    if (!headings.some((heading) => heading.text === name)) {
      die(`${file} at ${release.tag} has no section "${name}", which UNCLAIMED says the page leaves out on purpose. Drop the entry.`);
    }
  }
}

// The two places a reader goes from the page: the tracker and the repository,
// as the extension's README links them.
const EXTENSION_README = "editors/vscode/README.md";
const links = {};
for (const [id, label] of [["issues", "Issues"], ["repository", "Repository"]]) {
  const found = [...read(EXTENSION_README).matchAll(new RegExp(`\\[${label}\\]\\((https://[^)\\s]+)\\)`, "g"))];
  if (found.length !== 1) {
    die(`${EXTENSION_README} at ${release.tag} links "${label}" ${found.length} times, and /docs/tools/ sends a reader to that one URL`);
  }
  links[id] = found[0][1];
}

// Written ---------------------------------------------------------------------

const record = {
  provenance: {
    generator: "scripts/tools.mjs",
    repository: slug,
    release: release.version,
    tag: release.tag,
    commit: release.commit,
  },
  programName,
  usage,
  verbs,
  passages,
  links,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

const files = new Set([ENTRY, ...Object.values(VERBS).map((want) => want.file), ...documents.keys(), "install.sh"]);
console.log(
  `tools: ${Object.keys(verbs).length} verbs' help and ${Object.keys(passages).length} passages, ` +
    `read out of ${files.size} files at ${release.tag}`,
);
