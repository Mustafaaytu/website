# iyi.dev

The website for [iyi](https://github.com/iyilang/iyi), published at
https://iyi.dev from this repository.

The site restates the iyi repository rather than describing it: every number,
listing and quotation is generated at build time from that tree - its
README.md, SPEC.md, CHANGELOG.md, its CI workflow, the programs under
`samples/`, and the measurements `bench/doc_numbers.py` already gates there.
Two things this repository authors in iyi, and no more: the playground's tour
under `samples/tour/`, short programs in the sections `samples/tour/tour.json`
lays out, and the agent loop's project under `records/agent/`. Both go through
the same recorders as the repository's own programs. Nothing
on a page is typed by hand, and `scripts/no-transcription.mjs` fails the build
if a figure is.

SPEC.md and CHANGELOG.md are read in the repository, not here. The site used
to publish both, cut into 57 of its 128 routes, and no page anywhere linked
in: every rule citation on the site names a SPEC.md section and line as text.
A design record marked Draft 0 is not documentation for someone learning the
language, and it was standing where a language reference should. What the site
takes from CHANGELOG.md is which release is current, which reaches the
masthead, the home page, the install page and llms.txt, and each release's own
summary and the opening sentence of each change, which is what `/releases/`
and its feed print, all through `scripts/releases.mjs`. The full notes stay
in the repository, linked from every release.

## Building

The scripts look for an iyi checkout beside this one, named `iyi`, or wherever
`IYI_REPO` points:

    git clone git@github.com:iyilang/iyi.git ../iyi
    npm ci
    npm run build            # generate, build, check the built prose
    npm run dev              # the same, served locally

`bench/website_citations.py` checks that every path the documents under `doc/`
cite exists, in this tree or in iyi's.

CI builds from the release, not from master. `site.yml` checks iyi out with its
full history, asks `releaseRef` in `scripts/release-ref.mjs` which release
CHANGELOG.md states, and checks out that tag before any generator runs. So
every page describes one tree, and the commit history `bench/site_facts.py`
counts ends at the release the pages name. Before this the records were read
at the tag and everything else at master: the footer read "measured at
c8978396c", a master commit, beside an install command for 0.17.0, which is
fe3db8354.

A local build reads whatever `../iyi` holds, and its footer names that commit.
To build what CI publishes, point `IYI_REPO` at a worktree at the tag:

    git -C ../iyi worktree add --detach /tmp/iyi-0.12.0 v0.12.0
    IYI_REPO=/tmp/iyi-0.12.0 npm run build

The generators do not refuse master the way the recorders do. What they read
is text and history, which a developer working on a page usually wants as it
is in front of them, and the footer already says which commit it was, so a
local page cannot misstate where its numbers came from. CI is where the tree
is fixed, because CI is what publishes.

## Records

`records/` holds what only a machine with the compiler can produce: the wasm
modules the playground runs, the diagnostics the break-this-rule exercises
show, the agent loop the agents page is a transcript of, the syntax
highlighting of every listing, and the standard library's exported surface as
`iyi doc` prints it, which the API reference is. They are committed, and they
are evidence about **a release**, not about somebody's checkout.

That is what makes them checkable without making the build brittle. Every
recorder refuses to run against anything but the tag CHANGELOG.md states, and
`scripts/records.mjs` reads the recorded files out of that same tag with
`git cat-file` rather than off the working tree. So a commit to the language
after the release cannot make this site stale: the playground keeps running
the tarball the install page tells a reader to download, and commits reach the
site when they are released. Before this, the tenth commit after 0.12.0 edited
a line count inside a comment in `samples/iyi/calc.iyi` and `npm run check`
refused to build a site whose every page was still correct.

Regenerate after a release, in a worktree at its tag so your own branch and
build directory are left alone:

    git -C ../iyi worktree add --detach /tmp/iyi-0.12.0 v0.12.0
    make -C /tmp/iyi-0.12.0 all -j"$(nproc)"
    IYI_REPO=/tmp/iyi-0.12.0 IYI_BUILD=/tmp/iyi-0.12.0/.build \
      WASI_SDK=/path/to/wasi-sdk-24 npm run record

The recorders say this themselves, with the commands, when they are pointed
somewhere else; `scripts/release-ref.mjs` is where the rule lives and why.

wasi-sdk 24, not a later one: the modules are linked for `wasm32-wasi`, the
target README.md publishes, and wasi-sdk renamed that sysroot to
`wasm32-wasip1` and dropped the old name afterwards. `record:wasm` refuses one
without that sysroot by name rather than failing at the linker.

`.github/workflows/record.yml` runs that regeneration when iyi releases, so
nobody has to remember to. Once a day, and when dispatched,
`scripts/record-due.mjs` compares the `recorded.commit` of every record with
the commit the stated tag is, and the run ends there when they all agree. When
one does not, the workflow builds the compiler at the tag in the container
that `.github/workflows/iyi.yml`'s `build` job names at that tag, so the
Crystal and the LLVM are the release's own; downloads wasi-sdk 24 and checks
its digest; runs `npm run record`; then runs `bench/website_citations.py` and
`npm run build` over the result on the runner `site.yml` uses, and opens a
pull request on `records/v<version>`.

A person merges it, because a recorded program that prints something new is a
page that says something new. A recorder that refuses fails the run with its
own sentence, also written to the job summary: a tour program that stopped
compiling after a language change, a verdict that moved. The fix is here, in
the program or the recorder. A scheduled run leaves a recording branch that is
already open alone; a dispatch records again and updates it. The pull request
is opened with `GITHUB_TOKEN`, so it starts no `site.yml` run of its own (the
gates it would run have already passed), and the repository has to allow
Actions to create pull requests, under Settings, Actions, General.

The workflow calls `npm run record` and never a recorder by name, so a
recorder added to that script is run by it without editing the workflow.

`records/agent/` is the second thing this repository authors in iyi: four
modules, left broken on purpose, that `record:agent` takes to green with the
compiler's own verbs and keeps every frame of. That recorder is also the gate
on two claims the site would otherwise only be making. It refuses to write a
record when a verb's verdict moves, when `iyi check` stops offering a
`suggested_edit`, when a body-only change starts moving an interface, or when
the answer the `check` tool gives over MCP stops matching the answer the same
verb gives in a shell.

## Layout

    doc/          the art direction, the stack, the fact base, the playground
                  feasibility and service notes, and screenshots
    samples/tour/ the playground's tour: short programs, this site's own
    records/agent/ the agent loop's project: this site's own, broken on purpose
    scripts/      the generators: facts, targets, releases, samples, tools,
                  community, benchmark, api, records, and the gates on the
                  palette and the built output
    records/      committed recordings (see above)
    src/          the Astro site
    bench/        the two Python checks the build runs
    .github/      site.yml, which builds, gates and deploys from the tag, and
                  record.yml, which re-records when iyi releases

Where the reference pages come from, all of it read at the tag:

    /docs/api/            records/api.json: `iyi doc` for every prelude type
                          and every module under src/std/, by record:api,
                          indexed by scripts/api.mjs
    /docs/tools/          the `iyi help` text in src/compiler/, README.md and
                          editors/*/README.md, through scripts/tools.mjs
    /docs/from-crystal/   README.md's Crystal table and passages from README.md
                          and SPEC.md, through scripts/tools.mjs
    /releases/            CHANGELOG.md, through scripts/releases.mjs, with its
                          feed at /releases/feed.xml
    /community/           CONTRIBUTING.md, SECURITY.md, README.md, editors/ and
                          the git history up to the tag, through
                          scripts/community.mjs
    /agents/benchmark/    bench/context_pack.py, AI_FIRST.md and the CI
                          workflow, through scripts/benchmark.mjs, with the
                          figures from scripts/facts.mjs
    /learn/<slug>.md      each lesson as Markdown, from the data its page uses
    /llms-full.txt        llms.txt, every lesson, the tour with its recorded
                          output, and every API surface
