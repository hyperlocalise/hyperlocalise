import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The mode of operation for a repository agent task.
 *
 * - read_only: The agent may inspect, query, and report but must not mutate
 *              repository state or create external effects.
 * - approval_required/write: Reserved for dormant write-tool scaffolding; source
 *              adapters should keep repository-agent tasks read_only for now.
 */
export const repositoryAgentWorkModeSchema = z.enum(["read_only", "approval_required", "write"]);

export type RepositoryAgentWorkMode = z.infer<typeof repositoryAgentWorkModeSchema>;

/**
 * Supported sources that can trigger a repository agent task.
 *
 * Kept as a string union so future adapters (e.g. CLI, webhook) can be added
 * without changing downstream workflow code.
 */
export const repositoryAgentTaskSourceSchema = z.enum(["slack", "github", "chat_ui"]);

export type RepositoryAgentTaskSource = z.infer<typeof repositoryAgentTaskSourceSchema>;

/**
 * The actor who triggered the task, captured from the source adapter.
 */
export const repositoryAgentActorSchema = z.object({
  /** Source-specific user identifier (e.g. Slack user ID, GitHub login). */
  sourceUserId: z.string(),
  /** Optional internal Hyperlocalise user ID when the actor is a known member. */
  userId: z.string().optional(),
  /** Email address from the source adapter, used for membership lookup. */
  email: z.string().optional(),
  /** Human-readable display name from the source. */
  displayName: z.string().optional(),
  /** Organization membership role when the actor is a known member. */
  role: z.enum(["admin", "member"]).optional(),
});

export type RepositoryAgentActor = z.infer<typeof repositoryAgentActorSchema>;

/**
 * Resolved GitHub repository context for repository tasks.
 */
export const repositoryAgentGitHubContextSchema = z.object({
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

export type RepositoryAgentGitHubContext = z.infer<typeof repositoryAgentGitHubContextSchema>;

/**
 * Unresolved GitHub context signals that the source adapter could not
 * determine the repository or PR to work on. The agent should ask a
 * follow-up question instead of failing.
 */
export const unresolvedRepositoryAgentGitHubContextSchema = z.object({
  resolved: z.literal(false),
  /** Human-readable reason the context could not be resolved. */
  reason: z.string(),
  /** Optional hint the agent can include in its follow-up question. */
  hint: z.string().optional(),
});

export type UnresolvedRepositoryAgentGitHubContext = z.infer<
  typeof unresolvedRepositoryAgentGitHubContextSchema
>;

/**
 * Union of resolved and unresolved GitHub context.
 */
export const repositoryAgentGitHubContextUnionSchema = z.union([
  repositoryAgentGitHubContextSchema,
  unresolvedRepositoryAgentGitHubContextSchema,
]);

export type RepositoryAgentGitHubContextUnion = z.infer<
  typeof repositoryAgentGitHubContextUnionSchema
>;

/**
 * Durable task contract for repository agent workflows.
 *
 * This payload is source-neutral: the same workflow runner can handle tasks
 * originating from Slack, GitHub, or the chat UI without source-specific
 * branching. Source adapters are responsible for assembling this shape before
 * enqueueing.
 */
export const repositoryAgentTaskSchema = z.object({
  /** Stable task identifier. */
  id: z.string(),
  /** Where the task originated. */
  source: repositoryAgentTaskSourceSchema,
  /** Source-specific thread or conversation identifier. */
  sourceThreadId: z.string(),
  /** The user who triggered the task. */
  actor: repositoryAgentActorSchema,
  /** Organization that owns the task. */
  organizationId: z.string(),
  /** Optional project context; null for workspace-level tasks. */
  projectId: z.string().nullable(),
  /** How the agent is allowed to mutate state. */
  workMode: repositoryAgentWorkModeSchema,
  /** Natural-language instructions from the user. */
  instructions: z.string(),
  /**
   * Optional GitHub repository context. Present when the task is repo-scoped.
   * May be unresolved so the agent can ask clarifying questions.
   */
  githubContext: repositoryAgentGitHubContextUnionSchema.optional(),
  /** ISO-8601 creation timestamp. */
  createdAt: z.string().datetime(),
  /** Deterministic idempotency key for deduplicating repeated triggers. */
  idempotencyKey: z.string(),
});

export type RepositoryAgentTask = z.infer<typeof repositoryAgentTaskSchema>;

/**
 * Build a deterministic idempotency key for a repository agent task.
 *
 * The key is derived from the stable dimensions of the task so that repeated
 * trigger events (e.g. a Slack user clicking a button twice, or a GitHub
 * webhook redelivery) do not create duplicate workflow runs.
 *
 * @param input - The fields that make a task unique. All fields are required
 *   because omitting any dimension weakens deduplication.
 */
export function buildRepositoryTaskIdempotencyKey(input: {
  source: RepositoryAgentTaskSource;
  sourceThreadId: string;
  organizationId: string;
  instructions: string;
  githubContext?: RepositoryAgentGitHubContext;
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
 * Serialize a repository agent task to a JSON string.
 */
export function serializeRepositoryAgentTask(task: RepositoryAgentTask): string {
  return JSON.stringify(task);
}

/**
 * Deserialize and validate a repository agent task from a JSON string.
 *
 * @throws {SyntaxError} when `json` is not valid JSON.
 * @throws {z.ZodError} when the parsed value does not match the schema.
 */
export function deserializeRepositoryAgentTask(json: string): RepositoryAgentTask {
  const parsed = JSON.parse(json);
  return repositoryAgentTaskSchema.parse(parsed);
}

/**
 * Type guard for unresolved GitHub context.
 */
export function isUnresolvedGitHubContext(
  context: RepositoryAgentGitHubContextUnion | undefined,
): context is UnresolvedRepositoryAgentGitHubContext {
  return context !== undefined && "resolved" in context && context.resolved === false;
}

/**
 * Type guard for resolved GitHub context.
 */
export function isResolvedGitHubContext(
  context: RepositoryAgentGitHubContextUnion | undefined,
): context is RepositoryAgentGitHubContext {
  return context !== undefined && "resolved" in context && context.resolved === true;
}
