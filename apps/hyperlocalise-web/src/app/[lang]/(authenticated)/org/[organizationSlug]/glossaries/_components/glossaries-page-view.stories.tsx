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
import { expect, fn, within } from "storybook/test";

import {
  createEmptyGlossaryFormFixture,
  createGlossaryListRow,
  glossariesFixture,
} from "./glossaries.fixture";
import { GlossariesPageView } from "./glossaries-page-view";

const meta = {
  title: "App/Glossaries/Page",
  component: GlossariesPageView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    nativeGlossaries: glossariesFixture.filter((glossary) => glossary.source === "native"),
    externalGlossaries: glossariesFixture.filter((glossary) => glossary.source === "external_tms"),
    glossaryTotal: glossariesFixture.length,
    nativeTotal: 2,
    externalTotal: 2,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    allowCreateGlossaries: true,
    hasConnectedProvider: true,
    useLiveProviderGlossaries: false,
    useLiveCrowdinGlossaries: false,
    selectedExternalProjectId: "",
    onSelectedExternalProjectIdChange: fn(),
    searchQuery: "",
    onSearchQueryChange: fn(),
    hasActiveFilters: false,
    activeFilterCount: 0,
    onClearFilters: fn(),
    page: 1,
    totalPages: 1,
    pageStart: 1,
    pageEnd: glossariesFixture.length,
    onPageChange: fn(),
    crowdinPage: 1,
    crowdinHasMore: false,
    onCrowdinPageChange: fn(),
    crowdinOrderBy: "createdAt desc,name",
    onCrowdinOrderByChange: fn(),
    createDialogOpen: false,
    onCreateDialogOpenChange: fn(),
    createForm: createEmptyGlossaryFormFixture(),
    onCreateFormChange: fn(),
    projects: [],
    createErrors: {},
    isCreating: false,
    onSubmitCreateGlossary: fn(),
  },
} satisfies Meta<typeof GlossariesPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Glossaries" })).toBeInTheDocument();
    await expect(canvas.getByText("Product UI")).toBeInTheDocument();
    await expect(canvas.getByText("Org")).toBeInTheDocument();
    await expect(canvas.getByText("Product team terms")).toBeInTheDocument();
    await expect(canvas.getByText("Team")).toBeInTheDocument();
    await expect(canvas.getAllByText("English (United States)").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Vietnamese (Vietnam)")).toBeInTheDocument();
    await expect(canvas.getByText("Phrase Term Base")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin Glossary")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Phrase Term Base" })).toHaveAttribute(
      "href",
      "/org/acme/glossaries/22222222-2222-4222-8222-222222222222",
    );
    const providerLink = canvas.getByText("Open in provider").closest("a");
    await expect(providerLink).toHaveAttribute("href", "https://phrase.com/tb/42");
  },
};

export const LiveProviderGlossary: Story = {
  args: {
    nativeGlossaries: [],
    externalGlossaries: [
      createGlossaryListRow({
        id: "crowdin:glossary:99",
        detailId: "crowdin:glossary:99",
        name: "Live Crowdin Glossary",
        source: "external_tms",
        externalProviderKind: "crowdin",
        externalProjectId: "crowdin-project-1",
        externalGlossaryId: "99",
        externalUrl: null,
        projectLinkId: "crowdin-project-link-1",
        isLiveApi: true,
        providerLogoSrc: "/images/tms/crowdin.png",
        resourceTypeLabel: "Glossary",
        controlLevel: "org",
      }),
    ],
    glossaryTotal: 1,
    nativeTotal: 0,
    externalTotal: 1,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    allowCreateGlossaries: true,
    useLiveProviderGlossaries: true,
    useLiveCrowdinGlossaries: true,
    pageEnd: 1,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Live Crowdin Glossary")).toBeInTheDocument();
    await expect(canvas.getByText("Live API")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Live Crowdin Glossary" })).toHaveAttribute(
      "href",
      "/org/acme/glossaries/crowdin:glossary:99",
    );
    await expect(canvas.queryByRole("link", { name: "Open in provider" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create glossary" })).toBeInTheDocument();
    await expect(canvas.getByText("TMS project")).toBeInTheDocument();
    await expect(canvas.getByText("Sort")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "More glossary actions" })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    nativeGlossaries: [],
    externalGlossaries: [],
    glossaryTotal: 0,
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: { isLoading: true, isError: false, isSuccess: false, error: null },
    externalQuery: { isLoading: true, isError: false, isSuccess: false, error: null },
    pageStart: 0,
    pageEnd: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading glossaries...")).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    nativeGlossaries: [],
    externalGlossaries: [],
    glossaryTotal: 0,
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    pageStart: 0,
    pageEnd: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Build your terminology library")).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Create a workspace glossary for approved terms, or connect a provider to bring in an existing term base.",
      ),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Create glossary" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Open integrations" })).toBeInTheDocument();
    await expect(canvas.getByRole("heading", { name: "Glossaries" })).toBeInTheDocument();
  },
};

