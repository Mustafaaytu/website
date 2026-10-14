/**
 * A lesson as Markdown, with everything the page transcludes written out.
 *
 * WHY. An agent asked to write iyi reads a lesson better as text than as a
 * page: no rail, no ticks, no highlighting spans, and the listings in fences
 * it can copy. The lesson's own source is not that text, because a lesson is
 * MDX and the listings in it are references, `<Sample path=... region=.../>`,
 * that only the build resolves. Publishing the `.mdx` would hand an agent a
 * pointer where the page has a program.
 *
 * So this renders the page's shape, in the page's order, out of the same
 * sources the page reads: the premise out of rules.json, the listing through
 * `selectListing`, the quoted recordings out of readme.json, the recorded
 * rejections out of records/diagnostics.json. A lesson that changes changes
 * both, and a selection that fails fails both.
 *
 * IT REFUSES WHAT IT DOES NOT KNOW. A component other than Sample or Quote in
 * a lesson, or an attribute it does not understand, is a build failure naming
 * the lesson, because the alternative is a Markdown edition with a hole where
 * the page has content and nothing noticing.
 */
import readme from "../generated/readme.json";
import { selectListing, type ListingProps } from "./listing";
import { breakCases, lessonHref, ruleById, rulesOf, runOf, type Lesson } from "./lessons";

type Block = { text: string; from: number; to: number; source: string; cite: string };

/** A fenced block that cannot be closed early by a run of backticks inside it. */
export function fence(text: string, info = ""): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${info}\n${text}\n${ticks}`;
}

/** A listing with the caption the page gives it, as a paragraph and a fence. */
export function listingMarkdown(props: ListingProps): string {
  const listing = selectListing(props);
  return `\`${listing.path}\`, ${listing.shown}:\n\n${fence(listing.text, "iyi")}`;
}

const QUOTE_FACES = ["console", "shell", "diagnostic", "source"] as const;
type QuoteFace = (typeof QUOTE_FACES)[number];

/** A recording quoted out of README.md, with the citation the page prints. */
function quoteMarkdown(id: string, as: QuoteFace, caption: string | undefined, claimant: string): string {
  const block = (readme as Record<string, Block>)[id];
  if (!block) {
    throw new Error(
      `${claimant}: Quote "${id}" is not a recording scripts/samples.mjs ` +
        `extracts. It has ${Object.keys(readme).join(", ")}.`,
    );
  }
  switch (as) {
    case "console":
      return `${fence(block.text, "console")}\n\n${caption ?? `Quoted from ${block.cite}`}.`;
    case "shell":
      return `${fence(block.text, "sh")}\n\n${caption ?? `Quoted from ${block.cite}`}.`;
    case "diagnostic":
      return `${fence(block.text, "text")}\n\n${caption ? `${caption}. ` : ""}Quoted verbatim from ${block.cite}.`;
    case "source":
      return `${fence(block.text)}\n\n${caption ? `${caption}, quoted` : "Quoted"} from ${block.cite}.`;
  }
}

