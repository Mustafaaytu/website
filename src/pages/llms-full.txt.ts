/**
 * `/llms-full.txt`: `/llms.txt`, then everything it links to that an agent
 * would otherwise have to fetch page by page and strip of layout.
 *
 * In order: the rule table, every lesson in full, the tour's programs with
 * what they printed, and, when `records/api.json` is in the tree, every API
 * surface the compiler recorded. Each part is rendered from the data its page
 * reads: lessons through `src/lib/lesson-markdown.ts`, which the per-lesson
 * `.md` routes use too; listings through `selectListing`, as `Sample` selects
 * them; output out of the wasm record; surfaces out of the API record. So
 * this file carries no sentence a page does not, and no figure typed here.
 */
import type { APIRoute } from "astro";
import rules from "../generated/rules.json";
import { llmsText } from "../lib/llms";
import { apiRecord } from "../lib/api-record";
import { demote, fence, lessonMarkdown, listingMarkdown } from "../lib/lesson-markdown";
import { sequence, type Rule } from "../lib/lessons";
import { runnable, tourSections, wasmProvenance } from "../playground/samples";

export const GET: APIRoute = async ({ site: given }) => {
  const site = given ?? new URL("https://iyi.dev");
  const at = (path: string) => new URL(`${import.meta.env.BASE_URL.replace(/\/*$/, "/")}${path}`, site).href;
  const lessons = await sequence();

  /* The rule table: SPEC.md's own sentence for every identifier a lesson or a
   * recording names, with the line it is stated on. */
  const ruleTable = Object.values(rules as Record<string, Rule>)
    .map((rule) => `- ${rule.id} (${rule.cite}): ${rule.premise}`)
    .join("\n");

  /* Every lesson, one heading level down so its title sits under "Learn". */
  const learn = lessons
    .map((lesson) => {
      const { body } = lessonMarkdown(lesson, site, lessons.length);
      const where =
        `Step ${lesson.data.order} of ${lessons.length}, teaching ${lesson.data.rule}. ` +
        `Page: ${at(`learn/${lesson.id}/`)} Markdown: ${at(`learn/${lesson.id}.md`)}`;
      return `${demote(body, 1)}\n\n${where}`;
    })
    .join("\n\n");

  /* The tour, as samples/tour/tour.json sections it, each program with what
   * the recording says it printed. Both runs are shown when the native binary
   * and the wasm module disagreed, because the record keeps both for that. */
  const tour = tourSections
    .map((section) => {
      const steps = section.steps.map((step) => {
        const head = `### ${step.id}\n\n${listingMarkdown({ path: step.path })}\n\nPage: ${at(`playground/${step.id}/`)}`;
        const printed = (stdout: string) => (stdout === "" ? "It printed nothing." : fence(stdout.replace(/\n$/, ""), "text"));
        if (runnable(step)) {
          const runs = step.identical
            ? `Recorded output, exit code ${step.exitCode}, the same bytes natively and under wasm32-wasi:\n\n${printed(step.nativeStdout)}`
            : `Recorded output natively, exit code ${step.exitCode}:\n\n${printed(step.nativeStdout)}\n\n` +
              `Recorded output under wasm32-wasi:\n\n${printed(step.wasmStdout)}`;
          return [head, runs, step.note ?? ""].filter(Boolean).join("\n\n");
        }
        return [
          head,
          `This program does not run in the browser. ${step.reason}`,
          step.refusal ? `The compiler's refusal:\n\n${fence(step.refusal, "text")}` : "",
          `Recorded output natively, exit code ${step.exitCode}:\n\n${printed(step.nativeStdout)}`,
        ]
          .filter(Boolean)
          .join("\n\n");
      });
      return `## ${section.title}\n\n${section.blurb}\n\n${steps.join("\n\n")}`;
    })
    .join("\n\n");

  /* The API surfaces, only when the record is in the tree. A refusal is
   * quoted as one, with the compiler's own words, rather than skipped. */
  const api = apiRecord
    ? [
        `# API reference`,
        `Each surface below follows the command that printed it, run against ` +
          `the release and recorded by \`${apiRecord.recorded.command}\` with ` +
          `${apiRecord.recorded.compiler} at ${apiRecord.recorded.commit.slice(0, 12)}: ` +
          `declarations and doc comments, no bodies. Pages: ${at("docs/api/")}`,
        `## The prelude\n\n\`${apiRecord.prelude.command}\`\n\n${fence(apiRecord.prelude.stdout.replace(/\n$/, ""), "text")}`,
        ...apiRecord.surfaces.map((surface) =>
          surface.exitCode === 0
            ? `## ${surface.name}\n\n\`${surface.command}\`, ${at(`docs/api/${surface.slug}/`)}\n\n${fence(surface.stdout.replace(/\n$/, ""), "iyi")}`
            : `## ${surface.name}\n\n\`${surface.command}\` exited ${surface.exitCode}, and the compiler said:\n\n${fence(surface.stderr.replace(/\n$/, ""), "text")}`,
        ),
      ].join("\n\n")
    : "";

  const text = [
    (await llmsText(site, apiRecord !== null)).trimEnd(),
    `# The rules\n\nEach rule in SPEC.md's own words, with the line it is stated on.\n\n${ruleTable}`,
    `# Learn\n\n${learn}`,
    `# The tour\n\nEvery program recorded by ${wasmProvenance.compiler} at ${wasmProvenance.commit.slice(0, 12)}, on ${wasmProvenance.machine}.\n\n${tour}`,
    api,
  ]
    .filter(Boolean)
    .join("\n\n");

  return new Response(`${text}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
