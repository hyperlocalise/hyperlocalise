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
  collectAutomationSetupChanges,
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

export type AutomationAssistantValue = {
  mode: "create" | "detail";
  automationName: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  status: AutomationAssistantStatus;
  /** A turn is running for this page. */
  working: boolean;
  /** What went wrong with the last request, or null. */
  error: "turn_in_progress" | "failed" | null;
  session: AssistantSession | null;
  messages: AssistantMessage[];
  /** The reply as it streams, or null between turns. */
  streaming: UIMessage | null;
  send: (text: string) => void;
  startOver: () => void;
  /** Tool calls of the assistant that changed the page, and the changes they made in all. */
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

/**
 * Holds one person's assistant session for the automation page and applies what the assistant
 * changes to the form. A saved automation's session is resumed when the page opens; a new
 * automation's session is made on the first message and thrown away with the page.
 */
export function AutomationAssistantProvider({
  automationId,
  children,
  connections,
  connectionsSettled,
  contentfulConnectionIds,
  crowdinProjectIds,
  form,
  initialPrompt,
  mode,
  onChange,
  onSessionChange,
  onWorkingChange,
  organizationSlug,
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
  /** A request handed over from the automations page, sent once the page is ready. */
  initialPrompt?: string | null;
  mode: "create" | "detail";
  /** Called with the form after each of the assistant's changes. */
  onChange: (next: WorkspaceAutomationFormState) => void;
  /** Called when the session for this page starts or ends, with its id. */
  onSessionChange?: (sessionId: string | null) => void;
  onWorkingChange?: (working: boolean) => void;
  organizationSlug: string;
  /** Connected repositories. Only a selectable one can be offered as the default. */
  repositories: ReadonlyArray<{ id: string; name: string; selectable: boolean }>;
}) {
  const chatDock = useOptionalAppShellStore()?.chatDock ?? null;
  const [editorSessionId] = useState(() => crypto.randomUUID());
  const [timeZone] = useState(browserTimeZone);
  const [open, setOpenState] = useState(false);
  const [status, setStatus] = useState<AutomationAssistantStatus>(
    automationId ? "loading" : "idle",
  );
  const [error, setError] = useState<AutomationAssistantValue["error"]>(null);
  const [session, setSession] = useState<AssistantSession | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [streaming, setStreaming] = useState<UIMessage | null>(null);
  const [appliedCallCount, setAppliedCallCount] = useState(0);
  const [appliedChangeCount, setAppliedChangeCount] = useState(0);
  const appliedToolCallIds = useRef(new Set<string>());
  // The form after the latest change by the assistant, until the page renders with it.
  const pendingForm = useRef<WorkspaceAutomationFormState | null>(null);
  const sessionRef = useRef<AssistantSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handedOver = useRef(false);

  const usable = isWorkspaceAutomationAssistantForm(form);
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
          })
        : null,
    [
      automationId,
      connections,
      contentfulConnectionIds,
      crowdinProjectIds,
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

  const send = useEffectEvent((text: string) => {
    const trimmed = text.trim();
    const current = contextRef.current;
    if (!trimmed || !current || status === "streaming") {
      return;
    }
    setError(null);
    setStatus("streaming");
    setOpen(true);
    const controller = new AbortController();
    abortRef.current = controller;

    void (async () => {
      try {
        let active = sessionRef.current;
        if (!active) {
          active = await createAssistantSession(organizationSlug, automationId ?? null);
          notifySession(active);
        }
        const sent: AssistantMessage = {
          id: `local-${crypto.randomUUID()}`,
          conversationId: active.id,
          senderType: "user",
          senderEmail: null,
          text: trimmed,
          parts: null,
          attachments: null,
          createdAt: new Date().toISOString(),
        };
        setMessages((list) => [...list, sent]);
        for await (const reply of streamAssistantTurn({
          organizationSlug,
          sessionId: active.id,
          text: trimmed,
          pageContext: current,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) {
            return;
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
        setError(caught instanceof AssistantTurnInProgressError ? "turn_in_progress" : "failed");
      } finally {
        if (!controller.signal.aborted) {
          setStreaming(null);
          setStatus("idle");
        }
      }
    })();
  });

  // Leaving the page stops reading the reply; the turn itself finishes on the server.
  useEffect(() => () => abortRef.current?.abort(), []);

  // A request handed over from the automations page goes once the page knows its integrations.
  useEffect(() => {
    if (!initialPrompt || handedOver.current || !connectionsSettled || !context) {
      return;
    }
    handedOver.current = true;
    send(initialPrompt);
  }, [connectionsSettled, context, initialPrompt]);

  const startOver = useEffectEvent(() => {
    abortRef.current?.abort();
    const ended = sessionRef.current;
    notifySession(null);
    setMessages([]);
    setStreaming(null);
    setError(null);
    setStatus("idle");
    appliedToolCallIds.current = new Set();
    if (ended) {
      void deleteAssistantSession(organizationSlug, ended.id).catch(() => undefined);
    }
  });

  const value = useMemo<AutomationAssistantValue>(
    () => ({
      mode,
      automationName: form.name,
      open,
      setOpen,
      status,
      working: status === "streaming",
      error,
      session,
      messages,
      streaming,
      send,
      startOver,
      appliedCallCount,
      appliedChangeCount,
      steps: listWorkspaceAutomationSetupSteps({ form, connections }),
    }),
    [
      appliedCallCount,
      appliedChangeCount,
      connections,
      error,
      form,
      messages,
      mode,
      open,
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
