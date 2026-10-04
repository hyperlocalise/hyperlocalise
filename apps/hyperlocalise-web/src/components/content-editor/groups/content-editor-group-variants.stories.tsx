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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import type { CatGroupVariant } from "@/lib/go-svc/go-svc-cat-groups.types";
import { contentEditorIntelligenceFixture } from "@/components/content-editor/shared/content-editor.fixture";
import type { ContentEditorSegment } from "@/components/content-editor/shared/types";

import { ContentEditorGroupVariantsGate } from "./content-editor-group-variants";
import { ContentEditorGroupingProvider } from "./content-editor-grouping-context";

const segment = {
  id: "k1",
  key: "nav.join",
  sourceText: "Join the club",
  targetLocale: "fr-FR",
  occurrenceCount: 3,
  divergentLocales: ["fr-FR"],
} as ContentEditorSegment;

const occurrence = (id: string, key: string) => ({
  id,
  key,
  sourcePath: "locales/en/common.json",
  isLocked: false,
});

const variants: CatGroupVariant[] = [
  {
    text: "Rejoignez le club",
    isApproved: true,
    occurrences: [occurrence("k1", "nav.join")],
  },
  {
    text: "",
    isApproved: false,
    occurrences: [occurrence("k2", "footer.join"), occurrence("k3", "pricing.cta.join")],
  },
];

function GroupVariantsStory({ aiSuggestion }: { aiSuggestion: string }) {
  const client = {
    cat: { groupVariants: fn().mockResolvedValue({ variants }) },
  } as unknown as GoSvcClient;

  return (
    <ContentEditorGroupingProvider
      value={{
        view: "grouped",
        preference: null,
        changeView: fn(),
        client,
        organizationSlug: "acme",
        projectId: "p1",
        sourcePath: "*",
        canEdit: true,
        saveVariant: fn().mockResolvedValue(undefined),
      }}
    >
      <div className="w-[26rem] p-4">
        <ContentEditorGroupVariantsGate
          segment={segment}
          locale="fr-FR"
          ai={{
            intelligence: { ...contentEditorIntelligenceFixture, aiSuggestion },
            isLoading: false,
            onGenerateAiRecommendation: fn(),
          }}
        >
          {null}
        </ContentEditorGroupVariantsGate>
      </div>
    </ContentEditorGroupingProvider>
  );
}

const meta = {
  title: "CAT/Group variants",
  component: GroupVariantsStory,
  args: { aiSuggestion: "" },
} satisfies Meta<typeof GroupVariantsStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("2 different translations")).toBeInTheDocument();
    await expect(canvas.queryByRole("complementary")).toBeNull();
  },
};

export const WithAiSuggestion: Story = {
  args: { aiSuggestion: "Rejoignez le club" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("complementary", { name: "AI recommendation" }),
    ).toBeInTheDocument();
  },
};
