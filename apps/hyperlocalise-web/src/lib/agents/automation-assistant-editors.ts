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

import { assertNever } from "@/lib/primitives/assert-never/assert-never";
import type { VisualWorkflowEditorState } from "@/lib/visual-workflows/schema/types";

import {
  AUTOMATION_SETUP_PAGE_EDITS_PART,
  AUTOMATION_SETUP_SNAPSHOT_PART,
  readDataPart,
  toAutomationAssistantHistoryParts,
  type AutomationAssistantCallSummary as CallSummary,
} from "./automation-assistant-editor";
import {
  visualWorkflowEditor,
  type VisualWorkflowChangeLine,
  type VisualWorkflowPageEdit,
} from "./visual-workflow-assistant";
import { visualWorkflowEditorContextSchema } from "./visual-workflow-editor-context";
import {
  automationSetupEditor,
  type AutomationSetupChangeLine,
  type AutomationSetupPageEdit,
} from "./workspace-automation-assistant";
import { workspaceAutomationEditorContextSchema } from "./workspace-automation-editor-context";
import type { WorkspaceAutomationFormState } from "./workspace-automation-view-model";

/**
 * The editors the assistant works in, by the kind the page names in its context. The parts of
 * the assistant that serve every editor dispatch through this file.
 */
export const automationAssistantEditors = {
  "automation-editor": automationSetupEditor,
  "visual-workflow-editor": visualWorkflowEditor,
};

export const automationAssistantPageContextSchema = z.discriminatedUnion("kind", [
  workspaceAutomationEditorContextSchema,
  visualWorkflowEditorContextSchema,
]);

/** What an open page tells the assistant with each turn. */
export type AutomationAssistantPageContext = z.infer<typeof automationAssistantPageContextSchema>;
export type AutomationAssistantEditorKind = AutomationAssistantPageContext["kind"];

export type AutomationAssistantChangeLine = AutomationSetupChangeLine | VisualWorkflowChangeLine;
export type AutomationAssistantPageEdit = AutomationSetupPageEdit | VisualWorkflowPageEdit;
export type AutomationAssistantCallSummary = CallSummary<AutomationAssistantChangeLine>;

/** The part of a page the tool changes, as a saved reply records it. */
export type AutomationAssistantSnapshot =
  | { kind: "automation-editor"; document: WorkspaceAutomationFormState }
  | { kind: "visual-workflow-editor"; document: VisualWorkflowEditorState };

export function describeAutomationAssistantCatalogue(kind: AutomationAssistantEditorKind): string {
  switch (kind) {
    case "automation-editor":
      return automationSetupEditor.describeCatalogue();
    case "visual-workflow-editor":
      return visualWorkflowEditor.describeCatalogue();
    default:
      return assertNever(kind);
  }
}

/** The page as it stands, to go at the start of the person's newest message. */
export function describeAutomationAssistantPage(context: AutomationAssistantPageContext): string {
  switch (context.kind) {
    case "automation-editor":
      return automationSetupEditor.describePage(context);
    case "visual-workflow-editor":
      return visualWorkflowEditor.describePage(context);
    default:
      return assertNever(context);
  }
}

export function snapshotOfAutomationAssistantPage(
  context: AutomationAssistantPageContext,
): AutomationAssistantSnapshot {
  switch (context.kind) {
    case "automation-editor":
      return { kind: context.kind, document: automationSetupEditor.documentOf(context) };
    case "visual-workflow-editor":
      return { kind: context.kind, document: visualWorkflowEditor.documentOf(context) };
    default:
      return assertNever(context);
  }
}

/** The data of the part a saved reply records its snapshot in. */
export function toAutomationAssistantSnapshotData(snapshot: AutomationAssistantSnapshot): unknown {
  switch (snapshot.kind) {
    case "automation-editor":
      return automationSetupEditor.snapshotData(snapshot.document);
    case "visual-workflow-editor":
      return visualWorkflowEditor.snapshotData(snapshot.document);
    default:
      return assertNever(snapshot);
  }
}

/** The page as a saved reply's turn left it, or null when the reply holds none. */
export function readAutomationAssistantSnapshot(
  parts: readonly unknown[] | null | undefined,
): AutomationAssistantSnapshot | null {
  const data = readDataPart(parts, AUTOMATION_SETUP_SNAPSHOT_PART);
  const form = automationSetupEditor.readSnapshot(data);
  if (form) {
    return { kind: "automation-editor", document: form };
  }
  const workflow = visualWorkflowEditor.readSnapshot(data);
  if (workflow) {
    return { kind: "visual-workflow-editor", document: workflow };
  }
  return null;
}

