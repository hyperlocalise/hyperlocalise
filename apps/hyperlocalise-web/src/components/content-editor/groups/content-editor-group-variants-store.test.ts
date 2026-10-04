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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { CatGroupVariant } from "@/lib/go-svc/go-svc-cat-groups.types";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
} from "@/components/content-editor/shared/types";

import { MultilingualDrafts } from "../multilingual/content-editor-multilingual-drafts";
import {
  ContentEditorGroupVariants,
  ContentEditorGroupVariantsRegistry,
  type ContentEditorGroupVariantsPorts,
} from "./content-editor-group-variants-store";

const segment = {
  id: "k1",
  key: "member.a",
  sourceText: "Member",
  targetLocale: "fr",
} as ContentEditorSegment;

const occurrence = (id: string, isLocked = false) => ({
  id,
  key: `member.${id}`,
  sourcePath: "a.json",
  isLocked,
});

const variants: CatGroupVariant[] = [
  { text: "Membre", isApproved: true, occurrences: [occurrence("k1"), occurrence("k3", true)] },
  { text: "Adhérent", isApproved: false, occurrences: [occurrence("k2")] },
];

function createGroup(ports: Partial<ContentEditorGroupVariantsPorts> = {}, input = variants) {
  const drafts = new MultilingualDrafts();
  const group = new ContentEditorGroupVariants({
    segment,
    locale: "fr",
    projectId: "p1",
    variants: input,
    drafts,
    ports: {
      canEdit: true,
      saveVariant: vi.fn().mockResolvedValue(undefined),
      saveFailedMessage: "Could not save the translation.",
      ...ports,
    },
  });
  group.attach();
  return { group, drafts };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ContentEditorGroupVariants", () => {
  it("sends text to the focused translation, else the first editable one", () => {
    const { group } = createGroup();
    const [first, second] = group.variants;

    expect(group.useText("Membre actif")).toBe(true);
    expect(first!.text).toBe("Membre actif");
    expect(group.focusedVariantId).toBe(first!.id);

    group.focus(second!.id);
    group.useText("Adhérente");
    expect(second!.text).toBe("Adhérente");
    expect(first!.text).toBe("Membre actif");
  });

  it("skips translations whose strings are all locked", () => {
    const { group } = createGroup({}, [
      { text: "Membre", isApproved: true, occurrences: [occurrence("k1", true)] },
      { text: "Adhérent", isApproved: false, occurrences: [occurrence("k2")] },
    ]);

    group.focus(group.variants[0]!.id);
    group.useText("Membre");

    expect(group.variants[0]!.text).toBe("Membre");
    expect(group.variants[1]!.text).toBe("Membre");
  });

  it("approves only the unlocked strings of one translation", async () => {
    const saveVariant = vi.fn().mockResolvedValue(undefined);
    const { group } = createGroup({ saveVariant });
    const first = group.variants[0]!;

    first.change("Membre actif");
    const approving = first.approve();
    expect(first.pending).toBe(true);
    await approving;

    expect(saveVariant).toHaveBeenCalledWith({
      segment,
      locale: "fr",
      occurrences: [occurrence("k1")],
      text: "Membre actif",
      approve: true,
    });
    expect(first.pending).toBe(false);
    expect(first.savedText).toBe("Membre actif");
  });

  it("applies a suggestion to every unlocked string across translations", async () => {
    const saveVariant = vi.fn().mockResolvedValue(undefined);
    const { group } = createGroup({ saveVariant });

    await group.applyTextToAll("Membre");

    expect(saveVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Membre",
        approve: false,
        occurrences: [occurrence("k1"), occurrence("k2")],
      }),
    );
    expect(group.isApplyingToAll).toBe(false);
  });

  it("reconciles dirty drafts after applying a suggestion to every unlocked string", async () => {
    const { group, drafts } = createGroup();
    const [first, second] = group.variants;
    first!.change("Membre actif");
    second!.change("Adhérente");

    await group.applyTextToAll("Membre");

    expect(first!.text).toBe("Membre");
    expect(second!.text).toBe("Membre");
    expect(first!.draft?.dirty).toBe(false);
    expect(second!.draft?.dirty).toBe(false);

    group.sync([
      {
        text: "Membre",
        isApproved: false,
        occurrences: [occurrence("k1"), occurrence("k2"), occurrence("k3", true)],
      },
    ]);
    expect(drafts.dirty).toBe(false);
  });

  it("locks every translation editor while applying to all", async () => {
    let finish!: () => void;
    const saveVariant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { group } = createGroup({ saveVariant });
    const [first, second] = group.variants;

    const applying = group.applyTextToAll("Membre");
    expect(first!.pending).toBe(true);
    expect(second!.pending).toBe(true);
    second!.change("Adhérente");
    expect(second!.text).toBe("Adhérent");

    finish();
    await applying;
    expect(second!.text).toBe("Membre");
    expect(second!.pending).toBe(false);
  });

  it("locks other translation editors while one translation is applied to all", async () => {
    let finish!: () => void;
    const saveVariant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { group } = createGroup({ saveVariant });
    const [first, second] = group.variants;

    const applying = first!.applyToAll();
    expect(second!.pending).toBe(true);
    second!.change("Adhérente");
    expect(second!.text).toBe("Adhérent");

    finish();
    await applying;
    expect(second!.text).toBe("Membre");
    expect(second!.pending).toBe(false);
  });

  it("reconciles other dirty drafts when one translation is applied to all", async () => {
    const { group, drafts } = createGroup();
    const [first, second] = group.variants;
    second!.change("Adhérente");

    await first!.applyToAll();

    expect(second!.text).toBe("Membre");
    expect(second!.draft?.dirty).toBe(false);
    expect(drafts.dirty).toBe(false);
  });

  it("surfaces save failures on the translation that failed", async () => {
    const saveVariant = vi.fn().mockRejectedValue(new Error(""));
    const { group } = createGroup({ saveVariant });
    const second = group.variants[1]!;

    await second.approve();

    expect(second.displayError).toBe("Could not save the translation.");
    expect(group.variants[0]!.displayError).toBeNull();
  });

  it("surfaces a fallback when a dirty draft save fails without a message", async () => {
    const saveVariant = vi.fn().mockRejectedValue(new Error(""));
    const { group } = createGroup({ saveVariant });
    const second = group.variants[1]!;

    second.change("Adhérente");
    await second.approve();

    expect(second.displayError).toBe("Could not save the translation.");
    expect(second.draft?.dirty).toBe(true);
  });

  it("keeps unsaved drafts and drops stale translations when the server list changes", () => {
    const { group } = createGroup();
    const [first, second] = group.variants;
    first!.change("Membre actif");
    group.focus(second!.id);

    group.sync([{ ...variants[0]!, text: "Membre!" }]);
    group.attach();

    expect(group.variants).toEqual([first]);
    expect(first!.text).toBe("Membre actif");
    expect(group.focusedVariantId).toBeNull();
  });

  it("checks each translation's own text after edits settle", async () => {
    vi.useFakeTimers();
    const validateFormat = vi.fn(async (_segment: ContentEditorSegment, value: string) =>
      value.includes("{name}")
        ? []
        : [{ id: "placeholder", label: "Placeholders", status: "fail" as const, message: "" }],
    );
    const { group } = createGroup({ services: { validateFormat } });
    await vi.runAllTimersAsync();
    expect(validateFormat).toHaveBeenCalledTimes(2);

    const first = group.variants[0]!;
    first.change("Membre {name");
    first.change("Membre {name}");
    expect(first.isCheckingFormat).toBe(true);
    await vi.runAllTimersAsync();

    expect(validateFormat).toHaveBeenCalledTimes(3);
    expect(validateFormat).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: segment.id, sourcePath: "a.json" }),
      "Membre {name}",
      undefined,
      {
        signal: expect.any(AbortSignal),
      },
    );
    expect(first.qaIssues).toEqual([]);
    expect(group.variants[1]!.qaIssues).toHaveLength(1);
    expect(first.isCheckingFormat).toBe(false);
  });

  it("does not apply an in-flight format check after a later edit is scheduled", async () => {
    vi.useFakeTimers();
    const deferred: Array<(checks: ContentEditorFormatCheck[]) => void> = [];
    const validateFormat = vi.fn(
      () =>
        new Promise<ContentEditorFormatCheck[]>((resolve) => {
          deferred.push(resolve);
        }),
    );
    const { group } = createGroup({ services: { validateFormat } });
    await vi.runAllTimersAsync();
    expect(deferred).toHaveLength(2);
    deferred.shift()!([]);
    deferred.shift()!([]);
    await Promise.resolve();

    const first = group.variants[0]!;
    first.change("Membre {name");
    await vi.advanceTimersByTimeAsync(300);
    expect(deferred).toHaveLength(1);
    const stale = deferred.shift()!;

    first.change("Membre {name}");
    stale([{ id: "placeholder", label: "Placeholders", status: "fail", message: "stale" }]);
    await Promise.resolve();
    expect(first.qaIssues).toEqual([]);

    await vi.advanceTimersByTimeAsync(300);
    expect(deferred).toHaveLength(1);
    deferred.shift()!([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(first.qaIssues).toEqual([]);
    expect(first.isCheckingFormat).toBe(false);
  });

  it("validates each distinct occurrence path and length limit", async () => {
    vi.useFakeTimers();
    const validateFormat = vi.fn(async (checked: ContentEditorSegment) => [
      {
        id: "length",
        label: checked.maxLength === 5 ? "Too long" : "Length",
        status: checked.maxLength === 5 ? ("fail" as const) : ("pass" as const),
        message: checked.sourcePath ?? "",
      },
    ]);
    const { group } = createGroup({ services: { validateFormat } }, [
      {
        text: "Membre",
        isApproved: true,
        occurrences: [
          { ...occurrence("k1"), sourcePath: "a.json", maxLength: 20 },
          { ...occurrence("k2"), sourcePath: "b.po", maxLength: 5 },
        ],
      },
    ]);
    await vi.runAllTimersAsync();

    expect(validateFormat).toHaveBeenCalledTimes(2);
    expect(validateFormat).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: "a.json", maxLength: 20 }),
      "Membre",
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(validateFormat).toHaveBeenCalledWith(
      expect.objectContaining({ sourcePath: "b.po", maxLength: 5 }),
      "Membre",
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(group.variants[0]!.qaIssues).toEqual([
      expect.objectContaining({ id: "length", status: "fail", label: "Too long" }),
    ]);
    expect(group.variants[0]!.editorMaxLength).toBe(5);
  });

  it("does not inherit the grouped row's length limit when a variant has none", () => {
    const drafts = new MultilingualDrafts();
    const group = new ContentEditorGroupVariants({
      segment: { ...segment, maxLength: 8 },
      locale: "fr",
      projectId: "p1",
      variants: [{ text: "Adhérent", isApproved: false, occurrences: [occurrence("k2")] }],
      drafts,
      ports: { canEdit: true, saveFailedMessage: "Could not save the translation." },
    });

    expect(group.variants[0]!.editorMaxLength).toBeUndefined();
  });
});

