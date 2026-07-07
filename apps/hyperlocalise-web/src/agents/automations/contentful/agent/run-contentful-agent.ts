import { and, eq } from "drizzle-orm";
import { stepCountIs, ToolLoopAgent } from "ai";

import { getHyperlocaliseAgentModel } from "@/lib/agent-runtime/loops/model";
import { WORKFLOW_AGENT_TIMEOUT } from "@/lib/agent-runtime/subagents/constants";
import type { ContentfulAutomationExecutionEvent } from "@/lib/contentful/automation-executor";
import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import type {
  ContentfulAutomationExecutionError,
  ContentfulAutomationExecutionSuccess,
} from "@/lib/contentful/types";
import { hasContentfulNoWriteback } from "@/lib/contentful/types";
import { loadOrganizationTranslationGenerator } from "@/lib/translation/generation";
import { composeContentfulAutomationInstructions } from "@/agents/automations/workspace/agent/workspace-template-manifest";

import { createContentfulAgentSession, type ContentfulAgentSession } from "./context";
import {
  buildContentfulAgentTools,
  CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME,
  loadContentfulAgentClient,
} from "./tools/build-contentful-tools";

const CONTENTFUL_AGENT_STEP_LIMIT = 2;
const logger = createLogger("contentful-agent");

export type RunContentfulAgentOptions = {
  manageWorkspaceRunStatus?: boolean;
};

export async function runContentfulAgent(
  input: ContentfulAutomationExecutionEvent,
  options: RunContentfulAgentOptions = {},
): Promise<Result<ContentfulAutomationExecutionSuccess, ContentfulAutomationExecutionError>> {
  const manageWorkspaceRunStatus = options.manageWorkspaceRunStatus ?? true;
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

  if (manageWorkspaceRunStatus) {
    await db
      .update(schema.workspaceAutomationRuns)
      .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId));
  }

  let session: ContentfulAgentSession | undefined;

  try {
    const generator = await loadOrganizationTranslationGenerator(run.projectId);
    if (!generator.ok) {
      throw new Error(generator.message);
    }

    const { client, connection } = await loadContentfulAgentClient({
      organizationId: input.organizationId,
      connectionId: run.connectionId,
    });

    session = createContentfulAgentSession({
      organizationId: input.organizationId,
      runId: run.id,
      entryId: run.entryId,
      workspaceAutomationRunId: input.workspaceAutomationRunId,
      projectId: run.projectId,
      instructions: composedInstructions,
      userBindingContext: userInstructions,
      sourceLocale: run.sourceLocale,
      targetLocales: run.targetLocales,
      runQa: run.runQa,
      writeDrafts: run.writeDrafts,
      overwriteDraftLocales: run.overwriteDraftLocales,
      fieldConfig: connection.fieldConfig,
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
      activeTools: [CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME],
      stopWhen: stepCountIs(CONTENTFUL_AGENT_STEP_LIMIT),
      timeout: WORKFLOW_AGENT_TIMEOUT,
      experimental_context: session,
      prepareStep: ({ stepNumber }) => {
        if (stepNumber === 0) {
          return {
            activeTools: [CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME],
            toolChoice: { type: "tool", toolName: CONTENTFUL_TRANSLATION_EXECUTOR_TOOL_NAME },
          };
        }

        return {
          toolChoice: "none",
        };
      },
    });

    await agent.generate({
      messages: [
        {
          role: "user",
          content: [
            `Translate Contentful entry ${run.entryId}.`,
            `Source locale: ${run.sourceLocale}.`,
            `Target locales: ${run.targetLocales.join(", ")}.`,
            "Call run_translation to execute the translation pipeline.",
          ].join("\n"),
        },
      ],
    });

    if (!session.executionResult) {
      const message = session.executionError ?? "contentful_translation_executor_not_called";
      throw new Error(message);
    }

    logger.info(
      {
        contentfulTranslationRunId: run.id,
        workspaceAutomationRunId: input.workspaceAutomationRunId,
        organizationId: input.organizationId,
        entryId: run.entryId,
        fieldsDetected: session.executionResult.fieldsDetected,
        localeValuesWritten: session.executionResult.localeValuesWritten,
        qaFindingCount: session.executionResult.qaFindingCount,
      },
      "contentful agent translation finished",
    );

    if (
      manageWorkspaceRunStatus &&
      hasContentfulNoWriteback({
        writeDrafts: run.writeDrafts,
        fieldsDetected: session.executionResult.fieldsDetected,
        localeValuesWritten: session.executionResult.localeValuesWritten,
      })
    ) {
      const message = "contentful_no_draft_writebacks";
      const completedAt = new Date();

      await db
        .update(schema.workspaceAutomationRuns)
        .set({
          status: "failed",
          outputSummary: {
            contentfulTranslationRunId: run.id,
            fieldsDetected: session.executionResult.fieldsDetected,
            localeValuesWritten: session.executionResult.localeValuesWritten,
            error: message,
          },
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId));

      logger.warn(
        {
          contentfulTranslationRunId: run.id,
          workspaceAutomationRunId: input.workspaceAutomationRunId,
          organizationId: input.organizationId,
          entryId: run.entryId,
          fieldsDetected: session.executionResult.fieldsDetected,
          localeValuesWritten: session.executionResult.localeValuesWritten,
        },
        "contentful agent translation finished with no draft writebacks",
      );

      return err({
        code: "contentful_automation_failed",
        message,
        runId: run.id,
      });
    }

    if (manageWorkspaceRunStatus) {
      const completedAt = new Date();
      await db
        .update(schema.workspaceAutomationRuns)
        .set({
          status: "succeeded",
          outputSummary: {
            contentfulTranslationRunId: run.id,
            fieldsDetected: session.executionResult.fieldsDetected,
            localeValuesWritten: session.executionResult.localeValuesWritten,
            qaFindingCount: session.executionResult.qaFindingCount,
          },
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId));
    }

    return ok(session.executionResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "contentful_agent_failed";
    const completedAt = new Date();

    if (!session?.executionError) {
      await db
        .update(schema.contentfulTranslationRuns)
        .set({
          status: "failed",
          error: { message },
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(schema.contentfulTranslationRuns.id, run.id));
    }

    if (manageWorkspaceRunStatus) {
      await db
        .update(schema.workspaceAutomationRuns)
        .set({
          status: "failed",
          completedAt,
          updatedAt: completedAt,
          outputSummary: { error: message },
        })
        .where(eq(schema.workspaceAutomationRuns.id, input.workspaceAutomationRunId));
    }

    logger.error(
      {
        contentfulTranslationRunId: run.id,
        workspaceAutomationRunId: input.workspaceAutomationRunId,
        organizationId: input.organizationId,
        entryId: run.entryId,
        message,
      },
      "contentful agent translation failed",
    );

    return err({
      code: "contentful_automation_failed",
      message,
      runId: run.id,
    });
  }
}
