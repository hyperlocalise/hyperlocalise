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
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import type { GlossaryConceptRecord, GlossaryRecord } from "@/api/routes/glossary/glossary.schema";

import { createGlossaryDetailMswHandlers } from "./glossary-detail-page-content-msw-handlers";
import { GlossaryDetailPageContent } from "./glossary-detail-page-content";

const fixedNow = "2026-08-19T12:00:00.000Z";
const glossaryId = "glossary-1";
const conceptId = "concept-1";

const glossaryFixture: GlossaryRecord = {
  id: glossaryId,
  organizationId: "org-1",
  createdByUserId: "user-1",
  name: "Product terminology",
  description: "Shared terminology for product and support content.",
  sourceLocale: "en-US",
  targetLocale: null,
  status: "active",
  source: "native",
  controlLevel: "org",
  externalProviderKind: null,
  externalProjectId: null,
  externalResourceType: null,
  externalGlossaryId: null,
  localeCoverage: ["en-US", "vi-VN"],
  languages: [
    { locale: "en-US", name: "American English", isSource: true },
    { locale: "vi-VN", name: "Vietnamese (Vietnam)", isSource: false },
  ],
  termCount: 2,
  syncState: null,
  termCapabilities: { preferredTerms: true, forbiddenTerms: true },
  externalUrl: null,
  lastSyncedAt: null,
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  createdAt: fixedNow,
  updatedAt: fixedNow,
};

const conceptFixture: GlossaryConceptRecord = {
  id: conceptId,
  glossaryId,
  primaryTerm: "Agency",
  subject: "Accounts",
  definition: "An organization or person authorized to act on behalf of another.",
  translatable: true,
  note: "Use for partner and reseller terminology.",
  url: "https://example.com/terminology/agency",
  createdAt: fixedNow,
  updatedAt: fixedNow,
  terms: [
    {
      id: "term-en-1",
      glossaryId,
      conceptId,
      locale: "en-US",
      term: "Agency",
      isPrimary: true,
      description: "",
      note: "",
      partOfSpeech: "Noun",
      gender: null,
      termType: "full form",
      status: "preferred",
      caseSensitive: false,
      forbidden: false,
      provenance: "native",
      externalKey: null,
      reviewStatus: "approved",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
    {
      id: "term-vi-1",
      glossaryId,
      conceptId,
      locale: "vi-VN",
      term: "Đại lý",
      isPrimary: false,
      description: "",
      note: "",
      partOfSpeech: "Noun",
      gender: null,
      termType: "full form",
      status: "draft",
      caseSensitive: false,
      forbidden: false,
      provenance: "native",
      externalKey: null,
      reviewStatus: "unreviewed",
      createdAt: fixedNow,
      updatedAt: fixedNow,
    },
  ],
};

const conceptsFixture = [conceptFixture];
const onConceptUpdate = fn();
const onTermDelete = fn();

const meta = {
  title: "App/Glossaries/Detail",
  component: GlossaryDetailPageContent,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    glossaryId,
    canManageGlossaries: true,
    canContributeTeamGlossaries: false,
  },
} satisfies Meta<typeof GlossaryDetailPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const detailHandlers = createGlossaryDetailMswHandlers({
  glossary: glossaryFixture,
  concepts: conceptsFixture,
  onConceptUpdate,
  onTermDelete,
});

export const ConceptList: Story = {
  parameters: {
    msw: { handlers: detailHandlers },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Product terminology" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Control" })).toHaveTextContent("Org");
    const nameInput = canvas.getByRole("textbox", { name: "Edit glossary name" });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Canceled terminology");
    await userEvent.keyboard("{Escape}");
    await expect(nameInput).toHaveValue("Product terminology");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated terminology");
    await userEvent.keyboard("{Enter}");
    await expect(
      await canvas.findByRole("heading", { name: "Updated terminology" }),
    ).toBeInTheDocument();
    await expect(await canvas.findByText("Agency")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeInTheDocument();
  },
};

const teamGlossaryFixture: GlossaryRecord = {
  ...glossaryFixture,
  name: "Product team terms",
  controlLevel: "team",
};

const providerGlossaryFixture: GlossaryRecord = {
  ...glossaryFixture,
  name: "Phrase Term Base",
  source: "external_tms",
  controlLevel: "org",
  externalProviderKind: "phrase",
  externalProjectId: "phrase-project-9",
  externalResourceType: "term_base",
  externalGlossaryId: "tb-42",
};

