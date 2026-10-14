#!/usr/bin/env node
// How the grounding measurement is taken, read out of the gate that takes it.
//
// WHY THIS EXISTS. `/agents/benchmark/` publishes the one number on this site
// that is about a model rather than a machine: a grounded edit spent fewer
// prompt tokens. The figure itself reaches the site the way every recorded
// figure does, parsed out of README.md by `bench/site_facts.py` into
// `facts.recorded.context_pack`. What that record does not carry is the
// method: which programs, what counts as green, how many trials, what bar the
// result has to clear, and the per-run tables the README points at. A page
// that wrote those down by hand would be the site describing a benchmark
// rather than restating one, and it would go stale the first time the gate
// changed its targets or its bar.
//
// So the method is read out of the two files that state it, at the release
// tag rather than off a working tree, for the reason `release-ref.mjs` gives:
//
//   bench/context_pack.py   the targets and their import closures, the body
//                           marker the pack must not carry, the size line,
//                           the trial count, the round cap, the token bar,
//                           the build and fix commands that decide green, the
//                           task the model is given, and the two invocations
//                           its docstring names;
//   AI_FIRST.md §5          every run the section sets out trial by trial,
//                           and the harness it names for them;
//   .github/workflows/iyi.yml  the CI steps that run the token arm.
//
// Every value is matched by its shape in the file and fails loudly when the
// shape moves, naming the file and what it no longer says. Nothing is
// defaulted: a page saying "three trials" because a regex missed is the
// failure this repository exists to prevent.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blobAt, releaseRef } from "./release-ref.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "src", "generated");

const release = releaseRef(repo);

const SCRIPT = "bench/context_pack.py";
const RECORD = "AI_FIRST.md";
const WORKFLOW = ".github/workflows/iyi.yml";

/** A file as the release ships it, or a failure naming the file. */
function read(path) {
  const bytes = blobAt(repo, release.tag, path);
  if (bytes === null) {
    throw new Error(
      `benchmark: ${release.tag} has no ${path}. The benchmark page restates ` +
        `the method out of that file, so without it there is no method to show.`,
    );
  }
  return bytes.toString("utf8");
}

/** The first match of a pattern, with the one-based line it starts on. */
function find(text, pattern, file, what) {
  const match = pattern.exec(text);
  if (!match) {
    throw new Error(
      `benchmark: ${file} at ${release.tag} no longer states ${what}. The ` +
        `page prints it, so the shape it was read by has to follow the file.`,
    );
  }
  return { match, line: text.slice(0, match.index).split("\n").length };
}

/* ------------------------------------------------------------------------ */
/* bench/context_pack.py                                                     */
/* ------------------------------------------------------------------------ */

const script = read(SCRIPT);

/** A Python dict literal of string keys, read entry by entry. */
function dictBlock(name) {
  const { match, line } = find(
    script,
    new RegExp(`^${name} = \\{\\n([\\s\\S]*?)^\\}`, "m"),
    SCRIPT,
    `a ${name} dict`,
  );
  return { body: match[1], line };
}

/* The targets: an entry file and the import closure whose sources raw
 * grounding costs. Python's own literal, so a list per key. */
const targets = (() => {
  const { body } = dictBlock("TARGETS");
  const found = [...body.matchAll(/"([^"]+)":\s*\[([\s\S]*?)\]/g)].map((entry) => ({
    entry: entry[1],
    closure: [...entry[2].matchAll(/"([^"]+)"/g)].map((source) => source[1]),
  }));
  if (found.length === 0 || found.some((target) => target.closure.length === 0)) {
    throw new Error(
      `benchmark: ${SCRIPT} at ${release.tag} has a TARGETS dict this script ` +
        `cannot read as entry files and their closures.`,
    );
  }
  return found;
})();

