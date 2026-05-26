import type { Bash } from "just-bash";

/** Sandbox-scoped bash adapter for workspace primitive tools. */
export type RepoToolContext = {
  bash: Pick<Bash, "exec" | "readFile">;
};
