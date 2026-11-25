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
import { createDefaultConfig } from "../catalog/node-catalog";
import type {
  CanonicalVisualWorkflowNode,
  VisualCatalogType,
  VisualNodeConfig,
  VisualWorkflowV3Definition,
  VisualWorkflowV3Edge,
} from "../schema/types";
import { VISUAL_WORKFLOW_SCHEMA_V3_VERSION } from "../schema/types";

/**
 * Starting points for common localisation workflows. A template fills in everything with one
 * obvious value and leaves what only the person can choose (the project, Slack channel and who
 * does the work) empty, so the editor's issue list walks them through it before they publish.
 */
/** Listed in the order the new automation page shows them; the recommended template comes first. */
export const VISUAL_WORKFLOW_TEMPLATE_IDS = [
  "ai-translate-qa-gate",
  "ai-translate-on-upload",
  "mtpe-on-upload",
  "tep-on-upload",
  "review-done-qa",
] as const;

export type VisualWorkflowTemplateId = (typeof VISUAL_WORKFLOW_TEMPLATE_IDS)[number];

/**
 * The template teams should start from: AI translation where QA, the quality estimate or a
 * regulated content domain decides when people review, rather than shipping unreviewed work.
 */
export const RECOMMENDED_VISUAL_WORKFLOW_TEMPLATE_ID: VisualWorkflowTemplateId =
  "ai-translate-qa-gate";

export type VisualWorkflowTemplateOptions = {
  /** Fills the trigger's project when the person starts from a project's page. */
  projectId?: string;
};

const COLUMN_WIDTH = 320;
const ROW_HEIGHT = 180;
const WAIT_POLL_INTERVAL_MS = 60_000;
const WAIT_TIMEOUT_MS = 90 * 60_000;

type TemplateNode = {
  id: string;
  type: VisualCatalogType;
  config?: Partial<VisualNodeConfig>;
  bodyNodeIds?: string[];
  /** Grid cell on the canvas: column left to right, row top to bottom. */
  at: [column: number, row: number];
};

type TemplateEdge = [source: string, target: string, sourcePortId?: string];

function buildDefinition(
  name: string,
  nodes: readonly TemplateNode[],
  edges: readonly TemplateEdge[],
): VisualWorkflowV3Definition {
  const positions: VisualWorkflowV3Definition["editor"]["positions"] = {};
  const canonicalNodes: CanonicalVisualWorkflowNode[] = nodes.map((node) => {
    positions[node.id] = {
      x: 40 + node.at[0] * COLUMN_WIDTH,
      y: 160 + node.at[1] * ROW_HEIGHT,
    };
    return {
      id: node.id,
      type: node.type,
      config: { ...createDefaultConfig(node.type), ...node.config } as VisualNodeConfig,
      ...(node.bodyNodeIds ? { bodyNodeIds: node.bodyNodeIds } : {}),
    };
  });
  const canonicalEdges: VisualWorkflowV3Edge[] = edges.map(([source, target, sourcePortId]) => ({
    id: `${source}-${sourcePortId ?? "success"}-${target}`,
    kind: "execution",
    source,
    target,
    sourcePortId: sourcePortId ?? "success",
    targetPortId: "input",
  }));

  return {
    schemaVersion: VISUAL_WORKFLOW_SCHEMA_V3_VERSION,
    name,
    nodes: canonicalNodes,
    edges: canonicalEdges,
    editor: { positions },
  };
}

const POST_EDIT_DUE_IN_HOURS = 48;
const TEP_STEP_DUE_IN_HOURS = 72;
const QA_FIX_DUE_IN_HOURS = 24;
const QA_GATE_REVIEW_DUE_IN_HOURS = 48;

function sourceUploadTrigger(options: VisualWorkflowTemplateOptions): TemplateNode {
  return {
    id: "trigger",
    type: "trigger.source_upload",
    config: options.projectId ? { projectId: options.projectId } : {},
    at: [0, 0],
  };
}

function notifySlack(id: string, message: string, at: TemplateNode["at"]): TemplateNode {
  // The channel is the person's to pick; publish lists it until they do.
  return { id, type: "action.notify_slack", config: { channelId: "", message }, at };
}

