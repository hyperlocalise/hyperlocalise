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
  fetchCanvaSession,
  HyperlocaliseClientError,
} from "./hyperlocalise-client";

describe("hyperlocalise-client", () => {
  afterEach(() => {
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

    await expect(fetchCanvaSession("hl_canva_test")).resolves.toEqual({
      organization: { id: "org_1", name: "Acme", slug: "acme" },
      project: { id: "project_1", name: "Marketing", sourceLocale: "en", targetLocales: ["es"] },
      connection: {
        id: "conn_1",
        displayName: "Canva",
        sourceLocale: "en",
        targetLocales: ["es"],
      },
    });
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
});