function createListStoryParameters(glossary: GlossaryRecord) {
  return {
    msw: {
      handlers: createGlossaryDetailMswHandlers({
        glossary,
        concepts: conceptsFixture,
      }),
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}`,
      },
    },
  };
}

export const TeamManagerConceptList: Story = {
  parameters: createListStoryParameters(teamGlossaryFixture),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Product team terms" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("combobox", { name: "Control" })).toHaveTextContent("Team");
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeInTheDocument();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Control" }));
    await userEvent.click(await body.findByRole("option", { name: "Org" }));
    await waitFor(() =>
      expect(canvas.getByRole("combobox", { name: "Control" })).toHaveTextContent("Org"),
    );
  },
};

export const TeamTranslatorConceptList: Story = {
  args: {
    canManageGlossaries: false,
    canContributeTeamGlossaries: true,
  },
  parameters: createListStoryParameters(teamGlossaryFixture),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Product team terms" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Team")).toBeInTheDocument();
    await expect(canvas.queryByRole("combobox", { name: "Control" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("textbox", { name: "Edit glossary name" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add concept" })).toBeInTheDocument();
  },
};

export const OrgTranslatorReadOnly: Story = {
  args: {
    canManageGlossaries: false,
    canContributeTeamGlossaries: true,
  },
  parameters: createListStoryParameters(glossaryFixture),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Product terminology" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Org")).toBeInTheDocument();
    await expect(canvas.queryByRole("combobox", { name: "Control" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("textbox", { name: "Edit glossary name" }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add concept" })).not.toBeInTheDocument();
  },
};

export const ProviderReadOnly: Story = {
  args: {
    canManageGlossaries: false,
    canContributeTeamGlossaries: true,
  },
  parameters: createListStoryParameters(providerGlossaryFixture),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Phrase Term Base" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Provider")).toBeInTheDocument();
    await expect(canvas.queryByRole("combobox", { name: "Control" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add concept" })).not.toBeInTheDocument();
  },
};

export const ConceptDetail: Story = {
  args: {
    conceptId,
  },
  parameters: {
    msw: { handlers: detailHandlers },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}/concepts/${conceptId}`,
      },
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const primaryTermInput = canvas.getByRole("textbox", { name: "Primary term" });
    await expect(primaryTermInput).toHaveValue("Agency");
    await expect(primaryTermInput).toHaveAttribute("readonly");
    const sourceTermInput = canvas
      .getAllByDisplayValue("Agency")
      .find((element) => element !== primaryTermInput);
    if (!sourceTermInput) throw new Error("Source term input not found");
    await userEvent.clear(sourceTermInput);
    await userEvent.type(sourceTermInput, "Agency updated");
    await expect(primaryTermInput).toHaveValue("Agency updated");
    await expect(await canvas.findByDisplayValue("Đại lý")).toBeInTheDocument();
    await expect(canvas.getByText("vi-VN")).toBeInTheDocument();
    await expect(canvas.getByText("SOURCE")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[class*="overflow-y-auto"]')).toBeTruthy();
    await expect(canvas.getAllByText("Technical").length).toBeGreaterThan(0);
    await expect(canvas.getByText("Draft")).toBeInTheDocument();
    const addTermButtons = canvas.getAllByRole("button", { name: "Add term" });
    await expect(addTermButtons.length).toBeGreaterThan(0);
    await userEvent.click(addTermButtons[0]!);
    const localeDialog = canvas.getByRole("dialog", { name: "Choose a language" });
    await expect(localeDialog).toBeInTheDocument();
    await expect(localeDialog.querySelector('[class*="max-h-"]')).toBeTruthy();
    await expect(canvas.getByRole("button", { name: /French/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /French/ }));
    await expect(canvas.getByRole("button", { name: "Save" })).toBeDisabled();

    const termInput = canvas.getByDisplayValue("Đại lý");
    const termRow = termInput.closest("tr");
    await expect(termRow?.querySelector(".bg-emerald-500")).toBeNull();
    await userEvent.type(termInput, " updated");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
    await waitFor(() => {
      void expect(termRow?.querySelector(".bg-emerald-500")).toBeTruthy();
    });

    const expandTermButton = termRow?.querySelector<HTMLButtonElement>(
      'button[aria-label="Expand term details"]',
    );
    if (!expandTermButton) throw new Error("Term details button not found");
    await userEvent.click(expandTermButton);
    await userEvent.click(canvas.getByRole("button", { name: "Delete term" }));
    const deleteDialog = canvas.getByRole("dialog", { name: "Delete this term?" });
    await userEvent.click(within(deleteDialog).getByRole("button", { name: "Delete term" }));
    await expect(canvas.queryByDisplayValue("Đại lý updated")).not.toBeInTheDocument();
    await expect(onTermDelete).not.toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
    await expect(onConceptUpdate).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      void expect(onConceptUpdate).toHaveBeenCalledWith(["term-en-1"]);
    });
  },
};

export const ConceptCreationWithTerms: Story = {
  args: {
    conceptId: "new",
  },
  parameters: {
    msw: { handlers: detailHandlers },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}/concepts/new`,
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Add concept" })).toBeInTheDocument();
    const primaryTermInput = canvas.getByRole("textbox", { name: "Primary term" });
    const sourceTermInput = canvas.getAllByPlaceholderText("Term")[0]!;
    await userEvent.type(sourceTermInput, "Checkout");
    await expect(primaryTermInput).toHaveValue("Checkout");
    const addTermButton = canvas.getByRole("button", { name: "Add term" });
    await expect(addTermButton).toBeEnabled();
    await userEvent.click(addTermButton);
    await userEvent.click(canvas.getByRole("button", { name: /French/ }));
    await expect(canvas.getByText("French")).toBeInTheDocument();
    await expect(canvas.getByPlaceholderText("Term")).toBeInTheDocument();
  },
};

export const LoadingConceptList: Story = {
  parameters: {
    msw: {
      handlers: createGlossaryDetailMswHandlers({
        glossary: glossaryFixture,
        concepts: conceptsFixture,
        conceptsLoading: true,
      }),
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      void expect(canvasElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    });
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};

export const LoadingConceptDetail: Story = {
  args: {
    conceptId,
  },
  parameters: {
    msw: {
      handlers: createGlossaryDetailMswHandlers({
        glossary: glossaryFixture,
        concepts: conceptsFixture,
        conceptsLoading: true,
      }),
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/acme/glossaries/${glossaryId}/concepts/${conceptId}`,
      },
    },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      void expect(canvasElement.querySelector('[aria-busy="true"]')).toBeTruthy();
    });
    await expect(canvasElement.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
      0,
    );
  },
};