/** Run QA on the file and languages of one job, the work this run produced or reviewed. */
function runQaForJob(jobId: string, at: TemplateNode["at"]): TemplateNode {
  return {
    id: "run_qa",
    type: "action.run_qa",
    config: { projectId: "{{ trigger.projectId }}", jobId },
    at,
  };
}

/** Translate each new source file with AI, wait for it, run QA on it and report the result. */
function aiTranslateOnUpload(options: VisualWorkflowTemplateOptions) {
  return buildDefinition(
    "AI translation on upload",
    [
      sourceUploadTrigger(options),
      {
        id: "machine_translate",
        type: "action.machine_translate",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          targetLocales: "",
          useTranslationMemory: true,
        },
        at: [1, 0],
      },
      {
        id: "check_progress",
        type: "action.check_progress",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          jobId: "{{ nodes.machine_translate.jobId }}",
        },
        at: [2, 0],
      },
      {
        id: "wait",
        type: "flow.wait",
        config: {
          mode: "condition",
          condition: "{{ nodes.check_progress.jobFinished }}",
          pollingIntervalMs: WAIT_POLL_INTERVAL_MS,
          timeoutMs: WAIT_TIMEOUT_MS,
        },
        at: [3, 0],
      },
      runQaForJob("{{ nodes.machine_translate.jobId }}", [4, 0]),
      {
        id: "if",
        type: "logic.if",
        config: { condition: "{{ nodes.run_qa.passed }}" },
        at: [5, 0],
      },
      notifySlack(
        "notify_slack",
        "{{ trigger.sourcePath }} is translated with AI and passed QA ({{ nodes.run_qa.warningCount }} warnings).",
        [6, 0],
      ),
      notifySlack(
        "notify_slack_2",
        "{{ trigger.sourcePath }} is translated with AI, but QA found {{ nodes.run_qa.errorCount }} errors. Review them on the project's QA tab.",
        [6, 1],
      ),
      notifySlack(
        "notify_slack_3",
        "The AI translation of {{ trigger.sourcePath }} did not finish within 90 minutes.",
        [4, 2],
      ),
    ],
    [
      ["trigger", "machine_translate"],
      ["machine_translate", "check_progress"],
      ["check_progress", "wait"],
      ["wait", "run_qa", "completed"],
      ["wait", "notify_slack_3", "timed_out"],
      ["run_qa", "if"],
      ["if", "notify_slack", "true"],
      ["if", "notify_slack_2", "false"],
    ],
  );
}

/** Translate each new file with AI, then give each language to a post-editor. */
function mtpeOnUpload(options: VisualWorkflowTemplateOptions) {
  return buildDefinition(
    "MTPE: AI translation, then post-edit",
    [
      sourceUploadTrigger(options),
      {
        id: "machine_translate",
        type: "action.machine_translate",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          targetLocales: "",
          useTranslationMemory: true,
        },
        at: [1, 0],
      },
      {
        id: "for_each",
        type: "logic.for_each",
        config: { collection: "{{ nodes.machine_translate.targetLocales }}" },
        bodyNodeIds: ["pick_assignee", "create_task"],
        at: [2, 0],
      },
      {
        id: "pick_assignee",
        type: "action.pick_assignee",
        config: {
          locale: "{{ nodes.for_each.item }}",
          jobType: "edit",
        },
        at: [3, 1],
      },
      {
        id: "create_task",
        type: "action.create_task",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          targetLocales: "{{ nodes.for_each.item }}",
          step: "edit",
          assigneeWorkosUserId: "{{ nodes.pick_assignee.assigneeId }}",
          title: "Post-edit {{ trigger.fileName }} ({{ nodes.for_each.item }})",
          afterJobId: "{{ nodes.machine_translate.jobId }}",
          dueInHours: POST_EDIT_DUE_IN_HOURS,
        },
        at: [4, 1],
      },
      notifySlack(
        "notify_slack",
        "{{ trigger.sourcePath }} is being translated with AI. {{ nodes.for_each.count }} post-edit tasks are assigned and open when it is done.",
        [3, 0],
      ),
    ],
    [
      ["trigger", "machine_translate"],
      ["machine_translate", "for_each"],
      ["for_each", "pick_assignee", "each"],
      ["pick_assignee", "create_task"],
      ["for_each", "notify_slack", "done"],
    ],
  );
}

