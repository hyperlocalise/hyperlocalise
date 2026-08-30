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
import { expect } from "storybook/test";

import type {
  MemoryEntryRecord,
  MemoryProjectRecord,
  MemoryRecord,
} from "@/api/routes/memory/memory.schema";

import { createTranslationMemoryDetailMswHandlers } from "./translation-memory-detail-page-content-msw-handlers";
import { TranslationMemoryDetailPageContent } from "./translation-memory-detail-page-content";

const fixedNow = "2026-06-07T12:00:00.000Z";
const memoryId = "11111111-1111-4111-8111-111111111111";

function createMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: memoryId,
    organizationId: "org-1",
    createdByUserId: "user-1",
    name: "Product UI",
    description: "Core product translations",
    status: "active",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    externalMemoryId: null,
    localeCoverage: ["en-US", "fr-FR"],
    segmentCount: 2,
    syncState: null,
    capabilityMode: null,
    segmentCapabilities: {},
    externalUrl: null,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    ...overrides,
  };
}

function createEntry(overrides: Partial<MemoryEntryRecord> = {}): MemoryEntryRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    memoryId,
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    sourceText: "Checkout",
    targetText: "Paiement",
    matchScore: 100,
    provenance: "file_job",
    reviewStatus: "approved",
    version: 1,
    externalKey: "job_1:fr-FR:checkout",
    createdByUserId: "user-1",
    modifiedByUserId: null,
    reviewedByUserId: null,
    importBatchId: null,
    metadata: {},
    createdAt: fixedNow,
    updatedAt: fixedNow,
    reviewedAt: null,
    ...overrides,
  };
}

const memoryFixture = createMemory();
const providerMemoryFixture = createMemory({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Phrase TM",
  description: "Marketing translations",
  source: "external_tms",
  externalProviderKind: "phrase",
  externalProjectId: "phrase-project-9",
  externalMemoryId: "tm-42",
  localeCoverage: ["en-US", "fr-FR", "de-DE"],
  segmentCount: 50_000,
  syncState: "synced",
  capabilityMode: "live_search",
});

const entriesFixture: MemoryEntryRecord[] = [
  createEntry(),
  createEntry({
    id: "44444444-4444-4444-8444-444444444444",
    sourceText: "Save changes",
    targetText: "Enregistrer les modifications",
    provenance: "manual",
    externalKey: null,
  }),
];

const attachedProjectsFixture: MemoryProjectRecord[] = [
  {
    projectId: "project-marketing",
    projectName: "Marketing Site",
    priority: 0,
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
  },
];

const projectsFixture = [
  { id: "project-marketing", name: "Marketing Site" },
  { id: "project-docs", name: "Docs" },
];

const meta = {
  title: "App/TranslationMemories/Detail",
  component: TranslationMemoryDetailPageContent,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    memoryId,
    canManageMemories: true,
  },
} satisfies Meta<typeof TranslationMemoryDetailPageContent>;

export default meta;
type Story = StoryObj<typeof meta>;

function createDetailStoryParameters(input: {
  memory: MemoryRecord;
  entries?: MemoryEntryRecord[];
  attachedProjects?: MemoryProjectRecord[];
  memoryLoading?: boolean;
  memoryMissing?: boolean;
  entriesLoading?: boolean;
}) {
  return {
    msw: {
      handlers: createTranslationMemoryDetailMswHandlers({
        memory: input.memory,
        entries: input.entries ?? entriesFixture,
        attachedProjects: input.attachedProjects ?? attachedProjectsFixture,
        projects: projectsFixture,
        memoryLoading: input.memoryLoading,
        memoryMissing: input.memoryMissing,
        entriesLoading: input.entriesLoading,
      }),
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/org/acme/translation-memories/${input.memory.id}`,
      },
    },
  };
}

export const Default: Story = {
  parameters: createDetailStoryParameters({ memory: memoryFixture }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Product UI" })).toBeInTheDocument();
    await expect(canvas.getByText("Workspace")).toBeInTheDocument();
    await expect(canvas.getByText("Core product translations")).toBeInTheDocument();
    await expect(canvas.getByText("Checkout")).toBeInTheDocument();
    await expect(canvas.getByText("Paiement")).toBeInTheDocument();
    await expect(canvas.getByText("Save changes")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add entry" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Export TMX" })).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Marketing Site" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Assign to project" })).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    memoryId: "55555555-5555-4555-8555-555555555555",
  },
  parameters: createDetailStoryParameters({
    memory: createMemory({
      id: "55555555-5555-4555-8555-555555555555",
      description: "",
      segmentCount: 0,
    }),
    entries: [],
    attachedProjects: [],
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Product UI" })).toBeInTheDocument();
    await expect(
      canvas.getByText("Manage translation examples and assign this memory to projects."),
    ).toBeInTheDocument();
    await expect(canvas.getByText("No entries yet.")).toBeInTheDocument();
    await expect(canvas.getByText("No projects assigned yet.")).toBeInTheDocument();
  },
};

export const ProviderReadOnly: Story = {
  args: {
    memoryId: providerMemoryFixture.id,
    canManageMemories: true,
  },
  parameters: createDetailStoryParameters({
    memory: providerMemoryFixture,
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Phrase TM" })).toBeInTheDocument();
    await expect(canvas.getByText("Provider")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add entry" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Assign to project" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Checkout")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Export TMX" })).toBeInTheDocument();
  },
};

export const ReadOnlyMember: Story = {
  args: {
    canManageMemories: false,
  },
  parameters: createDetailStoryParameters({ memory: memoryFixture }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Product UI" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Add entry" })).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Assign to project" }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Marketing Site" })).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    memoryId: "66666666-6666-4666-8666-666666666666",
  },
  parameters: createDetailStoryParameters({
    memory: createMemory({ id: "66666666-6666-4666-8666-666666666666" }),
    memoryLoading: true,
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Loading memory...")).toBeInTheDocument();
  },
};

export const LoadingEntries: Story = {
  args: {
    memoryId: "77777777-7777-4777-8777-777777777777",
  },
  parameters: createDetailStoryParameters({
    memory: createMemory({ id: "77777777-7777-4777-8777-777777777777" }),
    entriesLoading: true,
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("heading", { name: "Product UI" })).toBeInTheDocument();
    await expect(canvas.getByLabelText("Loading translation memory entries")).toBeInTheDocument();
  },
};

export const NotFound: Story = {
  args: {
    memoryId: "88888888-8888-4888-8888-888888888888",
  },
  parameters: createDetailStoryParameters({
    memory: createMemory({ id: "88888888-8888-4888-8888-888888888888" }),
    memoryMissing: true,
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Translation memory not found.")).toBeInTheDocument();
  },
};
