import { describe, expect, it } from "vitest";
import { projectIdParamsSchema } from "./project/project.schema";
import {
  jobProjectParamsSchema,
  jobParamsSchema,
  workspaceJobParamsSchema,
  fileTranslationJobInputSchema,
} from "./project/job.schema";
import {
  createPublicJobBodySchema,
  jobIdParamsSchema,
  latestPublicJobQuerySchema,
} from "./public-jobs/public-jobs.schema";
import {
  uploadBodySchema,
  fileParamsSchema as publicFileParamsSchema,
} from "./public-files/public-files.schema";
import { searchRepositoriesSchema } from "./github-installation/github-installation.schema";
import { apiKeyIdParamsSchema } from "./api-key/api-key.schema";
import { fileParamsSchema } from "./file/file.schema";
import { glossaryIdParamsSchema } from "./glossary/glossary.schema";
import {
  chatRequestBodySchema,
  multipartChatRequestSchema,
} from "./chat-request/chat-request.schema";

describe("Identifier Schema length limits", () => {
  const longId = "a".repeat(129);
  const longSearch = "a".repeat(513);

  it("should enforce max length on projectId in project.schema", () => {
    const result = projectIdParamsSchema.safeParse({ projectId: longId });
    expect(result.success).toBe(false);
  });

  it("should enforce max length on projectId and jobId in job.schema", () => {
    expect(jobProjectParamsSchema.safeParse({ projectId: longId }).success).toBe(false);
    expect(jobParamsSchema.safeParse({ projectId: longId, jobId: "valid" }).success).toBe(false);
    expect(jobParamsSchema.safeParse({ projectId: "valid", jobId: longId }).success).toBe(false);
    expect(workspaceJobParamsSchema.safeParse({ jobId: longId }).success).toBe(false);
    expect(
      fileTranslationJobInputSchema.safeParse({
        sourceFileId: longId,
        fileFormat: "json",
        sourceLocale: "en",
        targetLocales: ["fr"],
      }).success,
    ).toBe(false);
  });

  it("should enforce max length on projectId and jobId in public-jobs.schema", () => {
    expect(jobIdParamsSchema.safeParse({ jobId: longId }).success).toBe(false);
    expect(
      latestPublicJobQuerySchema.safeParse({ projectId: longId, sourcePath: "a" }).success,
    ).toBe(false);

    const stringJobResult = createPublicJobBodySchema.safeParse({
      type: "string",
      projectId: longId,
      stringInput: {
        sourceText: "a",
        sourceLocale: "en",
        targetLocales: ["fr"],
      },
    });
    expect(stringJobResult.success).toBe(false);

    const fileJobResult = createPublicJobBodySchema.safeParse({
      type: "file",
      projectId: "valid",
      fileInput: {
        sourceFileId: longId,
        fileFormat: "json",
        sourceLocale: "en",
        targetLocales: ["fr"],
      },
    });
    expect(fileJobResult.success).toBe(false);
  });

  it("should enforce max length on projectId and fileId in public-files.schema", () => {
    expect(uploadBodySchema.safeParse({ projectId: longId, sourcePath: "a" }).success).toBe(false);
    expect(publicFileParamsSchema.safeParse({ fileId: longId }).success).toBe(false);
  });

  it("should enforce max length on search query q in github-installation.schema", () => {
    expect(searchRepositoriesSchema.safeParse({ q: longSearch }).success).toBe(false);
  });

  it("should enforce max length on apiKeyId", () => {
    expect(apiKeyIdParamsSchema.safeParse({ apiKeyId: longId }).success).toBe(false);
  });

  it("should enforce max length on file params (slug and fileId)", () => {
    expect(fileParamsSchema.safeParse({ organizationSlug: longId, fileId: "valid" }).success).toBe(
      false,
    );
    expect(fileParamsSchema.safeParse({ organizationSlug: "valid", fileId: longId }).success).toBe(
      false,
    );
  });

  it("should enforce max length on glossaryId", () => {
    expect(glossaryIdParamsSchema.safeParse({ glossaryId: longId }).success).toBe(false);
  });

  it("should enforce max length on projectId in chat-request", () => {
    expect(chatRequestBodySchema.safeParse({ text: "a", projectId: longId }).success).toBe(false);
    expect(multipartChatRequestSchema.safeParse({ text: "a", projectId: longId }).success).toBe(
      false,
    );
  });
});
