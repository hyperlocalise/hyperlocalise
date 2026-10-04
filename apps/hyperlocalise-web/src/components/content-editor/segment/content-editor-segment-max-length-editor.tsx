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
import { useEffect, useRef, useState } from "react";
import { PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { contentEditorIntelligencePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

import { ContentEditorCharacterMeter } from "./content-editor-character-meter";

const MAX_SEGMENT_LENGTH = 100_000;

export function parseMaxLengthDraft(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_SEGMENT_LENGTH) {
    return null;
  }

  return parsed;
}

export function ContentEditorSegmentMaxLengthEditor({
  maxLength,
  canEdit,
  isSaving = false,
  characterCount,
  onSave,
  onFinishEditing,
}: {
  maxLength?: number;
  canEdit: boolean;
  isSaving?: boolean;
  characterCount?: number;
  onSave: (maxLength: number | null) => void | Promise<void>;
  onFinishEditing?: () => void;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(maxLength != null ? String(maxLength) : "");
  const [error, setError] = useState<string | null>(null);
  const showEditor = canEdit && isEditing;

  useEffect(() => {
    setDraft(maxLength != null ? String(maxLength) : "");
    setError(null);
    setIsEditing(false);
  }, [maxLength]);

  useEffect(() => {
    if (showEditor) {
      inputRef.current?.focus();
    }
  }, [showEditor]);

  function validateDraft(): number | null | undefined {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const input = inputRef.current;
    if (input && !input.checkValidity()) {
      setError(intl.formatMessage(contentEditorIntelligencePanelMessages.maxLengthInvalid));
      return undefined;
    }

    const parsed = parseMaxLengthDraft(trimmed);
    if (parsed == null) {
      setError(intl.formatMessage(contentEditorIntelligencePanelMessages.maxLengthInvalid));
      return undefined;
    }

    return parsed;
  }

  async function commitDraft() {
    const parsed = validateDraft();
    if (parsed === undefined) {
      return;
    }

    const nextValue = parsed;
    const currentValue = maxLength ?? null;
    if (nextValue === currentValue) {
      setIsEditing(false);
      onFinishEditing?.();
      return;
    }

    setError(null);
    try {
      await onSave(nextValue);
      setIsEditing(false);
      onFinishEditing?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : intl.formatMessage(contentEditorIntelligencePanelMessages.maxLengthSaveFailed),
      );
    }
  }

  async function handleClear() {
    setDraft("");
    setError(null);
    try {
      await onSave(null);
      setIsEditing(false);
      onFinishEditing?.();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : intl.formatMessage(contentEditorIntelligencePanelMessages.maxLengthSaveFailed),
      );
    }
  }

  const parsedDraft = parseMaxLengthDraft(draft);
  const hasChanges = (maxLength ?? null) !== (draft.trim().length === 0 ? null : parsedDraft);
  const usedCountClassName =
    maxLength != null && characterCount != null && characterCount > maxLength
      ? "text-sm font-medium text-destructive tabular-nums"
      : "text-sm text-subtle-foreground tabular-nums";

  if (!showEditor) {
    return (
      <div className="flex items-center gap-3">
        {characterCount != null ? (
          <ContentEditorCharacterMeter
            count={characterCount}
            maxLength={maxLength}
            className="flex-1"
          />
        ) : (
          <p className="flex-1 text-sm text-foreground">
            {maxLength != null && maxLength > 0 ? (
              <FormattedMessage
                {...contentEditorIntelligencePanelMessages.maxLengthCurrent}
                values={{ maxLength }}
              />
            ) : (
              <FormattedMessage {...contentEditorIntelligencePanelMessages.maxLengthPlaceholder} />
            )}
          </p>
        )}
        {canEdit ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="size-7"
            aria-label={intl.formatMessage(contentEditorIntelligencePanelMessages.maxLengthEdit)}
            onClick={() => setIsEditing(true)}
          >
            <HugeiconsIcon icon={PencilEdit01Icon} className="size-3.5 text-beam-700" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          type="number"
          min={1}
          max={MAX_SEGMENT_LENGTH}
          inputMode="numeric"
          value={draft}
          placeholder={intl.formatMessage(
            contentEditorIntelligencePanelMessages.maxLengthInputPlaceholder,
          )}
          aria-label={intl.formatMessage(contentEditorIntelligencePanelMessages.maxLengthTitle)}
          className="h-9 w-24 border-border bg-background text-foreground tabular-nums"
          disabled={isSaving}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onBlur={(event) => {
            const nextFocus = event.relatedTarget;
            if (nextFocus instanceof Element && nextFocus.closest("[data-max-length-clear]")) {
              return;
            }
            if (hasChanges) {
              void commitDraft();
              return;
            }
            setIsEditing(false);
            onFinishEditing?.();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void commitDraft();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(maxLength != null ? String(maxLength) : "");
              setError(null);
              setIsEditing(false);
              onFinishEditing?.();
            }
          }}
        />
        <span className="text-sm text-subtle-foreground">
          <FormattedMessage {...contentEditorIntelligencePanelMessages.maxLengthUnit} />
        </span>
        {characterCount != null ? (
          <span className={usedCountClassName}>
            <FormattedMessage
              {...contentEditorIntelligencePanelMessages.maxLengthUsed}
              values={{ count: characterCount }}
            />
          </span>
        ) : null}
        {hasChanges ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={isSaving}
            onClick={() => void commitDraft()}
          >
            {isSaving ? <Spinner className="size-3.5" /> : null}
            <FormattedMessage {...contentEditorIntelligencePanelMessages.maxLengthSave} />
          </Button>
        ) : null}
        {maxLength != null && maxLength > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={isSaving}
            data-max-length-clear=""
            onClick={() => void handleClear()}
          >
            <FormattedMessage {...contentEditorIntelligencePanelMessages.maxLengthClear} />
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
