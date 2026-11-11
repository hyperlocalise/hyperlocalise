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
import { createContext, useContext, type ReactNode } from "react";
import { useIntl } from "react-intl";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMac } from "@/hooks/use-is-mac";
import { cn } from "@/lib/primitives/cn";

import {
  getAutomationShortcutKeys,
  getRevealKeyLabel,
  type AutomationShortcutId,
} from "./automation-shortcut-keys";
import { automationShortcutsMessages as messages } from "./automation-shortcuts.messages";
import { useHeldRevealKey } from "./use-held-reveal-key";

const AutomationShortcutRevealContext = createContext(false);

export function AutomationShortcutRevealProvider({ children }: { children: ReactNode }) {
  return (
    <AutomationShortcutRevealContext.Provider value={useHeldRevealKey()}>
      {children}
    </AutomationShortcutRevealContext.Provider>
  );
}

export function useAutomationShortcutReveal(): boolean {
  return useContext(AutomationShortcutRevealContext);
}

export function ShortcutKeys({ keys }: { keys: string[] }) {
  return (
    <KbdGroup aria-hidden="true" className="inline-flex items-center gap-0.5">
      {keys.map((key, index) => (
        <Kbd key={`${key}-${index}`}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

/**
 * Floats a shortcut under its action while Alt or Option is held. The action
 * keeps its size; the hint is only a label, not a second control.
 */
export function ShortcutHintAnchor({
  shortcut,
  children,
  className,
}: {
  shortcut: AutomationShortcutId;
  children: ReactNode;
  className?: string;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const reveal = useAutomationShortcutReveal();
  const keys = getAutomationShortcutKeys(isMac, shortcut);

  return (
    <span className={cn("relative inline-flex", className)}>
      {children}
      {reveal ? (
        <span
          role="note"
          aria-label={intl.formatMessage(messages.hintRegion)}
          className="pointer-events-none absolute start-1/2 top-full z-30 mt-1 -translate-x-1/2"
        >
          <KbdGroup
            aria-hidden="true"
            className="inline-flex items-center gap-0.5 rounded-md border border-border bg-popover px-1 py-0.5 shadow-sm"
          >
            {keys.map((key, index) => (
              <Kbd key={`${key}-${index}`}>{key}</Kbd>
            ))}
          </KbdGroup>
          <span className="sr-only">{keys.join(" + ")}</span>
        </span>
      ) : null}
    </span>
  );
}

export function AutomationShortcutAffordance({ onOpen }: { onOpen: () => void }) {
  const intl = useIntl();
  const isMac = useIsMac();
  const key = getRevealKeyLabel(isMac);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="hidden text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:inline"
            onClick={onOpen}
          >
            {intl.formatMessage(messages.holdToReveal, { key })}
          </button>
        }
      />
      <TooltipContent side="bottom">
        {intl.formatMessage(messages.holdToRevealTooltip, { key })}
      </TooltipContent>
    </Tooltip>
  );
}

export function VisualWorkflowCanvasShortcutHints() {
  const intl = useIntl();
  const isMac = useIsMac();
  const reveal = useAutomationShortcutReveal();
  if (!reveal) {
    return null;
  }

  const hints: Array<{ shortcut: AutomationShortcutId; label: string }> = [
    {
      shortcut: "addNode",
      label: intl.formatMessage(messages.addNode),
    },
    {
      shortcut: "fitView",
      label: intl.formatMessage(messages.fitView),
    },
    {
      shortcut: "primary",
      label: intl.formatMessage(messages.testWorkflow),
    },
  ];

  return (
    <div
      role="note"
      aria-label={intl.formatMessage(messages.canvasHints)}
      className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-full border border-border bg-popover/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
        {hints.map(({ shortcut, label }) => (
          <span key={shortcut} className="inline-flex items-center gap-1.5">
            <ShortcutKeys keys={getAutomationShortcutKeys(isMac, shortcut)} />
            <span>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
