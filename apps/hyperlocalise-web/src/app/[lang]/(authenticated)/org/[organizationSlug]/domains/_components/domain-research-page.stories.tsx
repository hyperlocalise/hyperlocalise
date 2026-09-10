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
import { DomainHomeView } from "./domain-home-view";
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
    home: <DomainHomeView organizationSlug={organizationSlug} linkedDomainId={linkedDomainId} />,
    overview: <DomainOverviewView linkedDomainId={linkedDomainId} />,
    keywords: <DomainKeywordsView linkedDomainId={linkedDomainId} />,
    ranks: <DomainRanksView linkedDomainId={linkedDomainId} />,
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
  args: { surface: "home", linkedDomainId: "hyperlocalise-com" },
  argTypes: {
    surface: {
      control: "select",
      options: ["home", "overview", "keywords", "ranks", "brand", "prompts"],
    },
    linkedDomainId: {
      control: "select",
      options: ["hyperlocalise-com", "acme-jp", "docs-acme-com", "help-acme-com", "missing"],
    },
  },
} satisfies Meta<typeof DomainResearchPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Home: Story = { args: { surface: "home" } };
export const HomeDark: Story = { ...Home, globals: { theme: "dark" } };
export const HomeMobile: Story = {
  ...Home,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
export const Overview: Story = { args: { surface: "overview" } };
export const OverviewDark: Story = { ...Overview, globals: { theme: "dark" } };
export const OverviewMobile: Story = {
  ...Overview,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
export const Keywords: Story = { args: { surface: "keywords" } };
export const KeywordsDark: Story = { ...Keywords, globals: { theme: "dark" } };
export const KeywordsMobile: Story = {
  ...Keywords,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
export const Ranks: Story = { args: { surface: "ranks" } };
export const RanksDark: Story = { ...Ranks, globals: { theme: "dark" } };
export const RanksMobile: Story = {
  ...Ranks,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
export const Brand: Story = { args: { surface: "brand" } };
export const BrandDark: Story = { ...Brand, globals: { theme: "dark" } };
export const BrandMobile: Story = {
  ...Brand,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
export const Prompts: Story = { args: { surface: "prompts" } };
export const PromptsDark: Story = { ...Prompts, globals: { theme: "dark" } };
export const PromptsMobile: Story = {
  ...Prompts,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 390 }}>
        <Story />
      </div>
    ),
  ],
};
export const EmptyRanks: Story = { args: { surface: "ranks", linkedDomainId: "docs-acme-com" } };
export const PendingVerification: Story = {
  args: { surface: "keywords", linkedDomainId: "help-acme-com" },
};
export const MissingDomain: Story = { args: { linkedDomainId: "missing" } };
export const JapaneseMarket: Story = { args: { surface: "keywords", linkedDomainId: "acme-jp" } };
