/**
 * What each release says it changed, as `scripts/releases.mjs` lifted it out
 * of CHANGELOG.md at the release tag: the summary paragraphs whole, the
 * passages the summary itself marks as breaking, and the opening sentence of
 * every entry under each `###` heading. Every string is the changelog's own,
 * rendered to HTML by `scripts/markdown.mjs`; nothing here writes a word of it.
 *
 * A separate module from `release.ts` on purpose. That one is imported by the
 * layout, so by every page; this record is a quarter of a megabyte and only
 * /releases/ and the feed read it.
 */
import record from "../generated/release-notes.json";

export interface NotesSection {
  /** The `###` heading, rendered. */
  title: string;
  /** The heading's line in CHANGELOG.md at the tag. */
  url: string;
  /** Each entry's opening sentence, rendered. */
  items: string[];
}

export interface ReleaseNotes {
  version: string;
  date: string;
  /** The release on GitHub, at its tag. */
  tag: string;
  /** The whole section in CHANGELOG.md at the tag the site quotes. */
  url: string;
  summary: string[];
  /** Passages of the summary marked as breaking, in the summary's order. */
  breaks: string[];
  sections: NotesSection[];
}

export const notesProvenance = record.provenance;
export const versioning = record.versioning;

/** Every release, newest first, as CHANGELOG.md orders them. */
export const releaseNotes: ReleaseNotes[] = record.releases;

/** The `###` heading a changelog gives what a release took out. */
export const REMOVED = "Removed";

/**
 * What a release breaks, in its own words: the passages its summary marks,
 * and the opening of every entry it filed under Removed, because taking a
 * thing out breaks whatever used it. A release with neither has an empty
 * answer, and the pages show nothing rather than a reassurance the changelog
 * did not give.
 */
export function whatBreaks(release: ReleaseNotes): { marked: string[]; removed: string[] } {
  return {
    marked: release.breaks,
    removed: release.sections.find((section) => section.title === REMOVED)?.items ?? [],
  };
}

/** Where a release's page is, with the deployment's base honoured. */
export function releaseHref(base: string, release: { version: string }): string {
  return `${base.replace(/\/$/, "")}/releases/${release.version}/`;
}
