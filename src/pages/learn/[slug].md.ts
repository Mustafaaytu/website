/**
 * `/learn/<slug>.md`: each step of the path as Markdown.
 *
 * The same step as `/learn/<slug>/`, in the same order, with every listing
 * and recording written out in a fence where the page sets it in a frame. For
 * an agent, which reads text rather than layout, and for anyone who wants a
 * lesson in a terminal. Rendered by `src/lib/lesson-markdown.ts` out of the
 * sources the page reads, so the two editions cannot disagree about a line.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { sequence, type Lesson } from "../../lib/lessons";
import { frontmatter, lessonMarkdown } from "../../lib/lesson-markdown";

export const getStaticPaths = (async () => {
  const lessons = await sequence();
  return lessons.map((lesson) => ({
    params: { slug: lesson.id },
    props: { lesson, total: lessons.length },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ lesson: Lesson; total: number }> = ({ props, site }) => {
  const { meta, body } = lessonMarkdown(props.lesson, site ?? new URL("https://iyi.dev"), props.total);
  return new Response(`${frontmatter(meta)}\n\n${body}\n`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
