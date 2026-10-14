/**
 * `/releases/feed.xml`: every release as an RSS 2.0 item, newest first.
 *
 * A reader who wants to hear about a release subscribes here rather than
 * watching the repository. Each item is one section of CHANGELOG.md at the
 * release tag, as `scripts/releases.mjs` lifted it: the version, the date its
 * heading gives, and its summary paragraphs as the description, which is the
 * same text as the tag's message and the GitHub release's body. Built, not
 * authored, for the same reason llms.txt is: a feed that drifted from the
 * changelog would tell subscribers about a release that is not the one
 * published.
 *
 * No `lastBuildDate`. The channel's date is the latest release's, so two
 * builds of one tree write the same bytes.
 */
import type { APIRoute } from "astro";
import { releaseHref, releaseNotes } from "../../lib/release-notes";

const xml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* RFC 822, which RSS 2.0 requires: the changelog gives a day, so midnight UTC
 * of it. */
const rfc822 = (date: string): string => new Date(`${date}T00:00:00Z`).toUTCString();

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://iyi.dev");
  const base = import.meta.env.BASE_URL;
  const absolute = (path: string) => new URL(path, origin).href;
  const self = absolute(`${base}releases/feed.xml`);
  const index = absolute(`${base}releases/`);

  const items = releaseNotes
    .map((release) => {
      const link = absolute(releaseHref(base, release));
      const description = release.summary.map((paragraph) => `<p>${paragraph}</p>`).join("\n");
      return [
        "    <item>",
        `      <title>iyi ${xml(release.version)}</title>`,
        `      <link>${xml(link)}</link>`,
        `      <guid isPermaLink="true">${xml(link)}</guid>`,
        `      <pubDate>${rfc822(release.date)}</pubDate>`,
        `      <description>${xml(description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>iyi releases</title>
    <link>${xml(index)}</link>
    <atom:link href="${xml(self)}" rel="self" type="application/rss+xml" />
    <description>Every iyi release, newest first, with the summary CHANGELOG.md gives it.</description>
    <language>en</language>
    <pubDate>${rfc822(releaseNotes[0].date)}</pubDate>
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
};
