#!/usr/bin/env node
// Who makes iyi, where to talk to them, and what has grown up around it.
//
// THE TEMPTATION THIS PAGE HAS TO REFUSE. A community page on a language site
// is usually the place a project lists the forum, the chat server, the
// newsletter and the logos of the companies using it. iyi has none of those,
// and the honest page is the one that lists what it does have: an issue
// tracker and pull requests on one repository, a security policy, a code of
// conduct, a package directory somebody else built, editor plugins, a licence,
// and a short list of people. So every one of those is read here, out of the
// release, and nothing else is offered. A channel this script cannot find in
// the tree is a channel the page does not mention.
//
// THE TREE IS THE RELEASE'S. Every file is read with `git cat-file` at the
// tag `scripts/release-ref.mjs` names, and the history is the history
// reachable from that tag, so the people on the page are the people whose
// work is in the tarball the install page links, and a commit on master does
// not change the page until it is released.
//
// THE FORK'S PEOPLE ARE NOT CRYSTAL'S. iyi is a fork, and the history behind
// the tag is mostly Crystal's: thousands of commits by hundreds of people who
// never wrote a line of iyi. Listing them as iyi's contributors would credit a
// young project with somebody else's community, which `bench/site_facts.py`
// already names as the one claim this site must not make. So the history is
// cut in two at the fork point and the halves are never added together: the
// fork's authors are listed by name, Crystal's are counted and credited as
// what the compiler is built on.
//
// WHERE THE FORK BEGINS is not typed here as a hash. It is the parent of the
// first commit in the release's history whose diff writes the language's own
// name, `iyi` or `IYI`: Crystal's tree never contains the word, and the fork's
// first commit (an `IYI_PROF` switch, the day before SPEC.md was added) does.
// Topological order guarantees nothing before it matches, and the check after
// it refuses a history where Crystal's commits arrive later through a merge.
//
// QUOTATIONS ARE ANCHORED, NOT COPIED. Each passage is named here by a phrase
// that has to occur in exactly one paragraph of its file; the paragraph (or
// the one sentence of it that holds the phrase) is lifted with the lines it
// came from. A document rewritten so the phrase is gone, or so it occurs
// twice, fails this script by name, because the alternative is a page quoting
// a sentence the release no longer contains.
//
// NAMES, NOT ADDRESSES. Authors are merged by email, after the release's own
// .mailmap, the way `git shortlog -e` does: one person committing under two
// names is one person. The page shows the name they committed under most and
// the other names beside it. The addresses themselves are not written out.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inline } from "./markdown.mjs";
import { blobAt, releaseRef } from "./release-ref.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated", "community.json");

const die = (message) => {
  throw new Error(`community: ${message}`);
};

const release = releaseRef(repo);

const git = (...args) =>
  execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/** A file as the release ships it, or a failure naming the file. */
const file = (path) => {
  const bytes = blobAt(repo, release.tag, path);
  if (bytes === null) die(`${release.tag} has no ${path}, which this page quotes`);
  return bytes.toString("utf8");
};

// The slug the installer downloads from, as scripts/project.mjs reads it, so
// the tracker this page sends people to is the repository the release is
// published from.
const slug = (() => {
  const found = /^repo="([^"]+)"/m.exec(file("install.sh"));
  if (!found) die(`install.sh at ${release.tag} has no repo="owner/name" line to learn the repository from`);
  return found[1];
})();

const home = `https://github.com/${slug}`;
const blob = `${home}/blob/${release.commit}`;

/** A document's own link, resolved the way scripts/project.mjs resolves it. */
const link = (from) => (href) => {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return href;
  const base = dirname(from) === "." ? "" : `${dirname(from)}/`;
  return `${blob}/${base}${href.replace(/^\.\//, "").replace(/\/$/, "")}`;
};

/** Lines outside fenced blocks, grouped into paragraphs, one-based. */
function paragraphs(text) {
  const lines = text.replace(/\n$/, "").split("\n");
  const found = [];
  let fenced = false;
  let open = null;
  const close = () => {
    if (open) found.push(open);
    open = null;
  };
  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      close();
      fenced = !fenced;
      return;
    }
    if (fenced || line.trim() === "" || /^#{1,6}\s/.test(line)) {
      close();
      return;
    }
    if (!open) open = { from: index + 1, lines: [] };
    open.lines.push(line.trim());
  });
  close();
  return found;
}

