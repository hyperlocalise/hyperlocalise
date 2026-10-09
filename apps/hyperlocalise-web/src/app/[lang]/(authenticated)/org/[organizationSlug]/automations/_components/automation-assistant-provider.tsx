"use client";

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
import { reaction } from "mobx";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useOptionalAppShellStore } from "@/components/app-shell/store/app-shell-store-context";
import {
  applyAutomationSetupChanges,
  AUTOMATION_SETUP_PAGE_EDITS_PART,
  collectAutomationSetupChanges,
  readAutomationAssistantTurnId,
  readAutomationSetupPageEdits,
} from "@/lib/agents/workspace-automation-assistant";
import { buildWorkspaceAutomationEditorContext } from "@/lib/agents/workspace-automation-editor-context";
import { isWorkspaceAutomationAssistantForm } from "@/lib/agents/workspace-automation-proposal-form";
import {
  listWorkspaceAutomationSetupSteps,
  type WorkspaceAutomationSetupStep,
} from "@/lib/agents/workspace-automation-setup-steps";
import type { WorkspaceAutomationSkillConnections } from "@/lib/agents/workspace-automation-skills";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";

import {
  AssistantSessionOutOfDateError,
  AssistantTurnInProgressError,
  createAssistantSession,
  deleteAssistantSession,
  findAssistantSession,
  loadAssistantSession,
  streamAssistantTurn,
  type AssistantMessage,
  type AssistantSession,
} from "./automation-assistant-api";

const FALLBACK_TIME_ZONE = "UTC";

export type AutomationAssistantStatus = "idle" | "loading" | "streaming";

/**
 * A message of the person's that got no reply. Refused ones were never saved: the session had a
 * turn running, or has had one this page has not seen, which only loading the page again mends.
 */
export type AutomationAssistantFailure = {
  messageId: string;
  reason: "turn_in_progress" | "out_of_date" | "failed";
};

export type AutomationAssistantValue = {
  organizationSlug: string;
  mode: "create" | "detail";
  automationName: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  status: AutomationAssistantStatus;
  /** A turn is running for this page. */
  working: boolean;
  /** The message the last request failed for and why, or null. */
  failure: AutomationAssistantFailure | null;
  session: AssistantSession | null;
  messages: AssistantMessage[];
  /** The reply as it streams, or null between turns. */
  streaming: UIMessage | null;
  send: (text: string) => void;
  startOver: () => void;
  /**
   * Tool calls of the assistant that changed the page, and the changes they made in all, since
   * the page last held nothing unsaved.
   */
  appliedCallCount: number;
  appliedChangeCount: number;
  steps: readonly WorkspaceAutomationSetupStep[];
};

export const AutomationAssistantContext = createContext<AutomationAssistantValue | null>(null);

/** Null outside the provider, so a section can render nothing without the assistant. */
export function useAutomationAssistant() {
  return useContext(AutomationAssistantContext);
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
}

