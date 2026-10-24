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
import { describe, expect, it, vi } from "vite-plus/test";

import {
  SmartlingApiClient,
  SmartlingApiError,
  classifySmartlingHttpError,
  deriveServiceBaseUrl,
  normalizeServiceBaseUrl,
} from "./smartling-api";

describe("SmartlingApiClient", () => {
  const credentials = {
    userIdentifier: "user-1",
    userSecret: "secret-1",
    accountUid: "acct-1",
  };

  function createClient(fetchFn: typeof fetch) {
    return new SmartlingApiClient({
      credentials,
      authBaseUrl: "https://api.smartling.test/auth-api/v2",
      accountsBaseUrl: "https://api.smartling.test/accounts-api/v2",
      projectsBaseUrl: "https://api.smartling.test/projects-api/v2",
      filesBaseUrl: "https://api.smartling.test/files-api/v2",
      stringsBaseUrl: "https://api.smartling.test/strings-api/v2",
      jobsBaseUrl: "https://api.smartling.test/jobs-api/v3",
      fetchFn,
    });
  }

  it("authenticates and caches the access token", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accessToken: "access-token",
                refreshToken: "refresh-token",
                expiresIn: 3600,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const first = await client.getAccessToken();
    const second = await client.getAccessToken();

    expect(first).toBe("access-token");
    expect(second).toBe("access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the access token when it is near expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate/refresh")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accessToken: "refreshed-token",
                refreshToken: "refresh-token",
                expiresIn: 3600,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                accessToken: "access-token",
                refreshToken: "refresh-token",
                expiresIn: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await client.getAccessToken();
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const refreshed = await client.getAccessToken();

    expect(refreshed).toBe("refreshed-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smartling.test/auth-api/v2/authenticate/refresh",
      expect.objectContaining({ method: "POST" }),
    );

    vi.useRealTimers();
  });

  it("lists account projects with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/accounts/acct-1/projects")) {
        if (String(url).includes("offset=0")) {
          return new Response(
            JSON.stringify({
              response: {
                code: "SUCCESS",
                data: {
                  items: [
                    {
                      accountUid: "acct-1",
                      projectId: "proj-1",
                      projectName: "Marketing",
                      sourceLocaleId: "en-US",
                      archived: false,
                      projectTypeCode: "GDN",
                    },
                  ],
                  totalCount: 2,
                },
              },
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    accountUid: "acct-1",
                    projectId: "proj-2",
                    projectName: "Mobile",
                    sourceLocaleId: "en-US",
                    archived: false,
                  },
                ],
                totalCount: 2,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const projects = await client.listAccountProjects("acct-1");

    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      projectId: "proj-1",
      projectName: "Marketing",
      sourceLocaleId: "en-US",
    });
  });

  it("throws SmartlingApiError on auth failure", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "AUTHENTICATION_ERROR",
            errors: [{ message: "Invalid credentials" }],
          },
        }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.authenticate()).rejects.toBeInstanceOf(SmartlingApiError);
    await expect(client.authenticate()).rejects.toMatchObject({
      status: 401,
      code: "smartling_auth_invalid",
    });
  });

  it("classifies paid or unavailable API responses", () => {
    expect(
      classifySmartlingHttpError(403, {
        response: {
          code: "FEATURE_NOT_AVAILABLE",
          errors: [{ message: "API access is not enabled on your subscription" }],
        },
      }),
    ).toMatchObject({
      errorCode: "smartling_api_unavailable",
    });
  });

  it("uses classified error codes for non-success envelopes on HTTP 200", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          response: {
            code: "MAX_OPERATIONS_LIMIT_EXCEEDED",
            errors: [{ message: "Rate limit exceeded" }],
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);

    await expect(client.authenticate()).rejects.toMatchObject({
      status: 200,
      code: "smartling_request_failed",
    });
  });

  it("lists project files with pagination", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/files/list") && String(url).includes("offset=0")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ fileUri: "a.json", fileType: "json" }],
                totalCount: 2,
              },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/files/list")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ fileUri: "b.json", fileType: "json" }],
                totalCount: 2,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const files = await client.listProjectFiles("proj-1");

    expect(files).toHaveLength(2);
    expect(files[0]?.fileUri).toBe("a.json");
    expect(files[1]?.fileUri).toBe("b.json");
  });

  it("lists source strings filtered by fileUri", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/source-strings")) {
        expect(String(url)).toContain("fileUri=messages.json");
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [{ hashcode: "hash-1", stringText: "Hello", fileUri: "messages.json" }],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const strings = await client.listSourceStrings("proj-1", { fileUri: "messages.json" });

    expect(strings).toHaveLength(1);
    expect(strings[0]).toMatchObject({ hashcode: "hash-1", stringText: "Hello" });
  });

  it("lists jobs for a project", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (String(url).includes("/jobs-api/v3/projects/proj-1/jobs")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                items: [
                  {
                    translationJobUid: "job-1",
                    jobName: "Launch",
                    jobStatus: "AWAITING_AUTHORIZATION",
                    targetLocaleIds: ["fr-FR"],
                  },
                ],
                totalCount: 1,
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const jobs = await client.listJobs("proj-1");

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      translationJobUid: "job-1",
      jobStatus: "AWAITING_AUTHORIZATION",
    });
  });

  it("updateJob sends only provided title and description fields", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (
        String(url).endsWith("/jobs-api/v3/projects/proj-1/jobs/job-1") &&
        init?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                translationJobUid: "job-1",
                jobName: "Updated launch",
                jobStatus: "IN_PROGRESS",
                description: "Prioritize EU locales",
                targetLocaleIds: ["fr-FR"],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const updated = await client.updateJob("proj-1", "job-1", {
      jobName: "Updated launch",
      description: "Prioritize EU locales",
    });

    expect(updated).toMatchObject({
      translationJobUid: "job-1",
      jobName: "Updated launch",
      description: "Prioritize EU locales",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smartling.test/jobs-api/v3/projects/proj-1/jobs/job-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          jobName: "Updated launch",
          description: "Prioritize EU locales",
        }),
      }),
    );
  });

  it("updateJob clears description with an empty string and omits unset fields", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: { accessToken: "access-token", expiresIn: 3600 },
            },
          }),
          { status: 200 },
        );
      }

      if (
        String(url).endsWith("/jobs-api/v3/projects/proj-1/jobs/job-1") &&
        init?.method === "PUT"
      ) {
        return new Response(
          JSON.stringify({
            response: {
              code: "SUCCESS",
              data: {
                translationJobUid: "job-1",
                jobName: "Launch",
                jobStatus: "IN_PROGRESS",
                description: null,
                targetLocaleIds: ["fr-FR"],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await client.updateJob("proj-1", "job-1", { description: null });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smartling.test/jobs-api/v3/projects/proj-1/jobs/job-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ description: "" }),
      }),
    );
  });

  it("searches glossaries through the v3 API", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return smartlingJson({ accessToken: "access-token", expiresIn: 3600 });
      }
      if (
        String(url).endsWith("/glossary-api/v3/accounts/acct-1/glossaries/search") &&
        init?.method === "POST"
      ) {
        expect(JSON.parse(String(init.body))).toMatchObject({
          query: "Brand",
          paging: { offset: 0, limit: 500 },
        });
        return smartlingJson({
          totalCount: 1,
          items: [{ glossaryUid: "gloss-1", name: "Brand terms", localeIds: ["en-US"] }],
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const glossaries = await client.searchAccountGlossaries("acct-1", "Brand");
    expect(glossaries).toEqual([
      {
        glossaryUid: "gloss-1",
        name: "Brand terms",
        description: null,
        localeIds: ["en-US"],
      },
    ]);
  });

  it("creates a glossary through the v3 API", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return smartlingJson({ accessToken: "access-token", expiresIn: 3600 });
      }
      if (
        String(url).endsWith("/glossary-api/v3/accounts/acct-1/glossaries") &&
        init?.method === "POST"
      ) {
        return smartlingJson({
          glossaryUid: "gloss-new",
          name: "Brand terms",
          accountUid: "acct-1",
          localeIds: ["en-US", "fr-FR"],
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const created = await client.createGlossary({
      accountUid: "acct-1",
      name: "Brand terms",
      localeIds: ["en-US", "fr-FR"],
    });

    expect(created).toMatchObject({
      glossaryUid: "gloss-new",
      name: "Brand terms",
      localeIds: ["en-US", "fr-FR"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.smartling.test/glossary-api/v3/accounts/acct-1/glossaries",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "Brand terms",
          localeIds: ["en-US", "fr-FR"],
        }),
      }),
    );
  });

  it("exports official glossary XLSX and defaults locales from get", async () => {
    let exportBody: unknown;
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return smartlingJson({ accessToken: "access-token", expiresIn: 3600 });
      }
      if (String(url).endsWith("/glossary-api/v3/accounts/acct-1/glossaries/gloss-1")) {
        return smartlingJson({
          glossaryUid: "gloss-1",
          glossaryName: "Brand terms",
          localeIds: ["en-US", "de-DE"],
        });
      }
      if (String(url).endsWith("/entries/download") && init?.method === "POST") {
        exportBody = JSON.parse(String(init.body));
        return new Response("xlsx-bytes", {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const exported = await client.exportGlossary({
      accountUid: "acct-1",
      glossaryUid: "gloss-1",
      format: "xlsx",
    });

    expect(new TextDecoder().decode(exported.content)).toBe("xlsx-bytes");
    expect(exported.bytes).toBe("xlsx-bytes".length);
    expect(exportBody).toMatchObject({
      format: "XLSX",
      localeIds: ["en-US", "de-DE"],
    });
  });

  it("imports official glossary TBX and polls until successful", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return smartlingJson({ accessToken: "access-token", expiresIn: 3600 });
      }
      if (String(url).endsWith("/import") && init?.method === "POST") {
        const form = init?.body as FormData;
        expect(form.get("importFileMediaType")).toBe("text/xml");
        expect(form.get("archiveMode")).toBe("true");
        return smartlingJson({
          glossaryImport: {
            glossaryUid: "gloss-1",
            importUid: "import-1",
            importStatus: "PENDING",
          },
        });
      }
      if (String(url).endsWith("/import/import-1/confirm")) {
        return smartlingJson({});
      }
      if (String(url).endsWith("/import/import-1")) {
        return smartlingJson({
          glossaryUid: "gloss-1",
          importUid: "import-1",
          importStatus: "SUCCESSFUL",
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const imported = await client.importGlossary({
      accountUid: "acct-1",
      glossaryUid: "gloss-1",
      filename: "terms.tbx",
      content: new TextEncoder().encode("<tbx/>"),
      archiveMode: true,
    });

    expect(imported).toEqual({ importUid: "import-1", importStatus: "SUCCESSFUL" });
  });

  it("creates a translation memory through GraphQL", async () => {
    let graphqlBody: unknown;
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return smartlingJson({ accessToken: "access-token", expiresIn: 3600 });
      }
      if (String(url).endsWith("/tm-graphql-api/v2/accounts/acct-1/graphql")) {
        graphqlBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            data: {
              createTm: {
                tmUid: "tm-new",
                name: "Product TM",
                description: "Fresh memory",
                sourceLocaleId: "en-US",
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const created = await client.createTranslationMemory({
      accountUid: "acct-1",
      name: "Product TM",
      description: "Fresh memory",
      sourceLocaleId: "en-US",
    });

    expect(created).toEqual({
      translationMemoryUid: "tm-new",
      name: "Product TM",
      description: "Fresh memory",
      sourceLocaleId: "en-US",
    });
    expect(graphqlBody).toMatchObject({
      variables: {
        createTm: {
          name: "Product TM",
          description: "Fresh memory",
          sourceLocaleId: "en-US",
        },
      },
    });
  });

  it("surfaces GraphQL errors from translation memory create", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).endsWith("/authenticate")) {
        return smartlingJson({ accessToken: "access-token", expiresIn: 3600 });
      }
      if (String(url).endsWith("/graphql")) {
        return new Response(JSON.stringify({ errors: [{ message: "name must not be blank" }] }), {
          status: 200,
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    await expect(
      client.createTranslationMemory({
        accountUid: "acct-1",
        name: "Product TM",
        sourceLocaleId: "en-US",
      }),
    ).rejects.toMatchObject({
      message: "name must not be blank",
    });
  });

  it("imports a TMX file into a translation memory", async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).endsWith("/authenticate")) {
        return smartlingJson({ accessToken: "access-token", expiresIn: 3600 });
      }
      if (String(url).endsWith("/tm-tmx-api/v2/accounts/acct-1/tmx/file")) {
        const form = init?.body as FormData;
        expect(form.get("tmUid")).toBe("tm-1");
        expect(form.get("fileUri")).toBe("memory.tmx");
        return smartlingJson({
          jobUid: "job-1",
          tmxUid: "tmx-1",
          stringCount: 12,
          wordCount: 34,
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;

    const client = createClient(fetchMock);
    const imported = await client.importTranslationMemory({
      accountUid: "acct-1",
      translationMemoryUid: "tm-1",
      filename: "memory.tmx",
      content: new TextEncoder().encode("<tmx/>"),
    });

    expect(imported).toEqual({
      jobUid: "job-1",
      tmxUid: "tmx-1",
      stringCount: 12,
      wordCount: 34,
    });
  });

  it("rejects non-TMX translation memory imports before calling Smartling", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    const client = createClient(fetchMock);
    await expect(
      client.importTranslationMemory({
        accountUid: "acct-1",
        translationMemoryUid: "tm-1",
        filename: "memory.csv",
        content: new Uint8Array(),
      }),
    ).rejects.toThrow("smartling_translation_memory_file_must_be_tmx");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function smartlingJson(data: unknown) {
  return new Response(JSON.stringify({ response: { code: "SUCCESS", data } }), { status: 200 });
}

describe("deriveServiceBaseUrl", () => {
  it("derives accounts and projects base URLs from the auth base URL", () => {
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "accounts")).toBe(
      "https://api.smartling.test/accounts-api/v2",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "projects")).toBe(
      "https://api.smartling.test/projects-api/v2",
    );
  });

  it("derives files, strings, and jobs base URLs from the auth base URL", () => {
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "files")).toBe(
      "https://api.smartling.test/files-api/v2",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "strings")).toBe(
      "https://api.smartling.test/strings-api/v2",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "jobs")).toBe(
      "https://api.smartling.test/jobs-api/v3",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "glossary-v3")).toBe(
      "https://api.smartling.test/glossary-api/v3",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "tm-graphql")).toBe(
      "https://api.smartling.test/tm-graphql-api/v2",
    );
    expect(deriveServiceBaseUrl("https://api.smartling.test/auth-api/v2", "tm-tmx")).toBe(
      "https://api.smartling.test/tm-tmx-api/v2",
    );
  });
});

describe("normalizeServiceBaseUrl", () => {
  const fallback = "https://api.smartling.com/auth-api/v2";

  it("normalizes a valid stored base URL", () => {
    expect(normalizeServiceBaseUrl("https://api.smartling.test/auth-api/v2/", fallback)).toBe(
      "https://api.smartling.test/auth-api/v2",
    );
  });

  it("falls back to the default when the stored base URL is invalid or unsafe", () => {
    expect(normalizeServiceBaseUrl("not-a-url", fallback)).toBe(fallback);
    expect(normalizeServiceBaseUrl("https://192.168.1.10/auth-api/v2", fallback)).toBe(fallback);
  });
});
