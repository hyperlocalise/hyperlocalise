import { describe, expect, it } from "vite-plus/test";

import { crowdinTmsProvider } from "./crowdin-provider";
import type { CrowdinTask } from "./crowdin-api";

function buildTask(overrides: Partial<CrowdinTask> = {}): CrowdinTask {
  return {
    id: 1,
    projectId: 1,
    type: 0,
    status: "todo",
    title: "Task",
    description: null,
    fileIds: [],
    assignees: [],
    deadline: null,
    webUrl: "https://crowdin.com/project/1/tasks/1",
    languageId: null,
    targetLanguageId: null,
    sourceLanguageId: null,
    targetLanguages: null,
    ...overrides,
  };
}

describe("crowdin task locales", () => {
  it("prefers targetLanguages over legacy languageId", () => {
    const metadata = crowdinTmsProvider.mapTaskToJobTaskMetadata(
      buildTask({
        languageId: null,
        targetLanguageId: "de",
        targetLanguages: [{ id: "fr" }, { id: "es" }],
      }),
      {},
    );

    expect(metadata.targetLocales).toEqual(["fr", "es"]);
  });

  it("falls back to targetLanguageId then languageId", () => {
    expect(
      crowdinTmsProvider.mapTaskToJobTaskMetadata(
        buildTask({
          languageId: "it",
          targetLanguageId: "de",
        }),
        {},
      ).targetLocales,
    ).toEqual(["de"]);

    expect(
      crowdinTmsProvider.mapTaskToJobTaskMetadata(
        buildTask({
          languageId: "it",
        }),
        {},
      ).targetLocales,
    ).toEqual(["it"]);
  });

  it("extracts source and primary language ids", () => {
    expect(
      crowdinTmsProvider.mapTaskToJobTaskMetadata(
        buildTask({
          sourceLanguageId: "en",
        }),
        {},
      ).providerPayload,
    ).toMatchObject({
      sourceLanguageId: "en",
    });

    expect(
      crowdinTmsProvider.mapTaskToJobTaskMetadata(
        buildTask({
          targetLanguageId: "fr",
          languageId: "de",
        }),
        {},
      ).providerPayload,
    ).toMatchObject({
      languageId: "fr",
      targetLanguageId: "fr",
    });
  });
});
