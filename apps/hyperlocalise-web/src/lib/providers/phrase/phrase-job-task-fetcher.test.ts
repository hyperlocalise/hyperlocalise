import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { fetchPhraseJobTasks } from "./phrase-job-task-fetcher";

describe("fetchPhraseJobTasks", () => {
  let originalFetch: typeof fetch;

  const credential = {
    id: "cred-1",
    organizationId: "org-1",
    providerKind: "phrase" as const,
    displayName: "Phrase",
    region: null,
    baseUrl: "https://cloud.memsource.com/web",
    validationStatus: "connected",
    validationMessage: null,
    lastValidatedAt: null,
    encryptionAlgorithm: "aes-256-gcm",
    keyVersion: 1,
    ciphertext: "cipher",
    iv: "iv",
    authTag: "tag",
    maskedSecretSuffix: "cret",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns normalized job metadata with TM and term-base references", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      const workflowLevel = Number(new URL(path).searchParams.get("workflowLevel") ?? "0");

      if (path.includes("/jobs?") && workflowLevel === 1) {
        return new Response(
          JSON.stringify({
            content: [
              {
                uid: "task-fr",
                innerId: "phrase-job-1",
                status: "NEW",
                targetLang: "fr-FR",
                filename: "Homepage French",
                dateDue: "2026-06-01T00:00:00.000Z",
                owner: { userName: "translator@example.com" },
                workflowStep: { id: "step-translation", name: "Translation", workflowLevel: 1 },
              },
            ],
            totalPages: 1,
          }),
          { status: 200 },
        );
      }

      if (path.includes("/jobs?") && workflowLevel === 2) {
        return new Response(JSON.stringify({ content: [], totalPages: 0 }), { status: 200 });
      }

      if (path.includes("/transMemories")) {
        return new Response(
          JSON.stringify({
            transMemories: [{ uid: "tm-fr", name: "French TM", id: "101" }],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/termBases")) {
        return new Response(
          JSON.stringify({
            termBases: [{ uid: "tb-brand", name: "Brand terms", id: "55" }],
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ content: [], totalPages: 0 }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchPhraseJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      credential,
      project: {
        providerMetadata: {},
      } as never,
      secretMaterial: "secret-token",
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalJobId: "phrase-job-1-task-fr-fr",
      externalTaskId: "task-fr",
      externalStatus: "NEW",
      title: "Homepage French (fr-FR)",
      targetLocales: ["fr-FR"],
      assignedUsers: ["translator@example.com"],
      kind: "translation",
    });
    expect(result[0]?.providerPayload).toMatchObject({
      workflowStep: "Translation",
      translationMemories: [{ uid: "tm-fr", name: "French TM", id: "101" }],
      termBases: [{ uid: "tb-brand", name: "Brand terms", id: "55" }],
    });
  });

  it("maps review workflow steps to review job kind", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      const workflowLevel = Number(new URL(path).searchParams.get("workflowLevel") ?? "0");

      if (path.includes("/jobs?") && workflowLevel === 1) {
        return new Response(
          JSON.stringify({
            content: [
              {
                uid: "task-review",
                innerId: "phrase-job-2",
                status: "ACCEPTED",
                targetLang: "de-DE",
                filename: "Docs",
                workflowStep: { id: "step-review", name: "Review", workflowLevel: 1 },
              },
            ],
            totalPages: 1,
          }),
          { status: 200 },
        );
      }

      if (path.includes("/transMemories") || path.includes("/termBases")) {
        return new Response(JSON.stringify({ transMemories: [], termBases: [] }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ content: [], totalPages: 0 }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const result = await fetchPhraseJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "phrase",
      externalProjectId: "phrase-project-1",
      credential,
      project: { providerMetadata: {} } as never,
      secretMaterial: "secret-token",
    });

    expect(result[0]?.kind).toBe("review");
  });

  it("uses tmsProjectUid from provider metadata when present", async () => {
    let requestedTmsProjectJobs = false;

    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      if (path.includes("/projects/tms-project-uid/jobs")) {
        requestedTmsProjectJobs = true;
        return new Response(
          JSON.stringify({
            content: [
              {
                uid: "task-1",
                innerId: "job-1",
                status: "COMPLETED",
                targetLang: "es-ES",
                filename: "Landing",
              },
            ],
            totalPages: 1,
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ content: [], totalPages: 0 }), { status: 200 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    await fetchPhraseJobTasks({
      organizationId: "org-1",
      projectId: "project-1",
      providerKind: "phrase",
      externalProjectId: "strings-project-id",
      credential,
      project: {
        providerMetadata: { tmsProjectUid: "tms-project-uid" },
      } as never,
      secretMaterial: "secret-token",
    });

    expect(requestedTmsProjectJobs).toBe(true);
  });

  it("throws phrase_auth_invalid on unauthorized responses", async () => {
    globalThis.fetch = vi.fn(async () => new Response("Unauthorized", { status: 401 })) as never;

    await expect(
      fetchPhraseJobTasks({
        organizationId: "org-1",
        projectId: "project-1",
        providerKind: "phrase",
        externalProjectId: "phrase-project-1",
        credential,
        project: { providerMetadata: {} } as never,
        secretMaterial: "secret-token",
      }),
    ).rejects.toThrow("phrase_auth_invalid");
  });
});
