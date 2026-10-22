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
import { computed, makeAutoObservable, reaction, type IReactionDisposer } from "mobx";

import type {
  ProjectFileContentEditorComment,
  ProjectFileContentEditorTranslation,
} from "@/api/routes/project/project.schema";
import {
  findSegmentIdByKeyOrIdInQueue,
  isServerQueueFilter,
  orderCatQueueSegmentsSkippedLast,
  segmentMatchesQueueFilterFromInput,
  type ContentEditorQueueFilter,
  type ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import type {
  ContentEditorFileContext,
  ContentEditorFormatCheck,
  ContentEditorQueueSegment,
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
  ContentEditorSegmentStatus,
  ContentEditorWorkspaceShell,
  ContentEditorWorkspaceState,
} from "@/components/content-editor/shared/types";
import { mapSegmentComments } from "@/components/content-editor/project-file/project-file-content-editor-mapper";
import { ContentEditorPageStore } from "@/components/content-editor/page/content-editor-page-store";

import type { ContentEditorWorkspaceViewMode } from "./content-editor-workspace-view-mode";
import { resolveCatFileViewCapabilities } from "./content-editor-file-view-capabilities";
import {
  ContentEditorQueueHydrator,
  DEFAULT_CONTENT_EDITOR_FILE_CONTEXT,
  type ContentEditorSnapshotShell,
} from "./content-editor-queue-hydrator";
import { ContentEditorBulkActionStore } from "./store/content-editor-bulk-action-store";
import { ContentEditorIntelligenceStore } from "./store/content-editor-intelligence-store";
import { ContentEditorQueueStore } from "./store/content-editor-queue-store";
import type { ContentEditorSegmentDraft } from "./store/content-editor-segment-draft";
import { ContentEditorSegmentStore } from "./store/content-editor-segment-store";
import {
  ContentEditorSegmentTargetSync,
  type ContentEditorServerTargetSource,
} from "./store/content-editor-segment-target-sync";
import { composeSegmentView } from "./store/content-editor-segment-view";
import { ContentEditorWorkspaceUiStore } from "./store/content-editor-workspace-ui-store";

import { ContentEditorGroupVariantsRegistry } from "../groups/content-editor-group-variants-store";
import { ContentEditorImageGenerationStore } from "../multilingual/content-editor-image-generation-store";
import { MultilingualDrafts } from "../multilingual/content-editor-multilingual-drafts";

export { resolveFileContext } from "./content-editor-queue-hydrator";

export type CreateCatWorkspaceOptions = {
  initialViewMode?: ContentEditorWorkspaceViewMode;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
};

type UnsavedNavigationPrompt = {
  proceed: () => void;
};

export interface WorkspaceControllerLifecycle {
  start(): void;
  dispose(): void;
  invalidateFileScope?(): void;
}

/** State that belongs to one open file and locale, and is dropped when either changes. */
interface FileScopedStore {
  resetForFileScope(): void;
}

const EMPTY_LOADING_SEGMENT_IDS: ReadonlySet<string> = new Set<string>();

function loadingSegmentIdsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left === right) {
    return true;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const id of left) {
    if (!right.has(id)) {
      return false;
    }
  }
  return true;
}

/**
 * Composes the workspace domain stores, owns cross-store derived state, and hosts the
 * controller lifecycle. Server reconciliation lives in `targets` and the queue hydrator.
 */
export class ContentEditorWorkspaceOrchestrator {
  readonly multilingualDrafts = new MultilingualDrafts();
  readonly imageGenerations = new ContentEditorImageGenerationStore();
  readonly groupVariants = new ContentEditorGroupVariantsRegistry();
  readonly queue = new ContentEditorQueueStore();
  readonly segments = new ContentEditorSegmentStore();
  readonly intelligenceState = new ContentEditorIntelligenceStore();
  readonly bulk = new ContentEditorBulkActionStore();
  readonly page = new ContentEditorPageStore();
  readonly targets = new ContentEditorSegmentTargetSync({
    queue: this.queue,
    segments: this.segments,
    intelligence: this.intelligenceState,
  });
  readonly ui: ContentEditorWorkspaceUiStore;
  private readonly hydrator: ContentEditorQueueHydrator;
  private readonly fileScopedStores: readonly FileScopedStore[];

