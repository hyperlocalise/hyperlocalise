import { describe, expect, it, vi } from "vite-plus/test";

import { smartlingTmsProvider } from "./smartling-provider";

function smartlingResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      response: {
        code: "SUCCESS",
        data,
      },
    }),
    { status },
  );
}

function authResponse() {
  return smartlingResponse({ accessToken: "access-token", expiresIn: 3600 });
}

describe("smartlingTmsProvider.pullReview", () => {
  it("pulls job-scoped Smartling issues into a deduplicated review report", async () => {
    const issueRequestHashcodes: string[][] = [];
    const capturedFileUris: string[] = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? "GET";

      if (path.endsWith("/authenticate") && method === "POST") {
        return authResponse();
      }

      if (path.includes("/projects-api/v2/projects/proj-1") && method === "GET") {
        return smartlingResponse({
          accountUid: "acct-1",
          projectId: "proj-1",
          projectName: "Project",
          sourceLocaleId: "en-US",
          targetLocales: [],
        });
      }

      if (path.includes("/jobs-api/v3/projects/proj-1/jobs/job-1/files") && method === "GET") {
        return smartlingResponse({
          items: [{ fileUri: "messages.json", fileName: "messages.json" }],
          totalCount: 1,
        });
      }

      if (path.includes("/strings-api/v2/projects/proj-1/source-strings") && method === "GET") {
        capturedFileUris.push(new URL(path).searchParams.get("fileUri") ?? "");
        return smartlingResponse({
          items: [{ hashcode: "hash-from-job-file", stringText: "File text" }],
          totalCount: 1,
        });
      }

      if (path.endsWith("/issues/list") && method === "POST") {
        const requestBody = typeof init?.body === "string" ? init.body : "{}";
        const body = JSON.parse(requestBody) as {
          stringFilter?: { hashcodes?: string[] };
        };
        issueRequestHashcodes.push(body.stringFilter?.hashcodes ?? []);

        return smartlingResponse({
          items: [
            {
              issueUid: "issue-file-1",
              issueText: "Use approved terminology",
              issueTypeCode: "REVIEW",
              issueStateCode: "OPENED",
              string: { hashcode: "hash-from-job-file", localeId: "fr-FR" },
            },
            {
              issueUid: "issue-content-1",
              issueText: "Already resolved",
              issueTypeCode: "LINGUISTIC",
              issueStateCode: "CLOSED",
              string: { hashcode: "hash-from-content", localeId: "fr-FR" },
            },
            {
              issueUid: "issue-file-1",
              issueText: "Use approved terminology",
              issueTypeCode: "REVIEW",
              issueStateCode: "OPENED",
              string: { hashcode: "hash-from-job-file", localeId: "fr-FR" },
            },
          ],
          totalCount: 3,
        });
      }

      return new Response("Not Found", { status: 404 });
    });

    const report = await smartlingTmsProvider.pullReview({
      organizationId: "org-1",
      projectId: "proj_1",
      externalProjectId: "proj-1",
      externalJobId: "job-1",
      credential: { baseUrl: null } as never,
      project: {} as never,
      secretMaterial: "user:secret:acct-1",
      content: {
        externalJobId: "job-1",
        targetLocales: ["fr-FR"],
        units: [
          {
            externalStringId: "hash-from-content",
            key: "welcome.title",
            sourceText: "Hello",
            translations: [{ locale: "fr-FR", text: "Bonjour" }],
          },
        ],
      },
      fetchFn: fetchFn as typeof fetch,
    });

    expect(capturedFileUris).toEqual(["messages.json"]);
    expect(issueRequestHashcodes).toHaveLength(1);
    expect(issueRequestHashcodes[0]).toEqual(
      expect.arrayContaining(["hash-from-content", "hash-from-job-file"]),
    );
    expect(issueRequestHashcodes[0]).toHaveLength(2);
    expect(report.summary).toEqual({
      total: 2,
      open: 1,
      resolved: 1,
      byKind: { issue: 2 },
    });
    expect(report.threads).toEqual([
      expect.objectContaining({
        threadId: "smartling:proj-1:job-1:issue:issue-file-1",
        kind: "issue",
        state: "open",
        subject: "Use approved terminology",
        issueType: "REVIEW",
        item: {
          externalStringId: "hash-from-job-file",
          key: "hash-from-job-file",
          locale: "fr-FR",
          field: "target",
        },
        locale: "fr-FR",
        providerContext: expect.objectContaining({
          externalProjectId: "proj-1",
          externalJobId: "job-1",
          externalThreadId: "issue-file-1",
          externalCommentId: "issue-file-1",
          providerUrl:
            "https://dashboard.smartling.com/app/accounts/acct-1/project/proj-1/dashboard",
        }),
      }),
      expect.objectContaining({
        threadId: "smartling:proj-1:job-1:issue:issue-content-1",
        state: "resolved",
        subject: "Already resolved",
        issueType: "LINGUISTIC",
        item: expect.objectContaining({
          externalStringId: "hash-from-content",
          key: "welcome.title",
        }),
      }),
    ]);
  });

  it("maps Smartling authorization failures while loading review scope", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      const path = String(url);

      if (path.endsWith("/authenticate")) {
        return authResponse();
      }

      if (path.includes("/projects-api/v2/projects/proj-1")) {
        return new Response(
          JSON.stringify({
            response: {
              code: "AUTHENTICATION_ERROR",
              errors: [{ message: "invalid credentials" }],
            },
          }),
          { status: 401 },
        );
      }

      return new Response("Not Found", { status: 404 });
    });

    await expect(
      smartlingTmsProvider.pullReview({
        organizationId: "org-1",
        projectId: "proj_1",
        externalProjectId: "proj-1",
        externalJobId: "job-1",
        credential: { baseUrl: null } as never,
        project: {} as never,
        secretMaterial: "user:secret:acct-1",
        content: {
          externalJobId: "job-1",
          targetLocales: ["fr-FR"],
          units: [],
        },
        fetchFn: fetchFn as typeof fetch,
      }),
    ).rejects.toThrow("smartling_auth_invalid");
  });
});
