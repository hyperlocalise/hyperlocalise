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
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMac } from "@/hooks/use-is-mac";

import {
  getAutomationShortcutKeys,
  listAutomationShortcuts,
  type AutomationShortcutId,
  type AutomationShortcutSurface,
} from "./automation-shortcut-keys";
import { ShortcutKeys } from "./automation-shortcut-hint";
import { automationShortcutsMessages as messages } from "./automation-shortcuts.messages";

const LABELS: Record<
  AutomationShortcutId,
  (surface: AutomationShortcutSurface, mode?: "create" | "detail") => MessageDescriptor
> = {
  save: () => messages.save,
  primary: (surface, mode) =>
    surface === "visual_workflow"
      ? messages.testWorkflow
      : mode === "create"
        ? messages.create
        : messages.runNow,
  assistant: () => messages.assistant,
  undo: () => messages.undo,
  redo: () => messages.redo,
  addNode: () => messages.addNode,
  fitView: () => messages.fitView,
  shortcuts: () => messages.shortcuts,
};

export function AutomationShortcutsDialog({
  open,
  onOpenChange,
  surface,
  mode = "detail",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface: AutomationShortcutSurface;
  mode?: "create" | "detail";
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const rows = listAutomationShortcuts(surface);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.dialogTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              {...(surface === "visual_workflow"
                ? messages.dialogDescriptionWorkflow
                : messages.dialogDescriptionAutomation)}
            />
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-border">
          {rows.map((shortcut) => {
            const keys = getAutomationShortcutKeys(isMac, shortcut);
            return (
              <div key={shortcut} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-sm text-foreground">
                  {intl.formatMessage(LABELS[shortcut](surface, mode))}
                </dt>
                <dd>
                  <ShortcutKeys keys={keys} />
                  <span className="sr-only">({keys.join(" + ")})</span>
                </dd>
              </div>
            );
          })}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
