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
import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowSquareOutIcon,
  FigmaLogoIcon,
  LinkSimpleIcon,
  PencilSimpleIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isValidLabelId } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";
import { cn } from "@/lib/primitives/cn";

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

/** Set on native projects: filters the queue to strings carrying a tag clicked in the panel. */
export const ContentEditorKeyTagFilterContext = createContext<((tag: string) => void) | null>(null);

/** Splits typed tags on commas and spaces; the caller checks each against the tag rule. */
export function parseTagInput(value: string) {
  return [...new Set(value.split(/[\s,]+/).filter(Boolean))];
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function useKeyDetailsEditingFor(segmentId: string | undefined) {
  const editing = useContentEditorKeyDetailsEditing();
  return editing && segmentId && editing.canEditSegment(segmentId) ? editing : null;
}

/** Whether the panel has anything to show for this string: values, or a way to add them. */
export function useContentEditorKeyDetailsVisible({
  segmentId,
  tags,
  designUrl,
}: {
  segmentId?: string;
  tags: string[];
  designUrl?: string;
}) {
  const editing = useKeyDetailsEditingFor(segmentId);
  return tags.length > 0 || Boolean(designUrl) || editing !== null;
}

/** A string's tags and design link as property rows, editable in place for people who may. */
export function ContentEditorKeyDetails({
  segmentId,
  tags,
  designUrl,
}: {
  segmentId?: string;
  tags: string[];
  designUrl?: string;
}) {
  const editing = useKeyDetailsEditingFor(segmentId);
  if (tags.length === 0 && !designUrl && !editing) {
    return null;
  }
  return (
    <dl className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2.5">
      {tags.length > 0 || editing ? (
        <PropertyRow label={<FormattedMessage {...messages.tagsLabel} />}>
          <KeyTags segmentId={segmentId} tags={tags} editing={editing} />
        </PropertyRow>
      ) : null}
      {designUrl || editing ? (
        <PropertyRow label={<FormattedMessage {...messages.designLabel} />}>
          <DesignLink
            key={`${segmentId ?? ""}:${designUrl ?? ""}`}
            segmentId={segmentId}
            designUrl={designUrl}
            editing={editing}
          />
        </PropertyRow>
      ) : null}
    </dl>
  );
}

function PropertyRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="flex h-6 items-center text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {children}
    </p>
  );
}

