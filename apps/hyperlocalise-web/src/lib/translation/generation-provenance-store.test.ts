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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { selectLimitMock, updateSetMock } = vi.hoisted(() => ({
  selectLimitMock: vi.fn(),
  updateSetMock: vi.fn(),
}));

vi.mock("@/lib/database/client", () => {
  const createSelectBuilder = () => {
    const builder = {
      from: vi.fn(() => builder),
      where: vi.fn(() => builder),
      limit: selectLimitMock,
    };
    return builder;
  };

  return {
    db: {
      select: vi.fn(() => createSelectBuilder()),
      update: vi.fn(() => ({
        set: (payload: unknown) => {
          updateSetMock(payload);
          return { where: vi.fn() };
        },
      })),
    },
    schema: {
      jobs: {
        id: "id",
        generationProvenance: "generationProvenance",
        apiKeyId: "apiKeyId",
        interactionId: "interactionId",
        createdByUserId: "createdByUserId",
      },
    },
  };
});

import { recordJobGenerationProvenance } from "./generation-provenance-store";

const provenance = {
  guidelines: { documents: [] },
  glossaries: [],
  translationMemories: [],
  customInstructions: false,
};

describe("recordJobGenerationProvenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the job is missing", async () => {
    selectLimitMock.mockResolvedValue([]);

    await expect(recordJobGenerationProvenance("job-missing", provenance)).resolves.toBeNull();
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("keeps a valid enqueue-time automation trigger", async () => {
    const trigger = {
      kind: "automation" as const,
      automationId: "auto-1",
      runId: "run-1",
      name: "Nightly Drive",
    };
    selectLimitMock.mockResolvedValue([
      {
        generationProvenance: { trigger },
        apiKeyId: "key-1",
        interactionId: "ix-1",
        createdByUserId: "user-1",
      },
    ]);

    await expect(recordJobGenerationProvenance("job-1", provenance)).resolves.toEqual({
      ...provenance,
      trigger,
    });
    expect(updateSetMock).toHaveBeenCalledWith({
      generationProvenance: { ...provenance, trigger },
    });
  });

  it("falls back to the job source when the stored trigger is invalid", async () => {
    selectLimitMock.mockResolvedValue([
      {
        generationProvenance: { trigger: { kind: "user" } },
        apiKeyId: "key-1",
        interactionId: "ix-1",
        createdByUserId: "user-1",
      },
    ]);

    await expect(recordJobGenerationProvenance("job-1", provenance)).resolves.toEqual({
      ...provenance,
      trigger: { kind: "api_key", apiKeyId: "key-1" },
    });
  });

  it("stores provenance without a trigger when the job has no source", async () => {
    selectLimitMock.mockResolvedValue([
      {
        generationProvenance: null,
        apiKeyId: null,
        interactionId: null,
        createdByUserId: null,
      },
    ]);

    await expect(recordJobGenerationProvenance("job-1", provenance)).resolves.toEqual(provenance);
    expect(updateSetMock).toHaveBeenCalledWith({ generationProvenance: provenance });
  });
});
