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
  AUTOMATION_SETUP_PAGE_EDITS_PART,
  readAutomationAssistantTurnId,
  type AutomationAssistantAppliedCall,
} from "@/lib/agents/automation-assistant-editor";
import {
  readAutomationAssistantPageEditsRecord,
  type AutomationAssistantPageContext,
} from "@/lib/agents/automation-assistant-editors";
import type { WorkspaceAutomationSetupStep } from "@/lib/agents/workspace-automation-setup-steps";

import {
  AssistantSessionGoneError,
  AssistantSessionOutOfDateError,
  AssistantTurnInProgressError,
  createAssistantSession,
  deleteAssistantSession,
  findAssistantSession,
  loadAssistantSession,
  streamAssistantTurn,
  type AutomationAssistantApi,
  type AssistantMessage,
  type AssistantSession,
  type AssistantSessionKey,
} from "./automation-assistant-api";

// Each call is looked up when it is made, so a page test can stub the module with less.
const SERVER_API: AutomationAssistantApi = {
  createAssistantSession: (...args) => createAssistantSession(...args),
  findAssistantSession: (...args) => findAssistantSession(...args),
  loadAssistantSession: (...args) => loadAssistantSession(...args),
  deleteAssistantSession: (...args) => deleteAssistantSession(...args),
  streamAssistantTurn: (...args) => streamAssistantTurn(...args),
};

export type AutomationAssistantStatus = "idle" | "loading" | "streaming";

/** Which page the assistant is on, for wording and counting. */
export type AutomationAssistantMode = "create" | "detail" | "visual_workflow";

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
  mode: AutomationAssistantMode;
  /** The name of what the page edits, for the panel's header. */
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
  /** What the setup still needs, on a page that lists such steps. */
  steps: readonly WorkspaceAutomationSetupStep[];
  /**
   * What a `{{ }}` field reference in a reply reads as, such as "AI Agent › text", on a page
   * whose fields are read that way; null for one the page does not know.
   */
  referenceLabel: ((reference: string) => string | null) | null;
};

export const AutomationAssistantContext = createContext<AutomationAssistantValue | null>(null);

/** Null outside the provider, so a section can render nothing without the assistant. */
export function useAutomationAssistant() {
  return useContext(AutomationAssistantContext);
}

