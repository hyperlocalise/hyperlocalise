import { http, HttpResponse } from "msw";

const demoProject = {
  id: "project_demo",
  organizationId: "org_demo",
  createdByUserId: "user_demo",
  name: "Demo Release",
  description: "Primary website strings",
  translationContext: "Use a concise product-marketing tone.",
  source: "native" as const,
  externalProviderKind: null,
  externalProjectId: null,
  sourceLocale: "en",
  targetLocales: ["fr", "de"],
  externalProjectUrl: null,
  isActive: true,
  lastSyncedAt: null,
  lastSyncErrorAt: null,
  lastSyncErrorMessage: null,
  createdAt: "2024-04-01T12:00:00.000Z",
  updatedAt: "2024-04-01T12:00:00.000Z",
  openJobCount: 2,
};

export const mswHandlers = {
  projects: [
    http.get("/api/orgs/:organizationSlug/projects", () =>
      HttpResponse.json({ projects: [demoProject] }),
    ),
  ],
};
