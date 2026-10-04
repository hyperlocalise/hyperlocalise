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
// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { CatGroupVariant } from "@/lib/go-svc/go-svc-cat-groups.types";
import type {
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";
import { contentEditorIntelligenceFixture } from "../shared/content-editor.fixture";
import { renderWithContentEditorProviders } from "../shared/content-editor-test-utils";
import { ContentEditorGroupingProvider } from "./content-editor-grouping-context";
import { ContentEditorGroupVariantsGate } from "./content-editor-group-variants";

afterEach(cleanup);

const segment = {
  id: "k1",
  key: "member.a",
  sourceText: "Member",
  targetLocale: "fr",
  occurrenceCount: 3,
  divergentLocales: ["fr"],
} as ContentEditorSegment;

function setup(
  variants: CatGroupVariant[],
  overrides: Partial<ContentEditorSegment> = {},
  intelligence?: Partial<ContentEditorSegmentIntelligence>,
) {
  const groupVariants = vi.fn().mockResolvedValue({ variants });
  const saveVariant = vi.fn().mockResolvedValue(undefined);
  const client = { cat: { groupVariants } } as unknown as GoSvcClient;
  renderWithContentEditorProviders(
    <ContentEditorGroupingProvider
      value={{
        view: "grouped",
        preference: null,
        changeView: vi.fn(),
        client,
        organizationSlug: "acme",
        projectId: "p1",
        sourcePath: "*",
        canEdit: true,
        saveVariant,
      }}
    >
      <ContentEditorGroupVariantsGate
        segment={{ ...segment, ...overrides }}
        locale="fr"
        ai={
          intelligence
            ? {
                intelligence: { ...contentEditorIntelligenceFixture, ...intelligence },
                isLoading: false,
              }
            : undefined
        }
      >
        <p>Single target</p>
      </ContentEditorGroupVariantsGate>
    </ContentEditorGroupingProvider>,
  );
  return { groupVariants, saveVariant, user: userEvent.setup() };
}

const occurrence = (id: string, isLocked = false) => ({
  id,
  key: `member.${id}`,
  sourcePath: "a.json",
  isLocked,
});

const divergentVariants: CatGroupVariant[] = [
  { text: "Membre", isApproved: true, occurrences: [occurrence("k1"), occurrence("k3", true)] },
  { text: "Adhérent", isApproved: false, occurrences: [occurrence("k2")] },
];

function variantEditors() {
  return [...document.querySelectorAll<HTMLElement>('[contenteditable="true"]')];
}

describe("ContentEditorGroupVariantsGate", () => {
  it("keeps the normal target input without fetching when copies agree", () => {
    const { groupVariants } = setup([], { divergentLocales: ["de"] });
    expect(screen.getByText("Single target")).toBeInTheDocument();
    expect(groupVariants).not.toHaveBeenCalled();
  });

  it("does not fetch variants for a row with one occurrence", () => {
    const { groupVariants } = setup([], { occurrenceCount: 1 });
    expect(screen.getByText("Single target")).toBeInTheDocument();
    expect(groupVariants).not.toHaveBeenCalled();
  });

  it("falls back to the normal input when the queue summary is stale", async () => {
    const { groupVariants } = setup([
      { text: "Membre", isApproved: true, occurrences: [occurrence("k1"), occurrence("k2")] },
    ]);
    expect(await screen.findByText("Single target")).toBeInTheDocument();
    expect(groupVariants).toHaveBeenCalledWith(
      "acme",
      "p1",
      "k1",
      { targetLocale: "fr", sourcePath: "*", groupSourcePath: "*" },
      expect.anything(),
    );
  });

  it("shows one editor per translation and saves only that variant's unlocked strings", async () => {
    const { saveVariant, user } = setup(divergentVariants);
    expect(await screen.findByText("2 different translations")).toBeInTheDocument();
    expect(screen.queryByText("Single target")).not.toBeInTheDocument();
    expect(variantEditors().map((editor) => editor.textContent)).toEqual(["Membre", "Adhérent"]);

    const second = screen.getByRole("group", { name: "1 occurrence" });
    expect(within(second).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(second).getByRole("button", { name: "Copy source" })).toBeInTheDocument();
    await user.click(within(second).getByRole("button", { name: /^Approve/ }));
    expect(saveVariant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locale: "fr",
        text: "Adhérent",
        approve: true,
        occurrences: [occurrence("k2")],
      }),
    );

    const first = screen.getByRole("group", { name: "2 occurrences" });
    await user.click(within(first).getByRole("button", { name: "Apply to all" }));
    expect(saveVariant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Membre",
        occurrences: [occurrence("k1"), occurrence("k2")],
      }),
    );
  });

  it("approves the translation being edited with Ctrl+Enter", async () => {
    const { saveVariant, user } = setup(divergentVariants);
    await screen.findByText("2 different translations");

    await user.click(variantEditors()[1]!);
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(saveVariant).toHaveBeenCalledTimes(1);
    expect(saveVariant).toHaveBeenLastCalledWith(
      expect.objectContaining({ approve: true, occurrences: [occurrence("k2")] }),
    );
  });

  it("offers the AI recommendation once for all translations", async () => {
    const { saveVariant, user } = setup(divergentVariants, {}, { aiSuggestion: "Membre" });
    await screen.findByText("2 different translations");

    const recommendation = screen.getByText("AI recommendation").closest("aside") as HTMLElement;
    await user.click(within(recommendation).getByRole("button", { name: "Apply to all" }));
    expect(saveVariant).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: "Membre",
        approve: false,
        occurrences: [occurrence("k1"), occurrence("k2")],
      }),
    );

    await user.click(within(recommendation).getByRole("button", { name: /Use in/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Adhérent · 1 occurrence/ }));
    await waitFor(() =>
      expect(variantEditors().map((editor) => editor.textContent)).toEqual(["Membre", "Membre"]),
    );
  });
});
