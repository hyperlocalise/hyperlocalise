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
import { observer } from "mobx-react-lite";
import { useId } from "react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { getCatShortcutKeys } from "@/components/content-editor/editor/content-editor-keyboard-shortcuts";
import { contentEditorShortcutsDialogMessages as messages } from "@/components/content-editor/shared/content-editor-chrome.messages";
import { useOptionalCatWorkspace } from "@/components/content-editor/workspace/content-editor-workspace-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useIsMac } from "@/hooks/use-is-mac";

export const ContentEditorShortcutsDialog = observer(function ContentEditorShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const intl = useIntl();
  const isMac = useIsMac();
  const store = useOptionalCatWorkspace();
  const hintSwitchId = useId();
  const rows: Array<{ label: MessageDescriptor; keys: string[] }> = [
    { label: messages.approve, keys: getCatShortcutKeys(isMac, "approve") },
    { label: messages.previous, keys: getCatShortcutKeys(isMac, "previous") },
    { label: messages.next, keys: getCatShortcutKeys(isMac, "next") },
    { label: messages.findContext, keys: getCatShortcutKeys(isMac, "findContext") },
    { label: messages.exitSelection, keys: ["Esc"] },
    { label: messages.openShortcuts, keys: ["?"] },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-border">
          {rows.map(({ label, keys }) => (
            <div key={label.id} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-sm text-foreground">{intl.formatMessage(label)}</dt>
              <dd>
                <KbdGroup className="inline-flex items-center gap-1">
                  {keys.map((key, index) => (
                    <Kbd key={`${key}-${index}`}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </dd>
            </div>
          ))}
        </dl>

        {store ? (
          <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
            <Label htmlFor={hintSwitchId} className="text-sm font-normal">
              <FormattedMessage {...messages.showHintBar} />
            </Label>
            <Switch
              id={hintSwitchId}
              checked={!store.ui.shortcutHintsHidden}
              onCheckedChange={(checked) => store.ui.setShortcutHintsHidden(!checked)}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
});
