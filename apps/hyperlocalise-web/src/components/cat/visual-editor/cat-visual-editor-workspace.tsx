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
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { FormattedMessage } from "react-intl";

import { useCatEditorHotkeys } from "@/components/cat/editor/cat-editor-hotkeys";
import type { CatSegmentStatus } from "@/components/cat/shared/types";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/primitives/cn";

import type {
  CatVisualEditorDevice,
  CatVisualEditorFilePage,
  CatVisualEditorFixture,
  CatVisualEditorSegment,
} from "./cat-visual-editor.fixture";
import { catVisualEditorMessages } from "./cat-visual-editor.messages";
import { CatVisualEditorCanvas } from "./cat-visual-editor-canvas";
import { CatVisualEditorDetailPanel } from "./cat-visual-editor-detail-panel";
import { CatVisualEditorFilesSidebar } from "./cat-visual-editor-files-sidebar";

type FileWorkspaceState = {
  segments: CatVisualEditorSegment[];
  selectedSegmentId: string | null;
  baselineTargets: Record<string, string>;
};

function fileLabelFromPath(sourcePath: string) {
  const parts = sourcePath.split("/");
  const filename = parts[parts.length - 1] ?? sourcePath;
  return filename.replace(/\.json$/i, "");
}

function needsAttention(status: CatSegmentStatus) {
  return status === "pending" || status === "needs_review";
}

function findOpenSegmentId(
  segments: CatVisualEditorSegment[],
  fromIndex: number,
  direction: 1 | -1,
): string | null {
  if (segments.length === 0) {
    return null;
  }

  for (let step = 1; step <= segments.length; step += 1) {
    const index = (fromIndex + direction * step + segments.length * 10) % segments.length;
    const segment = segments[index];
    if (segment && needsAttention(segment.status)) {
      return segment.id;
    }
  }

  return null;
}

function createFileState(page: CatVisualEditorFilePage): FileWorkspaceState {
  return {
    segments: page.segments,
    selectedSegmentId: page.defaultSelectedSegmentId,
    baselineTargets: Object.fromEntries(
      page.segments.map((segment) => [segment.id, segment.targetText]),
    ),
  };
}

function createFileStates(
  pagesBySourcePath: Record<string, CatVisualEditorFilePage>,
): Record<string, FileWorkspaceState> {
  return Object.fromEntries(
    Object.entries(pagesBySourcePath).map(([sourcePath, page]) => [
      sourcePath,
      createFileState(page),
    ]),
  );
}

function resolveActivePage(
  pagesBySourcePath: Record<string, CatVisualEditorFilePage>,
  selectedSourcePath: string,
): CatVisualEditorFilePage | null {
  return pagesBySourcePath[selectedSourcePath] ?? null;
}

