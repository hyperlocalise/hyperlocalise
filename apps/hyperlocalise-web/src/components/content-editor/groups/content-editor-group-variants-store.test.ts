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
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

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

  it("surfaces save failures on the translation that failed", async () => {
    const saveVariant = vi.fn().mockRejectedValue(new Error(""));
    const { group } = createGroup({ saveVariant });
    const second = group.variants[1]!;

    await second.approve();

    expect(second.displayError).toBe("Could not save the translation.");
    expect(group.variants[0]!.displayError).toBeNull();
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
    expect(validateFormat).toHaveBeenLastCalledWith(segment, "Membre {name}", undefined, {
      signal: expect.any(AbortSignal),
    });
    expect(first.qaIssues).toEqual([]);
    expect(group.variants[1]!.qaIssues).toHaveLength(1);
    expect(first.isCheckingFormat).toBe(false);
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
});