/** The person's message as the panel shows it until the saved conversation is loaded. */
export function localAssistantMessage(text: string): AssistantMessage {
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
 * What a page gives the session provider: the editor it is, what it sends with each turn and
 * how the tool's changes land on it.
 */
export type AutomationAssistantTarget<
  Context extends AutomationAssistantPageContext,
  Document,
  Change,
> = {
  editor: {
    collectChanges: (parts: readonly unknown[]) => Array<{ toolCallId: string; change: Change }>;
    applyChanges: (input: {
      context: Context;
      document: Document;
      changes: ReadonlyArray<{ toolCallId: string; change: Change }>;
      editorSessionId: string;
      appliedToolCallIds: ReadonlySet<string>;
    }) => { document: Document; applied: AutomationAssistantAppliedCall[] };
  };
  /** Names one mounted editor, so a change is applied only to the page it was made for. */
  editorSessionId: string;
  /** The page as it stands, or null while the page cannot use the assistant. */
  context: Context | null;
  document: Document;
  /** Called with the document after each of the assistant's changes. */
  onChange: (next: Document) => void;
  /** The saved thing the session is about, or null while it has not been saved. */
  sessionKey: AssistantSessionKey | null;
  mode: AutomationAssistantMode;
  title: string;
  /**
   * Whether the page holds anything unsaved. Once it does not, the assistant's changes were saved
   * or taken back, and its count of them starts again.
   */
  hasUnsavedChanges: boolean;
  /** A request handed over from another page, sent once the page is ready. */
  initialPrompt?: string | null;
  /** True once the page knows enough to run the handed-over request. */
  ready: boolean;
  steps?: readonly WorkspaceAutomationSetupStep[];
  /** What a `{{ }}` field reference in a reply reads as on this page. */
  referenceLabel?: (reference: string) => string | null;
  /** Called when the session for this page starts or ends, with its id. */
  onSessionChange?: (sessionId: string | null) => void;
  onWorkingChange?: (working: boolean) => void;
};

/**
 * Holds one person's assistant session for a page and applies what the assistant changes to it.
 * A saved page's session is resumed when the page opens; an unsaved page's session is made on
 * the first message and thrown away with the page. A request handed over from another page is
 * shown, with the panel open and working, from the first render; its turn starts once the page
 * is ready.
 */
export function AutomationAssistantSessionProvider<
  Context extends AutomationAssistantPageContext,
  Document,
  Change,
>({
  api = SERVER_API,
  children,
  organizationSlug,
  target,
}: {
  /** The calls for the session and its turns, in place of the server's. Must not change. */
  api?: AutomationAssistantApi;
  children?: ReactNode;
  organizationSlug: string;
  target: AutomationAssistantTarget<Context, Document, Change>;
}) {
  const chatDock = useOptionalAppShellStore()?.chatDock ?? null;
  const { editor, editorSessionId, context, document, onChange, sessionKey } = target;
  const sessionKeyId = sessionKey ? JSON.stringify(sessionKey) : null;
  // The handed-over request as the panel shows it, or null when there is none to send.
  const [handoff] = useState(() => {
    const text = target.initialPrompt?.trim();
    return text && context ? localAssistantMessage(text) : null;
  });
  const [open, setOpenState] = useState(handoff !== null);
  const [status, setStatus] = useState<AutomationAssistantStatus>(
    handoff ? "streaming" : sessionKey ? "loading" : "idle",
  );
  const [failure, setFailure] = useState<AutomationAssistantFailure | null>(null);
  const [session, setSession] = useState<AssistantSession | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>(() => (handoff ? [handoff] : []));
  const [streaming, setStreaming] = useState<UIMessage | null>(null);
  const [appliedCallCount, setAppliedCallCount] = useState(0);
  const [appliedChangeCount, setAppliedChangeCount] = useState(0);
  const appliedToolCallIds = useRef(new Set<string>());
  // The document after the latest change by the assistant, until the page renders with it.
  const pendingDocument = useRef<Document | null>(null);
  const sessionRef = useRef<AssistantSession | null>(null);
  // The session's latest turn as this page has seen it: the one it loaded, then each it ran. The
  // server refuses a message sent with any other, which is how a turn run in another tab shows.
  const lastTurnId = useRef<string | null>(null);
  // The session being made, so a turn that starts meanwhile waits for it and makes no second one.
  const sessionCreation = useRef<Promise<AssistantSession> | null>(null);
  // The delete Start over sent. The next session is asked for after it: a saved page has one
  // session per person, so asking sooner would be answered with the one being deleted.
  const sessionEnding = useRef<Promise<void> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const turnRunning = useRef(false);
  const handedOver = useRef(false);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    pendingDocument.current = null;
  }, [document]);

  const notifySession = useEffectEvent((next: AssistantSession | null) => {
    sessionRef.current = next;
    setSession(next);
    target.onSessionChange?.(next?.id ?? null);
  });

  // A saved page resumes the person's session for it, showing its history only. The panel takes
  // no message until this is done, since a message needs the latest turn it holds.
  useEffect(() => {
    const key = targetRef.current.sessionKey;
    if (!key) {
      return;
    }
    let ignore = false;
    api
      .findAssistantSession(organizationSlug, key)
      .then((found) => {
        // A turn that started meanwhile is ahead of this, and loads the session when it ends.
        if (ignore || turnRunning.current) {
          return;
        }
        notifySession(found.session);
        lastTurnId.current =
          found.messages.findLast((message) => message.senderType === "user")?.id ?? null;
        setMessages(found.messages);
        setStatus("idle");
      })
      .catch(() => {
        if (!ignore && !turnRunning.current) {
          setStatus("idle");
        }
      });
    return () => {
      ignore = true;
    };
  }, [api, sessionKeyId, organizationSlug]);

  // Saving, discarding or undoing everything leaves nothing of the assistant's to call unsaved.
  useEffect(() => {
    if (!target.hasUnsavedChanges) {
      setAppliedCallCount(0);
      setAppliedChangeCount(0);
    }
  }, [target.hasUnsavedChanges]);

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

  const notifyWorking = useEffectEvent((working: boolean) => target.onWorkingChange?.(working));
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
    const current = targetRef.current.context;
    if (!current) {
      return;
    }
    const before = pendingDocument.current ?? document;
    const result = editor.applyChanges({
      context: current,
      document: before,
      changes: editor.collectChanges(message.parts),
      editorSessionId,
      appliedToolCallIds: appliedToolCallIds.current,
    });
    if (result.applied.length === 0) {
      return;
    }
    let calls = 0;
    let changes = 0;
    for (const entry of result.applied) {
      appliedToolCallIds.current.add(entry.toolCallId);
      if (entry.made > 0) {
        calls += 1;
        changes += entry.made;
      }
    }
    if (calls > 0) {
      setAppliedCallCount((count) => count + calls);
      setAppliedChangeCount((count) => count + changes);
    }
    if (result.document !== before) {
      pendingDocument.current = result.document;
      onChange(result.document);
    }
  });

  const ensureSession = useEffectEvent((): Promise<AssistantSession> => {
    if (sessionRef.current) {
      return Promise.resolve(sessionRef.current);
    }
    sessionCreation.current ??= (sessionEnding.current ?? Promise.resolve())
      .then(() => api.createAssistantSession(organizationSlug, targetRef.current.sessionKey))
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
    const current = targetRef.current.context;
    if (!current || turnRunning.current) {
      return;
    }
    turnRunning.current = true;
    // A refused message was never saved, so it goes when the next one is sent.
    const refusedId = failure && failure.reason !== "failed" ? failure.messageId : null;
    setFailure(null);
    setStatus("streaming");
    setOpen(true);
    const local = shown ?? localAssistantMessage(text);
    setMessages((list) => {
      const kept = refusedId ? list.filter((message) => message.id !== refusedId) : list;
      return shown ? kept : [...kept, local];
    });
    let editsShown = false;
    const controller = new AbortController();
    abortRef.current = controller;

    const stream = async (active: AssistantSession) => {
      for await (const reply of api.streamAssistantTurn({
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
        const record = editsShown ? null : readAutomationAssistantPageEditsRecord(reply.parts);
        if (record && record.edits.length > 0) {
          editsShown = true;
          const parts = [
            { type: AUTOMATION_SETUP_PAGE_EDITS_PART, data: record },
          ] as UIMessage["parts"];
          setMessages((list) =>
            list.map((message) => (message.id === local.id ? { ...message, parts } : message)),
          );
        }
        setStreaming(reply);
        applyStreamedChanges(reply);
      }
    };

    void (async () => {
      try {
        let active = await ensureSession();
        if (controller.signal.aborted) {
          return;
        }
        try {
          await stream(active);
        } catch (caught) {
          if (!(caught instanceof AssistantSessionGoneError) || controller.signal.aborted) {
            throw caught;
          }
          // The session was ended with Start over in another tab; this message starts a new one.
          notifySession(null);
          lastTurnId.current = null;
          setMessages([local]);
          active = await ensureSession();
          if (controller.signal.aborted) {
            return;
          }
          await stream(active);
        }
        if (controller.signal.aborted) {
          return;
        }
        const saved = await api.loadAssistantSession(organizationSlug, active.id);
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

  // The handed-over request's session is made while the page gets ready, and its turn starts
  // once it is. Both wait one tick, which the cleanup cancels, so the mount, unmount, mount
  // sequence React runs in development starts each of them once.
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

  const ready = target.ready && context !== null;
  useEffect(() => {
    if (!handoff || handedOver.current || !ready) {
      return;
    }
    const timer = window.setTimeout(() => {
      handedOver.current = true;
      runTurn(handoff.text, handoff);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, handoff]);

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
      const ending = api
        .deleteAssistantSession(organizationSlug, ended.id)
        .catch(() => undefined)
        .finally(() => {
          if (sessionEnding.current === ending) {
            sessionEnding.current = null;
          }
        });
      sessionEnding.current = ending;
    }
  });

  const { mode, title, hasUnsavedChanges, steps, referenceLabel } = target;
  const value = useMemo<AutomationAssistantValue>(
    () => ({
      organizationSlug,
      mode,
      automationName: title,
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
      steps: steps ?? [],
      referenceLabel: referenceLabel ?? null,
    }),
    [
      referenceLabel,
      appliedCallCount,
      appliedChangeCount,
      failure,
      hasUnsavedChanges,
      messages,
      mode,
      open,
      organizationSlug,
      session,
      setOpen,
      status,
      steps,
      streaming,
      title,
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