export function CatVisualEditorWorkspace({
  initialState,
  className,
}: {
  initialState: CatVisualEditorFixture;
  className?: string;
}) {
  const [selectedSourcePath, setSelectedSourcePath] = useState(initialState.selectedSourcePath);
  const [fileStates, setFileStates] = useState(() =>
    createFileStates(initialState.pagesBySourcePath),
  );
  const [device, setDevice] = useState<CatVisualEditorDevice>("desktop");
  const [highlightTranslatable, setHighlightTranslatable] = useState(true);
  const selectedSourcePathRef = useRef(selectedSourcePath);
  selectedSourcePathRef.current = selectedSourcePath;

  useEffect(() => {
    setSelectedSourcePath(initialState.selectedSourcePath);
    setFileStates(createFileStates(initialState.pagesBySourcePath));
  }, [initialState]);

  const activePage = resolveActivePage(initialState.pagesBySourcePath, selectedSourcePath);
  const activeFileState = fileStates[selectedSourcePath] ?? null;
  const segments = activeFileState?.segments ?? [];
  const selectedSegmentId = activeFileState?.selectedSegmentId ?? null;
  const baselineTargets = activeFileState?.baselineTargets ?? {};

  const selectedIndex = useMemo(
    () => segments.findIndex((segment) => segment.id === selectedSegmentId),
    [segments, selectedSegmentId],
  );
  const selectedSegment = selectedIndex >= 0 ? segments[selectedIndex] : null;
  const intelligence =
    selectedSegment && activePage
      ? (activePage.intelligenceBySegmentId[selectedSegment.id] ?? null)
      : null;
  const isTargetDirty = selectedSegment
    ? selectedSegment.targetText !== (baselineTargets[selectedSegment.id] ?? "")
    : false;

  const reviewedCount = segments.filter((segment) => segment.status === "reviewed").length;
  const remainingCount = segments.filter((segment) => needsAttention(segment.status)).length;

  function updateActiveFileState(updater: (current: FileWorkspaceState) => FileWorkspaceState) {
    const sourcePath = selectedSourcePathRef.current;
    setFileStates((current) => {
      const active = current[sourcePath];
      if (!active) {
        return current;
      }
      return {
        ...current,
        [sourcePath]: updater(active),
      };
    });
  }

  function setSelectedSegmentId(segmentId: string | null) {
    updateActiveFileState((current) => ({
      ...current,
      selectedSegmentId: segmentId,
    }));
  }

  const clearActiveSelection = useEffectEvent(() => {
    setSelectedSegmentId(null);
  });

  function updateSelectedTarget(value: string) {
    if (!selectedSegmentId) {
      return;
    }
    updateActiveFileState((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === selectedSegmentId ? { ...segment, targetText: value } : segment,
      ),
    }));
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

  const goToNextOpen = useEffectEvent(() => {
    const fromIndex = selectedIndex < 0 ? -1 : selectedIndex;
    const nextId = findOpenSegmentId(segments, fromIndex, 1);
    if (nextId) {
      setSelectedSegmentId(nextId);
    }
  });

  function handleApprove() {
    if (!selectedSegment) {
      return;
    }
    const approvedId = selectedSegment.id;
    const approvedTarget = selectedSegment.targetText;
    updateActiveFileState((current) => {
      const nextSegments = current.segments.map((segment) =>
        segment.id === approvedId ? { ...segment, status: "reviewed" as const } : segment,
      );
      const fromIndex = nextSegments.findIndex((segment) => segment.id === approvedId);
      const nextOpenId = findOpenSegmentId(nextSegments, fromIndex, 1);
      return {
        segments: nextSegments,
        selectedSegmentId: nextOpenId ?? approvedId,
        baselineTargets: {
          ...current.baselineTargets,
          [approvedId]: approvedTarget,
        },
      };
    });
  }

  function handleSaveDraft() {
    if (!selectedSegment) {
      return;
    }
    const segmentId = selectedSegment.id;
    const targetText = selectedSegment.targetText;
    updateActiveFileState((current) => ({
      ...current,
      baselineTargets: {
        ...current.baselineTargets,
        [segmentId]: targetText,
      },
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

  function handleSelectFile(sourcePath: string) {
    setSelectedSourcePath(sourcePath);
    setFileStates((current) => {
      if (current[sourcePath]) {
        return current;
      }
      const page = initialState.pagesBySourcePath[sourcePath];
      if (!page) {
        return current;
      }
      return {
        ...current,
        [sourcePath]: createFileState(page),
      };
    });
  }

  useCatEditorHotkeys({
    hasPreviousSegment: selectedIndex > 0,
    hasNextSegment: selectedIndex >= 0 && selectedIndex < segments.length - 1,
    canTriggerApprove: Boolean(selectedSegment?.targetText.trim()),
    canTriggerFindContext: false,
    onPrevious: () => goToOffset(-1),
    onNext: () => goToOffset(1),
    onApprove: handleApprove,
    onAskQuestion: () => undefined,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) {
          return;
        }
      }
      if (event.key === "Escape") {
        clearActiveSelection();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        goToNextOpen();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearActiveSelection, goToNextOpen]);

  const progress = activePage?.progress ?? {
    locale: "de-DE",
    percent: 0,
    translated: 0,
    inReview: 0,
    untranslated: 0,
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background text-foreground", className)}>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[17.5rem_minmax(0,1fr)_22rem] xl:grid-cols-[18rem_minmax(0,1fr)_24rem]">
        <CatVisualEditorFilesSidebar
          files={initialState.files}
          selectedSourcePath={selectedSourcePath}
          onSelectFile={handleSelectFile}
          progress={progress}
          className="hidden min-h-0 lg:flex"
        />

        <CatVisualEditorCanvas
          previewUrl={activePage?.previewUrl ?? ""}
          previewKind={activePage?.previewKind ?? "generic"}
          fileLabel={fileLabelFromPath(selectedSourcePath)}
          locale={progress.locale}
          device={device}
          onDeviceChange={setDevice}
          highlightTranslatable={highlightTranslatable}
          onHighlightTranslatableChange={setHighlightTranslatable}
          segments={segments}
          selectedSegmentId={selectedSegmentId}
          onSelectSegment={setSelectedSegmentId}
        />

        <CatVisualEditorDetailPanel
          segment={selectedSegment}
          segmentPosition={selectedIndex >= 0 ? selectedIndex + 1 : 0}
          totalSegments={segments.length}
          remainingCount={remainingCount}
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
            const segmentId = selectedSegment.id;
            updateActiveFileState((current) => ({
              ...current,
              segments: current.segments.map((segment) =>
                segment.id === segmentId
                  ? { ...segment, comments: [...(segment.comments ?? []), comment] }
                  : segment,
              ),
            }));
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
              {...catVisualEditorMessages.statusBarRemaining}
              values={{ count: remainingCount }}
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
            <Kbd>tab</Kbd>
            <FormattedMessage {...catVisualEditorMessages.nextOpenHint} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>esc</Kbd>
            <FormattedMessage {...catVisualEditorMessages.deselectHint} />
          </span>
        </div>
      </footer>
    </div>
  );
}
