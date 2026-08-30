import { cleanup, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { App } from "./app";
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
  sourcePath: "figma/files/file-1/pages/page-1.json",
  targetLocales: ["es"],
  lastError: null,
  translationsByLocale: { es: { "figma.segment.1:1.0": "Hola" } },
};

const signedInSettings: PluginSettings = {
  appUrl: "https://app.hyperlocalise.com",
  personalAccessToken: "hl_test_token",
  userEmail: "dev@example.com",
  organizationSlug: "acme",
  organizationName: "Acme",
  projectId: "proj_1",
  sourceLocale: "en",
  targetLocales: ["es"],
  preserveFormatting: true,
  lastJobId: null,
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
    return jsonResponse({
      session: {
        user: { email: "dev@example.com", localUserId: "user_1" },
        organization: { slug: "acme", name: "Acme", id: "org_1" },
      },
    });
  }
  if (url.includes("/api/integrations/figma/projects")) {
    return jsonResponse({
      projects: [{ id: "proj_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] }],
    });
  }
  return null;
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

function postToUi(message: SandboxToUiMessage) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { pluginMessage: message },
    }),
  );
}

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
    binding,
  });
}

describe("Figma plugin UI", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders PAT connect before a token is stored", () => {
    const result = render(<App />);

    expect(result.getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(result.getByText("Personal access token")).toBeTruthy();
    expect(result.getByText("Hyperlocalise URL")).toBeTruthy();
    expect(result.queryByRole("button", { name: "Create job and generate" })).toBeNull();
  });

  it("clears a legacy sealed session and prompts to reconnect with a PAT", async () => {
    const result = render(<App />);
    postToUi({
      type: "ready",
      settings: {
        ...signedInSettings,
        personalAccessToken: null,
        userEmail: null,
      },
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
      binding: null,
      legacySessionCleared: true,
    });

    await waitFor(() => {
      expect(
        result.getByText(
          "Your previous Hyperlocalise sign-in is no longer supported. Connect with a personal access token.",
        ),
      ).toBeTruthy();
    });
  });

  it("hydrates the page job card and keeps Close enabled", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/api/integrations/figma/session")) {
        return jsonResponse({
          session: {
            user: { email: "dev@example.com", localUserId: "user_1" },
            organization: { slug: "acme", name: "Acme", id: "org_1" },
          },
        });
      }
      if (url.includes("/api/integrations/figma/projects")) {
        return jsonResponse({
          projects: [
            { id: "proj_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] },
          ],
        });
      }
      if (url.includes("/api/integrations/figma/jobs/current")) {
        return jsonResponse({ job: succeededJob });
      }
      return jsonResponse({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const postMessage = vi.spyOn(window.parent, "postMessage");

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/pages/page-1.json",
    });

    const card = await waitFor(() => result.getByLabelText("Page job"));
    expect(within(card).getByText("Ready")).toBeTruthy();
    expect(within(card).getByText("job_figma")).toBeTruthy();
    expect(result.getByRole("link", { name: "Open in Hyperlocalise" }).getAttribute("href")).toBe(
      "https://app.hyperlocalise.com/org/acme/projects/proj_1/jobs/job_figma",
    );
    expect((result.getByRole("button", { name: "Close" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(
      (result.getByRole("button", { name: "Pull translations into Figma" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

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

  it("does not offer Generate or Pull for a failed page job", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/api/integrations/figma/session")) {
        return jsonResponse({
          session: {
            user: { email: "dev@example.com", localUserId: "user_1" },
            organization: { slug: "acme", name: "Acme", id: "org_1" },
          },
        });
      }
      if (url.includes("/api/integrations/figma/projects")) {
        return jsonResponse({
          projects: [
            { id: "proj_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] },
          ],
        });
      }
      if (url.includes("/api/integrations/figma/jobs/current")) {
        return jsonResponse({
          job: {
            ...succeededJob,
            status: "failed",
            lastError: "provider_timeout",
            translationsByLocale: {},
          },
        });
      }
      return jsonResponse({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/pages/page-1.json",
    });

    const card = await waitFor(() => result.getByLabelText("Page job"));
    expect(within(card).getByText("Failed")).toBeTruthy();
    expect(
      (result.getByRole("button", { name: "Generate job" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (result.getByRole("button", { name: "Pull translations into Figma" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("hides the job card when the server has no job for the page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/api/integrations/figma/session")) {
        return jsonResponse({
          session: {
            user: { email: "dev@example.com", localUserId: "user_1" },
            organization: { slug: "acme", name: "Acme", id: "org_1" },
          },
        });
      }
      if (url.includes("/api/integrations/figma/projects")) {
        return jsonResponse({
          projects: [
            { id: "proj_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] },
          ],
        });
      }
      if (url.includes("/api/integrations/figma/jobs/current")) {
        return jsonResponse({ job: null });
      }
      return jsonResponse({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/pages/page-1.json",
    });

    await waitFor(() => {
      expect(result.getByText(/dev@example.com/)).toBeTruthy();
      expect(result.queryByLabelText("Page job")).toBeNull();
    });
    expect(
      (result.getByRole("button", { name: "Pull translations into Figma" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("disables Pull while another action is running", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      return workspaceResponse(input) ?? jsonResponse({ job: succeededJob });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_stale",
      sourcePath: "figma/files/file-1/pages/page-1.json",
    });

    await waitFor(() => {
      expect(
        (result.getByRole("button", { name: "Pull translations into Figma" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });

    result.getByRole("button", { name: "Extract text" }).click();

    await waitFor(() => {
      expect(
        (result.getByRole("button", { name: "Pull translations into Figma" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
  });

  it("keeps pull results on the originating page after a page change", async () => {
    let resolvePull: ((value: Response) => void) | undefined;
    const pullResponse = new Promise<Response>((resolve) => {
      resolvePull = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const workspace = workspaceResponse(input);
      if (workspace) {
        return workspace;
      }
      if (url.includes("/jobs/current")) {
        if (url.includes("pageId=page-2")) {
          return jsonResponse({ job: null });
        }
        return jsonResponse({ job: succeededJob });
      }
      if (url.includes("/translations")) {
        return pullResponse;
      }
      return jsonResponse({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const postMessage = vi.spyOn(window.parent, "postMessage");

    const result = render(<App />);
    readyMessage({
      projectId: "proj_1",
      jobId: "job_figma",
      sourcePath: "figma/files/file-1/pages/page-1.json",
    });

    await waitFor(() => result.getByLabelText("Page job"));
    result.getByRole("button", { name: "Pull translations into Figma" }).click();

    await waitFor(() => {
      expect(result.getByRole("button", { name: "Pulling…" })).toBeTruthy();
    });

    postToUi({
      type: "page-changed",
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-2",
        pageName: "About",
      },
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

  it("keeps a created job on the originating page after a page change", async () => {
    let resolveCreate: ((value: Response) => void) | undefined;
    const createResponse = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const workspace = workspaceResponse(input);
      if (workspace) {
        return workspace;
      }
      if (url.includes("/jobs/current")) {
        return jsonResponse({ job: null });
      }
      if (url.endsWith("/api/integrations/figma/jobs")) {
        return createResponse;
      }
      return jsonResponse({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const postMessage = vi.spyOn(window.parent, "postMessage");

    const result = render(<App />);
    readyMessage(null);

    await waitFor(() => result.getByRole("button", { name: "Extract text" }));
    result.getByRole("button", { name: "Extract text" }).click();
    postToUi({
      type: "extracted",
      segments: [{ key: "figma.segment.1:1.0", nodeId: "1:1", regionIndex: 0, text: "Hello" }],
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-1",
        pageName: "Home",
      },
    });

    await waitFor(() => {
      expect(
        (result.getByRole("button", { name: "Create job only" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    result.getByRole("button", { name: "Create job only" }).click();
    await waitFor(() => {
      expect(result.getByRole("button", { name: "Creating…" })).toBeTruthy();
    });

    postToUi({
      type: "page-changed",
      file: {
        fileKey: "file-1",
        fileName: "Marketing",
        pageId: "page-2",
        pageName: "About",
      },
      binding: null,
    });

    resolveCreate!(
      await jsonResponse({
        job: {
          jobId: "job_created",
          generated: false,
          projectId: "proj_1",
          sourcePath: "figma/files/file-1/pages/page-1.json",
        },
      }),
    );

    await waitFor(() => {
      expect(
        pluginMessages(postMessage).some(
          (message) =>
            message?.type === "binding-set" &&
            message.pageId === "page-1" &&
            message.binding?.jobId === "job_created",
        ),
      ).toBe(true);
    });

    expect(
      pluginMessages(postMessage).some(
        (message) =>
          message?.type === "binding-set" &&
          message.pageId === "page-2" &&
          message.binding?.jobId === "job_created",
      ),
    ).toBe(false);
    await waitFor(() => {
      expect(result.queryByText("job_created")).toBeNull();
    });
  });
});
