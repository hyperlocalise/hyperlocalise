import { and, eq } from "drizzle-orm";
import { stepCountIs, ToolLoopAgent } from "ai";

import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import { WORKFLOW_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import type { ContentfulAutomationExecutionEvent } from "@/lib/contentful/automation-executor";
import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import type {
  ContentfulAutomationExecutionError,
  ContentfulAutomationExecutionSuccess,
} from "@/lib/contentful/types";
import { loadOrganizationTranslationGenerator } from "@/lib/translation/load-organization-translation-generator";
import { composeContentfulAutomationInstructions } from "@/agents/automations/workspace/agent/workspace-template-manifest";

import { createContentfulAgentSession } from "./context";
import {
  buildContentfulAgentTools,
  loadContentfulAgentClient,
} from "./tools/build-contentful-tools";

const CONTENTFUL_AGENT_STEP_LIMIT = 20;

export async function runContentfulAgent(
  input: ContentfulAutomationExecutionEvent,
): Promise<Result<ContentfulAutomationExecutionSuccess, ContentfulAutomationExecutionError>> {
  const [run] = await db
    .select()
    .from(schema.contentfulTranslationRuns)
    .where(
      and(
        eq(schema.contentfulTranslationRuns.id, input.contentfulTranslationRunId),
        eq(schema.contentfulTranslationRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!run) {
    return err({
      code: "contentful_automation_failed",
      message: "contentful translation run not found",
      runId: input.contentfulTranslationRunId,
    });
  }

  const [workspaceRun] = await db
    .select()
    .from(schema.workspaceAutomationRuns)
    .where(
      and(
        eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId),
        eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  const userInstructions =
    typeof workspaceRun?.inputSnapshot?.instructions === "string"
      ? workspaceRun.inputSnapshot.instructions
      : null;

  const composedInstructions = composeContentfulAutomationInstructions({
    userOverride: userInstructions,
  });

  await db
    .update(schema.contentfulTranslationRuns)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.contentfulTranslationRuns.id, run.id));
  await db
    .update(schema.workspaceAutomationRuns)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId));

  try {
    const generator = await loadOrganizationTranslationGenerator(run.projectId);
    if (!generator.ok) {
      throw new Error(generator.message);
    }

    const { client } = await loadContentfulAgentClient({
      organizationId: input.organizationId,
      connectionId: run.connectionId,
    });

    const session = createContentfulAgentSession({
      organizationId: input.organizationId,
      runId: run.id,
      entryId: run.entryId,
      workspaceAutomationRunId: input.workspaceAutomationRunId,
      projectId: run.projectId,
      instructions: composedInstructions,
      sourceLocale: run.sourceLocale,
      targetLocales: run.targetLocales,
      runQa: run.runQa,
      writeDrafts: run.writeDrafts,
      overwriteDraftLocales: run.overwriteDraftLocales,
      client,
      translateStringJob: generator.translateStringJob,
      projectName: generator.project.name,
      projectTranslationContext: generator.project.translationContext,
    });

    const tools = buildContentfulAgentTools(session);
    const agent = new ToolLoopAgent({
      model: getHyperlocaliseAgentModel(),
      instructions: composedInstructions,
      tools,
      stopWhen: stepCountIs(CONTENTFUL_AGENT_STEP_LIMIT),
      timeout: WORKFLOW_AGENT_TIMEOUT,
      experimental_context: session,
    });

    await agent.generate({
      messages: [
        {
          role: "user",
          content: [
            `Translate Contentful entry ${run.entryId}.`,
            `Source locale: ${run.sourceLocale}.`,
            `Target locales: ${run.targetLocales.join(", ")}.`,
            "Use tools to fetch the entry, detect fields, translate, QA, and write drafts as configured.",
          ].join("\n"),
        },
      ],
    });

    const qaErrorCount = session.qaFindings.filter(
      (finding) => finding.severity === "error",
    ).length;
    const completedAt = new Date();

    await db
      .update(schema.contentfulTranslationRuns)
      .set({
        status: qaErrorCount > 0 ? "succeeded_with_warnings" : "succeeded",
        qaSummary: {
          total: session.qaFindings.length,
          errors: qaErrorCount,
          warnings: session.qaFindings.filter((finding) => finding.severity === "warning").length,
        },
        writebackSummary: {
          fieldsWritten: new Set(session.translations.map((item) => item.fieldId)).size,
          localeValuesWritten: session.translations.length,
          blockedByQaErrors: qaErrorCount,
        },
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.contentfulTranslationRuns.id, run.id));

    await db
      .update(schema.workspaceAutomationRuns)
      .set({
        status: "succeeded",
        outputSummary: {
          contentfulTranslationRunId: run.id,
          qaFindingCount: session.qaFindings.length,
          qaErrorCount,
        },
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId));

    return ok({
      runId: run.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "contentful_agent_failed";
    const completedAt = new Date();

    await db
      .update(schema.contentfulTranslationRuns)
      .set({
        status: "failed",
        error: { message },
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(schema.contentfulTranslationRuns.id, run.id));

    await db
      .update(schema.workspaceAutomationRuns)
      .set({
        status: "failed",
        completedAt,
        updatedAt: completedAt,
        outputSummary: { error: message },
      })
      .where(eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId));

    return err({
      code: "contentful_automation_failed",
      message,
      runId: run.id,
    });
  }
}
