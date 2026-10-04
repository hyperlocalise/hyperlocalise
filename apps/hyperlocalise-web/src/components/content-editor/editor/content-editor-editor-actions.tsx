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
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import { ContentEditorEditorShortcutKbd } from "./content-editor-editor-shortcut-kbd";

export function ContentEditorEditorActions({
  primaryActionLabel,
  isMac,
  canTriggerApprove,
  isApproving,
  isSavingDraft,
  onApprove,
  onSaveDraft,
  showApprove = true,
}: {
  primaryActionLabel: string;
  isMac: boolean;
  canTriggerApprove: boolean;
  isApproving: boolean;
  isSavingDraft: boolean;
  onApprove: () => void;
  onSaveDraft?: () => void;
  showApprove?: boolean;
}) {
  if (!showApprove && !onSaveDraft) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showApprove ? (
        <Button
          variant="default"
          className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
          onClick={onApprove}
          disabled={!canTriggerApprove}
        >
          {isApproving ? <Spinner className="size-4 text-primary-foreground" /> : null}
          {primaryActionLabel}
          <ContentEditorEditorShortcutKbd
            shortcut="approve"
            isMac={isMac}
            className="bg-primary-foreground/15 text-primary-foreground"
          />
        </Button>
      ) : null}
      {onSaveDraft ? (
        <Button
          variant="outline"
          className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
          onClick={onSaveDraft}
          disabled={!canTriggerApprove}
        >
          {isSavingDraft ? <Spinner className="size-4" /> : <FloppyDiskIcon className="size-4" />}
          <FormattedMessage {...contentEditorEditorPanelMessages.saveAsDraft} />
        </Button>
      ) : null}
    </div>
  );
}
