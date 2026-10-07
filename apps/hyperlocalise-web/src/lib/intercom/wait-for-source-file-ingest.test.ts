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

const { dbSelectMock } = vi.hoisted(() => ({
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/database/client", () => ({
  db: {
    select: dbSelectMock,
  },
  schema: {
    repositorySourceFileVersions: {
      id: "id",
      ingestState: "ingestState",
      ingestError: "ingestError",
    },
  },
}));

import { waitForSourceFileVersionIngest } from "./wait-for-source-file-ingest";

function mockSelectRows(rows: Array<{ ingestState: string; ingestError?: string | null }>) {
  dbSelectMock.mockReturnValue({
    from() {
      return this;
    },
    where() {
      return this;
    },
    limit() {
      return Promise.resolve(rows);
    },
  });
}

describe("waitForSourceFileVersionIngest", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns failed when the source file version is missing", async () => {
    mockSelectRows([]);

    await expect(
      waitForSourceFileVersionIngest({
        organizationId: "org-1",
        sourceFileVersionId: "missing",
        timeoutMs: 50,
        pollIntervalMs: 10,
      }),
    ).resolves.toBe("failed");
  });

  it("returns ingested as soon as the version is ingested", async () => {
    mockSelectRows([{ ingestState: "ingested" }]);

    await expect(
      waitForSourceFileVersionIngest({
        organizationId: "org-1",
        sourceFileVersionId: "ver-1",
        timeoutMs: 50,
        pollIntervalMs: 10,
      }),
    ).resolves.toBe("ingested");
  });

  it("returns failed when ingest already failed", async () => {
    mockSelectRows([{ ingestState: "failed", ingestError: "parse_error" }]);

    await expect(
      waitForSourceFileVersionIngest({
        organizationId: "org-1",
        sourceFileVersionId: "ver-1",
        timeoutMs: 50,
        pollIntervalMs: 10,
      }),
    ).resolves.toBe("failed");
  });

  it("polls until ingest succeeds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    let calls = 0;
    dbSelectMock.mockImplementation(() => {
      calls += 1;
      const rows = [{ ingestState: calls === 1 ? "pending" : "ingested" }];
      return {
        from() {
          return this;
        },
        where() {
          return this;
        },
        limit() {
          return Promise.resolve(rows);
        },
      };
    });

    const pending = waitForSourceFileVersionIngest({
      organizationId: "org-1",
      sourceFileVersionId: "ver-1",
      timeoutMs: 50,
      pollIntervalMs: 10,
    });

    await vi.advanceTimersByTimeAsync(15);
    await expect(pending).resolves.toBe("ingested");
    expect(calls).toBe(2);
  });

  it("returns timeout when ingest stays pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    mockSelectRows([{ ingestState: "pending" }]);

    const pending = waitForSourceFileVersionIngest({
      organizationId: "org-1",
      sourceFileVersionId: "ver-1",
      timeoutMs: 25,
      pollIntervalMs: 10,
    });

    await vi.advanceTimersByTimeAsync(40);
    await expect(pending).resolves.toBe("timeout");
  });
});
