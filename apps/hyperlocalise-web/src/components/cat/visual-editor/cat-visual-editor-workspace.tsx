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
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { FormattedMessage } from "react-intl";

import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/primitives/cn";

import type {
  CatVisualEditorDevice,
  CatVisualEditorFixture,
  CatVisualEditorSegment,
} from "./cat-visual-editor.fixture";
import { catVisualEditorMessages } from "./cat-visual-editor.messages";
import { CatVisualEditorCanvas } from "./cat-visual-editor-canvas";
import { CatVisualEditorDetailPanel } from "./cat-visual-editor-detail-panel";
import { CatVisualEditorFilesSidebar } from "./cat-visual-editor-files-sidebar";

function fileLabelFromPath(sourcePath: string) {
  const parts = sourcePath.split("/");
  const filename = parts[parts.length - 1] ?? sourcePath;
  return filename.replace(/\.json$/i, "");
}

export function CatVisualEditorWorkspace({
  initialState,
  className,
}: {
  initialState: CatVisualEditorFixture;
  className?: string;
}) {
  const [selectedSourcePath, setSelectedSourcePath] = useState(initialState.selectedSourcePath);
  const [segments, setSegments] = useState<CatVisualEditorSegment[]>(initialState.segments);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    initialState.selectedSegmentId,
  );
  const [device, setDevice] = useState<CatVisualEditorDevice>("desktop");
  const [highlightTranslatable, setHighlightTranslatable] = useState(true);
  const [baselineTargets, setBaselineTargets] = useState(() =>
    Object.fromEntries(initialState.segments.map((segment) => [segment.id, segment.targetText])),
  );

  useEffect(() => {
    setSelectedSourcePath(initialState.selectedSourcePath);
    setSegments(initialState.segments);
    setSelectedSegmentId(initialState.selectedSegmentId);
    setBaselineTargets(
      Object.fromEntries(initialState.segments.map((segment) => [segment.id, segment.targetText])),
    );
  }, [initialState]);

  const selectedIndex = useMemo(
    () => segments.findIndex((segment) => segment.id === selectedSegmentId),
    [segments, selectedSegmentId],
  );
  const selectedSegment = selectedIndex >= 0 ? segments[selectedIndex] : null;
  const intelligence = selectedSegment
    ? (initialState.intelligenceBySegmentId[selectedSegment.id] ?? null)
    : null;
  const isTargetDirty = selectedSegment
    ? selectedSegment.targetText !== (baselineTargets[selectedSegment.id] ?? "")
    : false;

  const reviewedCount = segments.filter((segment) => segment.status === "reviewed").length;

  function updateSelectedTarget(value: string) {
    if (!selectedSegmentId) {
      return;
    }
    setSegments((current) =>
      current.map((segment) =>
        segment.id === selectedSegmentId ? { ...segment, targetText: value } : segment,
      ),
    );
  }

  function applyAiSuggestion() {
    if (!selectedSegment || !intelligence?.aiSuggestion) {
      return;
    }
    updateSelectedTarget(intelligence.aiSuggestion);
  }

  function applyTmMatch(targetText: string) {
    updateSelectedTarget(targetText);
  }

  const goToOffset = useEffectEvent((offset: number) => {
    if (segments.length === 0) {
      return;
    }
    const nextIndex =
      selectedIndex < 0 ? 0 : Math.min(segments.length - 1, Math.max(0, selectedIndex + offset));
    setSelectedSegmentId(segments[nextIndex]?.id ?? null);
  });

  function handleApprove() {
    if (!selectedSegment) {
      return;
    }
    setBaselineTargets((current) => ({
      ...current,
      [selectedSegment.id]: selectedSegment.targetText,
    }));
    setSegments((current) =>
      current.map((segment) =>
        segment.id === selectedSegment.id ? { ...segment, status: "reviewed" } : segment,
      ),
    );
    goToOffset(1);
  }

  function handleSaveDraft() {
    if (!selectedSegment) {
      return;
    }
    setBaselineTargets((current) => ({
      ...current,
      [selectedSegment.id]: selectedSegment.targetText,
    }));
  }

  function handleCopySource() {
    if (!selectedSegment) {
      return;
    }
    updateSelectedTarget(selectedSegment.sourceText);
  }

  function handleClearTarget() {
    updateSelectedTarget("");
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedSegmentId(null);
        return;
      }
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) {
          return;
        }
      }
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        goToOffset(1);
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        goToOffset(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToOffset]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background text-foreground", className)}>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17.5rem_minmax(0,1fr)_22rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        <CatVisualEditorFilesSidebar
          files={initialState.files}
          selectedSourcePath={selectedSourcePath}
          onSelectFile={setSelectedSourcePath}
          progress={initialState.progress}
          className="hidden min-h-0 lg:flex"
        />

        <CatVisualEditorCanvas
          previewUrl={initialState.previewUrl}
          fileLabel={fileLabelFromPath(selectedSourcePath)}
          locale={initialState.progress.locale}
          device={device}
          onDeviceChange={setDevice}
          highlightTranslatable={highlightTranslatable}
          onHighlightTranslatableChange={setHighlightTranslatable}
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          showInlineEdit={Boolean(selectedSegment)}
          onSelectSegment={setSelectedSegmentId}
          onTargetChange={updateSelectedTarget}
          onConfirmInline={handleSaveDraft}
          onApplyAi={applyAiSuggestion}
        />

        <CatVisualEditorDetailPanel
          segment={selectedSegment}
          segmentPosition={selectedIndex >= 0 ? selectedIndex + 1 : 0}
          totalSegments={segments.length}
          intelligence={intelligence}
          isTargetDirty={isTargetDirty}
          hasPreviousSegment={selectedIndex > 0}
          hasNextSegment={selectedIndex >= 0 && selectedIndex < segments.length - 1}
          onPrevious={() => goToOffset(-1)}
          onNext={() => goToOffset(1)}
          onTargetChange={updateSelectedTarget}
          onCopySource={handleCopySource}
          onClearTarget={handleClearTarget}
          onUseAiSuggestion={applyAiSuggestion}
          onUseTmMatch={(match) => applyTmMatch(match.targetText)}
          onApprove={handleApprove}
          onSaveDraft={handleSaveDraft}
          onAskQuestion={() => undefined}
          onAddComment={async (input) => {
            if (!selectedSegment) {
              return;
            }
            const comment = {
              id: `ve-comment-${Date.now()}`,
              type: input.type ?? ("comment" as const),
              status: null,
              text: input.text,
              createdAt: new Date().toISOString(),
              locale: selectedSegment.targetLocale,
              author: "You",
            };
            setSegments((current) =>
              current.map((segment) =>
                segment.id === selectedSegment.id
                  ? { ...segment, comments: [...(segment.comments ?? []), comment] }
                  : segment,
              ),
            );
          }}
          className="hidden min-h-0 lg:flex"
        />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <p>
          <FormattedMessage {...catVisualEditorMessages.footerCopyright} values={{ year: 2026 }} />
        </p>
        <div className="flex items-center gap-3">
          <span>
            <FormattedMessage
              {...catVisualEditorMessages.statusBarProgress}
              values={{ done: reviewedCount, total: segments.length }}
            />
          </span>
          <span>
            <FormattedMessage
              {...catVisualEditorMessages.statusBarSelected}
              values={{ count: selectedSegment ? 1 : 0 }}
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <KbdGroup>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
            </KbdGroup>
            <FormattedMessage {...catVisualEditorMessages.navigateHint} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            <FormattedMessage {...catVisualEditorMessages.deselectHint} />
          </span>
          <span>
            <FormattedMessage {...catVisualEditorMessages.shortcutsHint} />
          </span>
        </div>
      </footer>
    </div>
  );
}
