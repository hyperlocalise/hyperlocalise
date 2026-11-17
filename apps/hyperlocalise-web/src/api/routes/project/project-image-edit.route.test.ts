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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { app } from "@/api/app";
import { rejectIfAiFeaturesUnavailable } from "@/api/billing/ai-features-response";
import { db, schema } from "@/lib/database/client";
import { ensureRepositorySourceFile } from "@/lib/file-storage/records";
import { err, ok } from "@/lib/primitives/result/results";
import { editAndStoreImageVariant } from "@/lib/projects/files/image-variant-service";
import { getTmsProviderConnection } from "@/lib/providers/jobs/tms-provider-live";

import { createProjectTestFixture } from "./project.fixture";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/api/billing/ai-features-response", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/billing/ai-features-response")>()),
  rejectIfAiFeaturesUnavailable: vi.fn(async () => null),
}));

vi.mock("@/lib/projects/files/image-variant-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/projects/files/image-variant-service")>();
  return {
    ...actual,
    editAndStoreImageVariant: vi.fn(),
  };
});

vi.mock("@/lib/providers/jobs/tms-provider-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/jobs/tms-provider-live")>();
  return {
    ...actual,
    getTmsProviderConnection: vi.fn(),
  };
});

const projectFixture = createProjectTestFixture();
const { authHeadersFor, cleanup, createStoredProjectFixture, createWorkosIdentityForOrganization } =
  projectFixture;
const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngFile(name = "hero.png") {
  return new File([pngBytes], name, { type: "image/png" });
}

async function nativeImageFixture(sourcePath = "assets/hero.png") {
  const fixture = await createStoredProjectFixture();
  const sourceFile = await ensureRepositorySourceFile({
    organizationId: fixture.organization.id,
    projectId: fixture.project.id,
    sourcePath,
  });
  return {
    ...fixture,
    sourcePath,
    sourceFile,
    headers: await authHeadersFor(fixture.identity),
    path: `/api/orgs/${encodeURIComponent(fixture.identity.organization.slug ?? "missing-slug")}/projects/${encodeURIComponent(fixture.project.id)}/files/detail/cat/images/edit`,
  };
}

function editForm(input: {
  sourcePath: string;
  kind?: string;
  instruction?: string;
  notes?: string[];
  image?: File | null;
  mask?: File;
  force?: string;
  targetLocale?: string;
}) {
  const form = new FormData();
  form.set("sourcePath", input.sourcePath);
  form.set("targetLocale", input.targetLocale ?? "fr-FR");
  form.set("kind", input.kind ?? "removeBackground");
  if (input.instruction) form.set("instruction", input.instruction);
  for (const note of input.notes ?? []) form.append("notes", note);
  if (input.image !== null) form.set("image", input.image ?? pngFile());
  if (input.mask) form.set("mask", input.mask);
  if (input.force) form.set("force", input.force);
  return form;
}