/* The line from a body each pack is checked not to carry, per target. */
const markers = (() => {
  const { body } = dictBlock("BODY_MARKERS");
  const found = Object.fromEntries(
    [...body.matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((entry) => [entry[1], entry[2]]),
  );
  for (const target of targets) {
    if (!found[target.entry]) {
      throw new Error(
        `benchmark: ${SCRIPT} at ${release.tag} measures ${target.entry} and ` +
          `names no body marker for it, so the page cannot say what the pack ` +
          `is checked not to carry.`,
      );
    }
    target.marker = found[target.entry];
  }
  return found;
})();

const threshold = (() => {
  const { match, line } = find(script, /^THRESHOLD = (0\.\d+)\s*$/m, SCRIPT, "THRESHOLD");
  return { percent: Math.round(Number(match[1]) * 100), line };
})();

const trials = Number(
  find(script, /"--trials", type=int, default=(\d+)/, SCRIPT, "the default trial count").match[1],
);

/* The round cap: `for attempt in range(1, N)` asks the model at most N - 1
 * times before a trial counts as never green. */
const attempts =
  Number(find(script, /for attempt in range\(1, (\d+)\)/, SCRIPT, "the round cap").match[1]) - 1;

/* The token bar: the pack's prompt bytes against the raw arm's times a
 * factor, which is the saving it has to reach. */
const tokenBar = (() => {
  const { match, line } = find(
    script,
    /if not pack_bytes <= raw_bytes \* (0\.\d+):/,
    SCRIPT,
    "the bar the pack's prompt bytes have to clear",
  );
  return { percent: Math.round((1 - Number(match[1])) * 100), line };
})();

/* The rounds bar: a loss is pack rounds over raw rounds, so a tie passes. */
const roundsBar = find(
  script,
  /if pack_rounds > raw_rounds:/,
  SCRIPT,
  "the bar the pack's rounds have to clear",
).line;

/** An argv list written `[str(IYI), "verb", ...]`, as the command it runs. */
function argv(verb) {
  const { match } = find(
    script,
    new RegExp(`\\[str\\(IYI\\), "${verb}"((?:, "[^"]+")*)\\]`),
    SCRIPT,
    `the iyi ${verb} command a trial runs`,
  );
  return ["iyi", verb, ...[...match[1].matchAll(/"([^"]+)"/g)].map((arg) => arg[1])].join(" ");
}

const build = argv("build");
const fix = argv("fix");

/* The task, verbatim, with the lines it occupies, because the page quotes it
 * as a listing and a listing here carries its lines. */
const task = (() => {
  const { match, line } = find(script, /^TASK = """([\s\S]*?)"""/m, SCRIPT, "the TASK text");
  const text = match[1].replace(/\n+$/, "");
  return { text, from: line, to: line + text.split("\n").length - 1 };
})();

/* What a green answer has to mention, as the tuple writes them. */
const marks = (() => {
  const { match } = find(script, /^TASK_MARKS = \(([^)]*)\)/m, SCRIPT, "TASK_MARKS");
  const found = [...match[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((mark) => mark[1] ?? mark[2]);
  if (found.length === 0) {
    throw new Error(`benchmark: ${SCRIPT} at ${release.tag} has an empty TASK_MARKS.`);
  }
  return found;
})();

/* The two invocations the docstring sets, each with the comment saying which
 * arms it runs. */
const usage = [
  ...script.matchAll(/^ {4}(python3 bench\/context_pack\.py[^#\n]*?)\s+#\s*(.+)$/gm),
].map((use) => ({ command: use[1].trim(), runs: use[2].trim() }));
if (usage.length === 0) {
  throw new Error(
    `benchmark: ${SCRIPT} at ${release.tag} no longer sets out how it is run ` +
      `in its docstring, so the page has no command to print.`,
  );
}

/* The rounds arm runs on one target, named in its own call to pack_for. */
const roundsTarget = find(
  script,
  /\("pack", pack_for\("([^"]+)"\)\)/,
  SCRIPT,
  "which target the rounds arm grounds",
).match[1];
if (!targets.some((target) => target.entry === roundsTarget)) {
  throw new Error(
    `benchmark: the rounds arm in ${SCRIPT} grounds ${roundsTarget}, which ` +
      `TARGETS does not list.`,
  );
}

/* ------------------------------------------------------------------------ */
/* The CI steps that run the token arm                                       */
/* ------------------------------------------------------------------------ */

const ci = (() => {
  const lines = read(WORKFLOW).split("\n");
  const steps = [];
  lines.forEach((line, index) => {
    if (!/\bbench\/context_pack\.py\b/.test(line) || /^\s*#/.test(line)) return;
    /* The step a run line belongs to is the nearest `- name:` above it. */
    for (let up = index; up >= 0; up -= 1) {
      const named = /^\s*-\s+name:\s*(.+?)\s*$/.exec(lines[up]);
      if (named) {
        steps.push({ name: named[1], line: index + 1 });
        return;
      }
    }
  });
  if (steps.length === 0) {
    throw new Error(
      `benchmark: ${WORKFLOW} at ${release.tag} runs ${SCRIPT} in no step, so ` +
        `the page cannot say the token arm is gated in CI.`,
    );
  }
  return { workflow: WORKFLOW, steps };
})();

/* ------------------------------------------------------------------------ */
/* AI_FIRST.md §5                                                            */
/* ------------------------------------------------------------------------ */

const runs = (() => {
  const lines = read(RECORD).split("\n");
  const start = lines.findIndex((line) => /^##\s+5\.\s/.test(line));
  if (start === -1) {
    throw new Error(
      `benchmark: ${RECORD} at ${release.tag} has no "## 5." section, which ` +
        `is where README.md says every run is written up.`,
    );
  }
  let end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  if (end === -1) end = lines.length;
  const heading = lines[start].replace(/^##\s+/, "");

  const HEADER = /^\|\s*arm\s*\|\s*rounds per trial\s*\|\s*total rounds\s*\|\s*total prompt bytes\s*\|\s*$/;
  const number = /^[\d,]+$/;

  const tables = [];
  for (let at = start; at < end; at += 1) {
    if (!HEADER.test(lines[at])) continue;
    const arms = {};
    let row = at + 2;
    for (; row < end && lines[row].startsWith("|"); row += 1) {
      const [arm, perTrial, total, bytes] = lines[row]
        .replace(/^\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((cell) => cell.trim());
      const rounds = perTrial.split(",").map((n) => Number(n.trim()));
      const entry = {
        rounds,
        total: number.test(total) ? Number(total.replace(/,/g, "")) : NaN,
        bytes: number.test(bytes) ? Number(bytes.replace(/,/g, "")) : NaN,
      };
      if (rounds.some(Number.isNaN) || Number.isNaN(entry.total) || Number.isNaN(entry.bytes)) {
        throw new Error(
          `benchmark: ${RECORD} line ${row + 1} is a row of a run table this ` +
            `script cannot read as numbers: ${lines[row]}`,
        );
      }
      /* The table states its total beside the trials it totals. If they
       * disagree the record contradicts itself, and the page would print
       * one of the two without knowing which is right. */
      const sum = rounds.reduce((a, b) => a + b, 0);
      if (sum !== entry.total) {
        throw new Error(
          `benchmark: ${RECORD} line ${row + 1} gives ${arm} trials of ` +
            `${rounds.join(", ")} and a total of ${entry.total}, which they do ` +
            `not add up to.`,
        );
      }
      arms[arm] = entry;
    }
    if (!arms.pack || !arms.raw) {
      throw new Error(
        `benchmark: the run table at ${RECORD} line ${at + 1} has arms ` +
          `${Object.keys(arms).join(", ")}, and a run is a pack arm against a ` +
          `raw arm.`,
      );
    }
    const saving = Math.round((1 - arms.pack.bytes / arms.raw.bytes) * 100);
    const verdict =
      arms.pack.total < arms.raw.total ? "won" : arms.pack.total === arms.raw.total ? "tied" : "lost";
    tables.push({ from: at + 1, to: row, pack: arms.pack, raw: arms.raw, saving, rounds: verdict });
  }
  if (tables.length === 0) {
    throw new Error(
      `benchmark: ${RECORD} §5 at ${release.tag} sets out no run as a table ` +
        `headed "arm | rounds per trial | total rounds | total prompt bytes".`,
    );
  }

  /* The harness the section names for the model runs, every version it
   * names, read off the section with its line wrapping undone. */
  const flat = lines.slice(start, end).join(" ").replace(/\s+/g, " ");
  const harness = [...new Set([...flat.matchAll(/Claude Code (\d+\.\d+\.\d+)/g)].map((m) => m[0]))];
  if (harness.length === 0) {
    throw new Error(
      `benchmark: ${RECORD} §5 at ${release.tag} names no harness for its ` +
        `model runs, so the page cannot say what ran them.`,
    );
  }

  return { source: RECORD, section: heading, line: start + 1, harness, tables };
})();

/* ------------------------------------------------------------------------ */

const benchmark = {
  provenance: {
    generator: "scripts/benchmark.mjs",
    release: release.version,
    tag: release.tag,
    commit: release.commit,
  },
  script: {
    path: SCRIPT,
    usage,
    targets,
    roundsTarget,
    threshold,
    trials,
    attempts,
    tokenBar,
    roundsBarLine: roundsBar,
    build,
    fix,
    task,
    marks,
  },
  ci,
  runs,
};

mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "benchmark.json"), `${JSON.stringify(benchmark, null, 2)}\n`, "utf8");

console.log(
  `benchmark: ${targets.length} targets, ${runs.tables.length} run tables from ` +
    `${RECORD} §5, ${ci.steps.length} CI steps, read at ${release.tag}`,
);
