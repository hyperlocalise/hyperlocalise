/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { makeAutoObservable, observable, runInAction } from "mobx";

import type { CatGroupOccurrence, CatGroupVariant } from "@/lib/go-svc/go-svc-cat-groups.types";
import type { ContentEditorWorkspaceServices } from "@/components/content-editor/shared/dependencies";
import type {
  ContentEditorFormatCheck,
  ContentEditorGlossaryTerm,
  ContentEditorSegment,
} from "@/components/content-editor/shared/types";

import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";

import type { MultilingualDrafts } from "../multilingual/content-editor-multilingual-drafts";
import type { ContentEditorGroupVariantSaveInput } from "./content-editor-grouping-context";

const FORMAT_CHECK_DELAY_MS = 300;
const FORMAT_CHECK_CONCURRENCY = 3;

export type ContentEditorGroupVariantAction = "save" | "approve" | "all";

export type ContentEditorGroupVariantsServices = {
  validateFormat?: ContentEditorWorkspaceServices["validateFormat"];
  glossaryTerms?: (segmentId: string) => ContentEditorGlossaryTerm[];
};

export type ContentEditorGroupVariantsPorts = {
  canEdit: boolean;
  saveVariant?: (input: ContentEditorGroupVariantSaveInput) => Promise<void>;
  services?: ContentEditorGroupVariantsServices;
  saveFailedMessage: string;
};