/** For each language of each new file, translate, edit and proofread it with people. */
function tepOnUpload(options: VisualWorkflowTemplateOptions) {
  const steps = [
    { suffix: "", step: "translate", label: "Translate" },
    { suffix: "_2", step: "edit", label: "Edit" },
    { suffix: "_3", step: "proofread", label: "Proofread" },
  ] as const;
  const body = steps.flatMap(({ suffix }) => [`pick_assignee${suffix}`, `create_task${suffix}`]);

  return buildDefinition(
    "TEP: translate, edit, proofread",
    [
      sourceUploadTrigger(options),
      {
        id: "for_each",
        type: "logic.for_each",
        config: { collection: "{{ trigger.targetLocales }}" },
        bodyNodeIds: body,
        at: [1, 0],
      },
      ...steps.flatMap(({ suffix, step, label }, index): TemplateNode[] => [
        {
          id: `pick_assignee${suffix}`,
          type: "action.pick_assignee",
          config: { locale: "{{ nodes.for_each.item }}", jobType: step },
          at: [2 + index * 2, 1],
        },
        {
          id: `create_task${suffix}`,
          type: "action.create_task",
          config: {
            projectId: "{{ trigger.projectId }}",
            sourceFileId: "{{ trigger.sourceFileId }}",
            targetLocales: "{{ nodes.for_each.item }}",
            step,
            assigneeWorkosUserId: `{{ nodes.pick_assignee${suffix}.assigneeId }}`,
            title: `${label} {{ trigger.fileName }} ({{ nodes.for_each.item }})`,
            afterJobId:
              index === 0 ? "" : `{{ nodes.create_task${steps[index - 1]!.suffix}.jobId }}`,
            dueInHours: TEP_STEP_DUE_IN_HOURS,
          },
          at: [3 + index * 2, 1],
        },
      ]),
      notifySlack(
        "notify_slack",
        "{{ trigger.sourcePath }} is ready for translation. Translate, edit and proofread tasks are assigned for {{ nodes.for_each.count }} languages.",
        [2, 0],
      ),
    ],
    [
      ["trigger", "for_each"],
      ["for_each", "pick_assignee", "each"],
      ["pick_assignee", "create_task"],
      ["create_task", "pick_assignee_2"],
      ["pick_assignee_2", "create_task_2"],
      ["create_task_2", "pick_assignee_3"],
      ["pick_assignee_3", "create_task_3"],
      ["for_each", "notify_slack", "done"],
    ],
  );
}

/**
 * When a post-edit or proofread task is marked done, run QA on its file and languages. Passing
 * work is announced. Failing work goes back to the same person as a new post-edit task; when they
 * mark it done, this workflow runs again, until QA passes.
 */
function reviewDoneQa(options: VisualWorkflowTemplateOptions) {
  return buildDefinition(
    "Review done: QA, then fix or deliver",
    [
      {
        id: "trigger",
        type: "trigger.job_changed",
        config: {
          ...(options.projectId ? { projectId: options.projectId } : {}),
          eventTypes: ["job.status_changed"],
          jobKinds: ["post_edit", "proofread"],
          toStatuses: ["succeeded"],
        },
        at: [0, 0],
      },
      runQaForJob("{{ trigger.jobId }}", [1, 0]),
      {
        id: "if",
        type: "logic.if",
        config: { condition: "{{ nodes.run_qa.passed }}" },
        at: [2, 0],
      },
      notifySlack(
        "notify_slack",
        "A review task is done and its translations passed QA ({{ nodes.run_qa.warningCount }} warnings). They are ready to ship.",
        [3, 0],
      ),
      {
        id: "create_task",
        type: "action.create_task",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          targetLocales: "{{ trigger.targetLocales }}",
          step: "edit",
          assigneeWorkosUserId: "{{ trigger.assigneeId }}",
          title: "Fix {{ nodes.run_qa.errorCount }} QA errors",
          dueInHours: QA_FIX_DUE_IN_HOURS,
        },
        at: [3, 1],
      },
      notifySlack(
        "notify_slack_2",
        "QA found {{ nodes.run_qa.errorCount }} errors in a finished review task. It went back to the reviewer to fix.",
        [4, 1],
      ),
    ],
    [
      ["trigger", "run_qa"],
      ["run_qa", "if"],
      ["if", "notify_slack", "true"],
      ["if", "create_task", "false"],
      ["create_task", "notify_slack_2"],
    ],
  );
}

