import { cleanup, render, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { App } from "./app";
import { DEFAULT_APP_URL, DEFAULT_SETTINGS } from "./settings";
import type { FigmaPageJobBinding } from "./page-binding";
import type { FigmaPageJob, PluginSettings, SandboxToUiMessage } from "./plugin-messages";

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

const succeededJob: FigmaPageJob = {
  jobId: "job_figma",
  status: "succeeded",
  projectId: "proj_1",
  sourcePath: "figma/files/file-1/page-1.json",
  targetLocales: ["es"],
  lastError: null,
  translationsByLocale: { es: { "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV": "Hola" } },
};

const sessionFixture = {
  organization: { slug: "acme", name: "Acme", id: "org_1" },
  project: {
    id: "proj_1",
    name: "Marketing",
    sourceLocale: "en",
    targetLocales: ["es"],
  },
  projects: [{ id: "proj_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] }],
  connection: {
    id: "conn_1",
    displayName: "Test",
    sourceLocale: "en",
    targetLocales: ["es"],
  },
};

const signedInSettings: PluginSettings = {
  appUrl: DEFAULT_APP_URL,
  accessToken: null,
  refreshToken: null,
  connectionToken: "hl_figma_test",
  personalAccessToken: null,
  userEmail: null,
  organizationSlug: "acme",
  organizationName: "Acme",
  projectId: "proj_1",
  selectedLocale: "es",
  selectedPageIds: ["page-1"],
  preserveFormatting: true,
  lastJobId: null,
  appliedLocaleByPage: {},
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function workspaceResponse(input: RequestInfo | URL) {
  const url = requestUrl(input);
  if (url.includes("/api/integrations/figma/session")) {
    return jsonResponse({ session: sessionFixture });
  }
  return null;
}

function localeStatusesResponse(input?: {
  pageIds?: string[];
  sourceCollected?: boolean;
  targetStatus?: FigmaPageJob["status"] | "missing";
}) {
  const pageIds = input?.pageIds ?? ["page-1"];
  const sourceCollected = input?.sourceCollected ?? false;
  const targetStatus = input?.targetStatus ?? "succeeded";
  return jsonResponse({
    locales: [
      {
        locale: "en",
        isSource: true,
        pages: pageIds.map((pageId) => ({
          pageId,
          status: sourceCollected ? "succeeded" : "missing",
        })),
      },
      {
        locale: "es",
        isSource: false,
        pages: pageIds.map((pageId) => ({
          pageId,
          status: targetStatus,
        })),
      },
    ],
    pages: [],
  });
}

function figmaFetchHandler(
  input: RequestInfo | URL,
  overrides?: {
    currentJob?: FigmaPageJob | null;
    localeStatuses?: ReturnType<typeof localeStatusesResponse>;
    collect?: Promise<Response> | Response;
    jobsPost?: Promise<Response> | Response;
    translations?: Promise<Response> | Response;
  },
) {
  const url = requestUrl(input);
  const workspace = workspaceResponse(input);
  if (workspace) {
    return workspace;
  }
  if (url.includes("/api/integrations/figma/locales")) {
    return overrides?.localeStatuses ?? localeStatusesResponse({ targetStatus: "succeeded" });
  }
  if (url.includes("/api/integrations/figma/jobs/current")) {
    if (url.includes("pageId=page-2")) {
      return jsonResponse({ job: null });
    }
    return jsonResponse({ job: overrides?.currentJob ?? null });
  }
  if (url.includes("/api/integrations/figma/collect")) {
    const collect = overrides?.collect;
    return collect instanceof Promise
      ? collect
      : (collect ??
          jsonResponse(
            {
              projectId: "proj_1",
              sourceFileId: "file_collected",
              sourcePath: "figma/files/file-1/page-1.json",
              segmentCount: 1,
            },
            201,
          ));
  }
  if (url.endsWith("/api/integrations/figma/jobs")) {
    const jobsPost = overrides?.jobsPost;
    return jobsPost instanceof Promise
      ? jobsPost
      : (jobsPost ?? jsonResponse({ error: "not_found" }, 404));
  }
  if (url.includes("/api/integrations/figma/translations")) {
    const translations = overrides?.translations;
    if (translations instanceof Promise) {
      return translations;
    }
    if (translations) {
      return translations;
    }
    const params = new URL(url, "http://localhost").searchParams;
    const locale = params.get("locale");
    if (locale === "en") {
      return jsonResponse({
        sourcePage: {
          locale: "en",
          sourcePath: "figma/files/file-1/page-1.json",
          needsReupload: false,
          entries: [],
        },
      });
    }
    return jsonResponse({ error: "not_found" }, 404);
  }
  if (url.includes("/api/integrations/figma/health")) {
    return jsonResponse({ ok: true, figmaOauthConfigured: false });
  }
  return jsonResponse({ error: "not_found" }, 404);
}

function postToUi(message: SandboxToUiMessage) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { pluginMessage: message },
    }),
  );
}

const filePages = [
  { pageId: "page-1", pageName: "Home" },
  { pageId: "page-2", pageName: "About" },
];

