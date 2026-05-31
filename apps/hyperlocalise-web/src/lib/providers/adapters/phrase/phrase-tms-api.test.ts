import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { PhraseTmsApiClient, phraseTmsAuthorizationHeader } from "./phrase-tms-api";

describe("PhraseTmsApiClient", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("builds ApiToken authorization headers", () => {
    expect(phraseTmsAuthorizationHeader("secret")).toBe("ApiToken secret");
    expect(phraseTmsAuthorizationHeader("ApiToken secret")).toBe("ApiToken secret");
  });

  it("lists job parts across workflow levels", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);
      const workflowLevel = Number(new URL(path).searchParams.get("workflowLevel"));

      if (workflowLevel === 1) {
        return new Response(
          JSON.stringify({
            content: [
              {
                uid: "job-fr",
                innerId: "phrase-job-1",
                status: "NEW",
                targetLang: "fr-FR",
                filename: "Homepage",
                workflowStep: { id: "step-1", name: "Translation", workflowLevel: 1 },
              },
            ],
            totalPages: 1,
          }),
          { status: 200 },
        );
      }

      if (workflowLevel === 2) {
        return new Response(
          JSON.stringify({
            content: [
              {
                uid: "job-de",
                innerId: "phrase-job-1",
                status: "ACCEPTED",
                targetLang: "de-DE",
                filename: "Homepage",
                workflowStep: { id: "step-2", name: "Review", workflowLevel: 2 },
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

    const client = new PhraseTmsApiClient({
      token: "secret",
      baseUrl: "https://cloud.memsource.com/web",
    });

    const jobs = await client.listAllJobParts("project-1", 2);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.uid).sort()).toEqual(["job-de", "job-fr"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops listing workflow levels after the first empty page", async () => {
    const fetchMock = vi.fn(async (url) => {
      const workflowLevel = Number(new URL(String(url)).searchParams.get("workflowLevel"));

      if (workflowLevel === 1) {
        return new Response(
          JSON.stringify({
            content: [
              {
                uid: "job-fr",
                innerId: "phrase-job-1",
                status: "NEW",
                targetLang: "fr-FR",
                filename: "Homepage",
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

    const client = new PhraseTmsApiClient({
      token: "secret",
      baseUrl: "https://cloud.memsource.com/web",
    });

    const jobs = await client.listAllJobParts("project-1", 15);
    expect(jobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("loads project translation memories and term bases", async () => {
    const fetchMock = vi.fn(async (url) => {
      const path = String(url);

      if (path.includes("/transMemories")) {
        return new Response(
          JSON.stringify({
            transMemories: [{ uid: "tm-1", name: "Marketing TM", id: "42" }],
          }),
          { status: 200 },
        );
      }

      if (path.includes("/termBases")) {
        return new Response(
          JSON.stringify({
            termBases: [{ uid: "tb-1", name: "Brand glossary", id: "7" }],
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    globalThis.fetch = fetchMock;

    const client = new PhraseTmsApiClient({
      token: "secret",
      baseUrl: "https://cloud.memsource.com/web",
    });

    const translationMemories = await client.getProjectTranslationMemories({
      projectUid: "project-1",
      targetLang: "fr-FR",
      workflowStepUid: "step-1",
    });
    const termBases = await client.getProjectTermBases("project-1");

    expect(translationMemories).toEqual([{ uid: "tm-1", name: "Marketing TM", id: "42" }]);
    expect(termBases).toEqual([{ uid: "tb-1", name: "Brand glossary", id: "7" }]);
  });
});
