#!/usr/bin/env node
// Records the release's exported surface, as the compiler prints it.
//
// `iyi doc` prints what a module or a prelude type exports, with its doc
// comments and without its bodies: the same declarations a build compiles a
// consumer against. So the reference on this site is that output, one entry
// per prelude type and one per module under src/std/, and nothing in it is
// written here. A reference typed by hand is a second description of the
// library, and it would be wrong about the library the first time the library
// moved without it.
//
// WHAT IS ENUMERATED, AND FROM WHERE. The prelude types are the ones
// `iyi doc prelude` lists, because the compiler is the one that knows which
// types every program gets without an import. The std modules are every
// `.iyi` file under `src/std/` in the tree at the tag, named the way `import`
// writes them, because that directory is the standard library and a module
// that is in it and not in the reference is a hole a reader cannot see.
//
// A MODULE THE COMPILER WILL NOT DOCUMENT IS RECORDED, NOT DROPPED. Its entry
// carries the exit code and the compiler's own sentence for why, and the page
// for it prints that sentence. Dropping it would make the reference quietly
// smaller than the library, which is the one thing a reference must not be.
// A prelude type is held to more: the compiler listed it, so the compiler
// refusing to print it is a disagreement inside the compiler, and this script
// stops rather than recording it.
//
// Regenerate with: npm run record:api

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  releaseRef,
  requireReleaseCompiler,
  requireReleaseTree,
  treeAt,
} from "./release-ref.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const site = resolve(here, "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const out = resolve(site, "records", "api.json");

// ---------------------------------------------------------------------------
// Toolchain
// ---------------------------------------------------------------------------

const buildDir = process.env.IYI_BUILD
  ? resolve(process.env.IYI_BUILD)
  : resolve(repo, ".build");
const iyi = join(buildDir, "iyi");
if (!existsSync(iyi)) {
  throw new Error(
    `no iyi compiler at ${iyi}. Build it, or set IYI_BUILD to the ` +
      `directory holding the iyi and crystal binaries.`,
  );
}

const env = { ...process.env, IYI_PATH: resolve(repo, "src") };

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

// A recording is evidence about a release, so it is taken from the release:
// the checkout this is pointed at has to be the tag the changelog states, the
// compiler beside it has to have been built there, and the tree has to be
// unedited. `scripts/release-ref.mjs` says why, and says what to run when it
// is not. Commits after the tag reach the site when they are released.
const release = releaseRef(repo);
requireReleaseTree(repo, release, "record:api");
const version = requireReleaseCompiler(iyi, release, "record:api");
const commit = release.commit;

const machine = (() => {
  const uname = execFileSync("uname", ["-srm"], { encoding: "utf8" }).trim();
  // The CPU's name, asked of the platform that knows it: sysctl is darwin's
  // spelling and /proc/cpuinfo is Linux's. A record is made on either.
  const cpu = process.platform === "darwin"
    ? execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], {
        encoding: "utf8",
      }).trim()
    : readFileSync("/proc/cpuinfo", "utf8")
        .split("\n")
        .find((line) => line.startsWith("model name"))
        .split(":")[1]
        .trim();
  return `${uname}, ${cpu}`;
})();

const recorded = {
  compiler: version,
  commit,
  machine,
  command: "npm run record:api",
  when: new Date().toISOString(),
};
for (const [key, value] of Object.entries(recorded)) {
  if (!value) {
    throw new Error(`provenance field "${key}" came out empty`);
  }
}

// ---------------------------------------------------------------------------
// Running `iyi doc`
// ---------------------------------------------------------------------------

// From an empty directory. `iyi doc` looks for a module under the project root
// before IYI_PATH, so run from this repository a file of the site's could
// shadow the library's, and the record would document the wrong thing under
// the right name. An empty directory has nothing to shadow anything with.
const work = mkdtempSync(join(tmpdir(), "iyi-record-api-"));

function doc(subject) {
  const args = ["doc", subject];
  const run = spawnSync(iyi, args, {
    cwd: work,
    encoding: "utf8",
    env,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) {
    throw new Error(`could not run the compiler on "iyi doc ${subject}": ${run.error.message}`);
  }
  if (run.status === null) {
    throw new Error(
      `the compiler was killed by ${run.signal} on "iyi doc ${subject}", so ` +
        `what it printed is neither a surface nor a refusal`,
    );
  }
  return {
    // The compiler is written by name rather than by path: the path is per
    // machine and `recorded.compiler` already pins the exact build.
    command: `IYI_PATH=<iyi>/src iyi ${args.join(" ")}`,
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
  };
}

/* A name as a URL path segment: `std/set` is `std-set`, `String` stays
 * `String`. The record carries it so the pages, the agent files and anything
 * else that links an entry agree on one address without each deriving it. */
const slugOf = (name) => name.replace(/\//g, "-");

// ---------------------------------------------------------------------------
// The prelude: the compiler's own list, then each type on it
// ---------------------------------------------------------------------------

const listing = doc("prelude");
if (listing.exitCode !== 0 || listing.stdout.trim() === "") {
  throw new Error(
    `"iyi doc prelude" exited ${listing.exitCode} and printed ` +
      `${JSON.stringify(listing.stdout.slice(0, 200))}, so there is no list ` +
      `of prelude types to record:\n${listing.stderr}`,
  );
}

// One line per type, as the compiler prints it: what it is, its name with any
// type parameters, then the first line of its doc comment if it has one.
// `class Array(T)        # The one sequence ...`. A line that does not read
// that way is a change in the compiler's format, and guessing at it would be
// recording a type list this script does not understand.
const PRELUDE_LINE = /^([a-z]+)\s+([A-Z][A-Za-z0-9_]*)(?:\([^)]*\))?(?:\s+#.*)?$/;
const preludeTypes = listing.stdout
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const match = PRELUDE_LINE.exec(line);
    if (!match) {
      throw new Error(
        `"iyi doc prelude" printed a line this script cannot read as a type:\n` +
          `  ${line}\nIt expects "<kind> <Name>[(params)] [# comment]".`,
      );
    }
    return match[2];
  });

