/**
 * How to register `iyi mcp` with a harness, client by client.
 *
 * TWO KINDS OF FACT, KEPT APART. What the server is comes from the iyi side:
 * the name is the `serverInfo.name` the server itself answered the handshake
 * with in `records/agent.json`, and the command is the one
 * `scripts/record-agent.mjs` spawns to record that handshake, `iyi mcp` over
 * stdio, which is the shape README.md describes. The executable is the first
 * word of a recorded frame's argv rather than a string typed here.
 *
 * How a client is told about a server is the client's business, not iyi's,
 * and no file in either repository states it. So every snippet below was
 * checked against that client's own documentation, and the page it was checked
 * against is cited on the entry, so the next person to touch this can check it
 * again rather than trusting it. Read on 2026-10-14.
 */
import record from "../../records/agent.json";

const first = record.frames[0];
if (!first) {
  throw new Error("mcp: records/agent.json holds no frames, so no executable name can be read off one");
}

/** The server, as a client launches it. */
export const server = {
  name: record.wire.initialize.serverInfo.name,
  command: first.command.split(" ")[0],
  args: ["mcp"],
};

const commandLine = [server.command, ...server.args].join(" ");

export interface Snippet {
  /** Where it goes: a shell, or the file it is written into. */
  where: string;
  /** The info string a Markdown fence gives it. */
  lang: "sh" | "json" | "toml";
  text: string;
}

export interface Client {
  name: string;
  /** The client's own page this syntax was verified against. */
  doc: string;
  snippets: Snippet[];
}

/** One server entry, as every client below that takes JSON writes it. */
const entry = { command: server.command, args: server.args };

/** Pretty JSON with each array of strings on one line, `"args": ["mcp"]`,
 * the way every client's documentation sets it. */
const configJson = (value: object) =>
  JSON.stringify(value, null, 2).replace(/\[\s*\n((?:\s*"[^"\n]*",?\n)+)\s*\]/g, (_, items: string) =>
    `[${items.trim().split(/,?\n\s*/).join(", ")}]`,
  );

export const clients: Client[] = [
  {
    name: "Claude Code",
    // https://code.claude.com/docs/en/mcp, "Option 3: Add a local stdio
    // server": `claude mcp add [options] <name> -- <command> [args...]`, with
    // `--transport stdio`, everything after `--` passed to the server.
    doc: "https://code.claude.com/docs/en/mcp",
    snippets: [
      {
        where: "a shell",
        lang: "sh",
        text: `claude mcp add --transport stdio ${server.name} -- ${commandLine}`,
      },
    ],
  },
  {
    name: "Cursor",
    // https://cursor.com/docs/mcp, "Using mcp.json", "STDIO server
    // configuration" (type, command and args, `type` marked required) and
    // "Configuration locations" (.cursor/mcp.json in a project,
    // ~/.cursor/mcp.json for every project).
    doc: "https://cursor.com/docs/mcp",
    snippets: [
      {
        where: ".cursor/mcp.json in a project, or ~/.cursor/mcp.json for all of them",
        lang: "json",
        text: configJson({ mcpServers: { [server.name]: { type: "stdio", ...entry } } }),
      },
    ],
  },
  {
    name: "Codex CLI",
    // https://developers.openai.com/codex/mcp, "Configure with the CLI":
    // `codex mcp add <server-name> -- <stdio server-command>`; "Configure
    // with config.toml": a `[mcp_servers.<server-name>]` table with
    // `command` and `args`, in ~/.codex/config.toml.
    doc: "https://developers.openai.com/codex/mcp",
    snippets: [
      {
        where: "a shell",
        lang: "sh",
        text: `codex mcp add ${server.name} -- ${commandLine}`,
      },
      {
        where: "~/.codex/config.toml, the same thing by hand",
        lang: "toml",
        text: `[mcp_servers.${server.name}]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args).replace(/,/g, ", ")}`,
      },
    ],
  },
];

/**
 * The block most other clients read. Claude Code's page, under "Add a server
 * from an mcpServers JSON block", says the block other clients' instructions
 * give uses the wrapper key and entry shape it reads itself, that an entry
 * with no `type` is a stdio server, and that a project can commit one as
 * `.mcp.json` at its root.
 * https://code.claude.com/docs/en/mcp
 */
export const generic: Snippet = {
  where: "an mcpServers block, such as .mcp.json at a project's root",
  lang: "json",
  text: configJson({ mcpServers: { [server.name]: entry } }),
};
