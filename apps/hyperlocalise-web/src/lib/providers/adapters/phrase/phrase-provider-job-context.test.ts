import { describe, expect, it } from "vite-plus/test";

import {
  buildPhraseExternalJobId,
  buildPhraseJobScopeTag,
  filterPhraseKeysForJobScope,
  findPhraseTmsJobPart,
  normalizePhraseTaskLocaleSuffix,
  parsePhraseExternalJobId,
  resolvePhraseTmsProjectUid,
} from "./phrase-provider";

describe("phrase job context", () => {
  it("parses and builds external job ids", () => {
    expect(parsePhraseExternalJobId("phrase-job-1-task-fr-fr")).toEqual({
      innerId: "phrase-job-1",
      taskLocaleSuffix: "fr-fr",
    });
    expect(buildPhraseExternalJobId("phrase-job-1", "fr-FR")).toBe("phrase-job-1-task-fr-fr");
    expect(normalizePhraseTaskLocaleSuffix("fr_FR")).toBe("fr-fr");
  });

  it("builds stable job scope tags", () => {
    expect(buildPhraseJobScopeTag("phrase-job-1")).toBe("hyperlocalise:job:phrase-job-1");
  });

  it("finds TMS job parts by external job id", () => {
    const jobPart = findPhraseTmsJobPart({
      externalJobId: "phrase-job-1-task-fr-fr",
      jobParts: [
        {
          uid: "task-fr",
          innerId: "phrase-job-1",
          status: "NEW",
          targetLang: "fr-FR",
          filename: "Homepage",
          dateDue: null,
          dateCreated: null,
          workflowStep: null,
          owner: null,
          importStatus: null,
        },
      ],
    });

    expect(jobPart?.uid).toBe("task-fr");
  });

  it("prefers tmsProjectUid from metadata and falls back to externalProjectId", () => {
    expect(
      resolvePhraseTmsProjectUid(
        {
          providerMetadata: { tmsProjectUid: "tms-project-1" },
        },
        "legacy-project-id",
      ),
    ).toBe("tms-project-1");
    expect(
      resolvePhraseTmsProjectUid(
        {
          providerMetadata: {},
        },
        "legacy-project-id",
      ),
    ).toBe("legacy-project-id");
    expect(
      resolvePhraseTmsProjectUid(
        {
          providerMetadata: {},
        },
        "",
      ),
    ).toBeNull();
    expect(
      resolvePhraseTmsProjectUid(
        {
          providerMetadata: { stringsProjectId: "strings-project-1" },
        },
        "strings-project-1",
      ),
    ).toBeNull();
  });

  it("filters keys by job tag and returns none when no keys match", () => {
    const keys = [{ tags: ["hyperlocalise:job:job-1"] }, { tags: ["other"] }];

    expect(filterPhraseKeysForJobScope({ keys, jobTag: "hyperlocalise:job:job-1" })).toHaveLength(
      1,
    );
    expect(filterPhraseKeysForJobScope({ keys, jobTag: "missing" })).toHaveLength(0);
    expect(filterPhraseKeysForJobScope({ keys, jobTag: null })).toHaveLength(2);
  });
});