/**
 * What the person changed on the page themselves since the assistant's last turn: the page as
 * that turn left it against the page the message comes from. Nothing when the two are pages of
 * different kinds, which a session never mixes.
 */
export function listAutomationAssistantPageEdits(
  before: AutomationAssistantSnapshot,
  after: AutomationAssistantPageContext,
): AutomationAssistantPageEdit[] {
  switch (after.kind) {
    case "automation-editor":
      return before.kind === after.kind
        ? automationSetupEditor.listPageEdits(before.document, after.form)
        : [];
    case "visual-workflow-editor":
      return before.kind === after.kind
        ? visualWorkflowEditor.listPageEdits(
            before.document,
            visualWorkflowEditor.documentOf(after),
          )
        : [];
    default:
      return assertNever(after);
  }
}

/** The page's record, for the model, of what the person changed themselves before a message. */
export function describeAutomationAssistantPageEdits(
  kind: AutomationAssistantEditorKind,
  edits: readonly AutomationAssistantPageEdit[],
): string {
  switch (kind) {
    case "automation-editor":
      return automationSetupEditor.describePageEdits(
        edits.filter((edit): edit is AutomationSetupPageEdit => isSetupEdit(edit)),
      );
    case "visual-workflow-editor":
      return visualWorkflowEditor.describePageEdits(
        edits.filter((edit): edit is VisualWorkflowPageEdit => !isSetupEdit(edit)),
      );
    default:
      return assertNever(kind);
  }
}

function isSetupEdit(edit: AutomationAssistantPageEdit): edit is AutomationSetupPageEdit {
  return automationSetupEditor.pageEditSchema.safeParse(edit).success;
}

/** The data of the part a saved message of the person's records their page edits in. */
export function toAutomationAssistantPageEditsData(
  kind: AutomationAssistantEditorKind,
  edits: readonly AutomationAssistantPageEdit[],
): { editor: AutomationAssistantEditorKind; edits: AutomationAssistantPageEdit[] } {
  return { editor: kind, edits: [...edits] };
}

const pageEditsDataSchema = z.object({
  // Absent on messages saved before the assistant served more than one kind of page.
  editor: z.enum(["automation-editor", "visual-workflow-editor"]).default("automation-editor"),
  edits: z.array(z.unknown()),
});

/** What the person changed on the page before sending a saved message, with its editor, or null. */
export function readAutomationAssistantPageEditsRecord(
  parts: readonly unknown[] | null | undefined,
): { editor: AutomationAssistantEditorKind; edits: AutomationAssistantPageEdit[] } | null {
  const parsed = pageEditsDataSchema.safeParse(
    readDataPart(parts, AUTOMATION_SETUP_PAGE_EDITS_PART),
  );
  if (!parsed.success) {
    return null;
  }
  switch (parsed.data.editor) {
    case "automation-editor": {
      const edits = z.array(automationSetupEditor.pageEditSchema).safeParse(parsed.data.edits);
      return edits.success ? { editor: parsed.data.editor, edits: edits.data } : null;
    }
    case "visual-workflow-editor": {
      const edits = z.array(visualWorkflowEditor.pageEditSchema).safeParse(parsed.data.edits);
      return edits.success ? { editor: parsed.data.editor, edits: edits.data } : null;
    }
    default:
      return assertNever(parsed.data.editor);
  }
}

/** What the person changed on the page before sending a saved message, or nothing. */
export function readAutomationAssistantPageEdits(
  parts: readonly unknown[] | null | undefined,
): AutomationAssistantPageEdit[] {
  return readAutomationAssistantPageEditsRecord(parts)?.edits ?? [];
}

/** What a call of any editor's tool came to, or null for a part of anything else. */
export function summarizeAutomationAssistantCall(
  part: unknown,
): AutomationAssistantCallSummary | null {
  return automationSetupEditor.summarizeCall(part) ?? visualWorkflowEditor.summarizeCall(part);
}

/** A past reply as the model is shown it, with the calls of every editor's tool kept. */
export function toAutomationAssistantModelHistoryParts(parts: readonly unknown[]): unknown[] {
  return toAutomationAssistantHistoryParts(parts, Object.values(automationAssistantEditors));
}