const flat = (text) => text.replace(/\s+/g, " ").trim();

/**
 * The paragraph of `path` holding `anchor`, or with `sentence`, the one
 * sentence of it that does. Carries its lines, a citation in the site's
 * spelling, and a link to exactly those lines at the release's commit.
 */
function passage(path, anchor, { sentence = false } = {}) {
  const hits = paragraphs(file(path)).filter((p) => flat(p.lines.join(" ")).includes(flat(anchor)));
  if (hits.length !== 1) {
    die(
      `"${anchor}" occurs in ${hits.length} paragraphs of ${path} at ${release.tag}, ` +
        `and this page quotes exactly one. Either the passage was rewritten and ` +
        `the page should follow it, or the anchor needs narrowing.`,
    );
  }
  const [hit] = hits;

  // The paragraph as one line, with each source line's starting offset, so a
  // sentence can be traced back to the lines it spans.
  const starts = [];
  let joined = "";
  hit.lines.forEach((line) => {
    if (joined) joined += " ";
    starts.push(joined.length);
    joined += line;
  });

  let begin = 0;
  let end = joined.length;
  if (sentence) {
    const at = joined.indexOf(anchor);
    if (at < 0) die(`"${anchor}" spans a line break in ${path}; anchor a sentence on words inside one line`);
    const boundaries = [...joined.matchAll(/[.?!]\s+(?=[A-Z[`*])/g)].map((m) => m.index + m[0].length);
    begin = Math.max(0, ...boundaries.filter((b) => b <= at));
    const after = boundaries.find((b) => b > at);
    end = after === undefined ? joined.length : after;
  }
  const text = joined.slice(begin, end).trim();
  const lineOf = (offset) => starts.filter((s) => s <= offset).length - 1 + hit.from;
  const from = lineOf(begin);
  const to = lineOf(begin + text.length - 1);

  return {
    file: path,
    text,
    html: inline(text, { link: link(path) }),
    from,
    to,
    cite: `${path}, ${to > from ? `lines ${from} to ${to}` : `line ${from}`}`,
    url: `${blob}/${path}?plain=1#L${from}${to > from ? `-L${to}` : ""}`,
  };
}

/** The target of the markdown link labelled `label` in a passage. */
function target(quoted, label) {
  const found = new RegExp(`\\[${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\(([^)\\s]+)\\)`).exec(quoted.text);
  if (!found) die(`the passage at ${quoted.cite} no longer links "${label}", which the page links to`);
  return link(quoted.file)(found[1]);
}

// ---------------------------------------------------------------- talking

// CONTRIBUTING.md's opening paragraph is the scope of the tracker: what goes
// to Crystal and what comes here.
const scope = passage("CONTRIBUTING.md", "it belongs in Crystal's tracker");
const crystal = target(scope, "Crystal");

// "What this repository expects of a change" is three paragraphs, each led by
// one bold sentence. The bold sentences are the list; the paragraphs are on
// /project/contributing/ whole.
const expects = (() => {
  const text = file("CONTRIBUTING.md");
  const lines = text.split("\n");
  const HEADING = "## What this repository expects of a change";
  const start = lines.indexOf(HEADING);
  if (start < 0) die(`CONTRIBUTING.md at ${release.tag} has no "${HEADING}" section, which the page lists`);
  let end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
  if (end < 0) end = lines.length;
  const leads = [];
  for (let i = start + 1; i < end; i++) {
    const lead = /^\*\*([^*]+)\*\*/.exec(lines[i]);
    if (lead && (i === 0 || lines[i - 1].trim() === "")) {
      leads.push({
        text: lead[1],
        html: inline(lead[1]),
        cite: `CONTRIBUTING.md, line ${i + 1}`,
        url: `${blob}/CONTRIBUTING.md?plain=1#L${i + 1}`,
      });
    }
  }
  if (leads.length === 0) die(`"${HEADING}" in CONTRIBUTING.md no longer leads its paragraphs with a bold sentence`);
  return leads;
})();

// SECURITY.md sends a report to one of two places, and the page quotes both
// rather than choosing for the reader.
const upstreamReport = passage("SECURITY.md", "**If the issue is in Crystal**");
const forkReport = passage("SECURITY.md", "**If the issue is in what this fork added**");
if (!forkReport.text.includes("private security advisory")) {
  die(`${forkReport.cite} no longer asks for a private security advisory, and the page links to the form for one`);
}

// ---------------------------------------------------------------- history

/** The release's .mailmap, as `git shortlog` would apply it. */
const mailmap = (() => {
  const bytes = blobAt(repo, release.tag, ".mailmap");
  const entries = [];
  if (bytes === null) return entries;
  for (const raw of bytes.toString("utf8").split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const found = /^([^<]*)<([^>]+)>\s*(?:([^<]*)<([^>]+)>)?$/.exec(line);
    if (!found) die(`.mailmap at ${release.tag} has a line this script cannot read: "${raw}"`);
    const [, properName, firstEmail, commitName, commitEmail] = found;
    entries.push(
      commitEmail
        ? { name: properName.trim() || null, email: firstEmail, matchName: commitName.trim() || null, matchEmail: commitEmail }
        : { name: properName.trim() || null, email: null, matchName: null, matchEmail: firstEmail },
    );
  }
  return entries;
})();

const canonical = (name, email) => {
  const lower = email.toLowerCase();
  const entry =
    mailmap.find((e) => e.matchEmail.toLowerCase() === lower && e.matchName === name) ??
    mailmap.find((e) => e.matchEmail.toLowerCase() === lower && e.matchName === null);
  return {
    name: entry?.name ?? name,
    key: (entry?.email ?? email).toLowerCase(),
  };
};

/** Authored commits in a revision range, merges excluded, mailmap applied. */
const authored = (...range) =>
  git("log", "--no-merges", "--no-mailmap", "--format=%H%x1f%an%x1f%ae%x1f%cI", ...range)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, name, email, committed] = line.split("\x1f");
      return { hash, committed: Date.parse(committed), ...canonical(name, email) };
    });

const first = git("log", "--reverse", "--topo-order", "--format=%H", "-G\\b(iyi|IYI)", release.tag)
  .split("\n")
  .find(Boolean);
if (!first) die(`no commit reachable from ${release.tag} writes the word iyi, so there is no fork to find`);
const fork = git("rev-parse", `${first}^1`).trim();
const forkDate = Date.parse(git("log", "-1", "--format=%cI", fork).trim());

// Committed, not authored: a commit rebased or cherry-picked onto the fork is
// committed after it whatever its author date, and one of Crystal's arriving
// through a merge was committed before it.
const own = authored(`${fork}..${release.tag}`);
const strays = own.filter((commit) => commit.committed < forkDate);
if (strays.length > 0) {
  die(
    `${strays.length} commits between the fork point ${fork.slice(0, 9)} and ${release.tag} ` +
      `are older than the fork itself (the first is ${strays[0].hash.slice(0, 9)}), which is ` +
      `Crystal's history merged in after the fork. Listing their authors would ` +
      `credit iyi with Crystal's contributors.`,
  );
}

// The releases the history passes through, oldest first, and the earliest of
// them each commit shipped in.
const releases = git("tag", "--merged", release.tag, "--list", "v*")
  .split("\n")
  .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
  .map((tag) => ({ tag, parts: tag.slice(1).split(".").map(Number) }))
  .sort((a, b) => a.parts[0] - b.parts[0] || a.parts[1] - b.parts[1] || a.parts[2] - b.parts[2])
  .map(({ tag }) => tag);
if (releases.at(-1) !== release.tag) {
  die(`the newest release tag reachable from ${release.tag} is ${releases.at(-1)}, so the tags and CHANGELOG.md disagree`);
}

const shippedIn = new Map();
for (const tag of releases) {
  for (const hash of git("rev-list", tag, `^${fork}`).split("\n").filter(Boolean)) {
    if (!shippedIn.has(hash)) shippedIn.set(hash, tag.slice(1));
  }
}

const people = new Map();
for (const commit of own) {
  const person = people.get(commit.key) ?? { names: new Map(), commits: 0, versions: [] };
  person.names.set(commit.name, (person.names.get(commit.name) ?? 0) + 1);
  person.commits++;
  const version = shippedIn.get(commit.hash);
  if (!version) die(`${commit.hash.slice(0, 9)} is in ${release.tag}'s history and in none of its release tags`);
  person.versions.push(version);
  people.set(commit.key, person);
}

const order = releases.map((tag) => tag.slice(1));
const byName = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en");

const contributors = [...people.values()]
  .map((person) => {
    const [name, ...others] = [...person.names.entries()].sort(byName).map(([n]) => n);
    const shipped = person.versions.map((version) => order.indexOf(version)).sort((a, b) => a - b);
    return {
      name,
      aliases: others,
      commits: person.commits,
      since: order[shipped[0]],
      latest: order[shipped.at(-1)],
    };
  })
  .sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name, "en"));

