import { describe, expect, it, vi } from "vite-plus/test";

import { CrowdinApiClient } from "./crowdin/crowdin-api";
import { LokaliseApiClient } from "./lokalise/lokalise-api";
import { PhraseApiClient } from "./phrase/phrase-api";
import { SmartlingApiClient } from "./smartling/smartling-api";

describe("source file upload API clients", () => {
  it("constructs Phrase multipart source uploads", async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const form = init?.body as FormData;
      const file = form.get("file") as File;
      expect(init?.method).toBe("POST");
      expect(form.get("file_format")).toBe("json");
      expect(form.get("locale_id")).toBe("locale-en");
      expect(file.name).toBe("home.json");
      expect(await file.text()).toBe(`{"hello":"Hello"}`);
      return Response.json({
        id: "upload-1",
        filename: "home.json",
        format: "json",
        state: "success",
        tags: [],
      });
    });
    const client = new PhraseApiClient({
      token: "token",
      baseUrl: "https://api.phrase.test/api/v2",
      fetchFn,
    });

    const result = await client.uploadSourceFile("project-1", {
      filename: "home.json",
      content: new TextEncoder().encode(`{"hello":"Hello"}`),
      contentType: "application/json",
      fileFormat: "json",
      localeId: "locale-en",
      branch: "main",
    });

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "https://api.phrase.test/api/v2/projects/project-1/uploads?branch=main",
    );
    expect(result.id).toBe("upload-1");
  });

  it("constructs Lokalise queued source imports", async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(init?.method).toBe("POST");
      expect(body).toMatchObject({
        filename: "home.json",
        lang_iso: "en",
        format: "json",
        queue: true,
      });
      expect(Buffer.from(String(body.data), "base64").toString("utf8")).toBe(`{"hello":"Hello"}`);
      return Response.json({
        process: {
          process_id: "process-1",
          type: "file-import",
          status: "queued",
        },
      });
    });
    const client = new LokaliseApiClient({
      token: "token",
      baseUrl: "https://api.lokalise.test/api2",
      fetchFn,
    });

    const result = await client.uploadSourceFile("project-1", {
      filename: "home.json",
      content: new TextEncoder().encode(`{"hello":"Hello"}`),
      sourceLocale: "en",
      format: "json",
      branch: "main",
    });

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "https://api.lokalise.test/api2/projects/project-1:main/files/upload",
    );
    expect(result.processId).toBe("process-1");
  });

  it("constructs Smartling multipart source uploads after auth", async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("/authenticate")) {
        return Response.json({
          response: {
            code: "SUCCESS",
            data: {
              accessToken: "access-token",
              refreshToken: "refresh-token",
              expiresIn: 3600,
            },
          },
        });
      }

      const form = init?.body as FormData;
      const file = form.get("file") as File;
      expect(init?.method).toBe("POST");
      expect(form.get("fileUri")).toBe("content/en/home.json");
      expect(form.get("fileType")).toBe("json");
      expect(file.name).toBe("home.json");
      expect(await file.text()).toBe(`{"hello":"Hello"}`);
      return Response.json({
        response: {
          code: "SUCCESS",
          data: {
            processUid: "process-1",
          },
        },
      });
    });
    const client = new SmartlingApiClient({
      credentials: { userIdentifier: "user", userSecret: "secret" },
      authBaseUrl: "https://api.smartling.test/auth-api/v2",
      fetchFn,
    });

    const result = await client.uploadSourceFile("project-1", {
      fileUri: "content/en/home.json",
      fileType: "json",
      filename: "home.json",
      content: new TextEncoder().encode(`{"hello":"Hello"}`),
      contentType: "application/json",
    });

    expect(String(fetchFn.mock.calls[1]?.[0])).toBe(
      "https://api.smartling.test/files-api/v2/projects/project-1/file",
    );
    expect(result.processUid).toBe("process-1");
  });

  it("constructs Crowdin source file create requests", async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        storageId: 7,
        name: "home.json",
        branchId: 3,
      });
      return Response.json({
        data: {
          id: 9,
          branchId: 3,
          directoryId: null,
          name: "home.json",
          title: null,
          type: "json",
          path: "/home.json",
          status: "active",
          revisionId: 2,
        },
      });
    });
    const client = new CrowdinApiClient({
      token: "token",
      baseUrl: "https://api.crowdin.test/api/v2",
      fetchFn,
    });

    const result = await client.addSourceFile(123, {
      storageId: 7,
      name: "home.json",
      branchId: 3,
    });

    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "https://api.crowdin.test/api/v2/projects/123/files",
    );
    expect(result.id).toBe(9);
  });
});