  jobTitle?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;
  fileContext: ContentEditorFileContext = DEFAULT_CONTENT_EDITOR_FILE_CONTEXT;
  unsavedNavigationPrompt: UnsavedNavigationPrompt | null = null;

  validationSequence = 0;
  reviewSequence = 0;
  fileScopeGeneration = 0;
  /** Identity of the file and locale the workspace data belongs to. */
  fileScopeKey: string | null = null;
  readonly queueViewCache = new WeakMap<ContentEditorQueueSegment, ContentEditorSegment>();
  private controllers: WorkspaceControllerLifecycle[] = [];
  private dirtyStateDisposer?: IReactionDisposer;
  private beforeUnloadHandler?: (event: BeforeUnloadEvent) => void;

  constructor(options?: CreateCatWorkspaceOptions) {
    this.ui = new ContentEditorWorkspaceUiStore(options?.initialViewMode);
    this.queue.filter = options?.initialQueueFilter ?? "all";
    this.queue.sort = options?.initialQueueSort ?? "file_order";
    this.queue.search = options?.initialSearch ?? "";
    this.hydrator = new ContentEditorQueueHydrator({
      queue: this.queue,
      segments: this.segments,
      intelligence: this.intelligenceState,
      targets: this.targets,
      ui: this.ui,
      readShell: () => this.shellState,
      applyShell: (shell) => this.applySnapshotShell(shell),
    });
    this.fileScopedStores = [
      this.queue,
      this.segments,
      this.intelligenceState,
      this.bulk,
      this.targets,
      this.groupVariants,
      this.multilingualDrafts,
      this.imageGenerations,
    ];
    makeAutoObservable<this, "hydrator" | "fileScopedStores" | "controllers">(
      this,
      {
        hydrator: false,
        fileScopedStores: false,
        controllers: false,
        queueViewCache: false,
        validationSequence: false,
        reviewSequence: false,
        fileScopeGeneration: false,
        loadingSegmentIds: computed({ equals: loadingSegmentIdsEqual }),
      },
      { autoBind: true },
    );
  }

  attachControllers(...controllers: WorkspaceControllerLifecycle[]) {
    this.controllers = controllers;
  }

