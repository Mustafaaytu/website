#!/usr/bin/env node
// The releases, read out of CHANGELOG.md: their headings, and what each one
// says it changed.
//
// WHAT THIS REPLACED. `scripts/reference.mjs` cut SPEC.md into 56 pages and
// quoted CHANGELOG.md whole, because the site published both. It no longer
// does: a design record marked Draft 0, whose Part III is open questions and
// whose Appendix B is decisions awaiting a call, is not documentation, and 57
// of the site's 128 routes were serving it with no page anywhere linking in.
// Both files stay in the repository, where they are read as what they are.
//
// WHAT SURVIVED. The changelog is the only place the current version number is
// written down, and the site prints it in the masthead's colophon, on the home
// page, on the install page and in llms.txt, and builds the release's tarball
// URLs out of it. A version is a fact about the tree like every other figure
// here, so it is read, never typed. That is `releases.json`, and it is read
// out of the checkout for the same reason `scripts/release-ref.mjs` reads the
// checkout: the checkout's first heading is what decides which release the
// site is about, and the tag is found from it, not the other way round.
//
// WHAT CAME BACK, and why it is not the 180 KB body. A reader deciding whether
// to upgrade wants three things a changelog of 1.3 MB does not hand them: the
// release's own summary, what it breaks, and a list of what changed short
// enough to scan. Every release section already carries all three. Its lead
// paragraphs are the summary (the tag's message, which is the GitHub release's
// body, is the same text). The bullets under `### Added`, `### Fixed` and the
// rest each open on a bold sentence that is the change in one line. And the
// summary marks what breaks in its own words, as a bold label ending in a
// colon: "**Some programs that compiled are refused:**", "**Some answers
// change:**". So `release-notes.json` is those three, lifted and not written:
// the paragraphs whole, the passages the summary labels, and each bullet's
// opening sentence, with the line of the section they came from.
//
// The notes are read at the tag, not out of the checkout. They are quoted, and
// a quotation is of the text the release published, not of whatever master
// has rewritten since; the links beside them point at the same bytes. The tag
// is the one `releaseRef` resolves, so this script needs the tags fetched,
// which the build already does for `scripts/records.mjs`.
//
// WHAT IT DOES NOT SAY. SPEC.md states one compatibility rule, IV.5's: an
// artifact is not migrated, and one from another release is refused and
// rebuilt. That paragraph is quoted with its lines. Nothing in the repository
// states a release cadence or a semver promise, so nothing here computes or
// implies one.
//
// It fails rather than defaulting. A changelog whose first heading stopped
// reading as "version — date" means the site does not know what the current
// release is, and a site that guesses that is worse than one that does not
// build. A release section with no summary, a SPEC.md with no IV.5, and a tag
// whose headings disagree with the checkout's each stop the build by name.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BOLD, CODE_SPAN, inline } from "./markdown.mjs";
import { blobAt, releaseRef } from "./release-ref.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated");

const SOURCE = "CHANGELOG.md";
const SPEC = "SPEC.md";

const die = (message) => {
  throw new Error(`releases: ${message}`);
};

/* A release heading, as CHANGELOG.md writes it: `## 0.12.0 — 2026-09-11`. The
 * dash is an em dash in the file and a hyphen in older entries, so both are
 * accepted; anything else at this level is a heading that is not a release
 * (`Unreleased`, and whatever comes next) and is skipped rather than guessed
 * at. */
const HEADING = /^##\s+(\d+\.\d+\.\d+)\s+[—-]+\s+(\d{4}-\d{2}-\d{2})\s*$/;

/** Every release heading in a changelog, newest first, with its line. */
const headings = (text) => {
  const found = [];
  text.split("\n").forEach((line, index) => {
    const match = HEADING.exec(line);
    if (match) found.push({ version: match[1], date: match[2], line: index + 1 });
  });
  return found;
};

const text = (() => {
  try {
    return readFileSync(resolve(repo, SOURCE), "utf8");
  } catch {
    die(
      `cannot read ${SOURCE} in ${repo}. It is where this project writes down ` +
        `which release is current, so without it the site cannot say.`,
    );
  }
})();

const releases = headings(text);

if (releases.length === 0) {
  die(
    `no heading in ${SOURCE} reads as "## version — date", so the site cannot ` +
      `say which release is current. The heading shape moved.`,
  );
}

const commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "releases.json"),
  `${JSON.stringify(
    { provenance: { generator: "scripts/releases.mjs", source: SOURCE, commit }, releases },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `releases: ${releases.length} in ${SOURCE}, latest ${releases[0].version} ` +
    `of ${releases[0].date}, at ${commit}`,
);

// ---------------------------------------------------------------------------
// The notes, at the tag.

const ref = releaseRef(repo);

const atTag = (path) => {
  const bytes = blobAt(repo, ref.tag, path);
  if (bytes === null) die(`${ref.tag} has no ${path}, so the release's own words cannot be quoted.`);
  return bytes.toString("utf8");
};

const changelog = atTag(SOURCE);
const lines = changelog.replace(/\n$/, "").split("\n");

/* The tag and the checkout must name the same releases on the same days. The
 * colophon and the install page print the checkout's; this page prints the
 * tag's. Two answers to "when was 0.15.0" on one site is the drift every
 * other generator here exists to rule out. */
const tagged = headings(changelog);
const spell = (list) => list.map((r) => `${r.version} ${r.date}`).join(", ");
if (spell(tagged) !== spell(releases)) {
  die(
    `${SOURCE} at ${ref.tag} states ${tagged.length} releases and the checkout ` +
      `states ${releases.length}, or the same ones on other days: the site ` +
      `would print one date in its colophon and another on /releases/. ` +
      `At the tag: ${spell(tagged)}. In the checkout: ${spell(releases)}.`,
  );
}

// `repo="iyilang/iyi"` in install.sh, at the tag: the slug the installer
// downloads from, as scripts/project.mjs reads it. Read rather than typed, so
// a fork that renames does not leave the site linking at the old owner's tree.
const slug = (() => {
  const line = atTag("install.sh")
    .split("\n")
    .find((row) => /^repo="/.test(row));
  if (!line) die(`install.sh at ${ref.tag} has no repo="owner/name" line, which is where this script learns where to link.`);
  return /^repo="([^"]+)"/.exec(line)[1];
})();

const github = `https://github.com/${slug}`;
const blob = `${github}/blob/${ref.tag}`;

/* A line of a file at the tag, in GitHub's plain view. The rendered view of a
 * 1.3 MB markdown file has no line anchors; the plain one does, and lands the
 * reader on the heading this site quoted. */
const lineUrl = (path, from, to) =>
  `${blob}/${path}?plain=1#L${from}${to && to !== from ? `-L${to}` : ""}`;

// A link inside the changelog that is a path in the repository resolves to the
// tag, where the quoted sentence was read. A URL or a fragment is left as
// written. The same rule scripts/project.mjs applies to its documents.
const link = (href) => {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return href;
  return `${blob}/${href.replace(/^\.\//, "").replace(/\/$/, "")}`;
};

const render = (markdown) => inline(markdown, { link });

/* Code spans blanked out, keeping every offset. A `**` inside backticks is a
 * glob, not bold, and a `.` inside `File.read` does not end a sentence; every
 * search below runs on this and cuts the original at what it finds. */
const masked = (source) => source.replace(CODE_SPAN, (span) => "x".repeat(span.length));

/** A bold run at the very start of a bullet, by the same rule as any other. */
const LEADING_BOLD = new RegExp(`^${BOLD.source}`);

/* Where the first sentence ends: a full stop, question or exclamation mark
 * followed by a space or the end, after any closing bold or bracket. Searched
 * in the masked text, so a method name with a dot in it is not a boundary. */
