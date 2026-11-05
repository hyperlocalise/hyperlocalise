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
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { contentEditorSourceTextEditorMessages as messages } from "./content-editor-source-text-editor.messages";

export type ContentEditorSourceTextEditing = {
  /** The project lets source text be edited here and this person may do it. */
  canEdit: boolean;
  /** The project sends approved translations to review on a source change, so offer the skip. */
  offerSmallFix: boolean;
  isSaving: boolean;
  onSave: (input: {
    segmentId: string;
    sourceText: string;
    keepApproved: boolean;
  }) => Promise<void>;
};

/** Set by a workspace whose project may let source text be edited; absent elsewhere. */
export const ContentEditorSourceTextEditingContext =
  createContext<ContentEditorSourceTextEditing | null>(null);

export function useContentEditorSourceTextEditing() {
  return useContext(ContentEditorSourceTextEditingContext);
}

export function ContentEditorSourceTextEditor({
  segmentId,
  sourceText,
  isLocked,
  editing,
}: {
  segmentId: string;
  sourceText: string;
  isLocked: boolean;
  editing: ContentEditorSourceTextEditing;
}) {
  const intl = useIntl();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const smallFixId = useId();
  const errorId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(sourceText);
  const [keepApproved, setKeepApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The saved text coming back starts the control over, unless an edit is under way.
  useEffect(() => {
    if (!isEditing) {
      setDraft(sourceText);
    }
  }, [isEditing, sourceText]);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [isEditing]);

  function close() {
    setDraft(sourceText);
    setKeepApproved(false);
    setError(null);
    returnFocus.current = true;
    setIsEditing(false);
  }

  const canEdit = editing.canEdit && !isLocked;
  const blank = draft.trim().length === 0;

  async function save() {
    if (blank) {
      setError(intl.formatMessage(messages.blank));
      return;
    }
    if (draft === sourceText) {
      close();
      return;
    }
    setError(null);
    try {
      await editing.onSave({
        segmentId,
        sourceText: draft,
        keepApproved: editing.offerSmallFix && keepApproved,
      });
      // A small fix covers this save only; the next edit starts unticked.
      setKeepApproved(false);
      setError(null);
      returnFocus.current = true;
      setIsEditing(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : intl.formatMessage(messages.saveFailed),
      );
    }
  }

  if (!isEditing) {
    return (
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap text-foreground">
          {sourceText}
        </p>
        {canEdit ? (
          <Button
            ref={editButtonRef}
            type="button"
            variant="outline"
            size="icon-sm"
            className="size-7 shrink-0"
            aria-label={intl.formatMessage(messages.edit)}
            onClick={() => setIsEditing(true)}
          >
            <PencilSimpleIcon className="size-3.5 text-beam-700" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Textarea
        ref={textareaRef}
        value={draft}
        aria-label={intl.formatMessage(messages.fieldLabel)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={editing.isSaving}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          // The editor's own shortcuts would approve or save the translation; here they save
          // the source text.
          const mod = event.metaKey || event.ctrlKey;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          } else if (mod && (event.key === "Enter" || event.key.toLowerCase() === "s")) {
            event.preventDefault();
            event.stopPropagation();
            void save();
          } else if (mod) {
            event.stopPropagation();
          }
        }}
      />
      {editing.offerSmallFix ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id={smallFixId}
            aria-describedby={`${smallFixId}-help`}
            className="mt-0.5"
            checked={keepApproved}
            disabled={editing.isSaving}
            onCheckedChange={(checked) => setKeepApproved(checked === true)}
          />
          <div className="min-w-0">
            <label htmlFor={smallFixId} className="text-sm font-medium">
              <FormattedMessage {...messages.smallFix} />
            </label>
            <p id={`${smallFixId}-help`} className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.smallFixHelp} />
            </p>
          </div>
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={editing.isSaving} onClick={() => void save()}>
          {editing.isSaving ? <Spinner /> : null}
          <FormattedMessage {...messages.save} />
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={editing.isSaving} onClick={close}>
          <FormattedMessage {...messages.cancel} />
        </Button>
      </div>
    </div>
  );
}