  start() {
    for (const controller of this.controllers) {
      controller.start();
    }
    this.dirtyStateDisposer?.();
    if (typeof window !== "undefined") {
      if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      }
      const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
      this.beforeUnloadHandler = handleBeforeUnload;
      this.dirtyStateDisposer = reaction(
        () => this.segments.hasDirtySegments || this.multilingualDrafts.dirty,
        (hasDirtySegments, previousHasDirtySegments) => {
          if (previousHasDirtySegments) {
            window.removeEventListener("beforeunload", handleBeforeUnload);
          }
          if (hasDirtySegments) {
            window.addEventListener("beforeunload", handleBeforeUnload);
          }
        },
        { fireImmediately: true },
      );
    }
  }

  dispose() {
    this.dirtyStateDisposer?.();
    this.dirtyStateDisposer = undefined;
    if (this.beforeUnloadHandler && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      this.beforeUnloadHandler = undefined;
    }
    for (const controller of this.controllers) {
      controller.dispose();
    }
    this.imageGenerations.dispose();
  }

  /** Reads clean targets from a lazy cache. Returns a function that detaches it. */
  attachServerTargetSource(source: ContentEditorServerTargetSource) {
    return this.targets.attachSource(source);
  }

  get pendingWrites(): ReadonlyMap<string, "approve" | "draft"> {
    return this.segments.pendingWrites;
  }

  get isApproving() {
    return this.segments.pendingWrites.get(this.selectedSegmentId) === "approve";
  }

  get isSavingDraft() {
    return this.segments.pendingWrites.get(this.selectedSegmentId) === "draft";
  }

  get isBulkActionPending() {
    return this.bulk.isPending;
  }

  get bulkCompletedCount() {
    return this.bulk.completedCount;
  }

  get bulkTotalCount() {
    return this.bulk.totalCount;
  }

  get localStatusOverrides(): ReadonlyMap<string, ContentEditorSegmentStatus> {
    return this.targets.localStatusOverrides;
  }

  get selectedSegmentId() {
    return this.queue.selectedSegmentId;
  }

  get queueFilter() {
    return this.queue.filter;
  }

  get queueSort() {
    return this.queue.sort;
  }

  get queueSearch() {
    return this.queue.search;
  }

  get selectionMode() {
    return this.queue.selectionMode;
  }

  get checkedSegmentIds(): ReadonlySet<string> {
    return this.queue.checkedSegmentIds;
  }

  get segmentMeta(): ReadonlyMap<string, ContentEditorQueueSegment> {
    return this.queue.segmentMeta;
  }

  get segmentComments() {
    return this.segments.comments;
  }

  get drafts(): ReadonlyMap<string, ContentEditorSegmentDraft> {
    return this.segments.drafts;
  }

  get formatChecks() {
    return this.intelligenceState.formatChecks;
  }

  get segmentFormatChecks() {
    return this.intelligenceState.segmentFormatChecks;
  }

  get intelligence() {
    return this.intelligenceState.fileIntelligence;
  }

  get segmentIntelligence() {
    return this.intelligenceState.bySegment;
  }

  get revealedAgentContextSegmentIds(): ReadonlySet<string> {
    return this.intelligenceState.revealedAgentContextSegmentIds;
  }

  get isValidating() {
    return this.intelligenceState.isValidating;
  }

  get isPostingComment() {
    return this.segments.isPostingComment;
  }

  get isResolvingComment() {
    return this.segments.isResolvingComment;
  }

  get resolvingCommentId() {
    return this.segments.resolvingCommentId;
  }

  get commentPostError() {
    return this.segments.commentPostError;
  }

  get isLookingUpContext() {
    return this.intelligenceState.contextLoadingSegmentIds.has(this.resolvedSelectedSegmentId);
  }

  get concordanceLoadingSegmentId() {
    return this.intelligenceState.concordanceLoadingSegmentId;
  }

  get isLoadingVisualContext() {
    return this.intelligenceState.isLoadingVisualContext;
  }

  get isGeneratingAiRecommendation() {
    return this.intelligenceState.isGeneratingAiRecommendation;
  }

  get isRunningFormatChecks() {
    return this.intelligenceState.isRunningFormatChecks;
  }

  get formatCheckLoadingSegmentIds(): ReadonlySet<string> {
    return this.intelligenceState.formatCheckLoadingSegmentIds;
  }

  get isSegmentTargetLoading() {
    return this.segments.targetLoadingSegmentIds.has(this.selectedSegmentId);
  }

  get isCommentsLoading() {
    return this.segments.commentsLoadingSegmentIds.has(this.selectedSegmentId);
  }

  get canEditTranslations() {
    return this.fileContext.canEditTranslations;
  }

  get canAddComments() {
    return this.fileContext.canAddComments;
  }

  get providerKind() {
    return this.fileContext.providerKind;
  }

  get isLoadingConcordance() {
    const loadingSegmentId = this.concordanceLoadingSegmentId;
    return loadingSegmentId !== null && loadingSegmentId === this.resolvedSelectedSegmentId;
  }

  get dirtySegmentIds(): ReadonlySet<string> {
    return this.segments.dirtySegmentIds;
  }

  get queueSegments(): ContentEditorQueueSegment[] {
    return this.queue.segments;
  }

  get shellState(): ContentEditorWorkspaceShell {
    return {
      fileContext: this.fileContext,
      selectedSegmentId: this.selectedSegmentId,
      formatChecks: this.formatChecks,
      segmentFormatChecks: this.segmentFormatChecks,
      intelligence: this.intelligence,
      segmentIntelligence: this.segmentIntelligence,
      jobTitle: this.jobTitle,
      breadcrumbs: this.breadcrumbs,
      primaryActionLabel: this.primaryActionLabel,
      canEditTranslations: this.canEditTranslations,
      canAddComments: this.canAddComments,
      providerKind: this.providerKind,
    };
  }

  /** Selected id resolved from a segment key, which deep links may use instead of the id. */
  private get resolvedSelectedSegmentId() {
    return this.findSegmentIdByKeyOrId(this.selectedSegmentId) ?? this.selectedSegmentId;
  }

  targetState(segmentId: string) {
    return this.targets.targetState(segmentId);
  }

  getSegmentView(segmentId: string): ContentEditorSegment | undefined {
    const meta = this.segmentMeta.get(segmentId);
    if (!meta) {
      return undefined;
    }

    return composeSegmentView({
      fileContext: this.fileContext,
      meta,
      draft: this.targetState(segmentId),
      comments: this.segmentComments.get(segmentId),
      openIssueCount: this.segments.openIssueCounts.get(segmentId),
      intelligence: this.segmentIntelligence[segmentId],
    });
  }

  findSegmentIdByKeyOrId(segmentIdOrKey: string) {
    return findSegmentIdByKeyOrIdInQueue(this.queueSegments, segmentIdOrKey);
  }

  segmentHasOpenIssues(segmentId: string) {
    return this.segments.hasOpenIssues(segmentId);
  }

  matchesQueueFilter(segmentId: string, filter: ContentEditorQueueFilter) {
    const draft = this.targetState(segmentId);
    return segmentMatchesQueueFilterFromInput(
      {
        status: draft?.status ?? "pending",
        hasOpenIssues: this.segmentHasOpenIssues(segmentId),
        isHidden: this.segmentMeta.get(segmentId)?.isHidden,
        isDirty: draft?.isDirty,
      },
      filter,
    );
  }

  getFilteredQueueSegments(filter: ContentEditorQueueFilter, usesServerQueueFilter: boolean) {
    let segments: ContentEditorQueueSegment[];
    const localStatusOverrides = this.targets.localStatusOverrides;

    if (usesServerQueueFilter && isServerQueueFilter(filter)) {
      // Trust the server page, but hide rows whose session-local status no longer
      // matches (skip is not persisted; approve may race ahead of refetch).
      segments =
        localStatusOverrides.size === 0
          ? this.queueSegments
          : this.queueSegments.filter(
              (meta) =>
                !localStatusOverrides.has(meta.id) || this.matchesQueueFilter(meta.id, filter),
            );
    } else if (filter === "all") {
      segments = this.queueSegments;
    } else {
      segments = this.queueSegments.filter((meta) => this.matchesQueueFilter(meta.id, filter));
    }

    const windowIds = this.queue.windowIds;
    if (this.targets.isSourceAttached() && windowIds) {
      segments = segments.filter((segment) => windowIds.has(segment.id));
    }
    return orderCatQueueSegmentsSkippedLast(segments, this.queue.sort, (meta) => {
      const draft = this.drafts.get(meta.id);
      return (draft?.status ?? "pending") === "skipped";
    });
  }

  getQueuePanelSegments(
    filter: ContentEditorQueueFilter,
    usesServerQueueFilter: boolean,
  ): ContentEditorSegment[] {
    return this.getFilteredQueueSegments(filter, usesServerQueueFilter).map((meta) => {
      const cached = this.queueViewCache.get(meta);
      if (cached) return cached;
      // Getters intentionally defer MobX reads until the row observer renders.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const workspace = this;
      // Read mutable segment fields in the consuming observer, not while the
      // workspace builds its ordered list. Offscreen drafts stay unsubscribed.
      const view: ContentEditorSegment = {
        ...meta,
        get sourceLocale() {
          return workspace.fileContext.sourceLocale;
        },
        get targetLocale() {
          return workspace.fileContext.targetLocale;
        },
        get targetText() {
          return workspace.targetState(meta.id)?.targetText ?? "";
        },
        get status() {
          return workspace.targetState(meta.id)?.status ?? "pending";
        },
        get comments() {
          return workspace.segmentComments.get(meta.id);
        },
        get tags() {
          return workspace.getSegmentView(meta.id)?.tags;
        },
        get hasOpenIssues() {
          return workspace.segmentHasOpenIssues(meta.id);
        },
        get contextLabel() {
          return workspace.segmentIntelligence[meta.id]?.productMeaning?.trim() || undefined;
        },
        get maxLength() {
          const maxLength = workspace.segmentIntelligence[meta.id]?.maxLength;
          return maxLength != null && maxLength > 0 ? maxLength : undefined;
        },
      };
      this.queueViewCache.set(meta, view);
      return view;
    });
  }

  get selectedSegmentView(): ContentEditorSegment | undefined {
    return this.getSegmentView(this.resolvedSelectedSegmentId);
  }

  get intelligenceSegmentId() {
    return this.selectedSegmentId;
  }

  get intelligenceSegmentView(): ContentEditorSegment | undefined {
    const segmentId =
      this.findSegmentIdByKeyOrId(this.intelligenceSegmentId) ?? this.intelligenceSegmentId;
    if (!segmentId) {
      return undefined;
    }

    return this.getSegmentView(segmentId);
  }

  get loadingSegmentIds(): ReadonlySet<string> {
    const hasSelectedLoading = this.isSegmentTargetLoading && this.selectedSegmentId;
    const queueLoadingIds = this.segments.queueTargetLoadingSegmentIds;
    const pendingViewportIds = this.ui.isSideBySideView
      ? this.ui.loadSideBySideSegmentIds.filter(
          (segmentId) =>
            !this.hasHydratedTarget(segmentId) &&
            !this.hasFailedTarget(segmentId) &&
            !this.drafts.get(segmentId)?.targetText.trim(),
        )
      : [];

    if (!hasSelectedLoading && queueLoadingIds.size === 0 && pendingViewportIds.length === 0) {
      return EMPTY_LOADING_SEGMENT_IDS;
    }

    const ids = new Set<string>(pendingViewportIds);
    for (const segmentId of queueLoadingIds) {
      // Read drafts here so MobX recomputes when the user types during a fetch.
      if (!this.drafts.get(segmentId)?.targetText.trim()) {
        ids.add(segmentId);
      }
    }
    if (hasSelectedLoading) {
      ids.add(this.selectedSegmentId);
    }
    return ids;
  }

  get isIntelligenceCommentsLoading() {
    return this.isCommentsLoading;
  }

  get selectedDraft(): ContentEditorSegmentDraft | undefined {
    return this.drafts.get(this.resolvedSelectedSegmentId);
  }

  reset(initialState: ContentEditorWorkspaceState, initialSegmentKeyOrId?: string | null) {
    this.hydrator.reset();
    this.targets.resetForFileScope();
    this.ingestQueue(initialState, initialSegmentKeyOrId);
  }

  /**
   * Records the open file and locale, and resets workspace data when they differ
   * from the last ones seen. The key lives here, not in a component, because the
   * workspace view can remount between two files while this store stays mounted.
   */
  syncFileScope(
    fileScopeKey: string,
    input: { sourcePath: string; sourceLocale: string; targetLocale: string },
  ) {
    const previousKey = this.fileScopeKey;
    this.fileScopeKey = fileScopeKey;
    if (previousKey !== null && previousKey !== fileScopeKey) {
      this.prepareFileScopeChange(input);
    }
  }

  /**
   * File or locale changed while the page store stays mounted. Drop the previous
   * file's queue so chrome can keep rendering, then wait for the next snapshot.
   */
  prepareFileScopeChange(input: {
    sourcePath: string;
    sourceLocale: string;
    targetLocale: string;
  }) {
    const filename = input.sourcePath.split("/").pop() ?? input.sourcePath;
    // Capture the outgoing segment before clearing the queue — for All Files
    // workspaces (sourcePath === "*") selectedSegmentView becomes undefined once
    // the queue meta and selectedSegmentId are cleared below, so we read it first.
    const outgoingSegment = input.sourcePath === "*" ? this.selectedSegmentView : undefined;
    this.fileScopeGeneration += 1;
    this.reviewSequence += 1;
    this.validationSequence += 1;
    for (const store of this.fileScopedStores) {
      store.resetForFileScope();
    }
    this.hydrator.reset();
    this.fileContext = {
      sourcePath: input.sourcePath,
      filename,
      sourceLocale: input.sourceLocale,
      targetLocale: input.targetLocale,
      // Keep the current provider so Crowdin markdown does not flash into native document view.
      providerKind: this.fileContext.providerKind,
      canEditTranslations: true,
      canAddComments: true,
    };
    // Update persona for the new file's content family eagerly (before the
    // snapshot arrives) so the UI reflects the correct layout immediately.
    const initialFamily = resolveCatFileViewCapabilities({
      sourcePath: outgoingSegment?.sourcePath ?? input.sourcePath,
      ...(outgoingSegment ? { contentKind: outgoingSegment.contentKind } : {}),
      providerKind: this.fileContext.providerKind,
    }).family;
    this.ui.applyFileFamily(initialFamily);
    this.page.beginFileScopeChange(input.sourcePath, input.targetLocale);
    this.ui.setTranslationViewLoading(true);
    for (const controller of this.controllers) {
      controller.invalidateFileScope?.();
    }
  }

  isFileScopeCurrent(generation: number) {
    return this.fileScopeGeneration === generation;
  }

  hasHydratedTarget(segmentId: string) {
    return this.targets.hasHydrated(segmentId);
  }

  hasFailedTarget(segmentId: string) {
    return this.targets.hasFailed(segmentId);
  }

  markSegmentTargetLoadFailed(segmentId: string) {
    this.targets.markLoadFailed(segmentId);
  }

  clearSegmentTargetLoadFailed(segmentId: string) {
    this.segments.clearTargetLoadFailed(segmentId);
  }

  ingestQueue(
    nextInitialState: ContentEditorWorkspaceState,
    initialSegmentKeyOrId?: string | null,
  ) {
    this.hydrateFromServerSnapshot(nextInitialState, initialSegmentKeyOrId);
  }

  hasIngestedQueueSnapshot(snapshot: ContentEditorWorkspaceState | null): boolean {
    return this.hydrator.hasIngested(snapshot);
  }

  hydrateFromServerSnapshot(
    nextInitialState: ContentEditorWorkspaceState,
    initialSegmentKeyOrId?: string | null,
  ) {
    this.hydrator.hydrate(nextInitialState, initialSegmentKeyOrId);
  }

  applySegmentTarget(segmentId: string, target: ProjectFileContentEditorTranslation | null) {
    this.targets.apply(segmentId, target);
  }

  applySegmentComments(segmentId: string, comments: ProjectFileContentEditorComment[]) {
    if (!this.segmentMeta.has(segmentId)) {
      return;
    }

    this.segments.setComments(segmentId, mapSegmentComments(comments));
    this.flagNeedsReviewWhenIssuesOpen(segmentId);
  }

  applySegmentOpenIssueCount(segmentId: string, openIssueCount: number) {
    if (!this.segmentMeta.has(segmentId)) {
      return;
    }

    this.segments.setOpenIssueCount(segmentId, openIssueCount);
    this.flagNeedsReviewWhenIssuesOpen(segmentId);
  }

  private flagNeedsReviewWhenIssuesOpen(segmentId: string) {
    const draft = this.drafts.get(segmentId);
    if (
      draft &&
      this.segmentHasOpenIssues(segmentId) &&
      draft.status !== "reviewed" &&
      this.localStatusOverrides.get(segmentId) !== "skipped"
    ) {
      draft.applyServerStatus("needs_review");
    }
  }

  setSegmentTargetLoading(loading: boolean, segmentId = this.selectedSegmentId) {
    this.segments.setTargetLoading(segmentId, loading);
  }

  setQueueTargetLoadingSegmentIds(segmentIds: readonly string[]) {
    this.segments.setQueueTargetLoadingSegmentIds(segmentIds);
  }

  setCommentsLoading(loading: boolean, segmentId = this.selectedSegmentId) {
    this.segments.setCommentsLoading(segmentId, loading);
  }

  private applySnapshotShell(shell: ContentEditorSnapshotShell) {
    this.fileContext = shell.fileContext;
    this.jobTitle = shell.jobTitle;
    this.breadcrumbs = shell.breadcrumbs;
    this.primaryActionLabel = shell.primaryActionLabel;
  }

  setSelectedSegmentId(segmentId: string) {
    this.queue.select(segmentId);
    this.segments.clearCommentError();
  }

  setTargetText(segmentId: string, value: string) {
    this.targets.ensureDraftForEdit(segmentId);
    this.segments.setTargetText(segmentId, value, this.segmentMeta.has(segmentId));
  }

  setSegmentStatus(segmentId: string, status: ContentEditorSegmentStatus) {
    this.segments.setStatus(segmentId, status, this.segmentMeta.has(segmentId));
  }

  rememberLocalStatusOverride(segmentId: string, status: ContentEditorSegmentStatus) {
    this.targets.rememberLocalStatusOverride(segmentId, status);
  }

  markSegmentSaved(segmentId: string, targetText: string, status?: ContentEditorSegmentStatus) {
    this.targets.markSaved(segmentId, targetText, status);
  }

  /**
   * Drop a segment from the local queue after a status change that no longer matches
   * the active filter (e.g. approve while filtered to Needs Review). Keeps dirty drafts.
   */
  removeQueueSegmentIfClean(segmentId: string) {
    if (!this.segmentMeta.has(segmentId) || this.drafts.get(segmentId)?.isDirty) {
      return false;
    }

    this.queue.remove(segmentId);
    this.segments.evict(segmentId);
    this.targets.forget(segmentId);
    return true;
  }

  beginWrite(segmentId: string, kind: "approve" | "draft") {
    return this.segments.beginWrite(segmentId, kind);
  }

  endWrite(segmentId: string) {
    this.segments.endWrite(segmentId);
  }

  setFormatChecks(segmentId: string, checks: ContentEditorFormatCheck[], isSelected: boolean) {
    this.intelligenceState.setChecks(segmentId, checks, isSelected);
  }

  setSegmentIntelligence(segmentId: string, intelligence: ContentEditorSegmentIntelligence) {
    this.intelligenceState.setSegment(segmentId, intelligence);
  }

  mergeSegmentIntelligence(segmentId: string, patch: Partial<ContentEditorSegmentIntelligence>) {
    this.intelligenceState.mergeSegment(segmentId, patch);
  }

  clearAgentContexts() {
    this.intelligenceState.clearAgentContexts();
  }

  addSaveFailureCheck(segmentId: string, message: string, label: string) {
    const saveFailureCheck: ContentEditorFormatCheck = {
      id: `save-failed-${segmentId}`,
      label,
      status: "fail",
      message,
      category: "qa",
    };
    const segmentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    this.setFormatChecks(
      segmentId,
      [saveFailureCheck, ...segmentChecks.filter((check) => !check.id.startsWith("save-failed-"))],
      this.selectedSegmentId === segmentId,
    );
  }

  removeFormatCheck(segmentId: string, checkId: string) {
    const currentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextChecks = currentChecks.filter((check) => check.id !== checkId);
    this.setFormatChecks(segmentId, nextChecks, this.selectedSegmentId === segmentId);
  }

  upsertFormatCheck(segmentId: string, check: ContentEditorFormatCheck) {
    const currentChecks = this.segmentFormatChecks[segmentId] ?? this.formatChecks;
    const nextChecks = [check, ...currentChecks.filter((item) => item.id !== check.id)];
    this.setFormatChecks(segmentId, nextChecks, this.selectedSegmentId === segmentId);
  }

  revealAgentContext(segmentId: string) {
    this.intelligenceState.revealAgentContext(segmentId);
  }

  setCheckedSegmentIds(next: ReadonlySet<string>) {
    this.queue.selectAll([...next]);
  }

  toggleSegmentChecked(segmentId: string, checked: boolean) {
    this.queue.toggleChecked(segmentId, checked);
  }

  selectAllVisible(segmentIds: string[]) {
    this.queue.selectAll(segmentIds);
  }

  clearChecked() {
    this.queue.clearChecked();
  }

  setSegmentsHidden(segmentIds: string[], isHidden: boolean) {
    this.queue.setHidden(segmentIds, isHidden);
  }

  setSegmentsLocked(segmentIds: string[], isLocked: boolean) {
    this.queue.setLocked(segmentIds, isLocked);
  }

  pruneCheckedToVisible(visibleIds: ReadonlySet<string>) {
    const next = [...this.checkedSegmentIds].filter((id) => visibleIds.has(id));
    if (next.length !== this.checkedSegmentIds.size) {
      this.queue.selectAll(next);
    }
  }

  setQueueFilter(filter: ContentEditorQueueFilter) {
    const filtered = this.getFilteredQueueSegments(filter, false);
    const selectionWillChange = !filtered.some(
      (segment) => segment.id === this.selectedSegmentId || segment.key === this.selectedSegmentId,
    );

    this.queue.setFilter(filter);
    if (selectionWillChange) {
      this.setSelectedSegmentId(filtered[0]?.id ?? "");
    }
  }

  setQueueSort(sort: ContentEditorQueueSort) {
    this.queue.setSort(sort);
  }

  setQueueSearch(search: string) {
    this.queue.setSearch(search);
  }

  setSelectionMode(enabled: boolean, options?: { persist?: boolean }) {
    const shouldPersist = options?.persist ?? !this.ui.adaptiveWorkspaceEnabled;
    this.queue.setSelectionMode(enabled, { persist: shouldPersist });
  }

  attemptPageNavigation(proceed: () => void) {
    if (this.dirtySegmentIds.size > 0 || this.multilingualDrafts.dirty) {
      this.unsavedNavigationPrompt = { proceed };
      return;
    }

    proceed();
  }

  dismissUnsavedNavigationPrompt() {
    this.unsavedNavigationPrompt = null;
  }

  confirmUnsavedNavigation() {
    const proceed = this.unsavedNavigationPrompt?.proceed;
    this.multilingualDrafts.clear();
    this.imageGenerations.cancelAll();
    this.unsavedNavigationPrompt = null;
    proceed?.();
  }

  clearCommentPostError() {
    this.segments.clearCommentError();
  }

  beginValidation(): number {
    this.validationSequence += 1;
    this.intelligenceState.setValidating(true);
    return this.validationSequence;
  }

  isValidationCurrent(sequence: number): boolean {
    return this.validationSequence === sequence;
  }

  completeValidation(sequence: number): void {
    if (this.isValidationCurrent(sequence)) {
      this.intelligenceState.setValidating(false);
    }
  }

  beginReview(options?: { includeAi?: boolean; showFormatChecksLoading?: boolean }): number {
    this.reviewSequence += 1;
    if (options?.includeAi) {
      this.intelligenceState.setGeneratingAiRecommendation(true);
    }
    if (options?.showFormatChecksLoading) {
      this.intelligenceState.setRunningFormatChecks(true);
    }
    return this.reviewSequence;
  }

  isReviewCurrent(sequence: number): boolean {
    return this.reviewSequence === sequence;
  }

  beginConcordanceLoad(segmentId: string) {
    this.intelligenceState.beginConcordanceLoad(segmentId);
  }

  endConcordanceLoad(segmentId: string) {
    this.intelligenceState.endConcordanceLoad(segmentId);
  }

  beginContextLookup(segmentId: string) {
    this.intelligenceState.beginContextLookup(segmentId);
  }

  endContextLookup(segmentId: string) {
    this.intelligenceState.endContextLookup(segmentId);
  }

  setVisualContextLoading(loading: boolean) {
    this.intelligenceState.setLoadingVisualContext(loading);
  }

  setFormatCheckLoading(segmentId: string, loading: boolean) {
    this.intelligenceState.setFormatCheckLoading(segmentId, loading);
  }

  clearFormatCheckLoading() {
    this.intelligenceState.clearFormatCheckLoading();
  }

  setReviewPhaseLoading(sequence: number, phase: "ai" | "formatChecks", loading: boolean): void {
    if (!this.isReviewCurrent(sequence)) {
      return;
    }

    switch (phase) {
      case "ai":
        this.intelligenceState.setGeneratingAiRecommendation(loading);
        break;
      case "formatChecks":
        this.intelligenceState.setRunningFormatChecks(loading);
        break;
    }
  }

  beginCommentPost() {
    this.segments.beginPostComment();
  }

  endCommentPost() {
    this.segments.endPostComment();
  }

  beginCommentResolve(commentId: string) {
    this.segments.beginResolveComment(commentId);
  }

  endCommentResolve() {
    this.segments.endResolveComment();
  }

  failComment(message: string) {
    this.segments.failComment(message);
  }
}

export function createCatWorkspace(
  initialState: ContentEditorWorkspaceState,
  initialSegmentKeyOrId?: string | null,
  options?: CreateCatWorkspaceOptions,
) {
  const workspace = new ContentEditorWorkspaceOrchestrator(options);
  workspace.reset(initialState, initialSegmentKeyOrId);
  return workspace;
}
