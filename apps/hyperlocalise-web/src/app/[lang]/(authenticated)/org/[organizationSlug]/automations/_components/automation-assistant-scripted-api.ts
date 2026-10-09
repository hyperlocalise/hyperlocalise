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
import type { UIMessage } from "ai";

import {
  AUTOMATION_ASSISTANT_TURN_PART,
  AUTOMATION_SETUP_PAGE_EDITS_PART,
  listAutomationSetupPageEdits,
  UPDATE_AUTOMATION_SETUP_TOOL_NAME,
  updateWorkspaceAutomationSetup,
  type UpdateAutomationSetupOutput,
} from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import type { WorkspaceAutomationProposalInput } from "@/lib/agents/workspace-automation-proposal";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import {
  AssistantSessionOutOfDateError,
  AssistantTurnInProgressError,
  type AssistantMessage,
  type AssistantSession,
  type AutomationAssistantApi,
} from "./automation-assistant-api";

type SetupResult = Extract<UpdateAutomationSetupOutput, { applied: true }>["result"];

/** One request the scripted assistant knows, and what it asks the setup tool for in answer. */
export type AutomationAssistantScript = {
  /** The request in a person's words, as a story types it and the fallback reply lists it. */
  request: string;
  /** Tells this request from the others, however it is worded. */
  match: RegExp;
  /** What the setup tool is called with, or null for a reply that calls nothing. */
  input: WorkspaceAutomationProposalInput | null;
  /** The reply, in place of the one written from the tool's result. */
  reply?: string;
};

/** How long each part of a turn takes, so a recording can be paced. */
export type ScriptedAssistantPace = {
  /** Before the tool call shows. */
  thinkingMs: number;
  /** While the tool call shows as running. */
  toolMs: number;
  /** Between the words of the reply. */
  wordMs: number;
};

export const SCRIPTED_ASSISTANT_PACES = {
  instant: { thinkingMs: 0, toolMs: 0, wordMs: 0 },
  live: { thinkingMs: 900, toolMs: 700, wordMs: 35 },
  slow: { thinkingMs: 2400, toolMs: 1800, wordMs: 90 },
} satisfies Record<string, ScriptedAssistantPace>;

export type ScriptedAssistantPaceName = keyof typeof SCRIPTED_ASSISTANT_PACES;

/** A point a turn stops at and stays, so that one state can be looked at or recorded. */
export type ScriptedAssistantHold = "thinking" | "tool" | "writing";

/** Why every turn is refused or fails, to show the panel's error lines. */
export type ScriptedAssistantFailure = "turn_in_progress" | "out_of_date" | "failed";

const NO_CHANGE: Pick<WorkspaceAutomationProposalInput, "addSkillIds" | "removeSkillIds"> = {
  addSkillIds: [],
  removeSkillIds: [],
};

/** Requests that between them show a first setup, follow-up changes and a refusal. */
export const AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS: AutomationAssistantScript[] = [
  {
    request: "Every Monday at 9am, research competitor news and post a brief to Slack",
    match: /competitor/i,
    input: {
      name: "Competitor news brief",
      instructions:
        "Focus on product launches and pricing changes. Keep the brief under ten bullet points.",
      trigger: {
        mode: "scheduled",
        cadence: "weekly",
        hour: 9,
        dayOfWeek: 1,
        timeZone: null,
        githubEvents: null,
        branches: null,
      },
      addSkillIds: ["research-web", "post-to-slack"],
      removeSkillIds: [],
    },
  },
  {
    request: "Review translation changes on every pull request to main and comment on it",
    match: /pull request/i,
    input: {
      name: "Review translations on pull requests",
      instructions: null,
      trigger: {
        mode: "github",
        cadence: null,
        hour: null,
        dayOfWeek: null,
        timeZone: null,
        githubEvents: ["pull_request"],
        branches: ["main"],
      },
      addSkillIds: ["review-translation-changes", "comment-on-pull-request"],
      removeSkillIds: [],
    },
  },
  {
    request: "Make it run every day at 8am instead",
    match: /every day|daily/i,
    input: {
      ...NO_CHANGE,
      name: null,
      instructions: null,
      trigger: {
        mode: "scheduled",
        cadence: "daily",
        hour: 8,
        dayOfWeek: null,
        timeZone: null,
        githubEvents: null,
        branches: null,
      },
    },
  },
  {
    request: "Also email the results",
    match: /email/i,
    input: {
      name: null,
      instructions: null,
      trigger: null,
      addSkillIds: ["email-results"],
      removeSkillIds: [],
    },
  },
  {
    request: "Rename it to Market watch",
    match: /rename/i,
    input: { ...NO_CHANGE, name: "Market watch", instructions: null, trigger: null },
  },
  {
    request: "Remove the Slack skill",
    match: /remove.*slack/i,
    input: {
      name: null,
      instructions: null,
      trigger: null,
      addSkillIds: [],
      removeSkillIds: ["post-to-slack"],
    },
  },
  {
    request: "Switch it on",
    match: /switch it on|turn it on|activate/i,
    input: null,
    reply:
      "I can't switch an automation on or off. You do that yourself with the switch under the automation's name, at the top of the page.",
  },
];

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NOON_HOUR = 12;

