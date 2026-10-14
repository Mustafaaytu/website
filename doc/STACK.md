# iyi website: front end architecture

A static site for GitHub Pages. This document is the architecture: what is
generated, what is authored, how a number reaches a page, and how the playground
is a slot rather than a guess.

## Stack choice

**Astro**, and the argument for it is short. The site is mostly content with
islands of interactivity, which is exactly Astro's model: zero JavaScript by
default, with components that hydrate only where they must. The duration chart
and the playground are the only two things that ship any client code, and Astro
keeps them isolated. Content collections give typed schemas for the lessons.
MDX lets a lesson embed a real component next to prose. And the build output is
plain files, which is all GitHub Pages can serve anyway.

Alternatives considered and rejected, in writing, because the brief asks for it.

- **Next.js or any framework with a server.** Prohibited by the deployment.
  GitHub Pages serves static files with no compute at request time and no
  control over response headers, so a server framework buys nothing and costs a
  platform.
- **Starlight** (Astro's docs theme). It would impose a recognisable look that
  fights the art direction, and the site's content model is not a generic docs
  site. The docs section is generated from the repository's own SPEC.md, which
  no theme assumes.
- **Eleventy or Hugo.** Both are fine static generators, but neither gives typed
  content collections or a component model that can share the measurement
  components between pages and lessons without a build step of its own. Astro
  is the same language as the components.
- **Hand-rolled static HTML.** The generated pipeline would have to be rebuilt
  by hand, and the component reuse that keeps the two number classes consistent
  would disappear.

## Directory layout

```
site/
  astro.config.mjs          base /iyi, static output, trailing slash
  package.json              build chain: facts, targets, releases, samples, then astro
  scripts/
    release-ref.mjs         resolves the release CHANGELOG.md states to its tag,
                            reads the iyi tree at it, and refuses a recording
                            taken from anything else
    facts.mjs               runs bench/site_facts.py, writes generated/facts.json
    targets.mjs             reads the platforms out of iyi's CI workflow and the
                            run set out of README.md, writes generated/targets.json
    releases.mjs            reads CHANGELOG.md's release headings, writes
                            generated/releases.json; and at the release tag,
                            each release's summary, the passages it marks as
                            breaking and its entries' opening sentences, with
                            SPEC.md IV.5, into generated/release-notes.json
    samples.mjs             transcludes samples/iyi, samples/tour, records/break
                            and records/agent into generated/samples/
    tools.mjs               reads `iyi help`, each verb's own help, and passages
                            of README.md, SPEC.md and the editors guides out of
                            the release tag, writes generated/tools.json for
                            /docs/tools/ and /docs/from-crystal/
    benchmark.mjs           reads bench/context_pack.py, AI_FIRST.md §5 and the
                            CI workflow at the release tag, writes
                            generated/benchmark.json: the method and the runs
                            behind /agents/benchmark/
    record-agent.mjs        recorder: runs the agent loop against a real
                            compiler, writes records/agent.json, and gates the
                            MCP-equals-shell claim by comparing both answers
    contrast.mjs            build gate: computes the palette's contrast, and
                            forbids a hand-typed ratio in src/styles
    no-transcription.mjs    build gate: forbids hand-typed recorded numbers
    prose.mjs               build gate: forbids a word or figure welded to the
                            next one in the built HTML
  src/
    styles/                 tokens.css, base.css, code.css
    components/             Measure, Stamped, DurationChart, Sample, Quote,
                            Compare, Frame, Lifted, Passage, Usage
    layouts/Page.astro      masthead, colophon, fonts, styles, scheme switch
    pages/                  index, why, agents, playground, learn, install,
                            download, targets, project
    playground/             the slot: types, registry, engines
    generated/              build output, gitignored, never edited
```

## The numbers pipeline

This is the load-bearing part, and it is the reason the site cannot drift.

**No number is ever typed into a page.** Every figure arrives from the
repository through `bench/site_facts.py`, which has two sources. Structural
numbers come from `bench/doc_numbers.py`'s `measured()`, the same function that
already gates `README.md` in CI, so the page and the gate cannot disagree.
Recorded numbers (seconds, bytes, milliseconds) are parsed out of `README.md`,
because that is where this project publishes them, and they are emitted only as
groups carrying the machine that produced them, the command that prints them,
and every session the README publishes. If any pattern stops matching, the
script fails rather than defaulting, which is the same rule
`bench/doc_numbers.py` applies to itself.

The build chain runs `bench/site_facts.py` and writes
`src/generated/facts.json`. The components read that file. `Measure`
renders a structural number and throws if the key is absent. `Stamped` renders
a recorded group inside a calibration card. `scripts/facts.mjs` is what refuses
a recorded group naming no machine or no command, so the provenance gate sits
on the record rather than on the card that shows it. So a missing figure fails
the build instead of rendering blank, and a hand-typed figure has no component
to live in.

A second gate, `scripts/no-transcription.mjs`, scans the authored
directories (pages, content, components) for a recorded value written next to a
time or size unit, and fails the build naming the file. This is belt and
braces: the components already make transcription unnecessary, and this makes
it impossible to do it quietly. It is deliberately narrow, matching a decimal
followed by `s`, `ms`, `KB` or `seconds`, so it does not flag CSS values or
line numbers.

The two classes of number are rendered differently by design; see
`doc/ART-DIRECTION.md`. The pipeline is what enforces it.

## What is generated versus authored

- **Generated, verbatim, never edited:** the README recordings a page quotes,
  lifted by anchor with their line range by `scripts/samples.mjs`, and the
  compiler diagnostics a lesson shows, replayed byte for byte out of
  `records/diagnostics.json`.
- **Recorded, and gated on its own claim:** the agent loop at `/agents/`.
  `scripts/record-agent.mjs` runs the compiler's verbs against
  `records/agent/` and keeps every frame's argv, stream, exit code and bytes.
  It is the only recorder here that also falsifies two sentences: the record
  is refused when `iyi check` stops offering a `suggested_edit`, when a
  body-only edit starts moving an interface, or when the answer the `check`
  tool gives over MCP stops matching the answer the same verb gives in a
  shell. The site had been making the last of those claims in prose, which
  nobody could check.
- **Recorded, and held to the release whole:** the API reference at
  `/docs/api/`. `scripts/record-api.mjs` runs `iyi doc` over every type
  `iyi doc prelude` lists and every module under `src/std/` at the tag, and
  keeps each command, exit code and output; a module the compiler refuses to
  document is recorded with its refusal and its page prints that. The surface
  is the compiler's reading of the library, so it cannot be checked file by
  file: `scripts/records.mjs` refuses it unless it was recorded at the
  release commit and covers exactly the modules the tag ships.
  `scripts/record-highlight.mjs` sets each surface in the compiler's tokens,
  keyed `iyi doc <name>`, so it runs after `record:api`. `scripts/api.mjs`
  adds what a page needs on top: each entry's first sentence, quoted from its
  own doc comment or its module file at the tag, and an anchor per declaration.
- **Not published at all:** SPEC.md and CHANGELOG.md. The site used to cut
  them into 57 of its 128 routes, and nothing anywhere linked in: every rule
  citation on the site names a SPEC.md section and line as text. A design
  record marked Draft 0, whose Part III is open questions and whose Appendix B
  is decisions awaiting a call, is not documentation, and a reader who reached
  it from a search for how the language works got the wrong answer confidently.
  Both files stay in the repository. `scripts/releases.mjs` reads what the
  site still needs from them: which release is current, and for `/releases/`
  each release's own summary, what it marks as breaking and the opening
  sentence of each entry, read at the tag and linked back to the lines they
  came from, with SPEC.md's versioning rule quoted the same way.
- **Generated, transcluded:** sample code in lessons, copied from
  `samples/iyi/` by `scripts/samples.mjs`, so a sample that changes in the
  repository changes on the site. Renaming a sample a lesson names fails the
  build.
- **Generated, measured:** all numbers, via the pipeline above.
- **Generated, for agents, as text:** `/llms.txt`, `/llms-full.txt` and each
  lesson at `/learn/<slug>.md`. They are rendered from the data the pages
  read, not from a copy of it: `src/lib/lesson-markdown.ts` writes a lesson
  out in the page's order with every `Sample` resolved through the same
  `src/lib/listing.ts` selection the component uses and every `Quote` and
  recorded rejection out of its record, and refuses a component it does not
  know. `/llms-full.txt` appends the rule table, every lesson, the tour's
  programs with their recorded output and, when `records/api.json` is in the
  tree, every recorded API surface. The MCP setup snippets on `/agents/` are
  the one thing there that is not iyi's: the client syntax lives in
  `src/lib/mcp.ts` with the client documentation each was checked against.
- **Authored fresh:** the marketing pages and the lessons. SPEC.md is a design
  record, not teaching material, so the learning path is written by hand but is
  grounded in real samples and real README passages, and every factual claim in
  it cites the file it came from.

## The playground as a slot

The playground is an interface, not an implementation. `src/playground/`
defines `PlaygroundEngine` with `ready()`, `capabilities()`, `run()`,
`cancel()` and `dispose()`, and a `Capability` union covering compile, run,
emit-iyimod, mod-dump, format and diagnostics. `capabilities()` drives the UI,
so an engine that cannot compile renders an honestly reduced interface rather
than a broken full one. A registry holds the active engine, and until a real
one is wired in the active engine is `unavailableEngine`, a null object that
reports no capabilities and yields a single `unsupported` event. It never emits
fake output and never emits an exit code, so it cannot pretend to have run
code.

The one hard constraint is documented in `types.ts` and repeated here because
it bounds what any engine can do. GitHub Pages cannot set the
`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response
headers, so the page is not cross-origin isolated, so `SharedArrayBuffer` is
unavailable. A wasm engine therefore cannot use threads and cannot do
synchronous standard input via `Atomics.wait`. Any engine implementation must
satisfy that.

## Deployment

GitHub Pages from the `docs/website` branch's `dist`, or from a Pages
action that builds and uploads. The base path is `/iyi` and is read from
`import.meta.env.BASE_URL` everywhere a link is built, so the same build can
move to a custom domain by changing two environment variables. The build is
pure static output; there is no server-side step.

## What this architecture refuses

- A number that is not in `facts.json`.
- A recorded number without a machine.
- A hand-edited copy of SPEC.md or CHANGELOG.md.
- A playground that fakes a run.
- Any client JavaScript beyond the chart and the playground.
