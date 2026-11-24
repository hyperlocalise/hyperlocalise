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
export const VISUAL_WORKFLOW_TEMPLATE_IDS = [
  "ai-translate-on-upload",
  "mtpe-on-upload",
  "tep-on-upload",
  "review-done-qa",
] as const;

export type VisualWorkflowTemplateId = (typeof VISUAL_WORKFLOW_TEMPLATE_IDS)[number];

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

function sourceUploadTrigger(options: VisualWorkflowTemplateOptions): TemplateNode {
  return {
    id: "trigger",
    type: "trigger.source_upload",
    config: options.projectId ? { projectId: options.projectId } : {},
    at: [0, 0],
  };
}

/**
 * The end of a QA check. Slack and email steps cannot be saved until the person picks where the
 * message goes, so a template ends here and the person adds a message step where they want one.
 */
function qaOutcomeNodes(column: number): TemplateNode[] {
  return [
    {
      id: "stop",
      type: "flow.stop",
      config: { outcome: "completed", reason: "Translations passed QA." },
      at: [column, 0],
    },
    {
      id: "fail_qa",
      type: "flow.fail",
      config: {
        errorCode: "QA_FAILED",
        message: "QA found errors. Review them on the project's QA tab before shipping.",
      },
      at: [column, 1],
    },
  ];
}

/** Translate each new source file with AI, wait for it, run QA and report the result. */
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
      {
        id: "run_qa",
        type: "action.run_qa",
        config: { projectId: "{{ trigger.projectId }}" },
        at: [4, 0],
      },
      {
        id: "if",
        type: "logic.if",
        config: { condition: "{{ nodes.run_qa.passed }}" },
        at: [5, 0],
      },
      ...qaOutcomeNodes(6),
      {
        id: "fail",
        type: "flow.fail",
        config: {
          errorCode: "TRANSLATION_NOT_FINISHED",
          message: "The AI translation did not finish in time.",
        },
        at: [4, 1],
      },
    ],
    [
      ["trigger", "machine_translate"],
      ["machine_translate", "check_progress"],
      ["check_progress", "wait"],
      ["wait", "run_qa", "completed"],
      ["wait", "fail", "timed_out"],
      ["run_qa", "if"],
      ["if", "stop", "true"],
      ["if", "fail_qa", "false"],
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
          afterJobId: "{{ nodes.machine_translate.jobId }}",
        },
        at: [4, 1],
      },
      {
        id: "stop",
        type: "flow.stop",
        config: { outcome: "completed", reason: "Post-edit tasks are assigned." },
        at: [3, 0],
      },
    ],
    [
      ["trigger", "machine_translate"],
      ["machine_translate", "for_each"],
      ["for_each", "pick_assignee", "each"],
      ["pick_assignee", "create_task"],
      ["for_each", "stop", "done"],
    ],
  );
}

/** Translate, edit and proofread each new file with people, one task after another. */
function tepOnUpload(options: VisualWorkflowTemplateOptions) {
  const steps = [
    { suffix: "", step: "translate" },
    { suffix: "_2", step: "edit" },
    { suffix: "_3", step: "proofread" },
  ] as const;

  return buildDefinition(
    "TEP: translate, edit, proofread",
    [
      sourceUploadTrigger(options),
      ...steps.flatMap(({ suffix, step }, index): TemplateNode[] => [
        {
          id: `pick_assignee${suffix}`,
          type: "action.pick_assignee",
          config: { jobType: step },
          at: [1 + index * 2, 0],
        },
        {
          id: `create_task${suffix}`,
          type: "action.create_task",
          config: {
            projectId: "{{ trigger.projectId }}",
            sourceFileId: "{{ trigger.sourceFileId }}",
            targetLocales: "",
            step,
            assigneeWorkosUserId: `{{ nodes.pick_assignee${suffix}.assigneeId }}`,
            afterJobId:
              index === 0 ? "" : `{{ nodes.create_task${steps[index - 1]!.suffix}.jobId }}`,
          },
          at: [2 + index * 2, 0],
        },
      ]),
    ],
    [
      ["trigger", "pick_assignee"],
      ["pick_assignee", "create_task"],
      ["create_task", "pick_assignee_2"],
      ["pick_assignee_2", "create_task_2"],
      ["create_task_2", "pick_assignee_3"],
      ["pick_assignee_3", "create_task_3"],
    ],
  );
}

/** When a post-edit or proofread task is marked done, run QA and report the result. */
function reviewDoneQaNotify(options: VisualWorkflowTemplateOptions) {
  return buildDefinition(
    "Review done: run QA",
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
      {
        id: "run_qa",
        type: "action.run_qa",
        config: { projectId: "{{ trigger.projectId }}" },
        at: [1, 0],
      },
      {
        id: "if",
        type: "logic.if",
        config: { condition: "{{ nodes.run_qa.passed }}" },
        at: [2, 0],
      },
      ...qaOutcomeNodes(3),
    ],
    [
      ["trigger", "run_qa"],
      ["run_qa", "if"],
      ["if", "stop", "true"],
      ["if", "fail_qa", "false"],
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
  "review-done-qa": reviewDoneQaNotify,
};

export function buildVisualWorkflowTemplate(
  id: VisualWorkflowTemplateId,
  options: VisualWorkflowTemplateOptions = {},
): VisualWorkflowV3Definition {
  return TEMPLATE_BUILDERS[id](options);
}
