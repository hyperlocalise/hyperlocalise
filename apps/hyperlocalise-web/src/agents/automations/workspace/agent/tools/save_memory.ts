/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { defineAgentTool } from "@/agents/_runtime/define-agent-tool";
import { hasWorkspaceAutomationKnowledgeUpdatesAllowed } from "@/lib/agents/workspace-automations";
import { resolveWorkspaceKnowledgeFlag } from "@/lib/flags/workspace-flags";
import {
  commitKnowledgeMemoryForOrganization,
  getKnowledgeMemoryForOrganization,
} from "@/lib/knowledge-memory/knowledge-memory";
import {
  KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH,
  KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH,
} from "@/lib/knowledge-memory/knowledge-memory.shared";
import { isErr } from "@/lib/primitives/result/results";

import type { WorkspaceOrchestratorSession } from "../context";

/**
 * Builds the revision summary, truncating the automation name so the result never exceeds the
 * database's knowledge_memories_summary_length_check (160 chars). Automation names accepted by
 * the API can run well past what the fixed prefix/suffix leaves room for, and this is the only
 * write path for these revisions, so an over-length summary would fail at the database on every
 * save_memory call for that automation instead of appending the entry.
 */
export function buildSaveMemorySummary(automationName: string, runId: string): string {
  const prefix = `Auto-appended by automation "`;
  const suffix = `" (run ${runId})`;
  const maxNameLength = Math.max(
    0,
    KNOWLEDGE_MEMORY_SUMMARY_MAX_LENGTH - prefix.length - suffix.length,
  );
  const name =
    automationName.length > maxNameLength
      ? `${automationName.slice(0, Math.max(0, maxNameLength - 1))}…`
      : automationName;
  return `${prefix}${name}${suffix}`;
}

/**
 * Appends to the organization's shared Memory.md. Append-only by design (MVP): the agent cannot
 * edit, replace, or delete existing content, only add to it. Gated on both `knowledge.enabled`
 * ("Use organization memory") and `knowledge.allowUpdates` ("Allow memory updates") — the second
 * is meaningless without the first, enforced by hasWorkspaceAutomationKnowledgeUpdatesAllowed.
 * This goes through the same commit path (and the same optimistic concurrency) as a human editing
 * Memory.md by hand, so every append is a normal, restorable revision.
 *
 * Planned as a forced tool (agent.ts's prepareStep always sets toolChoice to this exact tool when
 * it's this step's turn), not an optional one: the underlying ToolLoopAgent's step loop only
 * continues past a step that produced at least one tool call, so a "the model may skip this" step
 * risked ending the run before a later forced tool — e.g. a Slack/email notification — ever ran.
 * Being forced doesn't mean it fabricates content on every run, though: `entry` accepts `null` as
 * an explicit "the automation's instructions didn't ask me to remember anything this run" answer,
 * which short-circuits before touching the database.
 *
 * Also re-checks the workspace-knowledge feature flag at call time, not just toolConfig: the HTTP
 * knowledge-memory route already rejects every request when the flag is off, but automation
 * create/update doesn't validate it against stored toolConfig, so a flag disabled after an
 * automation's Memory tools were configured (or a config written some other way) would otherwise
 * let a scheduled or manual run keep mutating Memory.md regardless. Returns a nonfatal skipped
 * outcome instead of throwing when the flag is off — feature availability is an expected
 * condition callers should branch on, not an invariant failure (AGENTS.md's Result-pattern
 * guidance), same as the stale-revision and size-limit outcomes below.
 */
export function createSaveMemoryTool(session: WorkspaceOrchestratorSession) {
  return defineAgentTool({
    description:
      "Decide whether to append a new entry to the organization's shared Memory.md, then call this exactly once. Pass entry: null if the automation's own instructions don't call for remembering anything this run — never invent something to remember just to have a value. Append-only: this cannot edit, replace, or delete existing content.",
    inputSchema: z.object({
      entry: z.string().trim().min(1).nullable(),
    }),
    execute: async ({ entry }) => {
      if (!hasWorkspaceAutomationKnowledgeUpdatesAllowed(session.automation.toolConfig)) {
        throw new Error("memory_updates_not_allowed");
      }

      const knowledgeFeatureEnabled = await resolveWorkspaceKnowledgeFlag({
        organizationId: session.organizationId,
      });
      if (!knowledgeFeatureEnabled) {
        const payload = { appended: false as const, reason: "feature_disabled" as const };
        session.stepResults.save_memory = payload;
        return payload;
      }

      if (entry === null) {
        const payload = { appended: false as const };
        session.stepResults.save_memory = payload;
        return payload;
      }

      const current = await getKnowledgeMemoryForOrganization(session.organizationId);
      const trimmedEntry = entry.trim();
      const appended = current.content ? `${current.content}\n\n${trimmedEntry}` : trimmedEntry;

      if (appended.length > KNOWLEDGE_MEMORY_CONTENT_MAX_LENGTH) {
        // A recorded outcome, not a thrown error — same reasoning as the stale-revision case
        // below: Memory.md nearing its cap is an expected domain limit, not a bug, and the run's
        // notification step (forced right after this one) should be able to say the update was
        // skipped instead of getting no signal at all.
        const payload = { appended: false as const, reason: "size_limit_exceeded" as const };
        session.stepResults.save_memory = payload;
        return payload;
      }

      const result = await commitKnowledgeMemoryForOrganization({
        organizationId: session.organizationId,
        content: appended,
        // No human actor for an agent-authored append; real provenance lives here instead of
        // updatedByUserId, which is nullable for exactly this case.
        summary: buildSaveMemorySummary(session.automation.name, session.run.id),
        updatedByUserId: null,
        expectedRevisionId: current.revisionId,
      });

      if (isErr(result)) {
        // A recorded outcome, not a thrown error: two automations appending concurrently is an
        // expected race, not a bug, and the run's notification step (forced right after this one)
        // should be able to say the memory update was skipped instead of getting no signal at all.
        const payload = { appended: false as const, reason: "stale_revision" as const };
        session.stepResults.save_memory = payload;
        return payload;
      }

      // Never persist the appended text itself into stepResults/output_summary — matches the
      // repo's no-content-in-logs rule (AGENTS.md) and the handoff's explicit ask.
      const payload = {
        appended: true as const,
        revisionId: result.value.knowledgeMemory.revisionId,
      };
      session.stepResults.save_memory = payload;
      return payload;
    },
  });
}