function postEdit(path: string, headers: { cookie: string }, form: FormData) {
  return app.request(path, { method: "POST", headers, body: form });
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

beforeEach(() => {
  vi.mocked(rejectIfAiFeaturesUnavailable).mockResolvedValue(null);
  vi.mocked(getTmsProviderConnection).mockResolvedValue(null);
  vi.mocked(editAndStoreImageVariant).mockResolvedValue(
    ok({
      id: "variant_1",
      status: "needs_review",
      storedFileId: "file_1",
    } as Awaited<ReturnType<typeof editAndStoreImageVariant>> extends { value: infer V }
      ? V
      : never),
  );
});

afterEach(async () => {
  vi.clearAllMocks();
  await cleanup();
});

describe("POST CAT image edit", () => {
  it("rejects members before billing or generation", async () => {
    const { path, identity, sourcePath } = await nativeImageFixture();
    const member = createWorkosIdentityForOrganization(identity.organization, "member");
    const headers = await authHeadersFor(member);

    const response = await postEdit(path, headers, editForm({ sourcePath }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "forbidden" });
    expect(editAndStoreImageVariant).not.toHaveBeenCalled();
    expect(rejectIfAiFeaturesUnavailable).not.toHaveBeenCalled();
  });

  it("honors billing denial without editing", async () => {
    const { path, headers, sourcePath } = await nativeImageFixture();
    vi.mocked(rejectIfAiFeaturesUnavailable).mockResolvedValueOnce(
      Response.json({ error: "ai_features_required" }, { status: 403 }) as Awaited<
        ReturnType<typeof rejectIfAiFeaturesUnavailable>
      >,
    );

    const response = await postEdit(path, headers, editForm({ sourcePath }));

    expect(response.status).toBe(403);
    expect(editAndStoreImageVariant).not.toHaveBeenCalled();
  });

  it("rejects TMS-backed projects", async () => {
    const { identity } = await createStoredProjectFixture();
    const headers = await authHeadersFor(identity);
    vi.mocked(getTmsProviderConnection).mockResolvedValue({
      providerKind: "crowdin",
      displayName: "Crowdin",
      validationStatus: "valid",
      validationMessage: null,
    });

    const response = await postEdit(
      `/api/orgs/${encodeURIComponent(identity.organization.slug ?? "missing-slug")}/projects/${encodeURIComponent("ext:crowdin:42")}/files/detail/cat/images/edit`,
      headers,
      editForm({ sourcePath: "crowdin/hero.png" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "provider_cat_unsupported" });
    expect(editAndStoreImageVariant).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads, non-images, missing erase masks, and non-image files", async () => {
    const { path, headers, sourcePath } = await nativeImageFixture();

    const missingKind = await postEdit(path, headers, editForm({ sourcePath, kind: "markup" }));
    expect(missingKind.status).toBe(400);
    expect(await missingKind.json()).toMatchObject({ error: "invalid_project_payload" });

    const notImage = await postEdit(
      path,
      headers,
      editForm({
        sourcePath,
        image: new File([pngBytes], "hero.txt", { type: "text/plain" }),
      }),
    );
    expect(notImage.status).toBe(400);
    expect(await notImage.json()).toMatchObject({ error: "unsupported_image_response" });

    const erase = await postEdit(path, headers, editForm({ sourcePath, kind: "erase" }));
    expect(erase.status).toBe(400);
    expect(await erase.json()).toMatchObject({ error: "image_edit_mask_required" });

    const jsonSource = await postEdit(path, headers, editForm({ sourcePath: "locales/en.json" }));
    expect(jsonSource.status).toBe(400);
    expect(await jsonSource.json()).toMatchObject({ error: "image_edit_unsupported" });

    expect(editAndStoreImageVariant).not.toHaveBeenCalled();
  });

  it("rejects a path with no repository source file", async () => {
    const { path, headers } = await nativeImageFixture();

    const response = await postEdit(path, headers, editForm({ sourcePath: "assets/missing.png" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "source_file_not_found" });
    expect(editAndStoreImageVariant).not.toHaveBeenCalled();
  });

  it("refuses a locked file-backed image even when the string id is omitted", async () => {
    const { path, headers, sourcePath, sourceFile, organization, project, user } =
      await nativeImageFixture();
    await db.insert(schema.projectContentEditorSegmentLocks).values({
      organizationId: organization.id,
      projectId: project.id,
      targetLocale: "fr-FR",
      externalStringId: sourceFile.id,
      lockedByUserId: user.id,
    });

    const response = await postEdit(path, headers, editForm({ sourcePath }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "translation_locked" });
    expect(editAndStoreImageVariant).not.toHaveBeenCalled();
  });

  it("maps insufficient credit to 402 and unavailable credit to 503", async () => {
    const { path, headers, sourcePath } = await nativeImageFixture();
    vi.mocked(editAndStoreImageVariant).mockResolvedValueOnce(
      err({
        code: "ai_credit_insufficient",
        requiredAmountUsd: 1.25,
        remainingAmountUsd: 0.1,
      }),
    );

    const insufficient = await postEdit(path, headers, editForm({ sourcePath }));
    expect(insufficient.status).toBe(402);
    expect(await insufficient.json()).toMatchObject({
      error: "ai_credit_insufficient",
      details: {
        requiredAmountUsd: 1.25,
        remainingAmountUsd: 0.1,
        billingSection: "available-plans",
      },
    });

    vi.mocked(editAndStoreImageVariant).mockResolvedValueOnce(
      err({ code: "ai_credit_unavailable", message: "AI credit pricing is not configured" }),
    );
    const unavailable = await postEdit(path, headers, editForm({ sourcePath }));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: "ai_credit_unavailable" });
  });

  it("returns the edited variant and forwards force plus a comment request", async () => {
    const { path, headers, sourcePath, sourceFile, organization, project, identity } =
      await nativeImageFixture();
    const mask = pngFile("mask.png");

    const response = await postEdit(
      path,
      headers,
      editForm({
        sourcePath,
        kind: "comment",
        notes: ["Use the VND price", "Drop the badge"],
        force: "true",
        mask,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      imageVariant: {
        id: "variant_1",
        status: "needs_review",
        storedFileId: "file_1",
        targetAssetUrl: `/api/orgs/${encodeURIComponent(identity.organization.slug ?? "missing-slug")}/projects/${encodeURIComponent(project.id)}/assets/file_1`,
      },
    });
    expect(editAndStoreImageVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
        projectId: project.id,
        sourcePath,
        targetLocale: "fr-FR",
        repositorySourceFileId: sourceFile.id,
        force: true,
        request: { kind: "comment", notes: ["Use the VND price", "Drop the badge"] },
        image: Buffer.from(pngBytes),
      }),
    );
  });
});
