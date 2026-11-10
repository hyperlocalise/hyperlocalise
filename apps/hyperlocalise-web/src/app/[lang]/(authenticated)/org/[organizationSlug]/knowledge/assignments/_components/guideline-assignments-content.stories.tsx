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
import { http, HttpResponse } from "msw";

import type { ProjectRecord } from "@/lib/go-svc/go-svc-client.types";

import { storyGuidelineDocument } from "../../_components/guideline-story-fixtures";
import { GuidelineAssignmentsContent } from "./guideline-assignments-content";

const organizationSlug = "acme";

function storyProject(id: string, name: string): ProjectRecord {
  return {
    id,
    organizationId: "org_1",
    teamId: null,
    createdByUserId: null,
    name,
    identifier: id,
    description: "",
    translationContext: "",
    source: "native",
    externalProviderKind: null,
    externalProjectId: null,
    sourceLocale: "en",
    targetLocales: ["fr-FR"],
    externalProjectUrl: null,
    isActive: true,
    lastSyncedAt: null,
    lastSyncErrorAt: null,
    lastSyncErrorMessage: null,
    createdAt: "2026-10-10T00:00:00Z",
    updatedAt: "2026-10-10T00:00:00Z",
    openJobCount: 0,
  };
}

function createAssignmentMswHandlers(
  options: {
    assignedProjectIds?: string[];
    documents?: ReturnType<typeof storyGuidelineDocument>[];
  } = {},
) {
  const projects = [
    storyProject("project_1", "Mobile app"),
    storyProject("project_2", "Marketing site"),
    storyProject("project_3", "Help center"),
  ];
  const assignments = new Map<string, string[]>([
    ["doc-brand", options.assignedProjectIds ?? ["project_1"]],
  ]);
  const documents = options.documents ?? [
    storyGuidelineDocument({ id: "doc-brand", title: "Brand voice", filename: "brand.md" }),
    storyGuidelineDocument({ id: "doc-tone", title: "Tone guide", filename: "tone.md" }),
  ];

  const projectName = (projectId: string) =>
    projects.find((project) => project.id === projectId)?.name ?? projectId;

  return [
    http.get("*/v1/orgs/:organizationSlug/guidelines/documents", () =>
      HttpResponse.json({
        guidelineDocuments: documents,
        nextCursor: null,
        pagination: { limit: 200, returned: documents.length, hasMore: false },
      }),
    ),
    http.get("*/v1/orgs/:organizationSlug/guidelines/documents/assignments", () =>
      HttpResponse.json({
        assignments: [...assignments.entries()].map(([documentId, projectIds]) => ({
          documentId,
          projectIds,
        })),
      }),
    ),
    http.get("*/v1/orgs/:organizationSlug/projects", () => HttpResponse.json({ projects })),
    http.post("*/guidelines/documents/:documentId/projects", async ({ params, request }) => {
      const body = (await request.json()) as { projectId: string };
      const current = assignments.get(String(params.documentId)) ?? [];
      if (!current.includes(body.projectId)) {
        current.push(body.projectId);
      }
      assignments.set(String(params.documentId), current);
      return HttpResponse.json({
        projects: current.map((projectId) => ({ projectId, projectName: projectName(projectId) })),
      });
    }),
    http.delete("*/guidelines/documents/:documentId/projects/:projectId", ({ params }) => {
      const current = assignments.get(String(params.documentId)) ?? [];
      assignments.set(
        String(params.documentId),
        current.filter((projectId) => projectId !== params.projectId),
      );
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

const meta = {
  title: "Guidelines/Assignments",
  component: GuidelineAssignmentsContent,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GuidelineAssignmentsContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Assigned: Story = {
  args: { organizationSlug, canUpdate: true },
  parameters: { msw: { handlers: createAssignmentMswHandlers() } },
};

export const ReadOnly: Story = {
  args: { organizationSlug, canUpdate: false },
  parameters: {
    msw: {
      handlers: createAssignmentMswHandlers({ assignedProjectIds: ["project_1", "project_2"] }),
    },
  },
};

export const NoDocuments: Story = {
  args: { organizationSlug, canUpdate: true },
  parameters: { msw: { handlers: createAssignmentMswHandlers({ documents: [] }) } },
};