/**
 * Translate each new file with AI, then let QA decide whether people need to see it. Work that
 * passes, has no segment the quality estimate flagged, and is not in a domain that always needs
 * review is announced as ready. Anything else gets a review task per language.
 */
function aiTranslateQaGate(options: VisualWorkflowTemplateOptions) {
  return buildDefinition(
    "AI translation with a QA gate: review only when needed",
    [
      sourceUploadTrigger(options),
      {
        id: "machine_translate",
        type: "action.machine_translate",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          targetLocales: "",
          useTranslationMemory: true,
        },
        at: [1, 0],
      },
      {
        id: "check_progress",
        type: "action.check_progress",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          jobId: "{{ nodes.machine_translate.jobId }}",
        },
        at: [2, 0],
      },
      {
        id: "wait",
        type: "flow.wait",
        config: {
          mode: "condition",
          condition: "{{ nodes.check_progress.jobFinished }}",
          pollingIntervalMs: WAIT_POLL_INTERVAL_MS,
          timeoutMs: WAIT_TIMEOUT_MS,
        },
        at: [3, 0],
      },
      runQaForJob("{{ nodes.machine_translate.jobId }}", [4, 0]),
      {
        id: "if",
        type: "logic.if",
        config: { condition: "{{ nodes.run_qa.needsHumanReview }}" },
        at: [5, 0],
      },
      notifySlack(
        "notify_slack",
        "{{ trigger.sourcePath }} is translated with AI and passed the QA gate. It is ready to ship without review.",
        [6, 0],
      ),
      {
        id: "for_each",
        type: "logic.for_each",
        config: { collection: "{{ nodes.run_qa.targetLocales }}" },
        bodyNodeIds: ["pick_assignee", "create_task"],
        at: [6, 1],
      },
      {
        id: "pick_assignee",
        type: "action.pick_assignee",
        config: { locale: "{{ nodes.for_each.item }}", jobType: "edit" },
        at: [7, 2],
      },
      {
        id: "create_task",
        type: "action.create_task",
        config: {
          projectId: "{{ trigger.projectId }}",
          sourceFileId: "{{ trigger.sourceFileId }}",
          targetLocales: "{{ nodes.for_each.item }}",
          step: "edit",
          assigneeWorkosUserId: "{{ nodes.pick_assignee.assigneeId }}",
          title: "Review {{ trigger.fileName }} ({{ nodes.for_each.item }})",
          dueInHours: QA_GATE_REVIEW_DUE_IN_HOURS,
        },
        at: [8, 2],
      },
      notifySlack(
        "notify_slack_2",
        "{{ trigger.sourcePath }} is translated with AI and needs human review ({{ nodes.run_qa.reviewSegmentCount }} segments flagged by the quality estimate, {{ nodes.run_qa.errorCount }} QA errors). Review tasks are assigned for {{ nodes.for_each.count }} languages.",
        [7, 1],
      ),
      notifySlack(
        "notify_slack_3",
        "The AI translation of {{ trigger.sourcePath }} did not finish within 90 minutes.",
        [4, 2],
      ),
    ],
    [
      ["trigger", "machine_translate"],
      ["machine_translate", "check_progress"],
      ["check_progress", "wait"],
      ["wait", "run_qa", "completed"],
      ["wait", "notify_slack_3", "timed_out"],
      ["run_qa", "if"],
      ["if", "for_each", "true"],
      ["if", "notify_slack", "false"],
      ["for_each", "pick_assignee", "each"],
      ["pick_assignee", "create_task"],
      ["for_each", "notify_slack_2", "done"],
    ],
  );
}

const TEMPLATE_BUILDERS: Record<
  VisualWorkflowTemplateId,
  (options: VisualWorkflowTemplateOptions) => VisualWorkflowV3Definition
> = {
  "ai-translate-on-upload": aiTranslateOnUpload,
  "mtpe-on-upload": mtpeOnUpload,
  "tep-on-upload": tepOnUpload,
  "review-done-qa": reviewDoneQa,
  "ai-translate-qa-gate": aiTranslateQaGate,
};

export function buildVisualWorkflowTemplate(
  id: VisualWorkflowTemplateId,
  options: VisualWorkflowTemplateOptions = {},
): VisualWorkflowV3Definition {
  return TEMPLATE_BUILDERS[id](options);
}
