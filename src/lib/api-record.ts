/**
 * The API reference's recording, when the tree has one.
 *
 * `records/api.json` is `scripts/record-api.mjs`'s: `iyi doc` run over the
 * prelude and every module of the standard library at the release, each
 * surface kept as the bytes the compiler printed. The docs pages need it and
 * fail without it. The text endpoints for agents only append it, so they read
 * it through a glob, which is empty rather than an error when the file is
 * absent, and say nothing about an API they do not have.
 */
import type { Provenance } from "../playground/samples";

export interface ApiSurface {
  name: string;
  kind: "prelude" | "std";
  path?: string;
  slug: string;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ApiRecord {
  recorded: Provenance;
  prelude: { command: string; exitCode: number; stdout: string };
  surfaces: ApiSurface[];
}

const found = Object.values(
  import.meta.glob<ApiRecord>("../../records/api.json", { eager: true, import: "default" }),
);

export const apiRecord: ApiRecord | null = found[0] ?? null;
