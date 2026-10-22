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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { CrowdinApiClient, CrowdinApiError } from "@/lib/providers/adapters/crowdin/crowdin-api";
import type { VisualCrowdinPreTranslateMethod, VisualCrowdinTaskType } from "../schema/types";
import type { VisualWorkflowNodeExecutionResult } from "./execution-result";
import { parseWorkflowDueAt, parseWorkflowList } from "./localization-actions";

/** Crowdin task statuses after which no one works on the task. */
const DONE_TASK_STATUSES = new Set(["done", "closed"]);
/** Crowdin task statuses in which someone still has the work on their plate. */
const OPEN_TASK_STATUSES = ["todo", "in_progress"] as const;
const ENDED_PRE_TRANSLATION_STATUSES = new Set(["finished", "failed", "canceled"]);
const PERCENT_COMPLETE = 100;

type CrowdinActionInput = {
  organizationId: string;
  /** Whose Crowdin connection the step uses. */
  workosUserId?: string;
  signal?: AbortSignal;
};

type CrowdinSession = { client: CrowdinApiClient; crowdinProjectId: number };

function failure(code: string, message: string): VisualWorkflowNodeExecutionResult {
  return { ok: false, error: { code, message } };
}

function parseCrowdinIds(value: unknown): number[] | null {
  const ids = parseWorkflowList(value).map(Number);
  return ids.every((id) => Number.isInteger(id) && id > 0) ? ids : null;
}

async function openCrowdinSession(
  input: CrowdinActionInput & { crowdinProjectId: string },
): Promise<
  { ok: true; session: CrowdinSession } | { ok: false; result: VisualWorkflowNodeExecutionResult }