function everydayHour(hour: number | undefined): string {
  const value = hour ?? 0;
  const onClock = value % NOON_HOUR === 0 ? NOON_HOUR : value % NOON_HOUR;
  return `${onClock}:00 ${value < NOON_HOUR ? "am" : "pm"}`;
}

/** "Australia/Sydney" as "Sydney time". */
function everydayTimeZone(timeZone: string): string {
  return `${(timeZone.split("/").at(-1) ?? timeZone).replaceAll("_", " ")} time`;
}

function everydayTrigger(trigger: SetupResult["trigger"]): string {
  switch (trigger.mode) {
    case "manual":
      return "when you start it";
    case "scheduled":
      if (trigger.cadence === "hourly") {
        return "every hour";
      }
      return trigger.cadence === "weekly"
        ? `every ${DAY_NAMES[trigger.dayOfWeek ?? 0]} at ${everydayHour(trigger.hour)}, ${everydayTimeZone(trigger.timeZone)}`
        : `every day at ${everydayHour(trigger.hour)}, ${everydayTimeZone(trigger.timeZone)}`;
    case "github": {
      const events = [
        trigger.events.includes("push") ? "on every push" : null,
        trigger.events.includes("pull_request") ? "on every pull request" : null,
      ].filter((event): event is string => event !== null);
      return `${events.join(" and ")} to ${trigger.branches.join(", ") || "any branch"}`;
    }
    case "contentful":
      return "when an entry changes in Contentful";
    case "source_upload":
      return "when a source file is uploaded";
    case "web_chat":
      return "from a web chat";
  }
}

function withoutFullStop(sentence: string): string {
  return sentence.replace(/\.$/, "");
}

