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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DomainResearchShell } from "./domain-research-shell";
import type { DomainResearchNavId } from "@/lib/domains/research-prototype";
import { DomainOverviewView } from "./domain-overview-view";
import { DomainKeywordsView } from "./domain-keywords-view";
import { DomainRanksView } from "./domain-ranks-view";
import { DomainBrandView } from "./domain-brand-view";
import { DomainPromptsView } from "./domain-prompts-view";
function DomainResearchPage({
  surface,
  linkedDomainId,
}: {
  surface: DomainResearchNavId;
  linkedDomainId: string;
}) {
  const organizationSlug = "domains-preview";
  const views = {
    overview: (
      <DomainOverviewView linkedDomainId={linkedDomainId} organizationSlug={organizationSlug} />
    ),
    keywords: (
      <DomainKeywordsView linkedDomainId={linkedDomainId} organizationSlug={organizationSlug} />
    ),
    ranks: <DomainRanksView linkedDomainId={linkedDomainId} organizationSlug={organizationSlug} />,
    brand: <DomainBrandView linkedDomainId={linkedDomainId} />,
    prompts: <DomainPromptsView linkedDomainId={linkedDomainId} />,
  };
  return (
    <DomainResearchShell
      organizationSlug={organizationSlug}
      linkedDomainId={linkedDomainId}
      surface={surface}
    >
      {views[surface]}
    </DomainResearchShell>
  );
}
const meta = {
  title: "App/Domains/Research",
  component: DomainResearchPage,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: { pathname: "/en/org/domains-preview/domains/hyperlocalise-com" },
    },
  },
  args: { surface: "overview", linkedDomainId: "hyperlocalise-com" },
  argTypes: {
    surface: {
      control: "select",
      options: ["overview", "keywords", "ranks", "brand", "prompts"],
    },
    linkedDomainId: {
      control: "select",
      options: ["hyperlocalise-com", "acme-jp", "docs-acme-com", "help-acme-com", "missing"],
    },
  },
} satisfies Meta<typeof DomainResearchPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = { args: { surface: "overview" } };
export const Keywords: Story = { args: { surface: "keywords" } };
export const Ranks: Story = { args: { surface: "ranks" } };
export const Brand: Story = { args: { surface: "brand" } };
export const Prompts: Story = { args: { surface: "prompts" } };
export const EmptyRanks: Story = { args: { surface: "ranks", linkedDomainId: "docs-acme-com" } };
export const PendingVerification: Story = {
  args: { surface: "keywords", linkedDomainId: "help-acme-com" },
};
export const MissingDomain: Story = { args: { linkedDomainId: "missing" } };
export const JapaneseMarket: Story = { args: { surface: "keywords", linkedDomainId: "acme-jp" } };

export const MissingHistory: Story = {
  args: { surface: "overview", linkedDomainId: "docs-acme-com" },
};

export const LocaleWithoutResearch: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/en/org/domains-preview/domains/hyperlocalise-com/overview",
        query: { locale: "germany-de" },
      },
    },
  },
};
