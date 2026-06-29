import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Classifies the high-level work a job performs so workers, APIs, and UI views can route translation, review, sync, research, and asset-management workflows consistently.
 */
export const jobKindEnum = pgEnum("job_kind", [
  "translation",
  "research",
  "review",
  "sync",
  "asset_management",
]);
/**
 * Tracks the lifecycle of queued work from scheduling through execution, terminal success or failure, review waits, and cancellation.
 */
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "waiting_for_review",
  "cancelled",
]);
/**
 * Distinguishes string-based translation jobs from file-based translation jobs so job details can point at the right source inputs and outputs.
 */
export const translationJobTypeEnum = pgEnum("translation_job_type", ["string", "file"]);
/**
 * Describes the terminal shape of a translation job result, allowing callers to branch between string output, file output, and error payloads.
 */
export const translationJobOutcomeKindEnum = pgEnum("translation_job_outcome_kind", [
  "string_result",
  "file_result",
  "error",
]);
/**
 * Defines workspace-level authorization roles for organization memberships.
 * Role slugs are mirrored 1:1 in WorkOS; capability checks use `api/auth/policy.ts`.
 */
export const organizationMembershipRoleEnum = pgEnum("organization_membership_role", [
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "member",
]);
/**
 * Defines team-level authorization roles used for project visibility and team membership management inside an organization.
 */
export const teamMembershipRoleEnum = pgEnum("team_membership_role", ["manager", "member"]);
/**
 * Represents the lifecycle of reusable localization assets such as glossaries and translation memories, including draft, active, and archived states.
 */
export const assetStatusEnum = pgEnum("asset_status", ["draft", "active", "archived"]);
/**
 * Lists supported AI provider families for encrypted organization-level LLM credentials and model configuration.
 */
export const llmProviderEnum = pgEnum("llm_provider", [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
]);
/**
 * Lists supported external translation management systems that can back connected projects, files, memories, glossaries, jobs, and webhooks.
 */
export const externalTmsProviderKindEnum = pgEnum("external_tms_provider_kind", [
  "crowdin",
  "smartling",
  "phrase",
  "lokalise",
]);
/**
 * Identifies the type of external TMS content resource being synced, such as provider files or key-based resources.
 */
export const externalTmsResourceTypeEnum = pgEnum("external_tms_resource_type", ["file", "key"]);
/**
 * Identifies provider terminology containers so glossary and term-base resources can share the same local terminology model.
 */
export const externalTmsTerminologyResourceTypeEnum = pgEnum(
  "external_tms_terminology_resource_type",
  ["glossary", "term_base"],
);
/**
 * Records whether a project or localization asset is native to Hyperlocalise or mirrored from an external translation management system.
 */
export const projectSourceEnum = pgEnum("project_source", ["native", "external_tms"]);
/**
 * Tracks provider-backed terminology and translation-memory sync state for UI status, retries, and diagnostics.
 */
export const glossarySyncStateEnum = pgEnum("glossary_sync_state", [
  "synced",
  "stale",
  "syncing",
  "error",
]);
/**
 * Records whether a glossary term was created manually or imported through provider synchronization.
 */
export const glossaryTermProvenanceEnum = pgEnum("glossary_term_provenance", ["manual", "sync"]);
/**
 * Describes how a provider-backed translation memory can be used, ranging from live search to synced import or reference-only access.
 */
export const externalTmsMemoryCapabilityModeEnum = pgEnum("external_tms_memory_capability_mode", [
  "live_search",
  "synced_import",
  "reference_only",
]);
/**
 * Classifies provider synchronization work so scan, pull, push, webhook, and health-check runs can be observed and retried independently.
 */
export const providerSyncRunKindEnum = pgEnum("provider_sync_run_kind", [
  "project_scan",
  "file_key_scan",
  "job_task_scan",
  "context_scan",
  "tm_scan",
  "glossary_scan",
  "pull_content",
  "push_translations",
  "webhook",
  "health_check",
]);
/**
 * Tracks execution state for provider synchronization runs from active processing through terminal success, failure, or cancellation.
 */
