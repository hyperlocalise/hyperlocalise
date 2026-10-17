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
import { useState, useTransition } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import type { ContentEditorSegment } from "@/components/content-editor/shared/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/primitives/cn";

import { contentEditorFileViewMessages as m } from "./content-editor-file-view.messages";
import {
  groupOfficeSegments,
  officeFieldText,
  officeSegmentPosition,
  officeTargetFromFieldText,
  type OfficeSegmentGroup,
} from "./content-editor-office-segment-fields";

export type ContentEditorOfficeSegmentFieldsConfig = {
  /** Segments of the file in file order, with unsaved edits applied. */
  segments: readonly ContentEditorSegment[];
  dirtySegmentIds: ReadonlySet<string>;
  canEdit: boolean;
  hasMore: boolean;
  onLoadMore?: () => void;
  onChange: (segmentId: string, targetText: string) => void;
  /** Saves each segment's current text as a draft. Failed segments stay dirty. */
  onSaveDrafts: (segmentIds: string[]) => Promise<void>;
};

function groupHeading(intl: IntlShape, group: OfficeSegmentGroup) {
  const values = { number: group.number };
  switch (group.kind) {
    case "slide":
      return intl.formatMessage(m.officeGroupSlide, values);
    case "notes":
      return intl.formatMessage(m.officeGroupNotes, values);
    case "document":
      return intl.formatMessage(m.officeGroupDocument);
    case "header":
      return intl.formatMessage(m.officeGroupHeader, values);
    case "footer":
      return intl.formatMessage(m.officeGroupFooter, values);
    case "footnotes":
      return intl.formatMessage(m.officeGroupFootnotes);
    case "endnotes":
      return intl.formatMessage(m.officeGroupEndnotes);
    case "comments":
      return intl.formatMessage(m.officeGroupComments);
    case "sheet":
      return group.name ?? intl.formatMessage(m.officeGroupOther);
    case "other":
      return group.name ?? intl.formatMessage(m.officeGroupOther);
  }
}

function fieldLabel(intl: IntlShape, key: string) {
  const position = officeSegmentPosition(key);
  if (!position) {
    return key;
  }
  return "cell" in position
    ? position.cell
    : intl.formatMessage(m.officeParagraph, { number: position.paragraph });
}

/**
 * Lists every paragraph or cell of an Office file as a field. Each field is one segment, so
 * every edit maps to exactly one place in the generated file.
 */
export function ContentEditorOfficeSegmentFieldsPane({
  segments,
  dirtySegmentIds,
  canEdit,
  hasMore,
  onLoadMore,
  onChange,
  onSaveDrafts,
}: ContentEditorOfficeSegmentFieldsConfig) {
  const intl = useIntl();
  const [isSaving, startSaving] = useTransition();
  const [failedSegmentIds, setFailedSegmentIds] = useState<ReadonlySet<string>>(new Set());
  const dirtyIds = segments.flatMap((segment) =>
    dirtySegmentIds.has(segment.id) ? [segment.id] : [],
  );
  const failedCount = dirtyIds.filter((id) => failedSegmentIds.has(id)).length;

  function saveDrafts() {
    startSaving(async () => {
      await onSaveDrafts(dirtyIds).catch(() => undefined);
      // Saved segments leave the dirty set, so any still dirty are reported as failed.
      setFailedSegmentIds(new Set(dirtyIds));
    });
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">
            <FormattedMessage {...m.officeSegmentsHeading} />
          </h2>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...m.officeSegmentsHint} />
          </p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="xs"
            disabled={dirtyIds.length === 0 || isSaving}
            onClick={saveDrafts}
          >
            {isSaving ? <Spinner className="size-3 text-primary-foreground" /> : null}
            <FormattedMessage {...m.officeSaveDrafts} values={{ count: dirtyIds.length }} />
          </Button>
        ) : null}
        {failedCount > 0 && !isSaving ? (
          <p role="alert" className="w-full text-xs text-destructive">
            <FormattedMessage {...m.officeSaveDraftsFailed} values={{ count: failedCount }} />
          </p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <ol className="flex flex-col gap-4">
          {groupOfficeSegments(segments).map((run, runIndex) => (
            <li key={`${run.group.id}:${runIndex}`} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                {groupHeading(intl, run.group)}
              </h3>
              <ol className="flex flex-col gap-3 border-l border-border pl-3">
                {run.segments.map((segment) => {
                  const readOnly = !canEdit || Boolean(segment.isLocked) || isSaving;
                  const label = fieldLabel(intl, segment.key);
                  const sourceText = officeFieldText(segment.sourceText);
                  return (
                    <li key={segment.id} className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                        {label}
                      </span>
                      <p className="text-xs whitespace-pre-wrap text-muted-foreground">
                        {sourceText}
                      </p>
                      <Textarea
                        aria-label={label}
                        aria-invalid={
                          failedSegmentIds.has(segment.id) && dirtySegmentIds.has(segment.id)
                        }
                        placeholder={sourceText}
                        value={officeFieldText(segment.targetText)}
                        readOnly={readOnly}
                        className={cn("min-h-9 rounded-md py-2", readOnly && "bg-transparent")}
                        onChange={(event) =>
                          onChange(
                            segment.id,
                            officeTargetFromFieldText(event.target.value, segment.sourceText),
                          )
                        }
                      />
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
        {hasMore && onLoadMore ? (
          <Button type="button" variant="outline" size="xs" className="mt-4" onClick={onLoadMore}>
            <FormattedMessage {...m.officeLoadMoreSegments} />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