/** A sentence the tool wrote for the assistant, turned to face the person as a reply does. */
function toThePerson(sentence: string): string {
  return sentence
    .replace(
      "The person connects it in Integrations, then asks again or adds",
      "Connect it in Integrations, then ask me again or add",
    )
    .replace(" Note what it does:", "");
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * The reply for one call of the tool, in the order the assistant's own instructions give: what
 * was done, the skills in use, what was left out, what is still needed. Every statement is read
 * from the result, as the real assistant is told to.
 */
function writeSetupReply(result: SetupResult, firstSetup: boolean): string {
  if (!result.changed && result.notAdded.length === 0) {
    return "The page already shows that, so I left it as it is.";
  }
  const sections: string[] = [];
  if (firstSetup && result.changed) {
    sections.push(`I've set up "${result.name}". It will run ${everydayTrigger(result.trigger)}.`);
    if (result.skills.length > 0) {
      sections.push(
        `**Skills used:**\n\n${bullets(
          result.skills.map((skill) =>
            [
              `${skill.name}.`,
              skill.needs?.length
                ? ` Still needs: ${skill.needs.map(withoutFullStop).join("; ")}.`
                : "",
              skill.risk ? ` **${skill.risk}**` : "",
            ].join(""),
          ),
        )}`,
      );
    }
  } else if (result.changed) {
    sections.push(result.applied.map(toThePerson).join(" "));
  }
  if (result.notAdded.length > 0) {
    sections.push(
      `**Not added:**\n\n${bullets(result.notAdded.map((line) => `**${toThePerson(line)}**`))}`,
    );
  }
  if (result.stillNeeded.length > 0) {
    sections.push(`**Still needed from you:**\n\n${bullets(result.stillNeeded)}`);
  }
  return sections.join("\n\n");
}

function writeFallbackReply(scripts: readonly AutomationAssistantScript[]): string {
  return `This is a demo with no model behind it, so I only know a few requests. Try one of these:\n\n${bullets(
    scripts.map((script) => script.request),
  )}`;
}

/**
 * Answers one request the way a turn of the real assistant would: the script says what to ask the
 * setup tool for, and the real tool logic decides what that does to the page.
 */
export function runScriptedAssistantTurn(input: {
  scripts: readonly AutomationAssistantScript[];
  context: WorkspaceAutomationEditorContext;
  text: string;
  /** Nothing has been set up in this conversation yet, so the reply introduces the automation. */
  firstSetup: boolean;
}): {
  form: WorkspaceAutomationFormState;
  output: UpdateAutomationSetupOutput | null;
  reply: string;
} {
  const script = input.scripts.find((candidate) => candidate.match.test(input.text));
  if (!script) {
    return { form: input.context.form, output: null, reply: writeFallbackReply(input.scripts) };
  }
  if (!script.input) {
    return { form: input.context.form, output: null, reply: script.reply ?? "" };
  }
  const { context, output } = updateWorkspaceAutomationSetup(input.context, script.input);
  return {
    form: context?.form ?? input.context.form,
    output,
    reply: script.reply ?? (output.applied ? writeSetupReply(output.result, input.firstSetup) : ""),
  };
}

function toolPart(toolCallId: string, output: UpdateAutomationSetupOutput | null) {
  return {
    type: `tool-${UPDATE_AUTOMATION_SETUP_TOOL_NAME}`,
    toolCallId,
    input: {},
    ...(output ? { state: "output-available", output } : { state: "input-available" }),
  };
}

function savedMessage(
  sessionId: string,
  senderType: AssistantMessage["senderType"],
  text: string,
  parts: unknown[] | null,
  id: string = crypto.randomUUID(),
): AssistantMessage {
  return {
    id,
    conversationId: sessionId,
    senderType,
    senderEmail: null,
    text,
    parts: parts as AssistantMessage["parts"],
    attachments: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * A finished conversation, as a saved automation's page finds it: the messages, and the form the
 * requests left. For a story that opens on history.
 */
export function scriptAssistantConversation(input: {
  scripts?: readonly AutomationAssistantScript[];
  context: WorkspaceAutomationEditorContext;
  requests: readonly string[];
}): { messages: AssistantMessage[]; form: WorkspaceAutomationFormState } {
  const scripts = input.scripts ?? AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS;
  const messages: AssistantMessage[] = [];
  let context = input.context;
  let firstSetup = true;
  for (const text of input.requests) {
    const turn = runScriptedAssistantTurn({ scripts, context, text, firstSetup });
    firstSetup &&= !turn.output?.applied;
    context = { ...context, form: turn.form };
    messages.push(
      savedMessage("saved", "user", text, null),
      savedMessage("saved", "agent", turn.reply, [
        ...(turn.output ? [toolPart(crypto.randomUUID(), turn.output)] : []),
        { type: "text", text: turn.reply },
      ]),
    );
  }
  return { messages, form: context.form };
}

/** Resolves after the time given, or rejects as soon as the turn is abandoned. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error("aborted"));
  }
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    });
  });
}

/** Never resolves: the turn stays where it is until it is abandoned. */
function hold(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });
}

type StoredSession = {
  session: AssistantSession;
  messages: AssistantMessage[];
  /** The form as the last turn left it, which the next turn's page is compared with. */
  formAfterLastTurn: WorkspaceAutomationFormState | null;
  hasSetup: boolean;
};

/**
 * The assistant with no server and no model, for Storybook and demos: sessions are kept in
 * memory, a request is matched to a script, and the script's tool call is run by the real setup
 * logic against the page the request came from. Replies stream at the pace given.
 */
export function createScriptedAutomationAssistantApi(
  options: {
    scripts?: readonly AutomationAssistantScript[];
    pace?: ScriptedAssistantPace;
    hold?: ScriptedAssistantHold | null;
    failure?: ScriptedAssistantFailure | null;
    /** The conversation a saved automation already has. */
    saved?: { automationId: string; messages: AssistantMessage[] };
  } = {},
): AutomationAssistantApi {
  const scripts = options.scripts ?? AUTOMATION_ASSISTANT_SAMPLE_SCRIPTS;
  const pace = options.pace ?? SCRIPTED_ASSISTANT_PACES.live;
  const sessions = new Map<string, StoredSession>();

  const addSession = (automationId: string | null, messages: AssistantMessage[]) => {
    const now = new Date().toISOString();
    const stored: StoredSession = {
      session: {
        id: crypto.randomUUID(),
        automationId,
        title: "Automation assistant",
        turnInProgress: false,
        createdAt: now,
        lastMessageAt: now,
      },
      messages,
      formAfterLastTurn: null,
      hasSetup: messages.length > 0,
    };
    sessions.set(stored.session.id, stored);
    return stored;
  };

  if (options.saved) {
    addSession(options.saved.automationId, options.saved.messages);
  }

  const findByAutomation = (automationId: string) =>
    [...sessions.values()].find((stored) => stored.session.automationId === automationId);

  return {
    createAssistantSession: async (_organizationSlug, automationId) =>
      (automationId ? findByAutomation(automationId) : undefined)?.session ??
      addSession(automationId, []).session,

    findAssistantSession: async (_organizationSlug, automationId) => {
      const stored = findByAutomation(automationId);
      return { session: stored?.session ?? null, messages: stored?.messages ?? [] };
    },

    loadAssistantSession: async (_organizationSlug, sessionId) => {
      const stored = sessions.get(sessionId);
      return stored ? { session: stored.session, messages: stored.messages } : null;
    },

    deleteAssistantSession: async (_organizationSlug, sessionId) => {
      sessions.delete(sessionId);
    },

    async *streamAssistantTurn({ sessionId, text, pageContext, signal }) {
      const stored = sessions.get(sessionId);
      if (!stored) {
        throw new Error("session_not_found");
      }
      if (options.failure) {
        await wait(pace.thinkingMs, signal);
        if (options.failure === "turn_in_progress") {
          throw new AssistantTurnInProgressError();
        }
        if (options.failure === "out_of_date") {
          throw new AssistantSessionOutOfDateError();
        }
        throw new Error("failed");
      }

      const turnId = crypto.randomUUID();
      const edits = stored.formAfterLastTurn
        ? listAutomationSetupPageEdits(stored.formAfterLastTurn, pageContext.form)
        : [];
      const editsPart =
        edits.length > 0 ? [{ type: AUTOMATION_SETUP_PAGE_EDITS_PART, data: { edits } }] : [];
      const reply = (parts: unknown[]): UIMessage => ({
        id: `stream-${sessionId}`,
        role: "assistant",
        parts: [
          { type: AUTOMATION_ASSISTANT_TURN_PART, data: { id: turnId } },
          ...editsPart,
          ...parts,
        ] as UIMessage["parts"],
      });
      stored.messages = [
        ...stored.messages,
        savedMessage(sessionId, "user", text, editsPart, turnId),
      ];

      yield reply([]);
      if (options.hold === "thinking") {
        await hold(signal);
      }
      await wait(pace.thinkingMs, signal);

      const turn = runScriptedAssistantTurn({
        scripts,
        context: pageContext,
        text,
        firstSetup: !stored.hasSetup,
      });
      const toolCallId = crypto.randomUUID();
      const tool = turn.output ? [toolPart(toolCallId, turn.output)] : [];
      if (turn.output) {
        yield reply([toolPart(toolCallId, null)]);
        if (options.hold === "tool") {
          await hold(signal);
        }
        await wait(pace.toolMs, signal);
        yield reply(tool);
      }

      const words = turn.reply.split(/(?<=\s)/);
      let written = "";
      for (const [index, word] of words.entries()) {
        written += word;
        // With no time between words there is nothing to watch, so the reply comes whole.
        if (pace.wordMs > 0) {
          yield reply([...tool, { type: "text", text: written }]);
          if (options.hold === "writing" && index >= words.length / 2) {
            await hold(signal);
          }
          await wait(pace.wordMs, signal);
        }
      }
      yield reply([...tool, { type: "text", text: turn.reply }]);

      stored.formAfterLastTurn = turn.form;
      stored.hasSetup ||= turn.output?.applied === true;
      stored.messages = [
        ...stored.messages,
        savedMessage(sessionId, "agent", turn.reply, [...tool, { type: "text", text: turn.reply }]),
      ];
    },
  };
}
