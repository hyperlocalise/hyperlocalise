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

/**
 * The pages the automation assistant works on. Each has its own editor: the tool the agent
 * changes the page with, the words the page is described in, and the pure functions the page
 * applies the tool's changes with. Everything else about the assistant is shared.
 */
export type AutomationAssistantEditorKind = "automation-editor" | "visual-workflow-editor";

/** The part of a saved reply that holds the page as the turn left it. Never sent to the model. */
export const AUTOMATION_SETUP_SNAPSHOT_PART = "data-setup-after";
/** The part of a saved message of the person's that says what they changed on the page first. */
export const AUTOMATION_SETUP_PAGE_EDITS_PART = "data-page-edits";
/** The part of a turn's stream that names the turn, by the id of the person's saved message. */
export const AUTOMATION_ASSISTANT_TURN_PART = "data-turn";

/**
 * What the page adds, in the model's history, to a past reply that changed nothing. The panel
 * shows the person the same verdict under that reply.
 */
export const AUTOMATION_ASSISTANT_NO_CHANGE_RECORD =
  "[Page record, not part of the reply: this turn made no change to the setup. Whatever the reply above says was changed, added, removed or set was not.]";

/** What one call of an editor's tool came to, as the panel shows it beside the reply. */
export type AutomationAssistantCallSummary<Line> =
  | { state: "running" }
  | { state: "failed" }
  /** `changes` is null for a call saved before the tool listed what it did. */
  | { state: "done"; changes: Line[] | null };

/** One call the page applied, and how many changes it made there. */
export type AutomationAssistantAppliedCall = { toolCallId: string; made: number };

/**
 * What the assistant needs of one editor. `Context` is what the page sends with each turn,
 * `Document` the part of it the tool changes (the form, the workflow), `Change` the part of the
 * tool's output the page applies, `Line` one change as the panel lists it, and `Edit` one change
 * the person made on the page themselves between turns.
 */
export type AutomationAssistantEditor<Context, Document, Change, Line, Edit> = {
  kind: AutomationAssistantEditorKind;
  toolName: string;
  contextSchema: z.ZodType<Context>;
  documentSchema: z.ZodType<Document>;
  pageEditSchema: z.ZodType<Edit>;
  documentOf: (context: Context) => Document;
  /** What the tool can set, whatever the page holds. Goes in the system prompt. */
  describeCatalogue: () => string;
  /** The page as it stands, to go at the start of the person's newest message. */
  describePage: (context: Context) => string;
  listPageEdits: (before: Document, after: Document) => Edit[];
  describePageEdits: (edits: readonly Edit[]) => string;
  /** A finished call's output as the model is shown it in later turns, and whether it changed anything. */
  reduceHistoryOutput: (output: unknown) => { changed: boolean; output: unknown };
  summarizeCall: (part: unknown) => AutomationAssistantCallSummary<Line> | null;
  collectChanges: (parts: readonly unknown[]) => Array<{ toolCallId: string; change: Change }>;
  /** Applies the changes not applied yet, in order, the way the tool did on the server. */
  applyChanges: (input: {
    context: Context;
    document: Document;
    changes: ReadonlyArray<{ toolCallId: string; change: Change }>;
    editorSessionId: string;
    appliedToolCallIds: ReadonlySet<string>;
  }) => { document: Document; applied: AutomationAssistantAppliedCall[] };
};

export function readDataPart(parts: readonly unknown[] | null | undefined, type: string): unknown {
  for (const part of parts ?? []) {
    const parsed = z.object({ type: z.literal(type), data: z.unknown() }).safeParse(part);
    if (parsed.success) {
      return parsed.data.data;
    }
  }
  return undefined;
}

/** The id of the turn a stream belongs to, or null until the stream has named it. */
export function readAutomationAssistantTurnId(
  parts: readonly unknown[] | null | undefined,
): string | null {
  const parsed = z
    .object({ id: z.string() })
    .safeParse(readDataPart(parts, AUTOMATION_ASSISTANT_TURN_PART));
  return parsed.success ? parsed.data.id : null;
}

/** Whether a part of a reply is a call of the named tool, static or dynamic. */
export function isAssistantToolPart(
  part: { type: string; toolName?: string },
  toolName: string,
): boolean {
  return (
    part.type === `tool-${toolName}` || (part.type === "dynamic-tool" && part.toolName === toolName)
  );
}

const historyToolPartSchema = z.object({
  type: z.string(),
  toolName: z.string().optional(),
  state: z.literal("output-available"),
  toolCallId: z.string().min(1),
  input: z.unknown(),
  output: z.unknown(),
});

/**
 * A past reply as the model is shown it in later turns: its text, and each finished call of an
 * editor's tool with what the call did. The model has to see the calls: shown only the words of
 * its earlier replies, it takes saying "I've renamed it" for the way a rename is made and stops
 * calling the tool. The rest of a call's output described the page as it then was, which the
 * page section of the prompt now says better, so it is left out. Unfinished calls, reasoning and
 * every other kind of part are dropped. A reply whose turn changed nothing ends with the page's
 * record of that, so a reply that wrongly claimed a change is not taken at its word later.
 */
export function toAutomationAssistantHistoryParts(
  parts: readonly unknown[],
  editors: ReadonlyArray<{
    toolName: string;
    reduceHistoryOutput: (output: unknown) => { changed: boolean; output: unknown };
  }>,
): unknown[] {
  const kept: unknown[] = [];
  let changed = false;
  for (const part of parts) {
    const plain = z.object({ type: z.string(), text: z.string().optional() }).safeParse(part);
    if (!plain.success) {
      continue;
    }
    if (plain.data.type === "step-start") {
      kept.push({ type: "step-start" });
      continue;
    }
    if (plain.data.type === "text") {
      if (plain.data.text?.trim()) {
        kept.push({ type: "text", text: plain.data.text });
      }
      continue;
    }
    const call = historyToolPartSchema.safeParse(part);
    const editor = call.success
      ? editors.find((candidate) => isAssistantToolPart(call.data, candidate.toolName))
      : undefined;
    if (!call.success || !editor) {
      continue;
    }
    const reduced = editor.reduceHistoryOutput(call.data.output);
    changed ||= reduced.changed;
    kept.push({
      type: call.data.type,
      ...(call.data.toolName ? { toolName: call.data.toolName } : {}),
      toolCallId: call.data.toolCallId,
      state: "output-available",
      input: call.data.input,
      output: reduced.output,
    });
  }
  if (!changed && kept.some((part) => (part as { type: string }).type !== "step-start")) {
    kept.push({ type: "text", text: AUTOMATION_ASSISTANT_NO_CHANGE_RECORD });
  }
  return kept;
}