const chipClassName =
  "inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 px-2 text-xs font-medium text-foreground";

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
  const filterByTag = useContext(ContentEditorKeyTagFilterContext);
  const [isAdding, setIsAdding] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Blur also fires while a save runs or as the field closes; only a real click-away commits.
  const ignoreBlurRef = useRef(false);

  async function change(addTags: string[], removeTags: string[]) {
    if (!editing || !segmentId) {
      return false;
    }
    setError(null);
    setIsPending(true);
    ignoreBlurRef.current = true;
    try {
      await editing.onSetTags({ segmentIds: [segmentId], addTags, removeTags });
      return true;
    } catch (saveError) {
      setError(errorMessage(saveError, intl.formatMessage(messages.tagsFailed)));
      return false;
    } finally {
      setIsPending(false);
      ignoreBlurRef.current = false;
    }
  }

  async function add({ close }: { close: boolean }) {
    const typed = parseTagInput(draft);
    if (typed.length === 0) {
      if (close) {
        setIsAdding(false);
      }
      return;
    }
    if (!typed.every(isValidLabelId)) {
      setError(intl.formatMessage(messages.invalidTag));
      return;
    }
    const fresh = typed.filter((tag) => !tags.includes(tag));
    const saved = fresh.length === 0 || (await change(fresh, []));
    if (saved) {
      setDraft("");
      if (close) {
        ignoreBlurRef.current = true;
        setIsAdding(false);
      }
    }
  }

  function startAdding() {
    ignoreBlurRef.current = false;
    setIsAdding(true);
  }

  function cancel() {
    ignoreBlurRef.current = true;
    setDraft("");
    setError(null);
    setIsAdding(false);
  }

  const isSaving = editing?.isSaving ?? false;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span key={tag} className={chipClassName}>
            {filterByTag ? (
              <button
                type="button"
                className="min-w-0 truncate rounded-sm hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={intl.formatMessage(messages.filterByTag, { tag })}
                title={intl.formatMessage(messages.filterByTag, { tag })}
                onClick={() => filterByTag(tag)}
              >
                {tag}
              </button>
            ) : (
              <span className="min-w-0 truncate">{tag}</span>
            )}
            {editing ? (
              <button
                type="button"
                className="-mr-1 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                aria-label={intl.formatMessage(messages.removeTag, { tag })}
                disabled={isSaving}
                onClick={() => void change([], [tag])}
              >
                <XIcon className="size-3" />
              </button>
            ) : null}
          </span>
        ))}
        {editing && isAdding ? (
          <form
            className="inline-flex"
            onSubmit={(event) => {
              event.preventDefault();
              void add({ close: false });
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              <FormattedMessage {...messages.addTagLabel} />
            </label>
            <Input
              id={inputId}
              value={draft}
              autoFocus
              placeholder={intl.formatMessage(messages.addTagPlaceholder)}
              aria-invalid={error ? true : undefined}
              className="h-6 w-32 px-2 text-xs"
              readOnly={isPending}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onBlur={() => {
                if (!ignoreBlurRef.current) {
                  void add({ close: true });
                }
              }}
              onKeyDown={(event) => {
                // Keep the editor's own shortcuts from acting on this field's keys.
                event.stopPropagation();
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
            />
          </form>
        ) : editing ? (
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
            disabled={isSaving}
            onClick={startAdding}
          >
            <PlusIcon className="size-3" />
            <FormattedMessage {...messages.addTag} />
          </button>
        ) : null}
        {isPending ? <Spinner className="size-3 text-muted-foreground" /> : null}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
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
  const hintId = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [draft, setDraft] = useState(designUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  // Blur also fires while a save runs or as the field closes; only a real click-away commits.
  const ignoreBlurRef = useRef(false);

  async function save(next: string | null) {
    if (!editing || !segmentId) {
      return;
    }
    if (next !== null && !isHttpUrl(next)) {
      setError(intl.formatMessage(messages.invalidDesignUrl));
      return;
    }
    setError(null);
    setIsPending(true);
    ignoreBlurRef.current = true;
    try {
      await editing.onSetDesignUrl({ segmentId, designUrl: next });
      setIsEditing(false);
    } catch (saveError) {
      setError(errorMessage(saveError, intl.formatMessage(messages.designUrlFailed)));
      ignoreBlurRef.current = false;
    } finally {
      setIsPending(false);
    }
  }

  function startEditing() {
    setDraft(designUrl ?? "");
    setError(null);
    ignoreBlurRef.current = false;
    setIsEditing(true);
  }

  function cancel() {
    ignoreBlurRef.current = true;
    setDraft(designUrl ?? "");
    setError(null);
    setIsEditing(false);
  }

  function submit() {
    const trimmed = draft.trim();
    if (trimmed === (designUrl ?? "")) {
      cancel();
      return;
    }
    void save(trimmed === "" ? null : trimmed);
  }

  const isSaving = editing?.isSaving ?? false;

  if (editing && isEditing) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          <FormattedMessage {...messages.designUrlLabel} />
        </label>
        <div className="relative">
          <Input
            id={inputId}
            // Not type="url": the browser's own check would block the message below.
            type="text"
            inputMode="url"
            value={draft}
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            placeholder="https://www.figma.com/…"
            aria-invalid={error ? true : undefined}
            aria-describedby={hintId}
            className={cn("h-7 text-xs", isPending && "pr-7")}
            readOnly={isPending}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onBlur={() => {
              if (!ignoreBlurRef.current && !error) {
                submit();
              }
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
          {isPending ? (
            <Spinner className="absolute top-1/2 right-2 size-3 -translate-y-1/2 text-muted-foreground" />
          ) : null}
        </div>
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <p id={hintId} className="mt-1 text-[11px] text-subtle-foreground">
            <FormattedMessage {...messages.designUrlHint} />
          </p>
        )}
      </form>
    );
  }

  if (!designUrl) {
    if (!editing) {
      return null;
    }
    return (
      <button
        type="button"
        className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
        disabled={isSaving}
        onClick={startEditing}
      >
        <PlusIcon className="size-3" />
        <FormattedMessage {...messages.addDesignUrl} />
      </button>
    );
  }

  const target = describeDesignUrl(designUrl);
  const TargetIcon = target.isFigma ? FigmaLogoIcon : LinkSimpleIcon;

  return (
    <div>
      <div className="group flex h-6 min-w-0 items-center gap-1">
        <a
          href={designUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={designUrl}
          aria-label={intl.formatMessage(messages.openDesign, { name: target.name })}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-sm text-xs font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <TargetIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{target.name}</span>
          <ArrowSquareOutIcon className="size-3 shrink-0 text-muted-foreground" />
        </a>
        {editing ? (
          <span className="ml-auto flex shrink-0 items-center opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={intl.formatMessage(messages.editDesignUrl)}
              title={intl.formatMessage(messages.editDesignUrl)}
              disabled={isSaving}
              onClick={startEditing}
            >
              <PencilSimpleIcon className="size-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={intl.formatMessage(messages.removeDesignUrl)}
              title={intl.formatMessage(messages.removeDesignUrl)}
              disabled={isSaving}
              onClick={() => void save(null)}
            >
              {isPending ? <Spinner className="size-3" /> : <XIcon className="size-3" />}
            </Button>
          </span>
        ) : null}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

const FIGMA_FILE_SEGMENTS = new Set(["file", "design", "proto", "board", "slides"]);

/** A readable name for a design link: the Figma file name when there is one, else the host. */
export function describeDesignUrl(value: string): { name: string; isFigma: boolean } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { name: value, isFigma: false };
  }
  const host = url.hostname.replace(/^www\./, "");
  const isFigma = host === "figma.com" || host.endsWith(".figma.com");
  if (isFigma) {
    const [kind, key, slug] = url.pathname.split("/").filter(Boolean);
    if (kind && FIGMA_FILE_SEGMENTS.has(kind) && key && slug) {
      try {
        const name = decodeURIComponent(slug).replace(/-/g, " ").trim();
        if (name) {
          return { name, isFigma };
        }
      } catch {
        // A malformed escape falls back to the host below.
      }
    }
  }
  return { name: host || value, isFigma };
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
