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
import { expect, fn } from "storybook/test";

import { PromptInputProvider } from "@/components/ai-elements/prompt-input";

import { repositoriesFixture } from "./inbox.fixture";
import { ReplyComposerView } from "./reply-composer";

const meta = {
  title: "App/Inbox/ReplyComposer",
  component: ReplyComposerView,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <PromptInputProvider>
        <div className="w-full max-w-3xl bg-background">
          <Story />
        </div>
      </PromptInputProvider>
    ),
  ],
  args: {
    disabled: false,
    isStreaming: false,
    projects: [],
    projectsIsLoading: false,
    projectsIsError: false,
    repositories: repositoriesFixture,
    repositoriesIsLoading: false,
    repositoriesIsError: false,
    onSend: fn(),
  },
} satisfies Meta<typeof ReplyComposerView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("Ask Hyperlocalise…")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Send reply" })).toBeInTheDocument();
    await expect(canvas.getByText("GitHub repo")).toBeInTheDocument();
  },
};

export const Streaming: Story = {
  args: {
    isStreaming: true,
    disabled: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText("Agent is responding…")).toBeInTheDocument();
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const LoadingRepositories: Story = {
  args: {
    repositories: [],
    repositoriesIsLoading: true,
  },
};

export const RepositoriesLoadError: Story = {
  args: {
    repositories: [],
    repositoriesIsError: true,
  },
};

export const NoRepositories: Story = {
  args: {
    repositories: [],
  },
};

export const SingleRepository: Story = {
  args: {
    repositories: repositoriesFixture.slice(0, 1),
  },
};

export const LoadingProjects: Story = {
  args: {
    projectsIsLoading: true,
  },
};

export const ProjectsLoadError: Story = {
  args: {
    projectsIsError: true,
  },
};

export const WithProjects: Story = {
  args: {
    projects: [
      {
        id: "proj_website",
        name: "Website",
        source: "native",
        externalProviderKind: null,
      },
      {
        id: "ext:crowdin:42",
        name: "Crowdin App",
        source: "external_tms",
        externalProviderKind: "crowdin",
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Project")).toBeInTheDocument();
  },
};

export const CatPreselectedProject: Story = {
  args: {
    initialProjectId: "proj_website",
    projects: [
      {
        id: "proj_website",
        name: "Website",
        source: "native",
        externalProviderKind: null,
      },
      {
        id: "proj_mobile",
        name: "Mobile",
        source: "native",
        externalProviderKind: null,
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Website")).toBeInTheDocument();
  },
};

export const LockedProject: Story = {
  args: {
    lockedProjectId: "proj_website",
    projects: [
      {
        id: "proj_website",
        name: "Website",
        source: "native",
        externalProviderKind: null,
      },
      {
        id: "proj_mobile",
        name: "Mobile",
        source: "native",
        externalProviderKind: null,
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /website/i })).toBeDisabled();
  },
};
