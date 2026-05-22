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
import { uploadBodySchema, fileParamsSchema } from "./public-files/public-files.schema";
import { searchRepositoriesSchema } from "./github-installation/github-installation.schema";

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
    expect(fileParamsSchema.safeParse({ fileId: longId }).success).toBe(false);
  });

  it("should enforce max length on search query q in github-installation.schema", () => {
    expect(searchRepositoriesSchema.safeParse({ q: longSearch }).success).toBe(false);
  });
});
