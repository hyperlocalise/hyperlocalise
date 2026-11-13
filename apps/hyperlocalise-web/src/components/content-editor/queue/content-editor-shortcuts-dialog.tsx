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

import {
  CONTENT_EDITOR_SHORTCUT_GROUPS,
  getCatShortcutDialogRows,
  getModKeyLabel,
  type ContentEditorShortcutGroup,
} from "@/components/content-editor/editor/content-editor-keyboard-shortcuts";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useIsMac } from "@/hooks/use-is-mac";

const GROUP_LABELS: Record<ContentEditorShortcutGroup, MessageDescriptor> = {
  editing: messages.groupEditing,
  navigation: messages.groupNavigation,
  workspace: messages.groupWorkspace,
};

function ShortcutKeys({ keys }: { keys: readonly string[] }) {
  return (
    <KbdGroup className="inline-flex items-center gap-1">
      {keys.map((key, index) => (
        <Kbd key={`${key}-${index}`}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.title} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.description} />
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pe-3">
          <div className="space-y-5">
            {CONTENT_EDITOR_SHORTCUT_GROUPS.map((group) => (
              <section key={group}>
                <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                  {intl.formatMessage(GROUP_LABELS[group])}
                </h3>
                <dl className="divide-y divide-border">
                  {getCatShortcutDialogRows(isMac, group).map(
                    ({ id, label, keys, alternateKeys }) => (
                      <div key={id} className="flex items-center justify-between gap-4 py-2">
                        <dt className="text-sm text-foreground">{intl.formatMessage(label)}</dt>
                        <dd className="flex shrink-0 items-center gap-1.5">
                          <ShortcutKeys keys={keys} />
                          {alternateKeys ? (
                            <>
                              <span className="text-xs text-muted-foreground">
                                <FormattedMessage {...messages.alternateShortcut} />
                              </span>
                              <ShortcutKeys keys={alternateKeys} />
                            </>
                          ) : null}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </section>
            ))}
          </div>
        </ScrollArea>

        <p className="text-xs text-muted-foreground">
          <FormattedMessage
            {...messages.holdToReveal}
            values={{ key: <Kbd>{getModKeyLabel(isMac)}</Kbd> }}
          />
        </p>

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