function readyMessage(binding: FigmaPageJobBinding | null) {
  postToUi({
    type: "ready",
    settings: signedInSettings,
    file: {
      fileKey: "file-1",
      fileName: "Marketing",
      pageId: "page-1",
      pageName: "Home",
    },
    pages: filePages,
    binding,
  });
}

function pluginMessages(postMessage: { mock: { calls: unknown[][] } }) {
  return postMessage.mock.calls.map(([payload]) => {
    if (!payload || typeof payload !== "object" || !("pluginMessage" in payload)) {
      return null;
    }
    return (
      payload as {
        pluginMessage: { type: string; pageId?: string; binding?: { jobId?: string } };
      }
    ).pluginMessage;
  });
}

describe("Figma plugin UI", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders connect before a connection token is stored", async () => {
    const result = render(<App />);

    postToUi({
      type: "ready",
      settings: DEFAULT_SETTINGS,
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
      pages: filePages,
      binding: null,
    });

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Connect Hyperlocalise" })).toBeTruthy();
    });
    expect(result.getByRole("button", { name: "Connect with token" })).toBeTruthy();
    expect(result.queryByRole("button", { name: "Upload and translate" })).toBeNull();
  });

  it("refreshes an expired OAuth session instead of clearing stored tokens", async () => {
    let sessionCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/api/integrations/figma/session")) {
        sessionCalls += 1;
        if (sessionCalls === 1) {
          return jsonResponse({ error: "figma_access_token_invalid" }, 401);
        }
        return jsonResponse({ session: sessionFixture });
      }
      if (url.includes("/api/integrations/figma/health")) {
        return jsonResponse({
          ok: true,
          figmaOauthConfigured: true,
          figmaOauthClientId: "figma-plugin",
        });
      }
      if (url.includes("/api/oauth/figma/token")) {
        return jsonResponse({
          access_token: "hl_figma_at_new",
          refresh_token: "hl_figma_rt_new",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "figma",
        });
      }
      return figmaFetchHandler(input);
    });
    vi.stubGlobal("fetch", fetchMock);
    const postMessage = vi.spyOn(window.parent, "postMessage");

    const result = render(<App />);
    postToUi({
      type: "ready",
      settings: {
        ...signedInSettings,
        connectionToken: null,
        accessToken: "hl_figma_at_expired",
        refreshToken: "hl_figma_rt_old",
      },
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
      pages: filePages,
      binding: null,
    });

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Upload" })).toBeTruthy();
    });
    expect(result.queryByRole("button", { name: "Connect Hyperlocalise" })).toBeNull();
    expect(
      postMessage.mock.calls.some(([payload]) => {
        if (!payload || typeof payload !== "object" || !("pluginMessage" in payload)) {
          return false;
        }
        const message = (
          payload as {
            pluginMessage: {
              type?: string;
              settings?: { accessToken?: string; refreshToken?: string };
            };
          }
        ).pluginMessage;
        return (
          message.type === "storage-set" &&
          message.settings?.accessToken === "hl_figma_at_new" &&
          message.settings.refreshToken === "hl_figma_rt_new"
        );
      }),
    ).toBe(true);
  });

  it("clears a legacy sealed session and prompts to reconnect", async () => {
    const result = render(<App />);
    postToUi({
      type: "ready",
      settings: {
        ...signedInSettings,
        connectionToken: null,
        personalAccessToken: null,
        userEmail: null,
      },
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
      pages: filePages,
      binding: null,
      legacySessionCleared: true,
    });

    await waitFor(() => {
      expect(result.getByText(/Connect with a connection token from Integrations/)).toBeTruthy();
    });
  });

  it("hydrates the page job without showing job details", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      figmaFetchHandler(input, { currentJob: succeededJob }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const postMessage = vi.spyOn(window.parent, "postMessage");

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/page-1.json",
    });

    await waitFor(() => {
      expect((result.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
    expect(result.queryByLabelText("Page job")).toBeNull();
    expect(result.queryByLabelText("Translation progress")).toBeNull();
    expect(result.getByRole("button", { name: "Translate" })).toBeTruthy();

    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("jobs/current"))).toBe(
      true,
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginMessage: expect.objectContaining({
          type: "binding-set",
          pageId: "page-1",
          binding: expect.objectContaining({ jobId: "job_figma" }),
        }),
      }),
      "*",
    );
  });

  it("disables Apply for a failed page job", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      figmaFetchHandler(input, {
        currentJob: {
          ...succeededJob,
          status: "failed",
          lastError: "provider_timeout",
          translationsByLocale: {},
        },
        localeStatuses: localeStatusesResponse({ targetStatus: "failed" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/page-1.json",
    });

    await waitFor(() => {
      expect((result.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
    expect(result.queryByLabelText("Page job")).toBeNull();
    await waitFor(() => {
      expect(result.getByText("provider_timeout")).toBeTruthy();
    });
  });

  it("hides job progress when the server has no job for the page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      figmaFetchHandler(input, {
        currentJob: null,
        localeStatuses: localeStatusesResponse({ targetStatus: "missing" }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/page-1.json",
    });

    await waitFor(() => {
      expect(result.getByText(/Project:/)).toBeTruthy();
      expect(result.queryByLabelText("Page job")).toBeNull();
    });
    expect((result.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("disables Apply while another action is running", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      figmaFetchHandler(input, { currentJob: succeededJob }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/page-1.json",
    });

    await waitFor(() => {
      expect((result.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    });

    result.getByRole("button", { name: "Upload" }).click();
    postToUi({
      type: "extracted",
      segments: [
        { key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV", nodeId: "1:1", regionIndex: 0, text: "Hello" },
      ],
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
    });

    await waitFor(() => {
      expect(result.getByText("Upload to Hyperlocalise")).toBeTruthy();
    });

    result.getByRole("button", { name: "Upload pages" }).click();
    postToUi({
      type: "extracted",
      segments: [
        { key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV", nodeId: "1:1", regionIndex: 0, text: "Hello" },
      ],
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
    });

    await waitFor(() => {
      expect((result.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
  });

  it("keeps pull results on the originating page after a page change", async () => {
    let resolvePull: ((value: Response) => void) | undefined;
    const pullResponse = new Promise<Response>((resolve) => {
      resolvePull = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      figmaFetchHandler(input, {
        currentJob: succeededJob,
        translations: pullResponse,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const postMessage = vi.spyOn(window.parent, "postMessage");

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_figma",
      sourcePath: "figma/files/file-1/page-1.json",
    });

    await waitFor(() => {
      expect((result.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
    result.getByRole("button", { name: "Apply" }).click();

    await waitFor(() => {
      expect(
        (result.getByRole("button", { name: "Translate" }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    postToUi({
      type: "page-changed",
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-2",
        pageName: "About",
      },
      pages: filePages,
      binding: null,
    });

    const originatingBindingsBeforePull = pluginMessages(postMessage).filter(
      (message) =>
        message?.type === "binding-set" &&
        message.pageId === "page-1" &&
        message.binding?.jobId === "job_figma",
    ).length;

    resolvePull!(
      await jsonResponse({
        translations: succeededJob,
      }),
    );

    await waitFor(() => {
      expect(
        pluginMessages(postMessage).filter(
          (message) =>
            message?.type === "binding-set" &&
            message.pageId === "page-1" &&
            message.binding?.jobId === "job_figma",
        ).length,
      ).toBeGreaterThan(originatingBindingsBeforePull);
    });

    expect(
      pluginMessages(postMessage).some(
        (message) => message?.type === "binding-set" && message.pageId === "page-2",
      ),
    ).toBe(false);
    expect(pluginMessages(postMessage).some((message) => message?.type === "apply")).toBe(false);

    await waitFor(() => {
      expect(result.queryByLabelText("Page job")).toBeNull();
    });
  });

  it("finishes collect on the originating page after a page change", async () => {
    let resolveCollect: ((value: Response) => void) | undefined;
    const collectResponse = new Promise<Response>((resolve) => {
      resolveCollect = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      figmaFetchHandler(input, {
        currentJob: null,
        collect: collectResponse,
        localeStatuses: localeStatusesResponse({ sourceCollected: true }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const postMessage = vi.spyOn(window.parent, "postMessage");

    const result = render(<App />);
    readyMessage(null);

    await waitFor(() => result.getByRole("button", { name: "Upload" }));
    result.getByRole("button", { name: "Upload" }).click();
    postToUi({
      type: "extracted",
      segments: [
        { key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV", nodeId: "1:1", regionIndex: 0, text: "Hello" },
      ],
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
    });

    await waitFor(() => {
      expect(result.getByText("Upload to Hyperlocalise")).toBeTruthy();
    });

    result.getByRole("button", { name: "Upload pages" }).click();
    postToUi({
      type: "extracted",
      segments: [
        { key: "figma.k.01ARZ3NDEKTSV4RRFFQ69G5FAV", nodeId: "1:1", regionIndex: 0, text: "Hello" },
      ],
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
    });

    await waitFor(() => {
      expect(pluginMessages(postMessage).some((message) => message?.type === "extract")).toBe(true);
    });

    postToUi({
      type: "page-changed",
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-2",
        pageName: "About",
      },
      pages: filePages,
      binding: null,
    });

    resolveCollect!(
      await jsonResponse(
        {
          projectId: "proj_1",
          sourceFileId: "file_collected",
          sourcePath: "figma/files/file-1/page-1.json",
          segmentCount: 1,
        },
        201,
      ),
    );

    await waitFor(() => {
      expect(result.getByText(/Uploaded 1 page file/)).toBeTruthy();
    });

    expect(
      pluginMessages(postMessage).some(
        (message) =>
          message?.type === "binding-set" &&
          message.pageId === "page-2" &&
          message.binding?.jobId != null,
      ),
    ).toBe(false);
    await waitFor(() => {
      expect(result.queryByText("file_collected")).toBeNull();
    });
  });
});
