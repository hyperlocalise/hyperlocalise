import type {
  ProjectFileDetailResponse,
  ProjectFileRecord,
  ProjectSourceStringsPreview,
} from "@/api/routes/project/project.schema";

import type { ProviderProjectBranchOption } from "./project-files-branch-filter-view";

export const projectFilesStoryNow = Date.UTC(2026, 5, 6, 12, 0, 0);

function iso(offsetMs: number) {
  return new Date(projectFilesStoryNow + offsetMs).toISOString();
}

export function createProjectFileRecord(
  overrides: Partial<ProjectFileRecord> = {},
): ProjectFileRecord {
  return {
    origin: "repository",
    sourcePath: "marketing/home.json",
    sourceHash: "sha256:home-source",
    commitSha: "8f52a31",
    workflowRunId: "workflow_001",
    uploadedAt: iso(-3_600_000),
    storedFileId: "file_home_json",
    metadata: {},
    filename: "home.json",
    byteSize: 4_096,
    provider: null,
    latestJob: {
      id: "job_translate_homepage",
      status: "running",
      createdAt: iso(-2_400_000),
      type: "file",
    },
    ...overrides,
  };
}

export const projectSourceStringsPreview: ProjectSourceStringsPreview = {
  truncated: false,
  note: "Showing strings parsed from the latest source file version.",
  entries: [
    {
      id: 1,
      key: "hero.title",
      text: "Ship localized product pages faster",
      context: "Homepage hero headline",
    },
    {
      id: 2,
      key: "hero.cta",
      text: "Start translating",
      context: "Primary call to action",
    },
    {
      id: 3,
      key: "pricing.badge",
      text: "Most popular",
      context: null,
    },
  ],
};

export const projectFilesFixture: ProjectFileRecord[] = [
  createProjectFileRecord(),
  createProjectFileRecord({
    sourcePath: "marketing/pricing.json",
    sourceHash: "sha256:pricing-source",
    filename: "pricing.json",
    byteSize: 2_816,
    latestJob: {
      id: "job_review_pricing",
      status: "waiting_for_review",
      createdAt: iso(-1_800_000),
      type: "file",
    },
  }),
  createProjectFileRecord({
    sourcePath: "app/mobile/en.xcstrings",
    sourceHash: "sha256:mobile-source",
    filename: "en.xcstrings",
    byteSize: 13_240,
    latestJob: null,
  }),
];

export const providerProjectFilesFixture: ProjectFileRecord[] = [
  createProjectFileRecord({
    origin: "provider",
    sourcePath: "crowdin/home.json",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    storedFileId: null,
    filename: "home.json",
    byteSize: null,
    latestJob: null,
    provider: {
      kind: "crowdin",
      resourceType: "file",
      externalProjectId: "project_website",
      externalResourceId: "file_home_json",
      externalUrl: "https://crowdin.example/project/files/home.json",
      syncState: "synced",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
      localeReadiness: {},
      revision: "18",
      format: "json",
      lastSyncedAt: iso(-600_000),
    },
  }),
  createProjectFileRecord({
    origin: "provider",
    sourcePath: "crowdin/pricing.json",
    sourceHash: null,
    commitSha: null,
    workflowRunId: null,
    storedFileId: null,
    filename: "pricing.json",
    byteSize: null,
    latestJob: null,
    provider: {
      kind: "crowdin",
      resourceType: "file",
      externalProjectId: "project_website",
      externalResourceId: "file_pricing_json",
      externalUrl: "https://crowdin.example/project/files/pricing.json",
      syncState: "synced",
      sourceLocale: "en",
      targetLocales: ["fr-FR", "de-DE"],
      localeReadiness: {},
      revision: "7",
      format: "json",
      lastSyncedAt: iso(-600_000),
    },
  }),
];

export const providerProjectBranchesFixture: ProviderProjectBranchOption[] = [
  { name: "main", title: "Main" },
  { name: "feature-checkout", title: "Feature checkout" },
];

export function createProjectFileDetail(
  file: ProjectFileRecord = projectFilesFixture[0] as ProjectFileRecord,
  overrides: Partial<ProjectFileDetailResponse["file"]> = {},
): ProjectFileDetailResponse["file"] {
  return {
    sourcePath: file.sourcePath,
    filename: file.filename,
    provider: file.provider,
    versions: [
      {
        id: "version_home_json",
        origin: file.origin === "provider" ? "provider" : "repository",
        sourcePath: file.sourcePath,
        sourceHash: file.sourceHash,
        revision: file.provider?.revision ?? "3",
        commitSha: file.commitSha,
        workflowRunId: file.workflowRunId,
        uploadedAt: file.uploadedAt,
        storedFileId: file.storedFileId,
        filename: file.filename,
        contentType: "application/json",
        byteSize: file.byteSize,
        sha256: "8f0f5e2f4d8a",
        metadata: {},
        content: {
          sourceStrings: projectSourceStringsPreview,
        },
      },
    ],
    jobsByLocale: [
      {
        locale: "fr-FR",
        jobs: [
          {
            id: "job_translate_homepage",
            sourceFileVersionId: "version_home_json",
            status: "running",
            createdAt: iso(-2_400_000),
            completedAt: null,
            workflowRunId: "workflow_translate_homepage",
            sourceLocale: "en",
            targetLocales: ["fr-FR"],
            outputs: [],
          },
        ],
      },
      {
        locale: "de-DE",
        jobs: [
          {
            id: "job_review_homepage_de",
            sourceFileVersionId: "version_home_json",
            status: "waiting_for_review",
            createdAt: iso(-1_200_000),
            completedAt: null,
            workflowRunId: "workflow_review_homepage_de",
            sourceLocale: "en",
            targetLocales: ["de-DE"],
            outputs: [],
          },
        ],
      },
    ],
    providerJobsByLocale: [],
    ...overrides,
  };
}

export const selectedUploadFiles = [
  {
    name: "new-checkout.json",
    size: 1_428,
    lastModified: projectFilesStoryNow,
    webkitRelativePath: "marketing/new-checkout.json",
  },
  {
    name: "settings.yaml",
    size: 784,
    lastModified: projectFilesStoryNow - 10_000,
    webkitRelativePath: "",
  },
] as File[];