/** The person's message as the panel shows it until the saved conversation is loaded. */
function localMessage(text: string): AssistantMessage {
  return {
    id: `local-${crypto.randomUUID()}`,
    conversationId: "",
    senderType: "user",
    senderEmail: null,
    text,
    parts: null,
    attachments: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Holds one person's assistant session for the automation page and applies what the assistant
 * changes to the form. A saved automation's session is resumed when the page opens; a new
 * automation's session is made on the first message and thrown away with the page. A request
 * handed over from the automations page is shown, with the panel open and working, from the
 * first render; its turn starts once the page knows what is connected.
 */
export function AutomationAssistantProvider({
  automationId,
  children,
  connections,
  connectionsSettled,
  contentfulConnectionIds,
  crowdinProjectIds,
  form,
  hasUnsavedChanges = true,
  initialPrompt,
  mode,
  onChange,
  onSessionChange,
  onWorkingChange,
  organizationSlug,
  projectName,
  repositories,
}: {
  /** The saved automation the page shows. Absent while a new one is being set up. */
  automationId?: string;
  children?: ReactNode;
  connections: WorkspaceAutomationSkillConnections;
  /** True once every integration status has loaded or failed to load. */
  connectionsSettled: boolean;
  contentfulConnectionIds: readonly string[];
  crowdinProjectIds: readonly string[];
  form: WorkspaceAutomationFormState;
  /**
   * Whether the page holds anything unsaved. Once it does not, the assistant's changes were saved
   * or taken back, and its count of them starts again.
   */
  hasUnsavedChanges?: boolean;
  /** A request handed over from the automations page, sent once the page is ready. */
  initialPrompt?: string | null;
  mode: "create" | "detail";
  /** Called with the form after each of the assistant's changes. */
  onChange: (next: WorkspaceAutomationFormState) => void;
  /** Called when the session for this page starts or ends, with its id. */
  onSessionChange?: (sessionId: string | null) => void;
  onWorkingChange?: (working: boolean) => void;
  organizationSlug: string;
  /** Display name of the project the automation is in, when the page knows it. */
  projectName?: string | null;
  /** Connected repositories. Only a selectable one can be offered as the default. */
  repositories: ReadonlyArray<{ id: string; name: string; selectable: boolean }>;
}) {
  const chatDock = useOptionalAppShellStore()?.chatDock ?? null;
  const [editorSessionId] = useState(() => crypto.randomUUID());
  const [timeZone] = useState(browserTimeZone);
  const usable = isWorkspaceAutomationAssistantForm(form);
  // The handed-over request as the panel shows it, or null when there is none to send.
  const [handoff] = useState(() => {
    const text = initialPrompt?.trim();
    return text && usable ? localMessage(text) : null;
  });
  const [open, setOpenState] = useState(handoff !== null);
  const [status, setStatus] = useState<AutomationAssistantStatus>(
    handoff ? "streaming" : automationId ? "loading" : "idle",
  );
  const [failure, setFailure] = useState<AutomationAssistantFailure | null>(null);
  const [session, setSession] = useState<AssistantSession | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => (handoff ? [handoff] : []));
  const [streaming, setStreaming] = useState<UIMessage | null>(null);
  const [appliedCallCount, setAppliedCallCount] = useState(0);
  const [appliedChangeCount, setAppliedChangeCount] = useState(0);
  const appliedToolCallIds = useRef(new Set<string>());
  // The form after the latest change by the assistant, until the page renders with it.
  const pendingForm = useRef<WorkspaceAutomationFormState | null>(null);
  const sessionRef = useRef<AssistantSession | null>(null);
  // The session's latest turn as this page has seen it: the one it loaded, then each it ran. The
  // server refuses a message sent with any other, which is how a turn run in another tab shows.
  const lastTurnId = useRef<string | null>(null);
  // The session being made, so a turn that starts meanwhile waits for it and makes no second one.
  const sessionCreation = useRef<Promise<AssistantSession> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnRunning = useRef(false);
  const handedOver = useRef(false);

  const context = useMemo(
    () =>
      usable
        ? buildWorkspaceAutomationEditorContext({
            editorSessionId,
            mode,
            automationId,
            form,
            connections,
            timeZone,
            repositories,
            crowdinProjectIds,
            contentfulConnectionIds,
            projectName,
          })
        : null,
    [
      automationId,
      connections,
      contentfulConnectionIds,
      crowdinProjectIds,
      projectName,
      editorSessionId,
      form,
      mode,
      repositories,
      timeZone,
      usable,
    ],
  );
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    pendingForm.current = null;
  }, [form]);

  const notifySession = useEffectEvent((next: AssistantSession | null) => {
    sessionRef.current = next;
    setSession(next);
    onSessionChange?.(next?.id ?? null);
  });

  // A saved automation's page resumes the person's session for it, showing its history only.
  useEffect(() => {
    if (!automationId) {
      return;
    }
    let ignore = false;
    findAssistantSession(organizationSlug, automationId)
      .then((found) => {
        if (ignore) {
          return;
        }
        notifySession(found.session);
        lastTurnId.current =
          found.messages.findLast((message) => message.senderType === "user")?.id ?? null;
        setMessages(found.messages);
        setStatus("idle");
      })
      .catch(() => {
        if (!ignore) {
          setStatus("idle");
        }
      });
    return () => {
      ignore = true;
    };
  }, [automationId, organizationSlug]);

  // Saving, discarding or undoing everything leaves nothing of the assistant's to call unsaved.
  useEffect(() => {
    if (!hasUnsavedChanges) {
      setAppliedCallCount(0);
      setAppliedChangeCount(0);
    }
  }, [hasUnsavedChanges]);

  // One chat at a time, the other way round too: a chat opened in the dock floats over the
  // corner the panel is in, so the panel closes. Its session stays as it is.
  useEffect(() => {
    if (!chatDock) {
      return;
    }
    return reaction(
      () => chatDock.panelOpen,
      (dockOpen) => {
        if (dockOpen) {
          setOpenState(false);
        }
      },
    );
  }, [chatDock]);

  const notifyWorking = useEffectEvent((working: boolean) => onWorkingChange?.(working));
  useEffect(() => {
    notifyWorking(status === "streaming");
  }, [status]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      // One chat at a time on the page: the dock folds away while the assistant is open.
      if (next) {
        chatDock?.setPanelOpen(false);
      }
    },
    [chatDock],
  );

  const applyStreamedChanges = useEffectEvent((message: UIMessage) => {
    const current = contextRef.current;
    if (!current) {
      return;
    }
    const before = pendingForm.current ?? form;
    const result = applyAutomationSetupChanges({
      form: before,
      changes: collectAutomationSetupChanges(message.parts),
      editorSessionId,
      appliedToolCallIds: appliedToolCallIds.current,
      defaults: current.defaults,
      connections,
    });
    if (result.applied.length === 0) {
      return;
    }
    let calls = 0;
    let changes = 0;
    for (const entry of result.applied) {
      appliedToolCallIds.current.add(entry.toolCallId);
      const made = entry.items.filter((item) => item.status === "applied").length;
      if (made > 0) {
        calls += 1;
        changes += made;
      }
    }
    if (calls > 0) {
      setAppliedCallCount((count) => count + calls);
      setAppliedChangeCount((count) => count + changes);
    }
    if (result.form !== before) {
      pendingForm.current = result.form;
      onChange(result.form);
    }
  });

  const ensureSession = useEffectEvent((): Promise<AssistantSession> => {
    if (sessionRef.current) {
      return Promise.resolve(sessionRef.current);
    }
    sessionCreation.current ??= createAssistantSession(organizationSlug, automationId ?? null)
      .then((created) => {
        notifySession(created);
        return created;
      })
      .finally(() => {
        sessionCreation.current = null;
      });
    return sessionCreation.current;
  });

  /** Runs one turn. `shown` is the person's message when the panel already shows it. */
  const runTurn = useEffectEvent((text: string, shown: AssistantMessage | null) => {
    const current = contextRef.current;
    if (!current || turnRunning.current) {
      return;
    }
    turnRunning.current = true;
    // A refused message was never saved, so it goes when the next one is sent.
    const refusedId = failure && failure.reason !== "failed" ? failure.messageId : null;
    setFailure(null);
    setStatus("streaming");
    setOpen(true);
    const local = shown ?? localMessage(text);
    setMessages((list) => {
      const kept = refusedId ? list.filter((message) => message.id !== refusedId) : list;
      return shown ? kept : [...kept, local];
    });
    let editsShown = false;
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        const active = await ensureSession();
        if (controller.signal.aborted) {
          return;
        }
        for await (const reply of streamAssistantTurn({
          organizationSlug,
          sessionId: active.id,
          text,
          pageContext: current,
          lastTurnId: lastTurnId.current,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) {
            return;
          }
          lastTurnId.current = readAutomationAssistantTurnId(reply.parts) ?? lastTurnId.current;
          // The turn says first what the person changed on the page since the last one. It
          // goes above their message at once, as it will be when the saved turn is loaded.
          const edits = editsShown ? [] : readAutomationSetupPageEdits(reply.parts);
          if (edits.length > 0) {
            editsShown = true;
            const parts = [
              { type: AUTOMATION_SETUP_PAGE_EDITS_PART, data: { edits } },
            ] as UIMessage["parts"];
            setMessages((list) =>
              list.map((message) => (message.id === local.id ? { ...message, parts } : message)),
            );
          }
          setStreaming(reply);
          applyStreamedChanges(reply);
        }
        const saved = await loadAssistantSession(organizationSlug, active.id);
        if (!controller.signal.aborted && saved) {
          setMessages(saved.messages);
          notifySession(saved.session);
        }
      } catch (caught) {
        if (controller.signal.aborted) {
          return;
        }
        setFailure({
          messageId: local.id,
          reason:
            caught instanceof AssistantTurnInProgressError
              ? "turn_in_progress"
              : caught instanceof AssistantSessionOutOfDateError
                ? "out_of_date"
                : "failed",
        });
      } finally {
        turnRunning.current = false;
        if (!controller.signal.aborted) {
          setStreaming(null);
          setStatus("idle");
        }
      }
    })();
  });

  const send = useEffectEvent((text: string) => {
    const trimmed = text.trim();
    if (trimmed) {
      runTurn(trimmed, null);
    }
  });

  // Leaving the page stops reading the reply; the turn itself finishes on the server.
  useEffect(() => () => abortRef.current?.abort(), []);

  // The handed-over request's session is made while the page finds out what is connected, and
  // its turn starts once that is known. Both wait one tick, which the cleanup cancels, so the
  // mount, unmount, mount sequence React runs in development starts each of them once.
  useEffect(() => {
    if (!handoff || handedOver.current) {
      return;
    }
    chatDock?.setPanelOpen(false);
    const timer = window.setTimeout(() => {
      void ensureSession().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chatDock, handoff]);

  useEffect(() => {
    if (!handoff || handedOver.current || !connectionsSettled || !context) {
      return;
    }
    const timer = window.setTimeout(() => {
      handedOver.current = true;
      runTurn(handoff.text, handoff);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [connectionsSettled, context, handoff]);

  const startOver = useEffectEvent(() => {
    abortRef.current?.abort();
    const ended = sessionRef.current;
    notifySession(null);
    setMessages([]);
    setStreaming(null);
    setFailure(null);
    setStatus("idle");
    lastTurnId.current = null;
    turnRunning.current = false;
    handedOver.current = true;
    appliedToolCallIds.current = new Set();
    if (ended) {
      void deleteAssistantSession(organizationSlug, ended.id).catch(() => undefined);
    }
  });

  const value = useMemo<AutomationAssistantValue>(
    () => ({
      organizationSlug,
      mode,
      automationName: form.name,
      open,
      setOpen,
      status,
      working: status === "streaming",
      failure,
      session,
      messages,
      streaming,
      send,
      startOver,
      // A change that left the page as it is saved is counted until the next render only.
      appliedCallCount: hasUnsavedChanges ? appliedCallCount : 0,
      appliedChangeCount: hasUnsavedChanges ? appliedChangeCount : 0,
      steps: listWorkspaceAutomationSetupSteps({ form, connections }),
    }),
    [
      appliedCallCount,
      appliedChangeCount,
      connections,
      failure,
      form,
      hasUnsavedChanges,
      messages,
      mode,
      open,
      organizationSlug,
      session,
      setOpen,
      status,
      streaming,
    ],
  );

  if (!context) {
    return children;
  }

  return (
    <AutomationAssistantContext.Provider value={value}>
      {children}
    </AutomationAssistantContext.Provider>
  );
}