> {
  const crowdinProjectId = Number(input.crowdinProjectId.trim());
  if (!Number.isInteger(crowdinProjectId) || crowdinProjectId <= 0) {
    return {
      ok: false,
      result: failure("invalid_crowdin_project", "Enter the numeric ID of a Crowdin project."),
    };
  }
  const notConnected = {
    ok: false as const,
    result: failure(
      "crowdin_not_connected",
      "Connect your Crowdin account in Integrations, then save the workflow again.",
    ),
  };
  if (!input.workosUserId) return notConnected;

  const [actor] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(
      schema.organizationMemberships,
      eq(schema.organizationMemberships.userId, schema.users.id),
    )
    .where(
      and(
        eq(schema.users.workosUserId, input.workosUserId),
        eq(schema.organizationMemberships.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!actor) return notConnected;

  const { tryLoadActiveTmsProviderContext } =
    await import("@/lib/providers/jobs/tms-provider-live");
  let context: Awaited<ReturnType<typeof tryLoadActiveTmsProviderContext>>;
  try {
    context = await tryLoadActiveTmsProviderContext(input.organizationId, {
      actorUserId: actor.id,
    });
  } catch {
    return notConnected;
  }
  if (!context || context.providerKind !== "crowdin") return notConnected;

  return {
    ok: true,
    session: {
      client: new CrowdinApiClient({
        token: context.secretMaterial,
        baseUrl: context.credential.baseUrl ?? undefined,
        signal: input.signal,
      }),
      crowdinProjectId,
    },
  };
}

function crowdinFailure(error: unknown): VisualWorkflowNodeExecutionResult {
  if (error instanceof CrowdinApiError) {
    if (error.status === 401) {
      return failure(
        "crowdin_auth_invalid",
        "Crowdin rejected the connection. Reconnect Crowdin in Integrations.",
      );
    }
    if (error.status === 403) {
      return failure("crowdin_forbidden", "Your Crowdin account cannot do this in the project.");
    }
    if (error.status === 404) {
      return failure("crowdin_not_found", "Crowdin did not find the project, file, or task.");
    }
    return failure("crowdin_request_failed", error.message);
  }
  return failure("crowdin_request_failed", "The request to Crowdin did not finish.");
}

async function resolveLanguageIds(session: CrowdinSession, configured: unknown) {
  const languageIds = parseWorkflowList(configured);
  if (languageIds.length > 0) return languageIds;
  const project = await session.client.getProject(session.crowdinProjectId);
  return project.targetLanguageIds;
}

export async function runCrowdinPreTranslateAction(
  input: CrowdinActionInput & {
    crowdinProjectId: string;
    fileIds: unknown;
    languageIds: unknown;
    method: VisualCrowdinPreTranslateMethod;
    engineId: string;
    aiPromptId: string;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  const fileIds = parseCrowdinIds(input.fileIds);
  if (!fileIds || fileIds.length === 0) {
    return failure("invalid_crowdin_files", "Enter the numeric IDs of the Crowdin files.");
  }
  const engineId = Number(input.engineId.trim());
  if (input.method === "mt" && !(Number.isInteger(engineId) && engineId > 0)) {
    return failure(
      "missing_crowdin_engine",
      "Enter the ID of the Crowdin machine translation engine.",
    );
  }
  const aiPromptId = Number(input.aiPromptId.trim());
  if (input.method === "ai" && !(Number.isInteger(aiPromptId) && aiPromptId > 0)) {
    return failure("missing_crowdin_prompt", "Enter the ID of the Crowdin AI prompt.");
  }

  const opened = await openCrowdinSession(input);
  if (!opened.ok) return opened.result;
  const { session } = opened;

  try {
    const languageIds = await resolveLanguageIds(session, input.languageIds);
    if (languageIds.length === 0) {
      return failure("missing_crowdin_languages", "The Crowdin project has no target languages.");
    }
    const preTranslation = await session.client.applyPreTranslation(session.crowdinProjectId, {
      languageIds,
      fileIds,
      method: input.method,
      ...(input.method === "mt" ? { engineId } : {}),
      ...(input.method === "ai" ? { aiPromptId } : {}),
      autoApproveOption: "none",
      translateUntranslatedOnly: true,
    });
    return {
      ok: true,
      output: {
        preTranslationId: preTranslation.identifier,
        status: preTranslation.status,
        languageIds,
      },
    };
  } catch (error) {
    return crowdinFailure(error);
  }
}

export async function runCrowdinCreateTaskAction(
  input: CrowdinActionInput & {
    crowdinProjectId: string;
    fileIds: unknown;
    languageIds: unknown;
    taskType: VisualCrowdinTaskType;
    assigneeIds: unknown;
    title: string;
    description: string;
    dueAt?: string;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  const fileIds = parseCrowdinIds(input.fileIds);
  if (!fileIds || fileIds.length === 0) {
    return failure("invalid_crowdin_files", "Enter the numeric IDs of the Crowdin files.");
  }
  const assigneeIds = parseCrowdinIds(input.assigneeIds);
  if (!assigneeIds) {
    return failure("invalid_crowdin_assignees", "Enter the numeric IDs of the Crowdin users.");
  }
  const title = input.title.trim();
  if (!title) return failure("missing_crowdin_task_title", "Enter a title for the task.");
  const deadline = parseWorkflowDueAt(input.dueAt);
  if (deadline === undefined) {
    return failure("invalid_due_date", "The due date is not a date, such as 2026-05-01T17:00Z.");
  }

  const opened = await openCrowdinSession(input);
  if (!opened.ok) return opened.result;
  const { session } = opened;

  const taskIds: string[] = [];
  const taskUrls: string[] = [];
  try {
    const languageIds = await resolveLanguageIds(session, input.languageIds);
    if (languageIds.length === 0) {
      return failure("missing_crowdin_languages", "The Crowdin project has no target languages.");
    }
    for (const languageId of languageIds) {
      const task = await session.client.addTask(session.crowdinProjectId, {
        title,
        languageId,
        type: input.taskType === "translate" ? 0 : 1,
        fileIds,
        ...(input.description.trim() ? { description: input.description.trim() } : {}),
        ...(deadline ? { deadline: deadline.toISOString() } : {}),
        ...(assigneeIds.length > 0 ? { assignees: assigneeIds.map((id) => ({ id })) } : {}),
      });
      taskIds.push(String(task.id));
      taskUrls.push(task.webUrl);
    }
    return {
      ok: true,
      output: { taskIds, taskUrls, languageIds, dueAt: deadline?.toISOString() ?? null },
    };
  } catch (error) {
    const result = crowdinFailure(error);
    if (result.ok || taskIds.length === 0) return result;
    return failure(
      result.error.code ?? "crowdin_request_failed",
      `${result.error.message} Tasks ${taskIds.join(", ")} were created before the failure.`,
    );
  }
}

export async function runCrowdinCheckProgressAction(
  input: CrowdinActionInput & {
    crowdinProjectId: string;
    fileIds: unknown;
    languageIds: unknown;
    taskIds: unknown;
    preTranslationId: string;
  },
): Promise<VisualWorkflowNodeExecutionResult> {
  const fileIds = parseCrowdinIds(input.fileIds);
  if (!fileIds)
    return failure("invalid_crowdin_files", "Enter the numeric IDs of the Crowdin files.");
  const taskIds = parseCrowdinIds(input.taskIds);
  if (!taskIds)
    return failure("invalid_crowdin_tasks", "Enter the numeric IDs of the Crowdin tasks.");

  const opened = await openCrowdinSession(input);
  if (!opened.ok) return opened.result;
  const { session } = opened;
  const { client, crowdinProjectId } = session;

  try {
    const languageFilter = parseWorkflowList(input.languageIds);
    const languageIds = languageFilter.length > 0 ? languageFilter : undefined;
    const progressLists =
      fileIds.length > 0
        ? await Promise.all(
            fileIds.map((fileId) =>
              client.listFileLanguageProgress(crowdinProjectId, fileId, { languageIds }),
            ),
          )
        : [await client.listProjectLanguageProgress(crowdinProjectId, { languageIds })];

    const byLanguage = new Map<string, { total: number; translated: number; approved: number }>();
    for (const row of progressLists.flat()) {
      const entry = byLanguage.get(row.languageId) ?? { total: 0, translated: 0, approved: 0 };
      entry.total += row.phrases.total;
      entry.translated += row.phrases.translated;
      entry.approved += row.phrases.approved;
      byLanguage.set(row.languageId, entry);
    }
    const percent = (part: number, total: number) =>
      total === 0 ? PERCENT_COMPLETE : Math.floor((part / total) * PERCENT_COMPLETE);
    const languages = [...byLanguage].map(([languageId, counts]) => ({
      languageId,
      translationProgress: percent(counts.translated, counts.total),
      approvalProgress: percent(counts.approved, counts.total),
    }));
    const totals = [...byLanguage.values()].reduce(
      (sum, counts) => ({
        total: sum.total + counts.total,
        translated: sum.translated + counts.translated,
        approved: sum.approved + counts.approved,
      }),
      { total: 0, translated: 0, approved: 0 },
    );
    const translatedPercent = percent(totals.translated, totals.total);
    const approvedPercent = percent(totals.approved, totals.total);

    const [tasks, preTranslation] = await Promise.all([
      Promise.all(taskIds.map((taskId) => client.getTask(crowdinProjectId, taskId))),
      input.preTranslationId.trim()
        ? client.getPreTranslationStatus(crowdinProjectId, input.preTranslationId.trim())
        : Promise.resolve(null),
    ]);

    return {
      ok: true,
      output: {
        translatedPercent,
        approvedPercent,
        isTranslated: languages.length > 0 && translatedPercent === PERCENT_COMPLETE,
        isApproved: languages.length > 0 && approvedPercent === PERCENT_COMPLETE,
        languages,
        ...(tasks.length > 0
          ? {
              tasksDone: tasks.every((task) => DONE_TASK_STATUSES.has(task.status)),
              taskStatuses: tasks.map((task) => ({
                taskId: String(task.id),
                languageId: task.languageId ?? task.targetLanguageId ?? null,
                status: task.status,
              })),
            }
          : {}),
        ...(preTranslation
          ? {
              preTranslationStatus: preTranslation.status,
              preTranslationFinished: ENDED_PRE_TRANSLATION_STATUSES.has(preTranslation.status),
            }
          : {}),
      },
    };
  } catch (error) {
    return crowdinFailure(error);
  }
}

export type CrowdinAssignee = { name: string; email: string; openTasks: number };

/**
 * The listed Crowdin users who are still members of the project, with how many open tasks each
 * has there, so a workflow can route work to Crowdin people the way it does to workspace members.
 */
export async function loadCrowdinAssignees(
  input: CrowdinActionInput & { crowdinProjectId: string; assigneeIds: readonly string[] },
): Promise<
  | { ok: true; assignees: Map<string, CrowdinAssignee> }
  | { ok: false; result: VisualWorkflowNodeExecutionResult }
> {
  if (!parseCrowdinIds(input.assigneeIds)) {
    return {
      ok: false,
      result: failure("invalid_crowdin_assignees", "Enter the numeric IDs of the Crowdin users."),
    };
  }
  const opened = await openCrowdinSession(input);
  if (!opened.ok) return opened;
  const { client, crowdinProjectId } = opened.session;

  try {
    const [members, tasks] = await Promise.all([
      client.listProjectMembers(crowdinProjectId),
      client.listTasks(crowdinProjectId, { fetchAll: true, statuses: OPEN_TASK_STATUSES }),
    ]);
    const openTasks = new Map<string, number>();
    for (const task of tasks) {
      if (DONE_TASK_STATUSES.has(task.status)) continue;
      for (const assignee of task.assignees ?? []) {
        const id = String(assignee.id);
        openTasks.set(id, (openTasks.get(id) ?? 0) + 1);
      }
    }
    const listed = new Set(input.assigneeIds);
    const assignees = new Map<string, CrowdinAssignee>();
    for (const member of members) {
      const id = String(member.id);
      if (!listed.has(id)) continue;
      const fullName =
        member.fullName?.trim() ||
        [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
      assignees.set(id, {
        name: fullName || member.username,
        email: "",
        openTasks: openTasks.get(id) ?? 0,
      });
    }
    return { ok: true, assignees };
  } catch (error) {
    return { ok: false, result: crowdinFailure(error) };
  }
}