export const NoProviderConnected: Story = {
  args: {
    nativeGlossaries: [],
    externalGlossaries: [],
    glossaryTotal: 0,
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    allowCreateGlossaries: false,
    hasConnectedProvider: false,
    pageStart: 0,
    pageEnd: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Connect a TMS provider")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Connect a provider" })).toBeInTheDocument();
  },
};

export const ReadOnly: Story = {
  args: {
    allowCreateGlossaries: false,
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Create glossary" })).not.toBeInTheDocument();
  },
};

const createDialogProjects = [
  { id: "project-native-1", name: "Product app", sourceLocale: "en-US" },
  { id: "project-native-2", name: "Marketing site", sourceLocale: "en-US" },
];

export const CreateDialogOpen: Story = {
  args: {
    createDialogOpen: true,
    projects: createDialogProjects,
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByRole("dialog", { name: "Create glossary" })).toBeInTheDocument();
    await expect(body.queryByRole("combobox", { name: "Control" })).not.toBeInTheDocument();
    await expect(
      body.getByText("Optional. You can attach projects from the glossary detail page later."),
    ).toBeInTheDocument();
    await userEvent.click(
      body.getByRole("button", { name: "Assign glossary to the following projects:" }),
    );
    await expect(body.getByText("Product app")).toBeInTheDocument();
    await expect(body.getByText("Marketing site")).toBeInTheDocument();
  },
};

export const LoadError: Story = {
  args: {
    nativeGlossaries: [],
    externalGlossaries: [],
    glossaryTotal: 0,
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: {
      isLoading: false,
      isError: true,
      isSuccess: false,
      error: new Error("The native glossaries API returned a 500."),
    },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    pageStart: 0,
    pageEnd: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Glossaries failed to load.")).toBeInTheDocument();
  },
};

export const LiveAllProjects: Story = {
  args: {
    nativeGlossaries: [],
    externalGlossaries: [],
    glossaryTotal: 0,
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    useLiveProviderGlossaries: false,
    useLiveCrowdinGlossaries: true,
    allowCreateGlossaries: false,
    pageStart: 0,
    pageEnd: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Native glossaries")).toBeInTheDocument();
    await expect(canvas.getByText("Crowdin glossaries")).toBeInTheDocument();
  },
};

export const NoSearchMatches: Story = {
  args: {
    nativeGlossaries: [],
    externalGlossaries: [],
    glossaryTotal: 0,
    nativeTotal: 0,
    externalTotal: 0,
    nativeQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    externalQuery: { isLoading: false, isError: false, isSuccess: true, error: null },
    hasActiveFilters: true,
    activeFilterCount: 1,
    searchQuery: "missing glossary",
    pageStart: 0,
    pageEnd: 0,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No glossaries match your search.")).toBeInTheDocument();
  },
};