export const providerSyncRunStatusEnum = pgEnum("provider_sync_run_status", [
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
/**
 * Records why a provider sync intent was created, such as webhook delivery, manual user action, or scheduled maintenance.
 */
export const providerSyncIntentCauseEnum = pgEnum("provider_sync_intent_cause", [
  "webhook",
  "manual",
  "scheduled",
]);
/**
 * Tracks coalesced provider sync intents through pending, leased, retryable, successful, failed, and cancelled states.
 */
export const providerSyncIntentStatusEnum = pgEnum("provider_sync_intent_status", [
  "pending",
  "running",
  "retryable",
  "succeeded",
  "failed",
  "cancelled",
]);
/**
 * Represents the setup and health status of provider webhook subscriptions, including automatic setup failures and manual fallback states.
 */
export const providerWebhookSubscriptionStatusEnum = pgEnum(
  "provider_webhook_subscription_status",
  ["pending", "active", "permission_error", "provider_error", "disabled", "manual_required"],
);
/**
 * Tracks provider webhook event processing so accepted deliveries can be retried, skipped, or marked complete without losing dedupe history.
 */
export const providerWebhookEventProcessingStatusEnum = pgEnum(
  "provider_webhook_event_processing_status",
  ["pending", "processing", "succeeded", "failed", "skipped"],
);
/**
 * Classifies provider-facing agent work such as translation, review, QA fixes, glossary suggestions, or comment-only actions.
 */
export const agentRunKindEnum = pgEnum("agent_run_kind", [
  "translate",
  "review",
  "qa_fix",
  "glossary_suggestion",
  "comment_only",
]);
/**
 * Tracks provider agent run execution from queueing through active work and terminal success, failure, or cancellation.
 */
export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
/**
 * Tracks persisted workspace automation definitions from active scheduling through user-paused and archived states.
 */
export const workspaceAutomationStatusEnum = pgEnum("workspace_automation_status", [
  "active",
  "paused",
  "archived",
]);
/**
 * Records why a persisted workspace automation run was created.
 */
export const workspaceAutomationRunTriggerSourceEnum = pgEnum(
  "workspace_automation_run_trigger_source",
  ["manual", "scheduled", "github", "contentful", "source_upload"],
);
/**
 * Tracks persisted workspace automation run execution from queueing through active work and terminal outcomes.
 */
export const workspaceAutomationRunStatusEnum = pgEnum("workspace_automation_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);
/**
 * Defines where automated TMS agent settings apply: organization-wide, project-specific, or provider-credential-specific.
 */
export const tmsAgentAutomationScopeEnum = pgEnum("tms_agent_automation_scope", [
  "organization",
  "project",
  "provider",
]);
/**
 * Identifies the channel that created an inbox interaction, such as chat, email, GitHub, or Slack.
 */
export const interactionSourceEnum = pgEnum("interaction_source", [
  "chat_ui",
  "email_agent",
  "github_agent",
  "slack_agent",
]);
/**
 * Tracks whether an inbox item is still active for operators or has been archived from the active work queue.
 */
export const inboxStatusEnum = pgEnum("inbox_status", ["active", "archived"]);
/**
 * Distinguishes user-authored messages from agent-authored messages in interaction threads.
 */
export const messageSenderTypeEnum = pgEnum("message_sender_type", ["user", "agent"]);
/**
 * Tracks organization lifecycle state for active workspaces, soft-deleted archived workspaces, and deprecated legacy migration rows.
 */
export const organizationLifecycleStatusEnum = pgEnum("organization_lifecycle_status", [
  "active",
  "archived",
  "deprecated",
]);
/**
 * Describes how a stored file is used by the product, including source inputs, outputs, references, and reusable assets.
 */
export const storedFileRoleEnum = pgEnum("stored_file_role", [
  "source",
  "output",
  "reference",
  "asset",
]);
/**
 * Records where stored file bytes originated, such as chat uploads, email attachments, job outputs, repositories, or external TMS files.
 */
export const storedFileSourceKindEnum = pgEnum("stored_file_source_kind", [
  "chat_upload",
  "email_attachment",
  "job_output",
  "repository_file",
  "tms_file",
]);
/**
 * Identifies billable or metered product features so usage events can be mapped to subscription entitlements and external billing systems.
 */
export const usageFeatureIdEnum = pgEnum("usage_feature_id", [
  "translation_jobs",
  "translation_units",
  "source_characters",
  "ai_tokens",
  "api_requests",
  "agent_runs",
]);
/**
 * Tracks billing usage event lifecycle from reservation through success, rejection, and external tracking attempts.
 */
export const usageEventStatusEnum = pgEnum("usage_event_status", [
  "reserved",
  "succeeded",
  "rejected",
  "tracking_pending",
  "tracking_succeeded",
  "tracking_failed",
]);
/**
 * Tracks review lifecycle for native project translation segments.
 */
export const projectTranslationStatusEnum = pgEnum("project_translation_status", [
  "draft",
  "needs_review",
  "approved",
  "rejected",
]);
/**
 * Records how a native project translation was created or updated.
 */
export const projectTranslationProvenanceEnum = pgEnum("project_translation_provenance", [
  "manual",
  "translation_job",
  "import",
  "agent",
]);
/**
 * Distinguishes regular CAT comments from review issues on native project strings.
 */
export const projectTranslationCommentTypeEnum = pgEnum("project_translation_comment_type", [
  "comment",
  "issue",
]);
/**
 * Tracks source file key extraction lifecycle for repository source file versions.
 */
export const repositorySourceFileIngestStateEnum = pgEnum("repository_source_file_ingest_state", [
  "pending",
  "ingesting",
  "ingested",
  "skipped",
  "failed",
]);
