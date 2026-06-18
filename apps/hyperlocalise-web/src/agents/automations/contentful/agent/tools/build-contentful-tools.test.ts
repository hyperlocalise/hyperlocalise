import { describe, expect, it, vi } from "vite-plus/test";

import type { ContentfulManagementClient } from "@/lib/contentful/client";
import type { ContentfulContentType, ContentfulEntry } from "@/lib/contentful/types";

import { createContentfulAgentSession } from "../context";
import { buildContentfulAgentTools } from "./build-contentful-tools";

const contentType: ContentfulContentType = {
  sys: { id: "helpCenterArticle" },
  fields: [
    { id: "title", name: "Title", type: "Symbol", localized: true },
    { id: "body", name: "Body", type: "RichText", localized: true },
    { id: "slug", name: "Slug", type: "Symbol", localized: true },
  ],
};

const entry: ContentfulEntry = {
  sys: {
    id: "entry-1",
    version: 1,
    contentType: { sys: { id: "helpCenterArticle" } },
  },
  fields: {
    title: {
      "en-US": "Reset your password",
      "fr-FR": "Réinitialisez votre mot de passe",
    },
    body: {
      "en-US": {
        nodeType: "document",
        data: {},
        content: [
          {
            nodeType: "paragraph",
            data: {},
            content: [
              {
                nodeType: "text",
                value: "Visit https://example.com/reset.",
                marks: [],
                data: {},
              },
            ],
          },
        ],
      },
    },
    slug: {
      "en-US": "reset-password",
    },
  },
};

function createTestSession() {
  return createContentfulAgentSession({
    organizationId: "org_123",
    runId: "run_123",
    entryId: "entry-1",
    workspaceAutomationRunId: "workspace_run_123",
    projectId: "project_123",
    instructions: "Translate help center content.",
    sourceLocale: "en-US",
    targetLocales: ["fr-FR"],
    runQa: false,
    writeDrafts: false,
    overwriteDraftLocales: false,
    fieldConfig: {
      fieldMode: "configured",
      fieldsByContentType: { helpCenterArticle: ["title", "body"] },
    },
    client: {} as ContentfulManagementClient,
    translateStringJob: vi.fn() as never,
    projectName: "Help Center",
    projectTranslationContext: "Support articles",
  });
}

describe("buildContentfulAgentTools", () => {
  it("respects configured field allow-lists when listing translatable fields", async () => {
    const session = createTestSession();
    session.entry = entry as unknown as Record<string, unknown>;
    session.contentType = contentType as unknown as Record<string, unknown>;

    const tools = buildContentfulAgentTools(session);
    const listTranslatableFields = tools.list_translatable_fields;

    if (!listTranslatableFields?.execute) {
      throw new Error("list_translatable_fields tool is missing execute");
    }

    const result = await listTranslatableFields.execute(
      {},
      { toolCallId: "test-tool-call", messages: [] },
    );

    expect(result).toEqual({
      count: 1,
      fields: [{ fieldId: "body", kind: "text" }],
    });
  });
});