const sentenceEnd = (plain, from = 0) => {
  const end = /[.!?](?:\*\*|["')\]])*(?=\s|$)/g;
  end.lastIndex = from;
  const found = end.exec(plain);
  return found ? found.index + found[0].length : plain.length;
};

/** Where the sentence holding `at` begins. */
const sentenceStart = (plain, at) => {
  let start = 0;
  for (const found of plain.slice(0, at).matchAll(/[.!?](?:\*\*|["')\]])*\s+/g)) {
    start = found.index + found[0].length;
  }
  return start;
};

/**
 * The passages of a summary paragraph that say what breaks.
 *
 * The changelog marks them itself: a bold run that is a label, ending in a
 * colon or followed by one (`**Some answers change:**`, `**this release breaks
 * source that writes it**:`), or one that states a refusal in a sentence with
 * a colon in it (`**\`.iyimod\` is v54: an artifact written by 0.14.0 is
 * refused, ...**`). A passage runs from the start of the sentence the label is
 * in to the next bold run or the end of the paragraph, or to the end of the
 * bold run where the label is a whole sentence. Bold runs that are a
 * paragraph's headline, which every summary opens with, carry no colon and
 * are not passages. A breaking change the summary states without the mark is
 * still in the summary printed beside this; it is not promoted, because
 * deciding it breaks would be this script's judgement and not the release's.
 */
const breakingPassages = (paragraph) => {
  const plain = masked(paragraph);
  const runs = [...plain.matchAll(BOLD)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    inner: m[1].trim(),
  }));
  const passages = [];
  runs.forEach((run, index) => {
    const after = plain.slice(run.end, run.end + 1);
    const label = run.inner.endsWith(":") || after === ":" || run.inner.includes(":");
    if (!label) return;
    const start = sentenceStart(plain, run.start);
    const whole = /[.!?]$/.test(run.inner);
    const end = whole ? run.end : (runs[index + 1]?.start ?? plain.length);
    passages.push(paragraph.slice(start, end).trim());
  });
  return passages;
};

/**
 * One bullet's opening, in the changelog's own words.
 *
 * Almost every bullet opens on a bold sentence that is the change in one line,
 * and that is what is lifted. Where the bold is not a sentence - a rule's name,
 * `**R-1**`, or a phrase the sentence goes on past - or where there is no bold
 * at all, the bullet's first sentence is lifted instead, which is the same
 * thing said without the mark. Never a sentence of this script's.
 */
const opening = (item) => {
  const plain = masked(item);
  const lead = LEADING_BOLD.exec(plain);
  const end = sentenceEnd(plain);
  if (lead && /[.!?:]$/.test(lead[1].trim()) && end >= lead[0].length) {
    return item.slice(0, lead[0].length);
  }
  const lifted = item.slice(0, end).trim();
  // A bold run that holds more than one sentence (0.5.0 sets a whole bullet
  // in bold) is cut at the first like any other, and closed there, so the
  // lifted text never opens a `**` it does not close.
  const opened = (masked(lifted).match(/\*\*/g) ?? []).length;
  return opened % 2 === 1 ? `${lifted}**` : lifted;
};

/* The changelog, cut into release sections. A fenced block is skipped whole:
 * a `##` inside one is a listing, not a heading. A fence is three backticks and
 * an info string with none in it; a line that opens on ```` ```crystal ```` is
 * a code span that happens to start the line, and reading it as a fence once
 * swallowed every release after 0.16.2. */
const fence = /^\s*`{3,}[^`]*$/;
const sections = (() => {
  const found = [];
  let current = null;
  let fenced = false;
  lines.forEach((line, index) => {
    if (fence.test(line)) fenced = !fenced;
    if (fenced || fence.test(line)) {
      if (current) current.body.push({ line, number: index + 1, fenced: true });
      return;
    }
    if (/^##\s/.test(line)) {
      const match = HEADING.exec(line);
      current = match
        ? { version: match[1], date: match[2], line: index + 1, body: [] }
        : null;
      if (current) found.push(current);
      return;
    }
    if (current) current.body.push({ line, number: index + 1, fenced: false });
  });
  return found;
})();

/** Runs of non-blank lines, each joined into one line of markdown. */
const paragraphs = (rows) => {
  const found = [];
  let run = [];
  const flush = () => {
    if (run.length > 0) found.push({ text: run.map((r) => r.line.trim()).join(" "), from: run[0].number });
    run = [];
  };
  for (const row of rows) {
    if (row.line.trim() === "") flush();
    else run.push(row);
  }
  flush();
  return found;
};

const notes = sections.map((section) => {
  const subsections = [];
  const lead = [];
  for (const row of section.body) {
    const sub = !row.fenced && /^###\s+(.*\S)\s*$/.exec(row.line);
    if (sub) {
      subsections.push({ title: sub[1], line: row.number, rows: [] });
      continue;
    }
    (subsections.length > 0 ? subsections[subsections.length - 1].rows : lead).push(row);
  }

  const summary = paragraphs(lead.filter((row) => !row.fenced));
  if (summary.length === 0) {
    die(
      `${section.version} at ${SOURCE}:${section.line} at ${ref.tag} has no ` +
        `paragraph before its first ### heading. That paragraph is the ` +
        `release's summary, and the site has no other.`,
    );
  }

  const groups = subsections.map((sub) => {
    // A top-level bullet opens an item; its first paragraph is everything up
    // to the next blank line or the next bullet at the margin. Indented lines,
    // a nested bullet among them, belong to the item above.
    const items = [];
    let open = null;
    for (const row of sub.rows) {
      if (row.fenced || row.line.trim() === "") {
        open = null;
        continue;
      }
      const bullet = /^[-*]\s+(.*)$/.exec(row.line);
      if (bullet) {
        open = [bullet[1]];
        items.push(open);
      } else if (open) {
        open.push(row.line.trim());
      }
    }
    return {
      title: render(sub.title),
      url: lineUrl(SOURCE, sub.line),
      items: items.map((parts) => render(opening(parts.join(" ")))),
    };
  });

  // The section's last line of text, not the blank one before the next heading.
  const end = section.body.findLast((row) => row.line.trim() !== "")?.number ?? section.line;

  return {
    version: section.version,
    date: section.date,
    tag: `${github}/releases/tag/v${section.version}`,
    url: lineUrl(SOURCE, section.line, end),
    summary: summary.map((p) => render(p.text)),
    breaks: summary.flatMap((p) => breakingPassages(p.text)).map(render),
    sections: groups,
  };
});

// ---------------------------------------------------------------------------
// The compatibility rule, quoted out of SPEC.md at the tag.
//
// IV.5's first two paragraphs, because the rule is both of them: the first
// says an artifact's format is not migrated before 1.0, the second says what
// two compilers must agree on for one to read the other's artifacts, which is
// the release. Either alone tells a reader half of what happens to their
// `.iyimod` files on upgrade. The rest of the section is why, and is linked.

const QUOTED = 2;

const versioning = (() => {
  const spec = atTag(SPEC).replace(/\n$/, "").split("\n");
  const at = spec.findIndex((line) => /^###\s+IV\.5\s+Versioning\s*$/.test(line));
  if (at === -1) {
    die(
      `${SPEC} at ${ref.tag} has no "### IV.5 Versioning" heading. It is the ` +
        `compatibility rule /releases/ quotes rather than writing one of its own.`,
    );
  }
  const quoted = [];
  let line = at + 1;
  while (quoted.length < QUOTED && line < spec.length) {
    while (line < spec.length && spec[line].trim() === "") line++;
    if (line >= spec.length || /^#/.test(spec[line])) break;
    const from = line;
    while (line + 1 < spec.length && spec[line + 1].trim() !== "") line++;
    quoted.push({ from: from + 1, to: line + 1, text: spec.slice(from, line + 1).map((row) => row.trim()).join(" ") });
    line++;
  }
  if (quoted.length < QUOTED) {
    die(
      `${SPEC} IV.5 at ${ref.tag} has ${quoted.length} paragraph(s) before its ` +
        `section ends, and the rule /releases/ quotes is its first ${QUOTED}.`,
    );
  }
  const from = quoted[0].from;
  const to = quoted.at(-1).to;
  return {
    file: SPEC,
    section: spec[at].replace(/^###\s+/, "").trim(),
    from,
    to,
    url: lineUrl(SPEC, from, to),
    section_url: lineUrl(SPEC, at + 1),
    paragraphs: quoted.map((p) => render(p.text)),
  };
})();

writeFileSync(
  resolve(out, "release-notes.json"),
  `${JSON.stringify(
    {
      provenance: {
        generator: "scripts/releases.mjs",
        source: SOURCE,
        tag: ref.tag,
        commit: ref.commit.slice(0, 9),
        changelog: `${blob}/${SOURCE}`,
      },
      versioning,
      releases: notes,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

const items = notes.reduce((n, r) => n + r.sections.reduce((m, s) => m + s.items.length, 0), 0);
const breaking = notes.filter((r) => r.breaks.length > 0).length;
console.log(
  `releases: notes for ${notes.length} at ${ref.tag}, ${items} changes, ` +
    `${breaking} with what breaks marked, ${SPEC} ${versioning.section} at ` +
    `lines ${versioning.from} to ${versioning.to}`,
);
