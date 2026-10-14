/**
 * `/llms.txt`: the site in one page of plain text, for answer engines and
 * agents that read a site before they read its pages. The text is
 * `src/lib/llms.ts`'s, which `/llms-full.txt` opens with too.
 */
import type { APIRoute } from "astro";
import { llmsText } from "../lib/llms";
import { apiRecord } from "../lib/api-record";

export const GET: APIRoute = async ({ site }) =>
  new Response(await llmsText(site ?? new URL("https://iyi.dev"), apiRecord !== null), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