const rootDate = git("log", "-1", "--format=%aI", first).trim().slice(0, 10);

const inherited = authored(fork);
const history = {
  fork: fork.slice(0, 9),
  first: { commit: first.slice(0, 9), date: rootDate },
  commits: own.length,
  people: contributors.length,
  releases: releases.length,
  firstRelease: order[0],
  crystal: {
    url: crystal,
    commits: inherited.length,
    people: new Set(inherited.map((commit) => commit.key)).size,
  },
};

// ---------------------------------------------------------------- around it

// README.md's one sentence about the package directory, and the address it
// links, so the page's link is the README's link.
const packages = passage("README.md", "is a community directory", { sentence: true });
const directory = target(packages, "iyipacks");

// The editors guide: its sections, each a client it says how to set up, and
// the extension it says is published.
const editors = (() => {
  const path = "editors/README.md";
  const text = file(path);
  let fenced = false;
  const sections = [];
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const heading = !fenced && /^##\s+(.*\S)\s*$/.exec(line);
    if (!heading) continue;
    // GitHub's own anchor for a heading: lower case, punctuation dropped,
    // spaces to hyphens.
    const anchor = heading[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    sections.push({ title: heading[1], url: `${blob}/${path}#${anchor}` });
  }
  if (sections.length === 0) die(`${path} at ${release.tag} has no sections, so the page has no editors to name`);

  const published = passage(path, "It is published as");
  const id = /published as `([^`]+)`/.exec(published.text);
  if (!id) die(`${published.cite} no longer names the extension it publishes`);
  return {
    guide: `${blob}/${path}`,
    sections,
    extension: {
      id: id[1],
      cite: published.cite,
      citeUrl: published.url,
      registries: ["Marketplace", "Open VSX"].map((label) => ({ label, url: target(published, label) })),
    },
  };
})();

// The licence: README.md's sentence for what it is and whose, and LICENSE's
// own first two lines for its name, so the name is the file's.
const licence = (() => {
  const said = passage("README.md", "carries Crystal's licence", { sentence: true });
  const [title, version] = file("LICENSE")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (title !== "Apache License" || !/^Version 2\.0\b/.test(version ?? "")) {
    die(`LICENSE at ${release.tag} no longer opens "Apache License / Version 2.0", and README.md says it is Apache 2.0`);
  }
  return {
    ...said,
    name: `${title}, ${version.split(",")[0]}`,
    licence: `${blob}/LICENSE`,
    notice: `${blob}/NOTICE.md`,
  };
})();

const record = {
  provenance: {
    generator: "scripts/community.mjs",
    repository: slug,
    release: release.tag,
    commit: release.commit,
  },
  release: { version: release.version, date: release.date },
  repository: {
    url: home,
    issues: `${home}/issues`,
    pulls: `${home}/pulls`,
    advisory: `${home}/security/advisories/new`,
  },
  scope,
  expects,
  security: { upstream: upstreamReport, fork: forkReport },
  history,
  contributors,
  packages: { ...packages, directory },
  editors,
  licence,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");

console.log(
  `community: ${contributors.length} people, ${own.length} commits since the fork at ` +
    `${fork.slice(0, 9)}, ${releases.length} releases, ${editors.sections.length} editor ` +
    `sections, read at ${release.tag}`,
);