/** The attributes of one self-closing element, as MDX writes them here. */
function attributes(source: string, claimant: string): Record<string, string | true> {
  const found: Record<string, string | true> = {};
  const rest = source.replace(/\s*([A-Za-z]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g, (_, name, double, single) => {
    found[name] = double ?? single ?? true;
    return "";
  });
  if (rest.trim() !== "") {
    throw new Error(
      `${claimant}: an element's attributes include "${rest.trim()}", which is ` +
        `not a quoted string or a bare flag. The Markdown edition resolves ` +
        `only those, so it cannot say what this one shows.`,
    );
  }
  return found;
}

/** One Sample or Quote element, written out. */
function transclude(name: string, raw: string, claimant: string): string {
  const attrs = attributes(raw, claimant);
  const text = (key: string) => {
    const value = attrs[key];
    if (value === undefined) return undefined;
    if (value === true) {
      throw new Error(`${claimant}: <${name}> carries "${key}" with no value.`);
    }
    return value;
  };

  if (name === "Sample") {
    const known = ["path", "region", "from", "to", "block", "lines", "must", "caption"];
    const unknown = Object.keys(attrs).filter((key) => !known.includes(key));
    if (unknown.length > 0) {
      throw new Error(`${claimant}: <Sample> carries ${unknown.join(", ")}, which it does not take.`);
    }
    const path = text("path");
    if (!path) throw new Error(`${claimant}: a <Sample> names no path.`);
    return listingMarkdown({
      path,
      region: text("region"),
      from: text("from"),
      to: text("to"),
      block: attrs.block === true,
      lines: text("lines"),
      must: text("must"),
      caption: text("caption"),
    });
  }

  const known = ["id", "as", "caption", "copy"];
  const unknown = Object.keys(attrs).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${claimant}: <Quote> carries ${unknown.join(", ")}, which it does not take.`);
  }
  const id = text("id");
  if (!id) throw new Error(`${claimant}: a <Quote> names no id.`);
  const as = (text("as") ?? "console") as QuoteFace;
  if (!QUOTE_FACES.includes(as)) {
    throw new Error(`${claimant}: <Quote as="${as}"> is not a face Quote has.`);
  }
  return quoteMarkdown(id, as, text("caption"), claimant);
}

/**
 * A lesson's MDX body as Markdown: its ESM imports dropped, every Sample and
 * Quote resolved, and anything else that looks like a component refused.
 */
export function resolveBody(lesson: Lesson): string {
  const claimant = `src/content/learn/${lesson.id}.mdx`;
  const body = lesson.body;
  if (body === undefined) {
    throw new Error(`${claimant}: the content layer kept no body for this lesson.`);
  }

  const resolved = body
    .replace(/^import\s+\w+\s+from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/<(Sample|Quote)\b([\s\S]*?)\/>/g, (_, name, raw) => transclude(name, raw, claimant));

  const leftover = /<[A-Z][\w.]*[\s/>]|^export\s+(?:const|let|function|default|\{)/m.exec(resolved);
  if (leftover) {
    throw new Error(
      `${claimant}: the lesson uses "${leftover[0].trim()}", which the ` +
        `Markdown edition does not know how to write out. Teach ` +
        `src/lib/lesson-markdown.ts the component rather than publishing a ` +
        `lesson with a hole in it.`,
    );
  }

  return resolved.replace(/\n{3,}/g, "\n\n").trim();
}

/** Every `#` heading in a Markdown text pushed `by` levels deeper, fences left alone. */
export function demote(markdown: string, by: number): string {
  let open: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = /^(`{3,}|~{3,})/.exec(line);
      if (marker) {
        if (open === null) open = marker[1];
        else if (line.startsWith(open) && line.trim() === open) open = null;
        return line;
      }
      if (open === null && /^#{1,6}\s/.test(line)) return `${"#".repeat(by)}${line}`;
      return line;
    })
    .join("\n");
}

export interface LessonMarkdown {
  /** The fields an agent indexes a lesson by, in the order a reader wants them. */
  meta: [string, string | number][];
  /** The lesson as the page sets it, from its title down. */
  body: string;
}

/**
 * The lesson in the page's order: the rule it teaches, the program it runs,
 * the lesson, every recorded way of breaking the rule, what the rule bought,
 * and what the prose stands on. Every link is absolute, resolved against
 * `site`, so the text survives being read outside the site; the paths it
 * resolves already carry the deployment's base.
 */
export function lessonMarkdown(lesson: Lesson, site: URL, total: number): LessonMarkdown {
  const run = runOf(lesson);
  const sources = lesson.data.sources ?? [];
  const page = new URL(lessonHref(import.meta.env.BASE_URL, lesson), site).href;

  const says = rulesOf(lesson)
    .map((rule) => `> ${rule.premise}\n>\n> ${rule.id}, ${rule.cite}`)
    .join("\n\n");

  const runs = [
    `This step is grounded in \`${run.path}\`, ${run.lines} lines in the repository.`,
    run.href
      ? `Run it in your browser at ${new URL(run.href, site).href}, from the module the compiler built for it.`
      : `This program does not run in the browser. Locally it is \`iyi run ${run.path}\`.`,
    ...(run.note ? [run.note] : []),
  ].join(" ");

  const broken = breakCases(lesson).map((entry, i) => {
    const rule = ruleById(entry.rule, `diagnostics.json case ${entry.id}`);
    const also = i === 0 ? (lesson.data.breaksAlso ?? []) : [];
    const listings = [entry.path, ...also].map((path) => listingMarkdown({ path }));
    const recording = fence(`$ ${entry.command}\n${entry.stderr.replace(/\n$/, "")}`, "text");
    const cited =
      `${rule.id}: ${rule.premise}\n\n` +
      `${rule.cite}. Recorded run, exit code ${entry.exitCode}, ${entry.recorded.compiler}, ` +
      `commit ${entry.recorded.commit.slice(0, 12)}. Regenerate with \`${entry.recorded.command}\`.`;
    return `## Break it: ${entry.title}\n\n${listings.join("\n\n")}\n\n${recording}\n\n${cited}`;
  });

  const standing =
    sources.length > 0
      ? `## Standing on\n\n${sources.map((source) => `- \`${source.file}\`: ${source.note}`).join("\n")}`
      : "";

  const body = [
    `# ${lesson.data.title}`,
    lesson.data.summary,
    `## What the rule says\n\n${says}`,
    `## Run it\n\n${runs}`,
    resolveBody(lesson),
    ...broken,
    `## What the rule bought\n\n${lesson.data.bought}`,
    standing,
  ]
    .filter((part) => part !== "")
    .join("\n\n");

  return {
    meta: [
      ["title", lesson.data.title],
      ["summary", lesson.data.summary],
      ["rule", lesson.data.rule],
      ["step", `${lesson.data.order} of ${total}`],
      ["sample", lesson.data.sample],
      ["page", page],
    ],
    body,
  };
}

/**
 * YAML frontmatter for the fields above. Every value is written as a JSON
 * string or number, which YAML reads as itself, so a summary carrying a
 * colon or a backtick cannot change what the frontmatter means.
 */
export function frontmatter(meta: LessonMarkdown["meta"]): string {
  const lines = meta.map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---`;
}
