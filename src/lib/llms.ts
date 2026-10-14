/**
 * The text of `/llms.txt`, which `/llms-full.txt` also opens with.
 *
 * The site in one page of plain text, for answer engines and agents that read
 * a site before they read its pages. Every number here comes from
 * `facts.json` and the records, the same sources the pages read, so this file
 * cannot say something the site does not. It is built, not authored, for the
 * same reason nothing on the site is typed by hand.
 *
 * A function rather than the route's body because two routes serve it: the
 * short file, and the long one that appends every lesson, the tour and the
 * API surfaces after it. One text, so the two cannot drift.
 */
import { getCollection } from "astro:content";
import facts from "../generated/facts.json";
import platforms from "../generated/targets.json";
import proofs from "../generated/proofs.json";
import readme from "../generated/readme.json";
import agent from "../../records/agent.json";
import { tourSections, wasmProvenance } from "../playground/samples";
import { latestRelease } from "./release";
import { SPELLED } from "./lessons";
import { generic, server } from "./mcp";

export async function llmsText(site: URL, hasApi: boolean): Promise<string> {
  /* Every link is the site's origin and base and then a path, so a build
   * served under a base still links to itself. */
  const origin = new URL(import.meta.env.BASE_URL, site).href.replace(/\/$/, "");
  const loop = facts.recorded.edit_loop;

  /* The lessons, counted rather than stated. The path grew from five to eight
   * in one afternoon and this file said five; an agent reading it would have
   * been told the site is smaller than it is. */
  const lessons = (await getCollection("learn")).sort((a, b) => a.data.order - b.data.order);
  const bin = facts.recorded.hello_binary;
  const pack = facts.recorded.context_pack;
  const s = facts.structural;
  const release = latestRelease();

  /* The platforms README.md says are run every build, and how each is run,
   * out of scripts/targets.mjs. This file is read by agents, so a stale
   * count here is worse than one on a page. */
  const ranCount = SPELLED[platforms.ran.length];
  const ranHow = platforms.ran.map((t) => platforms.how[t as keyof typeof platforms.how]);

  /* The jobs that execute on a Windows machine, out of scripts/proofs.mjs and
   * the workflow's own `runs-on` labels. */
  const onWindows = proofs.native.filter((job) => job.os === "windows").length;

  /* The two install commands, quoted out of README.md through
   * scripts/samples.mjs rather than typed here: this file used to carry the
   * POSIX one-liner as text, which was the one copy of it on the site nothing
   * checked, and it said nothing at all about Windows once 0.14.0 published a
   * zip. Indented four spaces, which is how this file sets a command. */
  const indent = (text: string) =>
    text
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");

  /* The loop's verbs and what each one answered with, out of the recording
   * rather than out of a sentence about it. An agent reading this file gets
   * the argv, the stream and the status, which is what it needs to run the
   * loop itself. */
  const loopFrames = agent.frames
    .map(
      (f) =>
        `    ${f.command}${" ".repeat(Math.max(1, 52 - f.command.length))}exit ${f.exitCode}, answers on ${f.payload}`,
    )
    .join("\n");

  const tour = tourSections
    .map(
      (section) =>
        `- ${section.title}: ${section.steps.map((step) => `[${step.id}](${origin}/playground/${step.id}/)`).join(", ")}`,
    )
    .join("\n");

  const markdownEditions = lessons
    .map((lesson) => `- [${lesson.data.title}](${origin}/learn/${lesson.id}.md)`)
    .join("\n");

  return `# iyi

> iyi is a compiled language whose modules compile against their dependencies'
> declarations, never their bodies, so a rebuild reads less and an agent reads
> an interface instead of a repository. Native through LLVM, and compatible
> with Crystal.

iyi is Turkish for "good". Source: https://github.com/iyilang/iyi (Apache 2.0).
Site: ${origin}. Latest release: ${release.version}, ${release.date}.

## What it is

One rule, four sides. A module is the unit of compilation and it compiles
against its dependencies' declarations, never their bodies (R-1). Everything a
module exports writes its types down (R-2). \`import x::{...}\` brings exported
names into a file because that file asked (R-2b). There are no open classes; \`impl Trait
for Type\` lives with the trait or the type (R-3).

- Developer experience: change one line in a ${s.generated.toLocaleString("en-GB")}-line project of ${s.modules}
  modules and rebuild in ${loop.best.iyi} s, against ${loop.best.crystal} s under Crystal's rules on the
  same compiler binary: ${loop.claim.value}x less. Measured by \`${loop.command}\`
  on ${loop.machine}.
- AI experience: a module's interface is a file (.iyimod). \`iyi mod context\`
  grounds an edit at ${pack.size_low} to ${pack.size_high}% of the sources' size; a model writing
  against it spent ${pack.tokens_low} to ${pack.tokens_high}% fewer prompt tokens over ${pack.runs} measured
  runs (\`${pack.command}\`). Rounds to green were the model's: tied ${pack.rounds_tied}
  times and lost ${pack.rounds_lost}. The method, the bar and the runs: ${origin}/agents/benchmark/
  The loop is one verb per step, and every step of it is recorded from a real
  run at ${origin}/agents/:
${loopFrames}
  Both servers are in the binary, with nothing to install: \`iyi mcp\` serves
  ${agent.wire.tools.length} of those verbs over MCP stdio as the tools
  ${agent.wire.tools.map((t) => `\`${t}\``).join(", ")}, and \`iyi lsp\` speaks LSP over stdio to an
  editor. The answer over the wire is byte for byte the answer in a shell:
  ${agent.recorded.command} compares them on every recording and refuses to write
  the record when they differ.
- Portability: compiles for ${s.targets} targets and is run on ${ranCount} every
  build (${ranHow.join(", ")}). ${onWindows} CI jobs execute on a Windows machine,
  and since ${release.version} a release publishes a Windows zip beside the two tarballs.
- Performance and efficiency: native code through LLVM; a hello world is
  ${bin.iyi.kb} KB and starts in ${bin.iyi.ms} ms, against ${bin.crystal.kb.toLocaleString("en-GB")} KB and ${bin.crystal.ms} ms with Crystal's
  library (\`${bin.command}\` on ${bin.machine}).

## Install

${indent(readme.install.text)}

The latest release into ~/.local, on Linux x86-64 or macOS arm64, with both
libraries and the samples. On Windows, PowerShell installs the same release
from the zip into %LOCALAPPDATA%\\Programs\\iyi:

${indent(readme.install_windows.text)}

That machine also needs the Visual C++ build tools, because an iyi program is
linked by cl.exe. Details: ${origin}/install/

## Connect a harness

\`${[server.command, ...server.args].join(" ")}\` is a Model Context Protocol server over stdio. This is the
\`mcpServers\` block most clients read, Claude Code from \`.mcp.json\` at a
project's root among them:

${indent(generic.text)}

The command for Claude Code, the file for Cursor and the command and file for
Codex CLI, each checked against that client's documentation: ${origin}/agents/#connect

## Crystal compatibility

The same compiler builds .cr files unchanged. \`iyi build --crystal\` gives an
iyi program Crystal's standard library, \`require\`, and shards (Kemal, db,
ameba, sqlite3 among those swept through it). A Crystal program cannot require
an iyi module; iyi consumes Crystal, not the other way around.

## Pages

- [Home](${origin}/): the one line, a listing that runs, the Crystal section.
- [Why iyi](${origin}/why/): the four sides, each with its measurement and machine.
- [Learn](${origin}/learn/): ${SPELLED[lessons.length] ?? lessons.length} lessons on the rule, each running a real program.
- [Tour](${origin}/playground/): ${tourSections.reduce((n, x) => n + x.steps.length, 0)} short programs that run in the browser.
- [Playground evidence](${origin}/playground/evidence/): what ran, what checked it.
- [Docs](${origin}/docs/): the API reference, the tools, and iyi for Crystal programmers.
- [For your agents](${origin}/agents/): the loop above as a transcript, every frame a real run, and how to connect a harness.
- [The grounding benchmark](${origin}/agents/benchmark/): what the token figure measures, the bar it has to clear, and the runs trial by trial.
- [Community](${origin}/community/): how to take part, as the repository states it.
- [Install](${origin}/install/): the one-line installer, the by-hand version, and from source.
- [Releases](${origin}/releases/): the release notes, out of CHANGELOG.md, with a feed at ${origin}/releases/feed.xml
- [Download](${origin}/download/): every artifact, the \`uname\` pair it is for, and how to verify it.
- [Targets](${origin}/targets/): what CI type-checks, audits and runs, per triple.
- [Project](${origin}/project/): contributing, security, the code of conduct, the notices.

The design record lives in the repository: SPEC.md is read there, which is
where it is kept current.

## Markdown editions

Every lesson is also published as Markdown, with its listings and recorded
compiler output written out in fences:

${markdownEditions}

[llms-full.txt](${origin}/llms-full.txt) is this file followed by the rule table,
every lesson in full, the tour's programs with their recorded output${hasApi ? ",\nand the API reference's recorded surfaces" : ""}.

## The tour

${tour}

## Provenance

Numbers generated by ${facts.provenance.generator} from the iyi repository at
${facts.provenance.commit}. Programs recorded by ${wasmProvenance.compiler} at
${wasmProvenance.commit.slice(0, 12)}. Where iyi loses is published on the why
page beside where it wins.
`;
}