describe("ContentEditorGroupVariantsRegistry", () => {
  it("finds a mounted group by row and locale until it unregisters", () => {
    const registry = new ContentEditorGroupVariantsRegistry();
    const { group } = createGroup();

    const unregister = registry.register(group);
    expect(registry.get("k1", "fr")).toBe(group);
    expect(registry.get("k1", "de")).toBeNull();

    unregister();
    expect(registry.get("k1", "fr")).toBeNull();
  });

  it("holds routed text until the group registers", () => {
    const registry = new ContentEditorGroupVariantsRegistry();
    const { group } = createGroup();

    registry.expect("k1", "fr");
    expect(registry.routeText("k1", "fr", "Membre actif")).toBe(true);
    expect(group.variants[0]!.text).toBe("Membre");

    registry.register(group);
    expect(group.variants[0]!.text).toBe("Membre actif");
    expect(group.focusedVariantId).toBe(group.variants[0]!.id);
  });

  it("does not leave routed text for the single-target draft once a group is mounted", () => {
    const registry = new ContentEditorGroupVariantsRegistry();
    const { group } = createGroup();
    group.variants[0]!.pendingAction = "save";
    group.variants[1]!.pendingAction = "save";
    registry.register(group);

    expect(registry.routeText("k1", "fr", "Membre actif")).toBe(true);
    expect(group.variants[0]!.text).toBe("Membre");
    expect(group.variants[1]!.text).toBe("Adhérent");
  });

  it("holds a match until the busy translation can take it", async () => {
    let finish!: () => void;
    const saveVariant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { group } = createGroup({ saveVariant });
    const first = group.variants[0]!;
    first.change("Membre actif");
    const saving = first.approve();
    const registry = new ContentEditorGroupVariantsRegistry();
    registry.register(group);

    expect(registry.routeText("k1", "fr", "Membre retenu")).toBe(true);
    expect(first.text).toBe("Membre actif");

    finish();
    await saving;
    expect(first.text).toBe("Membre retenu");
  });

  it("applies a held match to the translation it was chosen for after focus changes", async () => {
    let finish!: () => void;
    const saveVariant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { group } = createGroup({ saveVariant });
    const [first, second] = group.variants;
    first!.change("Membre actif");
    const saving = first!.approve();
    const registry = new ContentEditorGroupVariantsRegistry();
    registry.register(group);

    expect(registry.routeText("k1", "fr", "Membre retenu")).toBe(true);
    group.focus(second!.id);

    finish();
    await saving;
    expect(first!.text).toBe("Membre retenu");
    expect(second!.text).toBe("Adhérent");
  });

  it("holds text that arrives before registration while the target is still saving", async () => {
    let finish!: () => void;
    const saveVariant = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { group } = createGroup({ saveVariant });
    const first = group.variants[0]!;
    first.change("Membre actif");
    const saving = first.approve();
    const registry = new ContentEditorGroupVariantsRegistry();
    registry.expect("k1", "fr");
    expect(registry.routeText("k1", "fr", "Membre retenu")).toBe(true);

    registry.register(group);
    expect(first.text).toBe("Membre actif");

    finish();
    await saving;
    expect(first.text).toBe("Membre retenu");
  });
});
