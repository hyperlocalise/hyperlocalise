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
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import { ContentEditorEditorShortcutKbd } from "./content-editor-editor-shortcut-kbd";

export function ContentEditorEditorActions({
  primaryActionLabel,
  isMac,
  canTriggerApprove,
  canTriggerFindContext,
  canLookupContext,
  isApproving,
  isSavingDraft,
  isLookingUpContext,
  hasPreviousSegment,
  hasNextSegment,
  onApprove,
  onSaveDraft,
  onAddToIssueSheet,
  onAskQuestion,
  onPrevious,
  onNext,
}: {
  primaryActionLabel: string;
  isMac: boolean;
  canTriggerApprove: boolean;
  canTriggerFindContext: boolean;
  canLookupContext: boolean;
  isApproving: boolean;
  isSavingDraft: boolean;
  isLookingUpContext: boolean;
  hasPreviousSegment: boolean;
  hasNextSegment: boolean;
  onApprove: () => void;
  onSaveDraft?: () => void;
  onAddToIssueSheet?: () => void;
  onAskQuestion: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const intl = useIntl();
  const isNavigationBlocked = isApproving || isSavingDraft || isLookingUpContext;

  return (
    <div className="flex flex-wrap items-center gap-2">
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
      {onSaveDraft ? (
        <Button
          variant="outline"
          className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
          onClick={onSaveDraft}
          disabled={!canTriggerApprove}
        >
          {isSavingDraft ? <Spinner className="size-4" /> : null}
          <FormattedMessage {...contentEditorEditorPanelMessages.saveAsDraft} />
        </Button>
      ) : null}
      <Button
        variant="outline"
        className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
        onClick={onAskQuestion}
        disabled={!canTriggerFindContext}
        title={
          canLookupContext
            ? intl.formatMessage(contentEditorEditorPanelMessages.findContextTitle)
            : intl.formatMessage(contentEditorEditorPanelMessages.findContextUnavailableTitle)
        }
      >
        {isLookingUpContext ? <Spinner className="size-4" /> : null}
        {isLookingUpContext ? (
          <FormattedMessage {...contentEditorEditorPanelMessages.findingContext} />
        ) : (
          <FormattedMessage {...contentEditorEditorPanelMessages.findContext} />
        )}
        <ContentEditorEditorShortcutKbd shortcut="findContext" isMac={isMac} />
      </Button>
      {onAddToIssueSheet ? (
        <Button
          variant="outline"
          className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
          onClick={onAddToIssueSheet}
          disabled={isNavigationBlocked}
        >
          <FormattedMessage {...contentEditorEditorPanelMessages.addToIssueSheet} />
        </Button>
      ) : null}
      <Button
        variant="ghost"
        className="hidden lg:inline-flex"
        onClick={onPrevious}
        disabled={isNavigationBlocked || !hasPreviousSegment}
      >
        <FormattedMessage {...contentEditorEditorPanelMessages.previous} />
        <ContentEditorEditorShortcutKbd shortcut="previous" isMac={isMac} />
      </Button>
      <Button
        variant="ghost"
        className="hidden lg:inline-flex"
        onClick={onNext}
        disabled={isNavigationBlocked || !hasNextSegment}
      >
        <FormattedMessage {...contentEditorEditorPanelMessages.next} />
        <ContentEditorEditorShortcutKbd shortcut="next" isMac={isMac} />
      </Button>
    </div>
  );
}
