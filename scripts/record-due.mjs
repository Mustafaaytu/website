#!/usr/bin/env node
// Whether the committed records are behind the release, and what building
// that release takes. `.github/workflows/record.yml` runs this first, on a
// runner with no compiler, so that a day with nothing new to record costs a
// clone and not a compiler build.
//
// BEHIND MEANS ANY RECORD. Every record says which commit it was recorded at,
// in `recorded.commit`, and the release is the tag CHANGELOG.md states, read
// by `releaseRef` like everything else here. One record naming another commit
// is enough: `npm run record` runs every recorder, and a site whose playground
// is at one release and whose diagnostics are at another is the thing the
// recorders exist to refuse. A record added later is covered by being a JSON
// file under `records/` with a `recorded` object, which is the shape
// `scripts/records.mjs` already requires of every one.
//
// THE IMAGE IS READ, NOT WRITTEN. The compiler is built in the container iyi's
// own CI builds it in, which `.github/workflows/iyi.yml` at the tag names in
// its `build` job. That image carries the Crystal and the LLVM the release was
// built with, so reading it means a release that moves either moves this
// workflow with it, and copying it here would be a second answer that drifts.
//
// IT FAILS RATHER THAN GUESSING. No records, a record with no commit, or a
// workflow whose `build` job names no image are each a sentence and a non-zero
// exit, because "nothing to record" is an answer this script must only give
// when it is true.
//
//   node scripts/record-due.mjs     # prints the answer; in Actions, also
//                                   # writes it to $GITHUB_OUTPUT

import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { blobAt, releaseRef } from "./release-ref.mjs";

const site = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = process.env.IYI_REPO ? resolve(process.env.IYI_REPO) : resolve(site, "..", "iyi");
const records = resolve(site, "records");
const WORKFLOW = ".github/workflows/iyi.yml";

const release = releaseRef(repo);

function* jsonUnder(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonUnder(path);
    else if (entry.name.endsWith(".json")) yield path;
  }
}

// Only files that say they are records. `records/agent/` and `records/break/`
// are this site's own iyi sources, and a JSON file among them is not evidence.
const recorded = [];
for (const path of jsonUnder(records)) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || !("recorded" in parsed)) continue;
  const commit = parsed.recorded?.commit;
  const file = relative(site, path);
  if (typeof commit !== "string" || commit === "") {
    throw new Error(
      `${file} has a "recorded" object with no commit, so nothing can say ` +
        `which release it describes. Regenerate it with npm run record.`,
    );
  }
  recorded.push({ file, commit });
}
if (recorded.length === 0) {
  throw new Error(
    `no file under records/ carries a "recorded" object, so there is no ` +
      `recording to compare with ${release.tag}. The records are committed; ` +
      `this checkout is missing them.`,
  );
}

const behind = recorded.filter((record) => record.commit !== release.commit);

const workflow = blobAt(repo, release.tag, WORKFLOW);
if (workflow === null) {
  throw new Error(
    `${release.tag} has no ${WORKFLOW}, so nothing says which container ` +
      `iyi builds its compiler in, and this workflow will not guess one.`,
  );
}
// The `build` job's block: from its key to the next job at the same depth.
const job = /^ {2}build:\s*\n((?: {4,}.*\n|\s*\n)*)/m.exec(workflow.toString("utf8"));
const image = job && /^ {6}image:\s*(\S+)\s*$/m.exec(job[1]);
if (!image) {
  throw new Error(
    `${WORKFLOW} at ${release.tag} has no "build" job with a container image, ` +
      `which is where iyi says its compiler is built. Read that workflow and ` +
      `build the way it does now; record.yml mirrors it and has nothing to mirror.`,
  );
}

const due = behind.length > 0;
const answer = {
  version: release.version,
  tag: release.tag,
  commit: release.commit,
  image: image[1],
  due: String(due),
};

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(answer)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}

const short = release.commit.slice(0, 9);
if (due) {
  console.log(`${release.tag} is ${short}, and ${behind.length} of ${recorded.length} records name another commit:`);
  for (const record of behind) console.log(`  ${record.file} at ${record.commit.slice(0, 9)}`);
  console.log(`build in ${answer.image}, then npm run record`);
} else {
  console.log(`all ${recorded.length} records name ${short}, the commit ${release.tag} is: nothing to record`);
}
