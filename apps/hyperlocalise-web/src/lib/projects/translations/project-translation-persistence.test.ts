import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { insertMock, limitMock, onConflictDoUpdateMock, selectMock, whereMock } = vi.hoisted(() => {
  const onConflictDoUpdateMock = vi.fn(() => undefined);
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: onConflictDoUpdateMock }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  const limitMock = vi.fn(async (): Promise<unknown[]> => []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  return {
    insertMock,
    limitMock,
    onConflictDoUpdateMock,
    selectMock,
    whereMock,
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ["and", conditions]),
  eq: vi.fn((field: string, value: unknown) => ["eq", field, value]),
  inArray: vi.fn((field: string, values: unknown[]) => ["inArray", field, values]),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      sql: strings.join(""),
      values,
    })),
    { raw: vi.fn((value: string) => ({ raw: value })) },
  ),
}));

vi.mock("@/lib/database", () => ({
  db: {
    insert: insertMock,
    select: selectMock,
  },
  schema: {
    repositorySourceFiles: {
      id: "id",
      organizationId: "organizationId",
      projectId: "projectId",
      sourcePath: "sourcePath",
    },
    projectTranslationKeys: {
      id: "id",
      key: "key",
      projectId: "projectId",
      repositorySourceFileId: "repositorySourceFileId",
    },
    projectTranslations: {
      translationKeyId: "translationKeyId",
      targetLocale: "targetLocale",
    },
  },
}));

import { persistFileJobTranslations } from "./project-translation-service";

describe("persistFileJobTranslations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([]);
  });

  it("preserves approved translations on conflict instead of overwriting review state", async () => {
    whereMock
      .mockImplementationOnce(() => ({ limit: limitMock }))
      .mockImplementationOnce(
        () =>
          Promise.resolve([{ id: "key_1", key: "greeting" }]) as unknown as {
            limit: typeof limitMock;
          },
      );
    limitMock.mockResolvedValueOnce([{ id: "repo_file_1" }]);

    await persistFileJobTranslations({
      organizationId: "org_1",
      projectId: "project_1",
      jobId: "job_1",
      sourcePath: "locales/en.json",
      sourceLocale: "en",
      targetLocale: "fr",
      sourceEntries: { greeting: "Hello" },
      targetEntries: { greeting: "Bonjour" },
    });

    expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          text: expect.objectContaining({
            sql: expect.stringContaining("project_translations.status = 'approved'"),
          }),
          status: expect.objectContaining({
            sql: expect.stringContaining("project_translations.status = 'approved'"),
          }),
          reviewedAt: expect.objectContaining({
            sql: expect.stringContaining("project_translations.reviewed_at"),
          }),
        }),
      }),
    );
  });
});
