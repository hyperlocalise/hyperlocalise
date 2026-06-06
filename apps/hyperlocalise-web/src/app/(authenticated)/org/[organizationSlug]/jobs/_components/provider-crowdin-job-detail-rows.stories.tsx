import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  JobDetailRow,
  ProviderCrowdinJobDetailRows,
  type CrowdinJobDetailSource,
} from "./provider-crowdin-job-detail-rows";
import { ProviderJobDescriptionFieldView } from "./provider-job-description-field";

const job = {
  id: "ext:crowdin:task:1204",
  externalProviderKind: "crowdin",
  externalTargetLocales: ["fr-FR", "de-DE"],
  externalStatus: "in_progress",
  status: "running",
  projectName: "Website",
  externalDueDate: "2026-06-08T12:00:00.000Z",
  updatedAt: "2026-06-06T11:30:00.000Z",
  externalJobId: "1204",
  externalUrl: "https://crowdin.example/tasks/1204",
  kind: "translation",
  type: "file",
} satisfies CrowdinJobDetailSource;

const providerPayload = {
  type: 0,
  targetLanguageIds: ["fr-FR", "de-DE"],
  languageId: "fr-FR",
  description:
    "Translate the launch campaign strings. Preserve product names and ICU placeholders.",
  localeReadiness: {
    translationProgress: 68,
    approvalProgress: 24,
    words: {
      total: 2400,
      translated: 1580,
      approved: 520,
    },
  },
};

function formatJobKind(value: CrowdinJobDetailSource) {
  return [value.kind, value.type].filter(Boolean).join(" · ");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const meta = {
  title: "App/Jobs/Provider Crowdin Job Detail Rows",
  component: ProviderCrowdinJobDetailRows,
  render: (args) => (
    <div className="max-w-3xl p-6">
      <dl className="divide-y divide-foreground/8">
        <ProviderCrowdinJobDetailRows
          {...args}
          renderDescriptionField={({ description, editable }) => (
            <ProviderJobDescriptionFieldView
              description={description}
              editable={editable}
              onSaveDescription={async (nextDescription) => nextDescription}
            />
          )}
        />
      </dl>
    </div>
  ),
} satisfies Meta<typeof ProviderCrowdinJobDetailRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CrowdinTask: Story = {
  args: {
    job,
    providerPayload,
    organizationSlug: "acme",
    formatJobKind,
    formatDateTime,
    descriptionQueryKey: ["job", "acme", "project_website", "ext:crowdin:task:1204"],
    canEditDescription: true,
    extraRows: <JobDetailRow label="Internal owner" value="Localization team" />,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Translate by own translators")).toBeInTheDocument();
    await expect(canvas.getByText("68% translated · 24% approved")).toBeInTheDocument();
  },
};

export const NonCrowdinProvider: Story = {
  args: {
    job: {
      ...job,
      id: "job_native_001",
      externalProviderKind: "phrase",
      externalUrl: null,
    },
    providerPayload: null,
    organizationSlug: "acme",
    formatJobKind,
    formatDateTime,
    showProviderLink: false,
  },
};