const surfaces = [];

for (const name of preludeTypes) {
  const run = doc(name);
  if (run.exitCode !== 0 || run.stdout.trim() === "") {
    throw new Error(
      `"iyi doc prelude" lists ${name} and "iyi doc ${name}" exited ` +
        `${run.exitCode} with ${JSON.stringify(run.stderr.trim())}. The ` +
        `compiler disagrees with itself about the prelude, and that is a bug ` +
        `to fix in the compiler, not a refusal to publish.`,
    );
  }
  // The declaration of the type asked for, at the left margin: proof the
  // compiler documented `String` when it was asked for `String`, and not some
  // other type that happens to mention it.
  const declared = new RegExp(`^(?:[a-z]+ )+(?:::)?${name}\\b`, "m");
  if (!declared.test(run.stdout)) {
    throw new Error(
      `"iyi doc ${name}" printed no declaration of ${name} at the left ` +
        `margin, so this script cannot tell it documented the type it was ` +
        `asked about:\n${run.stdout.slice(0, 400)}`,
    );
  }
  surfaces.push({ name, kind: "prelude", slug: slugOf(name), ...run });
}

// ---------------------------------------------------------------------------
// The standard library: every module under src/std/ at the tag
// ---------------------------------------------------------------------------

// Read out of the tag rather than the directory on disk. requireReleaseTree
// has already proved the two are the same tree, and the checker reads the tag,
// so this enumerates the way the check will.
const stdFiles = treeAt(repo, release.tag, "src/std").filter((path) => path.endsWith(".iyi"));
if (stdFiles.length === 0) {
  throw new Error(
    `${release.tag} has no .iyi file under src/std/, so there is no standard ` +
      `library to record. The directory moved, or IYI_REPO is not an iyi tree.`,
  );
}

for (const path of stdFiles) {
  // `src/std/set.iyi` is imported as `std/set`: a module's path is its file's
  // path under the source root (SPEC.md R-1).
  const name = path.replace(/^src\//, "").replace(/\.iyi$/, "");
  const run = doc(name);

  if (run.exitCode === 0) {
    const header = run.stdout.split("\n")[0];
    if (header !== `module ${name}`) {
      throw new Error(
        `"iyi doc ${name}" opened with "${header}" rather than ` +
          `"module ${name}", so this script cannot tell it documented the ` +
          `module it was asked about.`,
      );
    }
  } else if (run.stderr.trim() === "") {
    throw new Error(
      `"iyi doc ${name}" exited ${run.exitCode} and said nothing, so there is ` +
        `neither a surface nor a reason to record`,
    );
  }

  surfaces.push({ name, kind: "std", slug: slugOf(name), path, ...run });
}

rmSync(work, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// One address per entry
// ---------------------------------------------------------------------------

// A slug is a URL path segment and a file name on a case-insensitive disk, so
// two entries that differ only in case would be one page on some machines.
const slugs = new Map();
for (const entry of surfaces) {
  if (!/^[A-Za-z0-9_-]+$/.test(entry.slug)) {
    throw new Error(`"${entry.name}" has slug "${entry.slug}", which is not URL safe`);
  }
  const folded = entry.slug.toLowerCase();
  if (slugs.has(folded)) {
    throw new Error(
      `"${entry.name}" and "${slugs.get(folded)}" share the address ` +
        `"${entry.slug}" once case is ignored`,
    );
  }
  slugs.set(folded, entry.name);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify({ recorded, prelude: listing, surfaces }, null, 2)}\n`,
  "utf8",
);

const refused = surfaces.filter((entry) => entry.exitCode !== 0);
console.log(
  `api: ${preludeTypes.length} prelude types and ` +
    `${stdFiles.length} std modules, ` +
    (refused.length
      ? `${refused.length} refused by the compiler (${refused.map((entry) => entry.name).join(", ")}), `
      : "") +
    `at ${commit.slice(0, 9)}`,
);
