import { describe, expect, it } from "vite-plus/test";

import {
  normalizeProjectId,
  optionalProjectIdSchema,
  projectIdSchema,
} from "@/lib/projects/identity/project-id";
import { createConversationRequestSchema } from "@/api/routes/conversation/conversation.schema";
import { createContentfulConnectionBodySchema } from "@/api/routes/contentful-connection/contentful-connection.schema";
import { providerSyncObservabilityQuerySchema } from "@/api/routes/external-tms-provider-credential/external-tms-provider-credential.schema";
import { upsertGithubRepositoryAutomationSettingsBodySchema } from "@/api/routes/github-installation/github-installation.schema";
import {
  attachGlossaryProjectBodySchema,
  glossaryProjectParamsSchema,
} from "@/api/routes/glossary/glossary.schema";
import {
  attachMemoryProjectBodySchema,
  memoryProjectParamsSchema,
} from "@/api/routes/memory/memory.schema";
import {
  createPublicJobBodySchema,
  latestPublicJobQuerySchema,
} from "@/api/routes/public-jobs/public-jobs.schema";
import { uploadBodySchema } from "@/api/routes/public-files/public-files.schema";
import {
  projectFilesQuerySchema,
  projectIdParamsSchema,
} from "@/api/routes/project/project.schema";
import { projectAutomationParamsSchema } from "@/api/routes/tms-agent-automation/tms-agent-automation.schema";
import { workspaceAutomationConfigSchema } from "@/lib/agents/workspace-automations";

describe("project id schemas", () => {
  it("normalizes double-encoded external project ids", () => {
    expect(normalizeProjectId("ext%253Acrowdin%253A902807")).toBe("ext:crowdin:902807");
    expect(projectIdSchema.parse("ext%253Acrowdin%253A902807")).toBe("ext:crowdin:902807");
    expect(optionalProjectIdSchema.parse(undefined)).toBeUndefined();
  });

  it("normalizes project ids across route param, query, body, and multipart schemas", () => {
    const encoded = "ext%253Acrowdin%253A902807";
    const decoded = "ext:crowdin:902807";

    expect(projectIdParamsSchema.parse({ projectId: encoded }).projectId).toBe(decoded);
    expect(projectFilesQuerySchema.parse({ projectId: encoded }).projectId).toBe(decoded);
    expect(
      uploadBodySchema.parse({ projectId: encoded, sourcePath: "src/en.json" }).projectId,
    ).toBe(decoded);
    expect(
      createPublicJobBodySchema.parse({
        type: "string",
        projectId: encoded,
        stringInput: {
          sourceText: "Hello",
          sourceLocale: "en",
          targetLocales: ["fr"],
        },
      }).projectId,
    ).toBe(decoded);
    expect(
      latestPublicJobQuerySchema.parse({ projectId: encoded, sourcePath: "src/en.json" }).projectId,
    ).toBe(decoded);
    expect(createConversationRequestSchema.parse({ text: "", projectId: encoded }).projectId).toBe(
      decoded,
    );
    expect(
      glossaryProjectParamsSchema.parse({ glossaryId: "glossary_1", projectId: encoded }).projectId,
    ).toBe(decoded);
    expect(attachGlossaryProjectBodySchema.parse({ projectId: encoded }).projectId).toBe(decoded);
    expect(
      memoryProjectParamsSchema.parse({ memoryId: "memory_1", projectId: encoded }).projectId,
    ).toBe(decoded);
    expect(attachMemoryProjectBodySchema.parse({ projectId: encoded }).projectId).toBe(decoded);
    expect(
      createContentfulConnectionBodySchema.parse({
        displayName: "Contentful",
        spaceId: "space",
        fieldConfig: {},
        accessToken: "token",
      }).displayName,
    ).toBe("Contentful");
    expect(providerSyncObservabilityQuerySchema.parse({ projectId: encoded }).projectId).toBe(
      decoded,
    );
    expect(
      projectAutomationParamsSchema.parse({
        projectId: encoded,
      }).projectId,
    ).toBe(decoded);
    expect(
      upsertGithubRepositoryAutomationSettingsBodySchema.parse({
        settings: {
          workflows: {
            pushSource: { enabled: true, projectId: encoded },
          },
        },
      }).settings.workflows?.pushSource?.projectId,
    ).toBe(decoded);
    expect(
      workspaceAutomationConfigSchema.parse({
        triggerConfig: { mode: "manual" },
        repositoryTarget: { kind: "none" },
        toolConfig: {
          github: { enabled: true, projectId: encoded },
          contentful: { enabled: true, projectId: encoded },
        },
      }).toolConfig,
    ).toMatchObject({
      github: { projectId: decoded },
      contentful: { projectId: decoded },
    });
  });
});
