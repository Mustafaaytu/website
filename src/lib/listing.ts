/**
 * Which lines of a sample a listing shows.
 *
 * Moved out of `Sample.astro` when the lessons gained a Markdown edition at
 * `/learn/<slug>.md`: that edition transcludes the same listings as plain
 * text, and a second copy of this selection would be a second answer to "which
 * lines does this lesson show", free to disagree with the page. So the
 * component and the Markdown both ask here, and only the component paints.
 *
 * Three ways to select part of a file, in order of preference:
 *
 *   region  a named top-level declaration, "impl Greet for User". Survives an
 *           edit above it, which is why it is first.
 *   from    the first line containing it. Add `block` to run through the `end`
 *           that closes it, matched on the opener's own indentation, or `to` to
 *           run through the first later line containing another string. Content
 *           anchored, so both survive an edit above them.
 *   lines   "63-69". A guess about a file nobody edits with this site in mind,
 *           so it requires `must` and fails the build when the guess rots.
 *
 * `must` is available on all three: a substring the selection has to contain.
 */
import samples from "../generated/samples/index.json";

export interface ListingProps {
  path: string;
  region?: string;
  from?: string;
  to?: string;
  block?: boolean;
  lines?: string;
  must?: string;
  caption?: string;
}

type SampleEntry = {
  path: string;
  text: string;
  lines: number;
  regions: Record<string, { start: number; end: number }>;
  ambiguous: string[];
};

export interface Listing {
  /** The file's repository relative path, as the samples index states it. */
  path: string;
  /** The whole file's text, as scripts/samples.mjs read it out of the tree. */
  source: string;
  /** First and last line shown, one based and inclusive. */
  start: number;
  end: number;
  /** The selected lines, joined. */
  text: string;
  /** The caption the listing carries: its line count, or the lines shown. */
  shown: string;
}

export function selectListing(props: ListingProps): Listing {
  const { path, region, from, to, block, lines, must, caption } = props;

  const key = path.replace(/^samples\//, "");
  const sample = (samples as Record<string, SampleEntry>)[key];

  if (!sample) {
    throw new Error(
      `Sample: there is no "${path}" under samples/. The tree has ` +
        `${Object.keys(samples).join(", ")}. A listing on this site is read out ` +
        `of the file it claims to be, so a name that does not resolve is a ` +
        `build failure rather than a blank.`,
    );
  }

  const all = sample.text.replace(/\n$/, "").split("\n");

  let start = 1;
  let end = all.length;
  let whole = true;

  if (region !== undefined) {
    const span = sample.regions[region];
    if (!span) {
      if (sample.ambiguous.includes(region)) {
        throw new Error(
          `Sample: "${region}" is declared more than once in ${sample.path}, so ` +
            `naming it selects nothing. Overloads have to be selected with ` +
            `from/to.`,
        );
      }
      throw new Error(
        `Sample: ${sample.path} declares no "${region}". It declares ` +
          `${Object.keys(sample.regions).join(", ")}.`,
      );
    }
    start = span.start;
    end = span.end;
    whole = false;
  } else if (from !== undefined) {
    const at = all.findIndex((line) => line.includes(from));
    if (at === -1) {
      throw new Error(`Sample: no line of ${sample.path} contains "${from}".`);
    }
    start = at + 1;
    if (block) {
      // Extend to the `end` that closes what `from` opened, found by matching
      // the opener's own indentation. Content anchored like `from` itself, so a
      // block that moves or grows still selects exactly the block.
      const indent = /^\s*/.exec(all[at])?.[0] ?? "";
      const closer = `${indent}end`;
      const close = all.findIndex((line, i) => i > at && line === closer);
      if (close === -1) {
        throw new Error(
          `Sample: ${sample.path} opens a block at line ${start} with "${from}" ` +
            `and no later line is exactly "${closer}", so the block cannot be ` +
            `closed. Widen the selection or use from/to.`,
        );
      }
      end = close + 1;
    } else if (to !== undefined) {
      const close = all.findIndex((line, i) => i > at && line.includes(to));
      if (close === -1) {
        throw new Error(
          `Sample: ${sample.path} has "${from}" at line ${start} but no later ` +
            `line containing "${to}".`,
        );
      }
      end = close + 1;
    } else {
      end = start;
    }
    whole = false;
  } else if (lines !== undefined) {
    if (must === undefined) {
      throw new Error(
        `Sample: selecting ${sample.path} by line number requires "must", a ` +
          `substring the selection has to contain. Without it a line that moves ` +
          `silently shows the wrong code.`,
      );
    }
    const m = /^(\d+)(?:-(\d+))?$/.exec(lines.trim());
    if (!m) throw new Error(`Sample: "${lines}" is not a line or a line range.`);
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : start;
    if (start < 1 || end > all.length || end < start) {
      throw new Error(
        `Sample: ${sample.path} has ${all.length} lines, so ${lines} is not in it.`,
      );
    }
    whole = false;
  }

  const text = all.slice(start - 1, end).join("\n");

  if (must !== undefined && !text.includes(must)) {
    throw new Error(
      `Sample: ${sample.path} lines ${start} to ${end} do not contain "${must}". ` +
        `The file changed under this selection, so the page would have shown ` +
        `code the lesson is not talking about.`,
    );
  }

  // The count is read off the file, never typed. Structural: it is the same on
  // every machine, so it is set flat with no frame and no apology.
  const shown =
    caption ?? (whole ? `${sample.lines} lines` : `lines ${start} to ${end}`);

  return { path: sample.path, source: sample.text, start, end, text, shown };
}
