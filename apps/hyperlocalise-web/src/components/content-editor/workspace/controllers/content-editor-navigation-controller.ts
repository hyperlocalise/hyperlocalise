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
import { reaction, type IReactionDisposer } from "mobx";

import {
  findSegmentIdByKeyOrIdInQueue,
  type ContentEditorQueueFilter,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import type { ContentEditorWorkspaceNavigation } from "@/components/content-editor/shared/dependencies";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import type { ContentEditorWorkspaceOrchestrator } from "../content-editor-workspace-orchestrator";

type QueueRow = Pick<ContentEditorSegment, "id" | "key">;

function getSegmentQueueIndex(segments: QueueRow[], segmentIdOrKey: string) {
  const resolvedId = findSegmentIdByKeyOrIdInQueue(segments, segmentIdOrKey) ?? segmentIdOrKey;
  return segments.findIndex((segment) => segment.id === resolvedId);
}

export function getAdjacentSegmentId(segments: QueueRow[], currentId: string, direction: -1 | 1) {
  const currentIndex = getSegmentQueueIndex(segments, currentId);
  if (currentIndex < 0) {
    return segments[0]?.id;
  }

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= segments.length) {
    return undefined;
  }

  return segments[nextIndex]?.id;
}

export function findAdjacentSegmentIdMatching(
  segments: QueueRow[],
  currentId: string,
  direction: -1 | 1,
  matches: (segmentId: string) => boolean,
) {
  const currentIndex = getSegmentQueueIndex(segments, currentId);
  for (
    let index = currentIndex + direction;
    index >= 0 && index < segments.length;
    index += direction
  ) {
    const segmentId = segments[index]?.id;
    if (segmentId && matches(segmentId)) {
      return segmentId;
    }
  }

  return undefined;
}

export interface ContentEditorNavigationControllerPorts {
  queueFilter: ContentEditorQueueFilter;
  usesServerQueueFilter: boolean;
  /** When true, Next at the loaded-page boundary should fetch more queue rows. */
  hasMoreQueue: boolean;
  onLoadMoreQueue?: () => void;
  /** Host callbacks run after the workspace moved the selection. */
  navigation?: Partial<ContentEditorWorkspaceNavigation>;
}

/** Workspace surface the navigation controller may read and change. */
export type ContentEditorNavigationWorkspace = Pick<
  ContentEditorWorkspaceOrchestrator,
  | "findSegmentIdByKeyOrId"
  | "getFilteredQueueSegments"
  | "matchesQueueFilter"
  | "selectedSegmentId"
  | "setSelectedSegmentId"
>;

/**
 * Moves the selection through the visible queue. When Next reaches the end of the loaded
 * page it asks for more rows and advances once they arrive.
 */
export class ContentEditorNavigationController {
  private ports: ContentEditorNavigationControllerPorts;
  private pendingAdvanceFromSegmentId: string | null = null;
  private visibleSegmentsDisposer?: IReactionDisposer;

  constructor(
    private readonly workspace: ContentEditorNavigationWorkspace,
    ports: ContentEditorNavigationControllerPorts,
  ) {
    this.ports = ports;
  }

  configure(ports: ContentEditorNavigationControllerPorts) {
    this.ports = ports;
    this.resolvePendingAdvance();
  }

  start() {
    this.visibleSegmentsDisposer?.();
    this.visibleSegmentsDisposer = reaction(
      () => this.visibleSegments(),
      () => this.resolvePendingAdvance(),
    );
  }

  dispose() {
    this.visibleSegmentsDisposer?.();
    this.visibleSegmentsDisposer = undefined;
    this.pendingAdvanceFromSegmentId = null;
  }

  invalidateFileScope() {
    this.pendingAdvanceFromSegmentId = null;
  }

  /** A filter change re-orders the queue, so a pending Next no longer has a meaningful target. */
  cancelPendingAdvance() {
    this.pendingAdvanceFromSegmentId = null;
  }

  selectSegment(segmentIdOrKey: string) {
    const segmentId = this.resolve(segmentIdOrKey);
    if (segmentId === this.resolve(this.workspace.selectedSegmentId)) {
      return;
    }

    this.pendingAdvanceFromSegmentId = null;
    this.workspace.setSelectedSegmentId(segmentId);
    this.ports.navigation?.onSelectSegment?.(segmentIdOrKey);
  }

  previous() {
    this.pendingAdvanceFromSegmentId = null;
    const previousId = getAdjacentSegmentId(
      this.visibleSegments(),
      this.workspace.selectedSegmentId,
      -1,
    );
    if (previousId) {
      this.workspace.setSelectedSegmentId(previousId);
    }
    this.ports.navigation?.onPreviousSegment?.();
  }

  next() {
    const currentId = this.workspace.selectedSegmentId;
    const nextId = getAdjacentSegmentId(this.visibleSegments(), currentId, 1);
    if (nextId) {
      this.pendingAdvanceFromSegmentId = null;
      this.workspace.setSelectedSegmentId(nextId);
      this.ports.navigation?.onNextSegment?.();
      return;
    }

    const { hasMoreQueue, onLoadMoreQueue } = this.ports;
    if (hasMoreQueue && onLoadMoreQueue) {
      this.pendingAdvanceFromSegmentId = currentId;
      onLoadMoreQueue();
      // Sync loaders (tests / already-buffered pages) can populate the store
      // before the visible-segments reaction runs.
      this.resolvePendingAdvance();
    }
    this.ports.navigation?.onNextSegment?.();
  }

  previousUntranslated() {
    this.selectAdjacentUntranslated(-1);
  }

  nextUntranslated() {
    this.selectAdjacentUntranslated(1);
  }

  private selectAdjacentUntranslated(direction: -1 | 1) {
    const targetId = findAdjacentSegmentIdMatching(
      this.visibleSegments(),
      this.workspace.selectedSegmentId,
      direction,
      (segmentId) => this.workspace.matchesQueueFilter(segmentId, "untranslated"),
    );
    if (!targetId) {
      return;
    }

    this.pendingAdvanceFromSegmentId = null;
    this.workspace.setSelectedSegmentId(targetId);
    if (direction === 1) {
      this.ports.navigation?.onNextSegment?.();
    } else {
      this.ports.navigation?.onPreviousSegment?.();
    }
  }

  private resolvePendingAdvance() {
    const fromId = this.pendingAdvanceFromSegmentId;
    if (!fromId) {
      return;
    }

    const nextId = getAdjacentSegmentId(this.visibleSegments(), fromId, 1);
    if (nextId) {
      this.pendingAdvanceFromSegmentId = null;
      if (this.resolve(this.workspace.selectedSegmentId) === this.resolve(fromId)) {
        this.workspace.setSelectedSegmentId(nextId);
      }
      return;
    }

    if (!this.ports.hasMoreQueue) {
      this.pendingAdvanceFromSegmentId = null;
    }
  }

  private visibleSegments() {
    return this.workspace.getFilteredQueueSegments(
      this.ports.queueFilter,
      this.ports.usesServerQueueFilter,
    );
  }

  private resolve(segmentIdOrKey: string) {
    return this.workspace.findSegmentIdByKeyOrId(segmentIdOrKey) ?? segmentIdOrKey;
  }
}
