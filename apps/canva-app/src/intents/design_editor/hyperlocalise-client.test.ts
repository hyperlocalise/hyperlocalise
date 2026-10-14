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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildCanvaJobUrl,
  buildCanvaProjectUrl,
  CANVA_JOB_POLL_INTERVAL_MS,
  CANVA_JOB_WAIT_TIMEOUT_MS,
  collectAndGenerateCanvaLocaleJobs,
  fetchCanvaSession,
  generateCanvaLocaleJob,
  HyperlocaliseClientError,
  waitForCanvaJobs,
} from "./hyperlocalise-client";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: async () => body,
  };
}

function jobStatusResponse(input: { jobId: string; status: string; lastError?: string | null }) {
  return jsonResponse({
    job: {
      jobId: input.jobId,
      status: input.status,
      projectId: "project_1",
      sourcePath: "canva/design.json",
      targetLocales: ["es"],
      lastError: input.lastError ?? null,
      translationsByLocale: {},
    },
  });
}

describe("hyperlocalise-client", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds a safe Hyperlocalise job URL", () => {
    expect(
      buildCanvaJobUrl({
        organizationSlug: "acme",
        projectId: "project_1",
        jobId: "job_1",
      }),
    ).toBe("https://app.example.test/org/acme/projects/project_1/jobs/job_1");
  });

  it("builds a Hyperlocalise project URL", () => {
    expect(
      buildCanvaProjectUrl({
        organizationSlug: "acme",
        projectId: "project_1",
      }),
    ).toBe("https://app.example.test/org/acme/projects/project_1");
    expect(
      buildCanvaProjectUrl({
        organizationSlug: "",
        projectId: "project_1",
      }),
    ).toBeNull();
  });

  it("loads a Canva session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          session: {
            organization: { id: "org_1", name: "Acme", slug: "acme" },
            project: {
              id: "project_1",
              name: "Marketing",
              sourceLocale: "en",
              targetLocales: ["es"],
            },
            projects: [
              {
                id: "project_1",
                name: "Marketing",
                sourceLocale: "en",
                targetLocales: ["es"],
              },
            ],
            connection: {
              id: "conn_1",
              displayName: "Canva",
              sourceLocale: "en",
              targetLocales: ["es"],
            },
          },
        }),
      })),
    );

    await expect(fetchCanvaSession({ accessToken: "hl_canva_at_test" })).resolves.toEqual({
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      project: { id: "project_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] },
      projects: [{ id: "project_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] }],
      connection: {
        id: "conn_1",
        displayName: "Canva",
        sourceLocale: "en",
        targetLocales: ["es"],
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/integrations/canva/session"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Hyperlocalise-Access-Token": "hl_canva_at_test",
        }),
      }),
    );
  });

  it("throws a client error when session loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({
          error: "canva_connection_not_found",
          message: "Canva connection token is invalid.",
        }),
      })),
    );

    await expect(fetchCanvaSession("bad-token")).rejects.toBeInstanceOf(HyperlocaliseClientError);
  });

  describe("waitForCanvaJobs", () => {
    it("rejects empty or whitespace job ids before polling", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(waitForCanvaJobs({ auth: "token", jobIds: [] })).rejects.toMatchObject({
        name: "HyperlocaliseClientError",
        code: "canva_job_create_failed",
      });
      await expect(waitForCanvaJobs({ auth: "token", jobIds: ["  ", ""] })).rejects.toMatchObject({
        code: "canva_job_create_failed",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("resolves when every job reaches a pullable status", async () => {
      vi.useFakeTimers();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jobStatusResponse({ jobId: "job_1", status: "running" }))
        .mockResolvedValueOnce(jobStatusResponse({ jobId: "job_2", status: "queued" }))
        .mockResolvedValueOnce(jobStatusResponse({ jobId: "job_1", status: "succeeded" }))
        .mockResolvedValueOnce(jobStatusResponse({ jobId: "job_2", status: "waiting_for_review" }));
      vi.stubGlobal("fetch", fetchMock);
      const onProgress = vi.fn();

      const pending = waitForCanvaJobs({
        auth: "token",
        jobIds: ["job_1", "job_2"],
        onProgress,
      });
      await vi.advanceTimersByTimeAsync(CANVA_JOB_POLL_INTERVAL_MS);
      await expect(pending).resolves.toBeUndefined();

      expect(onProgress.mock.calls).toEqual([
        [0, 2],
        [1, 2],
        [2, 2],
      ]);
    });

    it("fails immediately when a polled job is failed or cancelled", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce(
          jobStatusResponse({
            jobId: "job_fail",
            status: "failed",
            lastError: "Glossary rejected the page.",
          }),
        ),
      );

      await expect(waitForCanvaJobs({ auth: "token", jobIds: ["job_fail"] })).rejects.toMatchObject(
        {
          code: "canva_job_failed",
          message: "Glossary rejected the page.",
        },
      );

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(jobStatusResponse({ jobId: "job_cancel", status: "cancelled" })),
      );
      await expect(
        waitForCanvaJobs({ auth: "token", jobIds: ["job_cancel"] }),
      ).rejects.toMatchObject({
        code: "canva_job_failed",
        message: "Translation failed.",
      });
    });

    it("times out when jobs stay running past the wait window", async () => {
      vi.useFakeTimers();
      let now = 0;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          now = CANVA_JOB_WAIT_TIMEOUT_MS + 1;
          return jobStatusResponse({ jobId: "job_slow", status: "running" });
        }),
      );

      const pending = expect(
        waitForCanvaJobs({ auth: "token", jobIds: ["job_slow"] }),
      ).rejects.toMatchObject({
        code: "canva_job_timeout",
      });
      await vi.advanceTimersByTimeAsync(CANVA_JOB_POLL_INTERVAL_MS);
      await pending;
    });
  });

  describe("collectAndGenerateCanvaLocaleJobs", () => {
    const segments = [
      {
        key: "canva.segment.0.0.0",
        pageIndex: 0,
        contentIndex: 0,
        regionIndex: 0,
        text: "Hello",
      },
    ];

    it("posts collect+generate and prefers jobIds over a single jobId", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          job: {
            locale: "es",
            projectId: "project_1",
            jobId: "job_ignored",
            jobIds: ["job_a", "job_b"],
          },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        collectAndGenerateCanvaLocaleJobs({
          auth: { accessToken: "hl_canva_at_test" },
          designToken: "design-token",
          designTitle: "Flyer",
          locale: "es",
          segments,
        }),
      ).resolves.toEqual({
        locale: "es",
        projectId: "project_1",
        jobIds: ["job_a", "job_b"],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/integrations/canva/jobs"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            designToken: "design-token",
            designTitle: "Flyer",
            segments,
            targetLocales: ["es"],
            generate: true,
          }),
          headers: expect.objectContaining({
            "X-Hyperlocalise-Access-Token": "hl_canva_at_test",
          }),
        }),
      );
    });

    it("falls back to job.jobId when jobIds is empty", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse({
            job: { locale: "fr", projectId: "project_1", jobId: "job_only" },
          }),
        ),
      );

      await expect(
        collectAndGenerateCanvaLocaleJobs({
          auth: "token",
          designToken: "design-token",
          locale: "fr",
          segments,
        }),
      ).resolves.toEqual({
        locale: "fr",
        projectId: "project_1",
        jobIds: ["job_only"],
      });
    });

    it("rejects a successful response that has no usable job ids", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse({
            job: { locale: "es", projectId: "project_1", jobIds: ["", "  "] },
          }),
        ),
      );

      await expect(
        collectAndGenerateCanvaLocaleJobs({
          auth: "token",
          designToken: "design-token",
          locale: "es",
          segments,
        }),
      ).rejects.toMatchObject({
        code: "canva_job_create_failed",
      });
    });

    it("surfaces HTTP errors from collect+generate", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          jsonResponse(
            { error: "canva_source_ingest_timeout", message: "Source ingest timed out." },
            false,
          ),
        ),
      );

      await expect(
        collectAndGenerateCanvaLocaleJobs({
          auth: "token",
          designToken: "design-token",
          locale: "es",
          segments,
        }),
      ).rejects.toMatchObject({
        code: "canva_source_ingest_timeout",
        message: "Source ingest timed out.",
      });
    });
  });

  describe("generateCanvaLocaleJob", () => {
    it("starts generate-only jobs from already collected pages", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          jobs: { locale: "de", projectId: "project_1", jobIds: ["job_de"] },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        generateCanvaLocaleJob({
          auth: "token",
          designToken: "design-token",
          locale: "de",
        }),
      ).resolves.toEqual({
        locale: "de",
        projectId: "project_1",
        jobIds: ["job_de"],
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/integrations/canva/jobs"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            designToken: "design-token",
            targetLocales: ["de"],
          }),
        }),
      );
    });

    it("rejects generate-only responses without job ids", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ jobs: { locale: "de", projectId: "project_1" } })),
      );

      await expect(
        generateCanvaLocaleJob({
          auth: "token",
          designToken: "design-token",
          locale: "de",
        }),
      ).rejects.toMatchObject({
        code: "canva_job_create_failed",
      });
    });
  });
});
