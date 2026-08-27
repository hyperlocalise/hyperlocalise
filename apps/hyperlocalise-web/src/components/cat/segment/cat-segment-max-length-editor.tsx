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
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import { catIntelligencePanelMessages } from "@/components/cat/shared/cat.messages";

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

export function CatSegmentMaxLengthEditor({
  maxLength,
  canEdit,
  isSaving = false,
  onSave,
}: {
  maxLength?: number;
  canEdit: boolean;
  isSaving?: boolean;
  onSave: (maxLength: number | null) => void | Promise<void>;
}) {
  const intl = useIntl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(maxLength != null ? String(maxLength) : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(maxLength != null ? String(maxLength) : "");
    setError(null);
  }, [maxLength]);

  function validateDraft(): number | null | undefined {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const input = inputRef.current;
    if (input && !input.checkValidity()) {
      setError(intl.formatMessage(catIntelligencePanelMessages.maxLengthInvalid));
      return undefined;
    }

    const parsed = parseMaxLengthDraft(trimmed);
    if (parsed == null) {
      setError(intl.formatMessage(catIntelligencePanelMessages.maxLengthInvalid));
      return undefined;
    }

    return parsed;
  }

  async function handleSave() {
    const parsed = validateDraft();
    if (parsed === undefined) {
      return;
    }

    setError(null);
    try {
      await onSave(parsed);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : intl.formatMessage(catIntelligencePanelMessages.maxLengthSaveFailed),
      );
    }
  }

  async function handleClear() {
    setDraft("");
    setError(null);
    try {
      await onSave(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : intl.formatMessage(catIntelligencePanelMessages.maxLengthSaveFailed),
      );
    }
  }

  const parsedDraft = parseMaxLengthDraft(draft);
  const hasChanges = (maxLength ?? null) !== (draft.trim().length === 0 ? null : parsedDraft);

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        {maxLength != null && maxLength > 0 ? (
          <FormattedMessage
            {...catIntelligencePanelMessages.maxLengthCurrent}
            values={{ maxLength }}
          />
        ) : (
          <FormattedMessage {...catIntelligencePanelMessages.maxLengthPlaceholder} />
        )}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <FormattedMessage {...catIntelligencePanelMessages.maxLengthDescription} />
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          type="number"
          min={1}
          max={MAX_SEGMENT_LENGTH}
          inputMode="numeric"
          value={draft}
          placeholder={intl.formatMessage(catIntelligencePanelMessages.maxLengthPlaceholder)}
          aria-label={intl.formatMessage(catIntelligencePanelMessages.maxLengthTitle)}
          className="h-8 w-28 tabular-nums"
          disabled={isSaving}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
        />
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={isSaving || !hasChanges}
          onClick={() => void handleSave()}
        >
          {isSaving ? <Spinner className="size-3.5" /> : null}
          <FormattedMessage {...catIntelligencePanelMessages.maxLengthSave} />
        </Button>
        {maxLength != null && maxLength > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={isSaving}
            onClick={() => void handleClear()}
          >
            <FormattedMessage {...catIntelligencePanelMessages.maxLengthClear} />
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
