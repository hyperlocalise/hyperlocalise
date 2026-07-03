"use client";

import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { catEditorPanelMessages } from "@/components/cat/shared/cat.messages";

import { CatEditorShortcutKbd } from "./cat-editor-shortcut-kbd";

export function CatEditorActions({
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
  onAskQuestion: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const intl = useIntl();
  const isNavigationBlocked = isApproving || isSavingDraft || isLookingUpContext;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        className="min-h-11 flex-1 bg-grove-500 text-white hover:bg-grove-400 sm:flex-none lg:min-h-0"
        onClick={onApprove}
        disabled={!canTriggerApprove}
      >
        {isApproving ? <Spinner className="size-4 text-white" /> : null}
        {primaryActionLabel}
        <CatEditorShortcutKbd shortcut="approve" isMac={isMac} className="bg-white/15 text-white" />
      </Button>
      {onSaveDraft ? (
        <Button
          variant="outline"
          className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
          onClick={onSaveDraft}
          disabled={!canTriggerApprove}
        >
          {isSavingDraft ? <Spinner className="size-4" /> : null}
          <FormattedMessage {...catEditorPanelMessages.saveAsDraft} />
        </Button>
      ) : null}
      <Button
        variant="outline"
        className="min-h-11 flex-1 sm:flex-none lg:min-h-0"
        onClick={onAskQuestion}
        disabled={!canTriggerFindContext}
        title={
          canLookupContext
            ? intl.formatMessage(catEditorPanelMessages.findContextTitle)
            : intl.formatMessage(catEditorPanelMessages.findContextUnavailableTitle)
        }
      >
        {isLookingUpContext ? <Spinner className="size-4" /> : null}
        {isLookingUpContext ? (
          <FormattedMessage {...catEditorPanelMessages.findingContext} />
        ) : (
          <FormattedMessage {...catEditorPanelMessages.findContext} />
        )}
        <CatEditorShortcutKbd shortcut="findContext" isMac={isMac} />
      </Button>
      <Button
        variant="ghost"
        className="hidden lg:inline-flex"
        onClick={onPrevious}
        disabled={isNavigationBlocked || !hasPreviousSegment}
      >
        <FormattedMessage {...catEditorPanelMessages.previous} />
        <CatEditorShortcutKbd shortcut="previous" isMac={isMac} />
      </Button>
      <Button
        variant="ghost"
        className="hidden lg:inline-flex"
        onClick={onNext}
        disabled={isNavigationBlocked || !hasNextSegment}
      >
        <FormattedMessage {...catEditorPanelMessages.next} />
        <CatEditorShortcutKbd shortcut="next" isMac={isMac} />
      </Button>
    </div>
  );
}
