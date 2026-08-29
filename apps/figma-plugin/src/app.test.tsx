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
  sealedSession: "sealed.session",
  userEmail: "dev@example.com",
  organizationSlug: "acme",
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

  it("renders OAuth sign-in before a session exists", () => {
    const result = render(<App />);

    expect(result.getByRole("button", { name: "Sign in with Hyperlocalise" })).toBeTruthy();
    expect(result.getByText("Hyperlocalise URL")).toBeTruthy();
    expect(result.queryByRole("button", { name: "Create job and generate" })).toBeNull();
  });

  it("hydrates the page job card and keeps Close enabled", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/api/integrations/figma/session")) {
        return jsonResponse({
          session: {
            user: { email: "dev@example.com", localUserId: "user_1" },
            organization: { slug: "acme", name: "Acme", id: "org_1" },
            organizations: [{ slug: "acme", name: "Acme", id: "org_1" }],
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
  });

  it("hides the job card when the server has no job for the page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/api/integrations/figma/session")) {
        return jsonResponse({
          session: {
            user: { email: "dev@example.com", localUserId: "user_1" },
            organization: { slug: "acme", name: "Acme", id: "org_1" },
            organizations: [{ slug: "acme", name: "Acme", id: "org_1" }],
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
      expect(result.getByText("dev@example.com")).toBeTruthy();
      expect(result.queryByLabelText("Page job")).toBeNull();
    });
    expect(
      (result.getByRole("button", { name: "Pull translations into Figma" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
