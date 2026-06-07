import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { ProjectFileSourceStringsPreviewRenderer } from "./project-file-detail-panel";
import { ProjectFileDetailPanelView } from "./project-file-detail-panel";
import {
  createProjectFileDetail,
  createProjectFileRecord,
  projectFilesFixture,
  projectSourceStringsPreview,
} from "./project-files.fixture";

const sourceStringsPreview: ProjectFileSourceStringsPreviewRenderer = ({ sourceStrings }) => (
  <div className="overflow-hidden rounded-md border border-foreground/8 bg-background">
    <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
      <thead className="border-b border-foreground/8">
        <tr>
          <th className="px-3 py-2 font-medium text-foreground/52">Key</th>
          <th className="px-3 py-2 font-medium text-foreground/52">Text</th>
          <th className="px-3 py-2 font-medium text-foreground/52">Context</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-foreground/8">
        {sourceStrings.entries.map((entry) => (
          <tr key={entry.id ?? entry.key}>
            <td className="px-3 py-2 font-mono text-foreground/82">{entry.key}</td>
            <td className="px-3 py-2 text-foreground/78">{entry.text}</td>
            <td className="px-3 py-2 text-foreground/52">{entry.context ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const selectedFile = projectFilesFixture[0] ?? createProjectFileRecord();

const meta = {
  title: "App/Project/Files/Detail Panel",
  component: ProjectFileDetailPanelView,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    organizationSlug: "acme",
    projectId: "project_website",
    file: selectedFile,
    requestedSourcePath: selectedFile.sourcePath,
    highlightLocale: "fr-FR",
    canFindInRepo: true,
    isLoading: false,
    detail: createProjectFileDetail(selectedFile),
    renderSourceStringsPreview: sourceStringsPreview,
  },
} satisfies Meta<typeof ProjectFileDetailPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SourceStrings: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("marketing/home.json")).toBeInTheDocument();
    await expect(canvas.getByText("hero.title")).toBeInTheDocument();
    await expect(canvas.getByText("fr-FR")).toBeInTheDocument();
  },
};

export const TextPreview: Story = {
  args: {
    detail: createProjectFileDetail(selectedFile, {
      versions: [
        {
          ...createProjectFileDetail(selectedFile).versions[0]!,
          content: {
            text: JSON.stringify(
              {
                title: "Ship localized product pages faster",
                cta: "Start translating",
              },
              null,
              2,
            ),
          },
        },
      ],
      jobsByLocale: [],
    }),
  },
};

export const NoPreviewAvailable: Story = {
  args: {
    detail: createProjectFileDetail(selectedFile, {
      versions: [
        {
          ...createProjectFileDetail(selectedFile).versions[0]!,
          content: null,
        },
      ],
      jobsByLocale: [],
    }),
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
    detail: undefined,
  },
};

export const LoadError: Story = {
  args: {
    error: new Error("The file detail API returned a 500."),
    detail: undefined,
  },
};

export const EmptySelection: Story = {
  args: {
    file: null,
    requestedSourcePath: null,
    detail: undefined,
  },
};

export const FileNotFound: Story = {
  args: {
    file: null,
    requestedSourcePath: "marketing/missing.json",
    detail: undefined,
  },
};

export const TruncatedStrings: Story = {
  args: {
    detail: createProjectFileDetail(selectedFile, {
      versions: [
        {
          ...createProjectFileDetail(selectedFile).versions[0]!,
          content: {
            sourceStrings: {
              ...projectSourceStringsPreview,
              truncated: true,
              note: "Only the first 100 strings are shown.",
            },
          },
        },
      ],
    }),
  },
};
