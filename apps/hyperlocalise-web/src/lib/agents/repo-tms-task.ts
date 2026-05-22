import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The mode of operation for a repo/TMS agent task.
 *
 * - read_only:   The agent may inspect, query, and report but must not mutate
 *                repository state or create TMS-side effects.
 * - write:       The agent may apply changes directly (e.g. push commits,
 *                create TMS entries) when it has sufficient context.
 * - approval_required: The agent may plan changes, but write tools require an
 *                      admin/owner until durable human approval is implemented.
 */
export const repoTmsAgentWorkModeSchema = z.enum(["read_only", "write", "approval_required"]);

export type RepoTmsAgentWorkMode = z.infer<typeof repoTmsAgentWorkModeSchema>;

/**
 * Supported sources that can trigger a repo/TMS agent task.
 *
 * Kept as a string union so future adapters (e.g. CLI, webhook) can be added
 * without changing downstream workflow code.
 */
export const repoTmsAgentTaskSourceSchema = z.enum(["slack", "github", "chat_ui"]);

export type RepoTmsAgentTaskSource = z.infer<typeof repoTmsAgentTaskSourceSchema>;

/**
 * The actor who triggered the task, captured from the source adapter.
 */
export const repoTmsAgentActorSchema = z.object({
  /** Source-specific user identifier (e.g. Slack user ID, GitHub login). */
  sourceUserId: z.string(),
  /** Optional internal Hyperlocalise user ID when the actor is a known member. */
  userId: z.string().optional(),
  /** Email address from the source adapter, used for membership lookup. */
  email: z.string().optional(),
  /** Human-readable display name from the source. */
  displayName: z.string().optional(),
  /** Organization membership role when the actor is a known member. */
  role: z.enum(["owner", "admin", "member"]).optional(),
});

export type RepoTmsAgentActor = z.infer<typeof repoTmsAgentActorSchema>;

/**
 * Resolved GitHub repository context for repo/TMS tasks.
 */
export const repoTmsAgentGitHubContextSchema = z.object({
  resolved: z.literal(true),
  /** GitHub App installation identifier. */
  installationId: z.number(),
  /** Full repository name (owner/name). */
  repositoryFullName: z.string(),
  /** Optional pull request number when the task is PR-scoped. */
  pullRequestNumber: z.number().optional(),
  /** Optional commit SHA when the task targets a specific revision. */
  commitSha: z.string().optional(),
  /** Optional branch name when the task targets a specific branch. */
  branch: z.string().optional(),
  /** Optional comment ID that triggered the task. */
  commentId: z.number().optional(),
});

export type RepoTmsAgentGitHubContext = z.infer<typeof repoTmsAgentGitHubContextSchema>;

/**
 * Unresolved GitHub context signals that the source adapter could not
 * determine the repository or PR to work on. The agent should ask a
 * follow-up question instead of failing.
 */
export const unresolvedRepoTmsAgentGitHubContextSchema = z.object({
  resolved: z.literal(false),
  /** Human-readable reason the context could not be resolved. */
  reason: z.string(),
  /** Optional hint the agent can include in its follow-up question. */
  hint: z.string().optional(),
});

export type UnresolvedRepoTmsAgentGitHubContext = z.infer<
  typeof unresolvedRepoTmsAgentGitHubContextSchema
>;

/**
 * Union of resolved and unresolved GitHub context.
 */
export const repoTmsAgentGitHubContextUnionSchema = z.union([
  repoTmsAgentGitHubContextSchema,
  unresolvedRepoTmsAgentGitHubContextSchema,
]);

export type RepoTmsAgentGitHubContextUnion = z.infer<typeof repoTmsAgentGitHubContextUnionSchema>;

/**
 * Durable task contract for repo/TMS agent workflows.
 *
 * This payload is source-neutral: the same workflow runner can handle tasks
 * originating from Slack, GitHub, or the chat UI without source-specific
 * branching. Source adapters are responsible for assembling this shape before
 * enqueueing.
 */
export const repoTmsAgentTaskSchema = z.object({
  /** Stable task identifier. */
  id: z.string(),
  /** Where the task originated. */
  source: repoTmsAgentTaskSourceSchema,
  /** Source-specific thread or conversation identifier. */
  sourceThreadId: z.string(),
  /** The user who triggered the task. */
  actor: repoTmsAgentActorSchema,
  /** Organization that owns the task. */
  organizationId: z.string(),
  /** Optional project context; null for workspace-level tasks. */
  projectId: z.string().nullable(),
  /** How the agent is allowed to mutate state. */
  workMode: repoTmsAgentWorkModeSchema,
  /** Natural-language instructions from the user. */
  instructions: z.string(),
  /**
   * Optional GitHub repository context. Present when the task is repo-scoped.
   * May be unresolved so the agent can ask clarifying questions.
   */
  githubContext: repoTmsAgentGitHubContextUnionSchema.optional(),
  /** ISO-8601 creation timestamp. */
  createdAt: z.string().datetime(),
  /** Deterministic idempotency key for deduplicating repeated triggers. */
  idempotencyKey: z.string(),
});

export type RepoTmsAgentTask = z.infer<typeof repoTmsAgentTaskSchema>;

/**
 * Build a deterministic idempotency key for a repo/TMS agent task.
 *
 * The key is derived from the stable dimensions of the task so that repeated
 * trigger events (e.g. a Slack user clicking a button twice, or a GitHub
 * webhook redelivery) do not create duplicate workflow runs.
 *
 * @param input - The fields that make a task unique. All fields are required
 *   because omitting any dimension weakens deduplication.
 */
export function buildRepoTmsTaskIdempotencyKey(input: {
  source: RepoTmsAgentTaskSource;
  sourceThreadId: string;
  organizationId: string;
  instructions: string;
  githubContext?: RepoTmsAgentGitHubContext;
}): string {
  const parts = [input.source, input.sourceThreadId, input.organizationId, input.instructions];

  if (input.githubContext) {
    parts.push(
      String(input.githubContext.installationId),
      input.githubContext.repositoryFullName,
      input.githubContext.pullRequestNumber !== undefined
        ? String(input.githubContext.pullRequestNumber)
        : "",
      input.githubContext.commitSha ?? "",
    );
  }

  const raw = parts.join("\0");
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Serialize a repo/TMS agent task to a JSON string.
 */
export function serializeRepoTmsAgentTask(task: RepoTmsAgentTask): string {
  return JSON.stringify(task);
}

/**
 * Deserialize and validate a repo/TMS agent task from a JSON string.
 *
 * @throws {SyntaxError} when `json` is not valid JSON.
 * @throws {z.ZodError} when the parsed value does not match the schema.
 */
export function deserializeRepoTmsAgentTask(json: string): RepoTmsAgentTask {
  const parsed = JSON.parse(json);
  return repoTmsAgentTaskSchema.parse(parsed);
}

/**
 * Type guard for unresolved GitHub context.
 */
export function isUnresolvedGitHubContext(
  context: RepoTmsAgentGitHubContextUnion | undefined,
): context is UnresolvedRepoTmsAgentGitHubContext {
  return context !== undefined && "resolved" in context && context.resolved === false;
}

/**
 * Type guard for resolved GitHub context.
 */
export function isResolvedGitHubContext(
  context: RepoTmsAgentGitHubContextUnion | undefined,
): context is RepoTmsAgentGitHubContext {
  return context !== undefined && "resolved" in context && context.resolved === true;
}