/** Stable across refetches of the same occurrence set, even if the server text changes. */
export function groupVariantIdentity(variant: CatGroupVariant) {
  return variant.occurrences
    .map((occurrence) => occurrence.id)
    .toSorted()
    .join(",");
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function occurrenceMaxLength(maxLength: number | null | undefined) {
  return maxLength != null && maxLength > 0 ? maxLength : undefined;
}

function variantQaContexts(occurrences: CatGroupOccurrence[], fallback: ContentEditorSegment) {
  const seen = new Set<string>();
  const contexts: { sourcePath: string; maxLength?: number }[] = [];
  for (const occurrence of occurrences) {
    const sourcePath = occurrence.sourcePath || fallback.sourcePath || "";
    const maxLength = occurrenceMaxLength(occurrence.maxLength);
    const key = `${sourcePath}\0${maxLength ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contexts.push({ sourcePath, maxLength });
  }
  if (contexts.length === 0) {
    contexts.push({
      sourcePath: fallback.sourcePath ?? "",
      maxLength: occurrenceMaxLength(fallback.maxLength),
    });
  }
  return contexts;
}

const FORMAT_CHECK_STATUS_RANK = { pass: 0, warn: 1, fail: 2 } as const;

function mergeFormatChecks(groups: ContentEditorFormatCheck[][]) {
  const byId = new Map<string, ContentEditorFormatCheck>();
  for (const checks of groups) {
    for (const check of checks) {
      const current = byId.get(check.id);
      if (
        !current ||
        FORMAT_CHECK_STATUS_RANK[check.status] > FORMAT_CHECK_STATUS_RANK[current.status]
      ) {
        byId.set(check.id, check);
      }
    }
  }
  return [...byId.values()];
}

/**
 * One distinct translation of a grouped row. Its text lives in the workspace's
 * multilingual draft store so unsaved edits survive refetches and count toward the
 * leave-page prompt.
 */
export class ContentEditorGroupVariant {
  readonly id: string;
  variant: CatGroupVariant;
  pendingAction: ContentEditorGroupVariantAction | null = null;
  error: string | null = null;
  formatChecks: ContentEditorFormatCheck[] = [];
  isCheckingFormat = false;
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private checkAbort: AbortController | null = null;

  constructor(
    readonly group: ContentEditorGroupVariants,
    variant: CatGroupVariant,
  ) {
    this.id = groupVariantIdentity(variant);
    this.variant = variant;
    makeAutoObservable<this, "checkTimer" | "checkAbort">(
      this,
      { id: false, group: false, checkTimer: false, checkAbort: false },
      { autoBind: true },
    );
  }

  get draftKey() {
    return this.group.draftKey(this.id);
  }
  get draft() {
    return this.group.drafts.cells.get(this.draftKey);
  }
  get unlocked(): CatGroupOccurrence[] {
    return this.variant.occurrences.filter((occurrence) => !occurrence.isLocked);
  }
  get canEdit() {
    return this.group.canEdit && this.unlocked.length > 0;
  }
  get text() {
    return this.draft?.text ?? this.variant.text;
  }
  get savedText() {
    return this.draft?.savedText ?? this.variant.text;
  }
  get hasText() {
    return this.text.trim().length > 0;
  }
  get pending() {
    return this.pendingAction !== null || Boolean(this.draft?.saving) || this.group.isApplyingToAll;
  }
  get canSave() {
    return this.canEdit && !this.pending && this.hasText && this.text !== this.savedText;
  }
  get canApprove() {
    return (
      this.canEdit &&
      !this.pending &&
      this.hasText &&
      !(this.variant.isApproved && this.text === this.savedText)
    );
  }
  get canApplyToAll() {
    return this.canEdit && !this.pending && this.hasText;
  }
  get displayError() {
    return this.error ?? this.draft?.error ?? null;
  }
  get qaIssues() {
    return this.formatChecks.filter((check) => check.status !== "pass");
  }

  /** Tightest character limit among the strings this translation can write. */
  get editorMaxLength() {
    let tightest: number | undefined;
    for (const occurrence of this.unlocked.length > 0 ? this.unlocked : this.variant.occurrences) {
      const limit = occurrenceMaxLength(occurrence.maxLength);
      if (limit == null) continue;
      tightest = tightest == null ? limit : Math.min(tightest, limit);
    }
    return tightest;
  }

  update(variant: CatGroupVariant) {
    this.variant = variant;
  }

  change(text: string) {
    if (this.pending) return;
    this.group.drafts.get(this.draftKey, this.variant.text).change(text);
    this.error = null;
    this.scheduleChecks();
  }
  copySource() {
    this.change(this.group.segment.sourceText);
  }
  clear() {
    this.change("");
  }

  saveDraft() {
    if (!this.canSave) return Promise.resolve();
    return this.save("save", this.unlocked, false);
  }
  approve() {
    if (!this.canApprove) return Promise.resolve();
    return this.save("approve", this.unlocked, true);
  }
  applyToAll() {
    if (!this.canApplyToAll) return Promise.resolve();
    return this.save("all", this.group.allUnlocked, false);
  }

  private async save(
    action: ContentEditorGroupVariantAction,
    occurrences: CatGroupOccurrence[],
    approve: boolean,
  ) {
    const { saveVariant, saveFailedMessage } = this.group.ports;
    if (!saveVariant || occurrences.length === 0) return;
    this.pendingAction = action;
    if (action === "all") this.group.isApplyingToAll = true;
    this.error = null;
    const { segment, locale } = this.group;
    const write = (text: string) => saveVariant({ segment, locale, occurrences, text, approve });
    const draft = this.draft;
    try {
      if (!draft || this.text === this.savedText) await write(this.text);
      else {
        await draft.save(write);
        if (draft.error !== null) throw new Error(draft.error);
      }
      if (action === "all") this.group.reconcileUnlockedDrafts(this.text, this);
    } catch (error) {
      runInAction(() => {
        this.error = errorMessage(error, saveFailedMessage);
      });
    } finally {
      runInAction(() => {
        this.pendingAction = null;
        if (action === "all") this.group.isApplyingToAll = false;
      });
      this.group.flushHeldText();
    }
  }

  scheduleChecks(delayMs = FORMAT_CHECK_DELAY_MS) {
    if (!this.group.ports.services?.validateFormat) return;
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkAbort?.abort();
    this.checkAbort = null;
    this.isCheckingFormat = true;
    this.checkTimer = setTimeout(() => void this.runChecks(), delayMs);
  }

  async runChecks() {
    this.checkTimer = null;
    const { validateFormat, glossaryTerms } = this.group.ports.services ?? {};
    if (!validateFormat) {
      this.isCheckingFormat = false;
      return;
    }
    this.checkAbort?.abort();
    const abort = new AbortController();
    this.checkAbort = abort;
    this.isCheckingFormat = true;
    const { segment } = this.group;
    const occurrences = this.unlocked.length > 0 ? this.unlocked : this.variant.occurrences;
    try {
      const checkGroups = await mapWithConcurrency(
        variantQaContexts(occurrences, segment),
        FORMAT_CHECK_CONCURRENCY,
        (context) =>
          validateFormat(
            { ...segment, sourcePath: context.sourcePath, maxLength: context.maxLength },
            this.text,
            glossaryTerms?.(segment.id),
            { signal: abort.signal },
          ),
      );
      if (abort.signal.aborted) return;
      runInAction(() => {
        this.formatChecks = mergeFormatChecks(checkGroups);
      });
    } catch (error) {
      if (abort.signal.aborted || (error as Error)?.name === "AbortError") return;
      runInAction(() => {
        this.formatChecks = [];
      });
    } finally {
      if (this.checkAbort === abort) {
        runInAction(() => {
          this.checkAbort = null;
          this.isCheckingFormat = false;
        });
      }
    }
  }

  /** Stops pending checks and drops a clean draft; the variant stays usable after `sync`. */
  release() {
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = null;
    this.checkAbort?.abort();
    this.checkAbort = null;
    this.isCheckingFormat = false;
    this.group.drafts.release(this.draftKey);
  }
}

/** Every distinct translation of one grouped row in one locale. */
export class ContentEditorGroupVariants {
  readonly segment: ContentEditorSegment;
  readonly locale: string;
  readonly drafts: MultilingualDrafts;
  private readonly projectId: string;
  variants: ContentEditorGroupVariant[] = [];
  focusedVariantId: string | null = null;
  canEdit: boolean;
  isApplyingToAll = false;
  applyError: string | null = null;
  private heldTextByVariant = new Map<string, string>();
  ports: ContentEditorGroupVariantsPorts;

  constructor(input: {
    segment: ContentEditorSegment;
    locale: string;
    projectId: string;
    variants: CatGroupVariant[];
    drafts: MultilingualDrafts;
    ports: ContentEditorGroupVariantsPorts;
  }) {
    this.segment = input.segment;
    this.locale = input.locale;
    this.projectId = input.projectId;
    this.drafts = input.drafts;
    this.ports = input.ports;
    this.canEdit = input.ports.canEdit;
    this.variants = input.variants.map((variant) => new ContentEditorGroupVariant(this, variant));
    makeAutoObservable<this, "projectId" | "heldTextByVariant">(
      this,
      {
        segment: false,
        locale: false,
        drafts: false,
        projectId: false,
        ports: false,
        heldTextByVariant: false,
      },
      { autoBind: true },
    );
  }

  draftKey(variantId: string) {
    // `MultilingualDrafts.releaseInactive` reads the segment id and locale at index 2 and 3.
    return JSON.stringify([
      "group-variant",
      this.projectId,
      this.segment.id,
      this.locale,
      variantId,
    ]);
  }

  get allUnlocked() {
    return this.variants.flatMap((variant) => variant.unlocked);
  }
  get focusedVariant() {
    return this.variants.find((variant) => variant.id === this.focusedVariantId) ?? null;
  }
  /** Where text from the details panel lands: the focused translation, else the first editable one. */
  get targetVariant() {
    const focused = this.focusedVariant;
    if (focused?.canEdit) return focused;
    return this.variants.find((variant) => variant.canEdit) ?? null;
  }
  get canApplyTextToAll() {
    return (
      this.canEdit &&
      this.allUnlocked.length > 0 &&
      !this.isApplyingToAll &&
      !this.variants.some((variant) => variant.pending)
    );
  }

  setPorts(ports: ContentEditorGroupVariantsPorts) {
    this.ports = ports;
    this.canEdit = ports.canEdit;
  }

  /** Reconciles with the server's variants, keeping drafts and checks of unchanged ones. */
  sync(variants: CatGroupVariant[]) {
    const existing = new Map(this.variants.map((variant) => [variant.id, variant]));
    const next = variants.map((variant) => {
      const id = groupVariantIdentity(variant);
      const current = existing.get(id);
      existing.delete(id);
      if (current) {
        current.update(variant);
        return current;
      }
      return new ContentEditorGroupVariant(this, variant);
    });
    for (const removed of existing.values()) removed.release();
    this.variants = next;
    if (this.focusedVariantId && !next.some((variant) => variant.id === this.focusedVariantId)) {
      this.focusedVariantId = null;
    }
  }

  /** Creates drafts (refreshing clean ones from the server text) and checks every variant. */
  attach() {
    for (const variant of this.variants) {
      this.drafts.get(variant.draftKey, variant.variant.text);
      variant.scheduleChecks(0);
    }
  }

  release() {
    for (const variant of this.variants) variant.release();
  }

  focus(variantId: string) {
    this.focusedVariantId = variantId;
  }

  getVariant(variantId: string) {
    return this.variants.find((variant) => variant.id === variantId) ?? null;
  }

  /** Puts text into a translation's draft without saving it. Returns false when nothing could take it. */
  useTextIn(variantId: string, text: string) {
    const variant = this.getVariant(variantId);
    if (!variant?.canEdit || variant.pending) return false;
    variant.change(text);
    this.focusedVariantId = variant.id;
    return true;
  }

  useText(text: string) {
    const target = this.targetVariant;
    if (!target) return false;
    if (this.useTextIn(target.id, text)) {
      this.heldTextByVariant.delete(target.id);
      return true;
    }
    if (target.pending) {
      this.heldTextByVariant.set(target.id, text);
      this.focusedVariantId = target.id;
      return true;
    }
    return false;
  }

  /** Applies text that arrived while a specific translation was busy. */
  flushHeldText() {
    if (this.heldTextByVariant.size === 0) return;
    const held = [...this.heldTextByVariant];
    this.heldTextByVariant.clear();
    for (const [variantId, text] of held) {
      if (this.useTextIn(variantId, text)) continue;
      const target = this.getVariant(variantId);
      if (target?.pending) this.heldTextByVariant.set(variantId, text);
    }
  }

  async applyTextToAll(text: string) {
    const { saveVariant, saveFailedMessage } = this.ports;
    if (!saveVariant || !text.trim() || !this.canApplyTextToAll) return;
    const occurrences = this.allUnlocked;
    this.isApplyingToAll = true;
    this.applyError = null;
    try {
      await saveVariant({
        segment: this.segment,
        locale: this.locale,
        occurrences,
        text,
        approve: false,
      });
      runInAction(() => {
        this.reconcileUnlockedDrafts(text);
      });
    } catch (error) {
      runInAction(() => {
        this.applyError = errorMessage(error, saveFailedMessage);
      });
    } finally {
      runInAction(() => {
        this.isApplyingToAll = false;
      });
      this.flushHeldText();
    }
  }

  /** After a write that covered every unlocked occurrence, drop leftover dirty drafts. */
  reconcileUnlockedDrafts(text: string, except?: ContentEditorGroupVariant) {
    for (const variant of this.variants) {
      if (variant === except || variant.unlocked.length === 0) continue;
      const draft = variant.draft ?? this.drafts.get(variant.draftKey, variant.variant.text);
      draft.accept(text);
    }
  }
}

function registryKey(segmentId: string, locale: string) {
  return JSON.stringify([segmentId, locale]);
}

/**
 * Mounted variant groups, so workspace actions such as "Use" on a translation memory match
 * reach the translation the user is editing instead of the row's single target.
 */
export class ContentEditorGroupVariantsRegistry {
  private readonly groups = observable.map<string, ContentEditorGroupVariants>([], {
    deep: false,
  });
  private readonly expected = observable.set<string>();
  private readonly heldText = observable.map<string, string>();
  services: ContentEditorGroupVariantsServices = {};

  constructor() {
    makeAutoObservable(this, { services: false }, { autoBind: true });
  }

  setServices(services: ContentEditorGroupVariantsServices) {
    this.services = services;
  }

  /** The single-target editor is hidden while this row's variant editors load or stay mounted. */
  expect(segmentId: string, locale: string) {
    const key = registryKey(segmentId, locale);
    this.expected.add(key);
    return () => {
      this.expected.delete(key);
    };
  }

  takeHeldText(segmentId: string, locale: string) {
    const key = registryKey(segmentId, locale);
    const text = this.heldText.get(key);
    this.heldText.delete(key);
    return text;
  }

  dropHeld(segmentId: string, locale: string) {
    this.heldText.delete(registryKey(segmentId, locale));
  }

  /**
   * Puts text in the translation being edited. Returns true when the single-target draft
   * must not receive it: a group is mounted, or variant editors are expected and the text
   * is held until they register.
   */
  routeText(segmentId: string, locale: string, text: string) {
    const key = registryKey(segmentId, locale);
    const group = this.groups.get(key);
    if (group) {
      group.useText(text);
      return true;
    }
    if (this.expected.has(key)) {
      this.heldText.set(key, text);
      return true;
    }
    return false;
  }

  register(group: ContentEditorGroupVariants) {
    const key = registryKey(group.segment.id, group.locale);
    this.groups.set(key, group);
    const held = this.heldText.get(key);
    if (held) {
      this.heldText.delete(key);
      group.useText(held);
    }
    return () => {
      if (this.groups.get(key) === group) this.unregister(key);
    };
  }

  private unregister(key: string) {
    this.groups.delete(key);
  }

  get(segmentId: string, locale: string) {
    return this.groups.get(registryKey(segmentId, locale)) ?? null;
  }
}
