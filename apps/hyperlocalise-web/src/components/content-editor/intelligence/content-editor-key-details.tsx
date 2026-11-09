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
import { createContext, useContext, useId, useState } from "react";
import { ArrowSquareOutIcon, PencilSimpleIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isValidLabelId } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

import { contentEditorKeyDetailsMessages as messages } from "./content-editor-key-details.messages";

export type ContentEditorKeyDetailsEditing = {
  isSaving: boolean;
  /** Whether the string is in the loaded queue; the panel can still show one that a search left out. */
  canEditSegment: (segmentId: string) => boolean;
  onSetTags: (input: {
    segmentIds: string[];
    addTags: string[];
    removeTags: string[];
  }) => Promise<void>;
  onSetDesignUrl: (input: { segmentId: string; designUrl: string | null }) => Promise<void>;
};

/** Set by a native project's workspace when this person may edit tags and design links. */
export const ContentEditorKeyDetailsEditingContext =
  createContext<ContentEditorKeyDetailsEditing | null>(null);

export function useContentEditorKeyDetailsEditing() {
  return useContext(ContentEditorKeyDetailsEditingContext);
}

/** Splits typed tags on commas and spaces; the caller checks each against the tag rule. */
export function parseTagInput(value: string) {
  return [...new Set(value.split(/[\s,]+/).filter(Boolean))];
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** A string's tags and design link in the context panel, editable for people who may. */
export function ContentEditorKeyDetails({
  segmentId,
  tags,
  designUrl,
}: {
  segmentId?: string;
  tags: string[];
  designUrl?: string;
}) {
  const editing = useContentEditorKeyDetailsEditing();
  const canEdit = Boolean(editing && segmentId && editing.canEditSegment(segmentId));
  if (tags.length === 0 && !designUrl && !canEdit) {
    return null;
  }
  return (
    <div className="mt-2 space-y-2">
      <KeyTags segmentId={segmentId} tags={tags} editing={canEdit ? editing : null} />
      <DesignLink
        key={`${segmentId ?? ""}:${designUrl ?? ""}`}
        segmentId={segmentId}
        designUrl={designUrl}
        editing={canEdit ? editing : null}
      />
    </div>
  );
}

function KeyTags({
  segmentId,
  tags,
  editing,
}: {
  segmentId?: string;
  tags: string[];
  editing: ContentEditorKeyDetailsEditing | null;
}) {
  const intl = useIntl();
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (tags.length === 0 && !editing) {
    return null;
  }

  async function change(addTags: string[], removeTags: string[]) {
    if (!editing || !segmentId) {
      return;
    }
    setError(null);
    try {
      await editing.onSetTags({ segmentIds: [segmentId], addTags, removeTags });
      setDraft("");
    } catch (saveError) {
      setError(errorMessage(saveError, intl.formatMessage(messages.tagsFailed)));
    }
  }

  function add() {
    const typed = parseTagInput(draft);
    if (typed.length === 0) {
      return;
    }
    if (!typed.every(isValidLabelId)) {
      setError(intl.formatMessage(messages.invalidTag));
      return;
    }
    void change(
      typed.filter((tag) => !tags.includes(tag)),
      [],
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-subtle-foreground">
          <FormattedMessage {...messages.tagsLabel} />
        </span>
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="h-5 gap-0.5 px-1.5 text-[10px] font-medium">
            {tag}
            {editing ? (
              <button
                type="button"
                className="-mr-0.5 rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                aria-label={intl.formatMessage(messages.removeTag, { tag })}
                disabled={editing.isSaving}
                onClick={() => void change([], [tag])}
              >
                <XIcon className="size-2.5" />
              </button>
            ) : null}
          </Badge>
        ))}
      </div>
      {editing ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            <FormattedMessage {...messages.addTagLabel} />
          </label>
          <Input
            id={inputId}
            value={draft}
            placeholder={intl.formatMessage(messages.addTagPlaceholder)}
            aria-invalid={error ? true : undefined}
            className="h-7 text-xs"
            disabled={editing.isSaving}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              // Keep the editor's own shortcuts from acting on this field's keys.
              event.stopPropagation();
            }}
          />
          <Button
            type="submit"
            variant="outline"
            size="icon-sm"
            className="size-7 shrink-0"
            aria-label={intl.formatMessage(messages.addTag)}
            disabled={editing.isSaving || draft.trim().length === 0}
          >
            {editing.isSaving ? <Spinner /> : <PlusIcon className="size-3.5" />}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function DesignLink({
  segmentId,
  designUrl,
  editing,
}: {
  segmentId?: string;
  designUrl?: string;
  editing: ContentEditorKeyDetailsEditing | null;
}) {
  const intl = useIntl();
  const inputId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(designUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    if (!editing || !segmentId) {
      return;
    }
    if (next !== null && !isHttpUrl(next)) {
      setError(intl.formatMessage(messages.invalidDesignUrl));
      return;
    }
    setError(null);
    try {
      await editing.onSetDesignUrl({ segmentId, designUrl: next });
      setIsEditing(false);
    } catch (saveError) {
      setError(errorMessage(saveError, intl.formatMessage(messages.designUrlFailed)));
    }
  }

  if (!isEditing) {
    if (!designUrl && !editing) {
      return null;
    }
    return (
      <div className="flex items-center gap-2">
        {designUrl ? (
          <a
            href={designUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            <ArrowSquareOutIcon className="size-3.5" />
            <FormattedMessage {...messages.openDesign} />
          </a>
        ) : null}
        {editing ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setDraft(designUrl ?? "");
              setIsEditing(true);
            }}
          >
            {designUrl ? (
              <PencilSimpleIcon className="size-3.5" />
            ) : (
              <PlusIcon className="size-3.5" />
            )}
            <FormattedMessage {...(designUrl ? messages.editDesignUrl : messages.addDesignUrl)} />
          </Button>
        ) : null}
      </div>
    );
  }

  const trimmed = draft.trim();
  return (
    <form
      className="space-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        void save(trimmed === "" ? null : trimmed);
      }}
    >
      <label htmlFor={inputId} className="text-xs text-subtle-foreground">
        <FormattedMessage {...messages.designUrlLabel} />
      </label>
      <Input
        id={inputId}
        // Not type="url": the browser's own check would block the message below.
        type="text"
        inputMode="url"
        value={draft}
        autoFocus
        placeholder="https://www.figma.com/…"
        aria-invalid={error ? true : undefined}
        className="h-7 text-xs"
        disabled={editing?.isSaving}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            setIsEditing(false);
          }
        }}
      />
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={editing?.isSaving}>
          {editing?.isSaving ? <Spinner /> : null}
          <FormattedMessage {...messages.save} />
        </Button>
        {designUrl ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={editing?.isSaving}
            onClick={() => void save(null)}
          >
            <FormattedMessage {...messages.removeDesignUrl} />
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={editing?.isSaving}
          onClick={() => setIsEditing(false)}
        >
          <FormattedMessage {...messages.cancel} />
        </Button>
      </div>
    </form>
  );
}

/** The design link rule: an http or https address with a host, as internal/keymeta checks. */
function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.host !== "";
  } catch {
    return false;
  }
}
