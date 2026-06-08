import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

import type { ProjectFileCatResponse } from "@/api/routes/project/project.schema";
import { ProjectFileCatWorkspaceView } from "./project-file-cat-workspace";
import { providerProjectFilesFixture } from "./project-files.fixture";

const providerFile = providerProjectFilesFixture[0]!;

const catFile: ProjectFileCatResponse["catFile"] = {
  sourcePath: providerFile.sourcePath,
  filename: providerFile.filename,
  provider: providerFile.provider,
  targetLocale: "fr-FR",
  canEditTranslations: true,
  truncated: false,
  segments: [
    {
      externalStringId: "1001",
      key: "hero.title",
      sourceText: "Ship localized product pages faster",
      context: "Homepage hero headline",
      type: "text",
      target: {
        text: "Publiez des pages produit localisees plus vite",
        externalTranslationId: "9001",
        isApproved: true,
      },
      comments: [],
    },
    {
      externalStringId: "1002",
      key: "hero.cta",
      sourceText: "Start translating",
      context: "Primary call to action",
      type: "text",
      target: null,
      comments: [
        {
          externalCommentId: "comment_42",
          type: "issue",
          status: "unresolved",
          text: "Use the approved product verb here.",
          createdAt: "2026-06-06T10:30:00.000Z",
          locale: "fr-FR",
        },
      ],
    },
    {
      externalStringId: "1003",
      key: "pricing.badge",
      sourceText: "Most popular",
      context: null,
      type: "text",
      target: {
        text: "Le plus populaire",
        externalTranslationId: "9003",
        isApproved: false,
      },
      comments: [
        {
          externalCommentId: "comment_43",
          type: "comment",
          status: null,
          text: "Check whether this should match the pricing-page badge.",
          createdAt: "2026-06-06T10:15:00.000Z",
          locale: "fr-FR",
        },
      ],
    },
  ],
};

const meta = {
  title: "App/Project/Files/CAT Workspace",
  component: ProjectFileCatWorkspaceView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    catFile,
    targetLocales: ["fr-FR", "de-DE"],
    targetLocale: "fr-FR",
    onTargetLocaleChange: () => undefined,
    isLoading: false,
    onSave: async (_externalStringId: string, text: string) => ({
      text,
      externalTranslationId: "new_translation",
      isApproved: false,
    }),
  },
} satisfies Meta<typeof ProjectFileCatWorkspaceView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editable: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("hero.cta")).toBeInTheDocument();
    await expect(canvas.getByText("Use the approved product verb here.")).toBeInTheDocument();
    const textarea = canvas.getByPlaceholderText("Add translation");
    await userEvent.type(textarea, "Commencer a traduire");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};

export const ReadOnly: Story = {
  args: {
    catFile: {
      ...catFile,
      canEditTranslations: false,
    },
    onSave: undefined,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "You can view this CAT workspace, but your role cannot write translations back.",
      ),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: {
    catFile: null,
    isLoading: true,
  },
};

export const LoadError: Story = {
  args: {
    catFile: null,
    error: new Error("Crowdin credentials are invalid."),
  },
};
