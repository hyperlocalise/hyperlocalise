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
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { db, schema } from "@/lib/database/client";
import { loadUploadedGuidelinesContext } from "@/lib/knowledge-memory/uploaded-guidelines-context";
import { assembleStringTranslationContextSnapshot } from "@/lib/translation/context";

vi.mock("@/lib/knowledge-memory/uploaded-guidelines-context", () => ({
  loadUploadedGuidelinesContext: vi.fn(async () => ({ text: "", documents: [] })),
}));

const fixture = createProjectTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.mocked(loadUploadedGuidelinesContext).mockClear();
  await fixture.cleanup();
});

describe("assembleStringTranslationContextSnapshot", () => {
  it("uses uploaded guideline documents in the translation context", async () => {
    const { project } = await fixture.createStoredProjectFixture();
    vi.mocked(loadUploadedGuidelinesContext).mockResolvedValueOnce({
      text: "### Brand guide\nNever translate Acme.",
      documents: [],
    });

    const result = await assembleStringTranslationContextSnapshot(
      project.id,
      {
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        sourceText: "Acme checkout",
        context: "",
        metadata: {},
      },
      undefined,
      { knowledgeMemoryEnabled: true },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.knowledgeMemory).toBe("### Brand guide\nNever translate Acme.");
    }
  });

  it("passes the organization, project, locales and source text to the document retriever", async () => {
    const { organization, project } = await fixture.createStoredProjectFixture();

    const result = await assembleStringTranslationContextSnapshot(
      project.id,
      {
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        sourceText: "Acme checkout",
        context: "",
        metadata: {},
      },
      undefined,
      { knowledgeMemoryEnabled: true },
    );

    expect(loadUploadedGuidelinesContext).toHaveBeenCalledWith({
      organizationId: organization.id,
      projectId: project.id,
      targetLocales: ["fr-FR"],
      sourceText: "Acme checkout",
    });
    expect(result.ok).toBe(true);
  });

  it("ignores legacy typed guideline notes", async () => {
    const { organization, user, project } = await fixture.createStoredProjectFixture();
    await db.insert(schema.knowledgeMemories).values({
      organizationId: organization.id,
      updatedByUserId: user.id,
      content: "Always refer to Hyperlocalise as the product name.",
    });
    await db.insert(schema.projectKnowledgeMemories).values({
      projectId: project.id,
      updatedByUserId: user.id,
      content: "Checkout buttons stay short.",
    });

    const result = await assembleStringTranslationContextSnapshot(
      project.id,
      {
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        sourceText: "Welcome to Hyperlocalise",
        context: "",
        metadata: {},
      },
      undefined,
      { knowledgeMemoryEnabled: true },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.knowledgeMemory).toBeUndefined();
    }
  });

  it("omits guideline documents when the capability is disabled", async () => {
    const { project } = await fixture.createStoredProjectFixture();

    const result = await assembleStringTranslationContextSnapshot(
      project.id,
      {
        sourceLocale: "en-US",
        targetLocales: ["fr-FR"],
        sourceText: "Welcome to Hyperlocalise",
        context: "",
        metadata: {},
      },
      undefined,
      { knowledgeMemoryEnabled: false },
    );

    expect(loadUploadedGuidelinesContext).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.knowledgeMemory).toBeUndefined();
    }
  });

  it("defaults to omitting guideline documents", async () => {
    const { project } = await fixture.createStoredProjectFixture();

    const result = await assembleStringTranslationContextSnapshot(project.id, {
      sourceLocale: "en-US",
      targetLocales: ["fr-FR"],
      sourceText: "Welcome to Hyperlocalise",
      context: "",
      metadata: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshot.knowledgeMemory).toBeUndefined();
    }
  });
});
