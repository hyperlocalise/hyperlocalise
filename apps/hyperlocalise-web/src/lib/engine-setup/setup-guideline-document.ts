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
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createGoSvcServerClient } from "@/lib/go-svc/go-svc-server-client";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

import { mergeEngineSetupKnowledge } from "./merge-knowledge-sections";
import type { EngineRulePayload, EngineVoicePayload } from "./types";

/**
 * Managed title for the guideline document the engine-setup wizard maintains.
 * Users can edit the document through the normal document flow; the wizard
 * finds it again by matching this exact title.
 */
export const ENGINE_SETUP_DOCUMENT_TITLE = "Setup wizard guidance";

const ENGINE_SETUP_DOCUMENT_FILENAME = "setup-wizard-guidance.md";

export type UpsertSetupGuidelineDocumentError = { code: "setup_document_too_long" };

async function resolveOrganizationSlug(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: schema.organizations.slug })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, organizationId))
    .limit(1);
  return row?.slug ?? null;
}

export async function findSetupGuidelineDocument(input: {
  organizationSlug: string;
}): Promise<{ id: string; revisionId: string } | null> {
  const guidelines = createGoSvcServerClient().guidelines;
  const documents = await guidelines.listDocuments(input.organizationSlug);
  const existing = documents.find(
    (document) => document.projectId === null && document.title === ENGINE_SETUP_DOCUMENT_TITLE,
  );
  return existing ? { id: existing.id, revisionId: existing.revisionId } : null;
}

/** Reads the current wizard-managed setup guidance, or "" when absent. */
export async function readSetupGuidelineDocumentContent(input: {
  organizationSlug: string;
}): Promise<string> {
  const guidelines = createGoSvcServerClient().guidelines;
  const existing = await findSetupGuidelineDocument(input);
  if (!existing) return "";
  const document = await guidelines.getDocument(input.organizationSlug, existing.id);
  return document.content ?? "";
}

export async function readSetupGuidelineDocumentContentByOrganization(input: {
  organizationId: string;
}): Promise<string> {
  const slug = await resolveOrganizationSlug(input.organizationId);
  if (!slug) return "";
  return readSetupGuidelineDocumentContent({ organizationSlug: slug });
}

/**
 * Merges wizard voice/rules into the managed setup guideline document,
 * creating it when absent. Returns the revision id when a new revision was
 * committed, or null when the content is unchanged.
 */
export async function upsertSetupGuidelineDocument(input: {
  organizationSlug: string;
  voice: EngineVoicePayload | null;
  rules: EngineRulePayload[];
  sourceUrl: string;
}): Promise<
  Result<{ documentId: string; revisionId: string | null }, UpsertSetupGuidelineDocumentError>
> {
  const guidelines = createGoSvcServerClient().guidelines;
  const existing = await findSetupGuidelineDocument(input);
  const current = existing
    ? ((await guidelines.getDocument(input.organizationSlug, existing.id)).content ?? "")
    : "";
  const merged = mergeEngineSetupKnowledge({
    content: current,
    voice: input.voice,
    rules: input.rules,
    sourceUrl: input.sourceUrl,
  });
  if (isErr(merged)) return err({ code: "setup_document_too_long" });
  if (existing && merged.value === current) {
    return ok({ documentId: existing.id, revisionId: null });
  }
  const file = new File([merged.value], ENGINE_SETUP_DOCUMENT_FILENAME, { type: "text/markdown" });
  const upload = { file, filename: ENGINE_SETUP_DOCUMENT_FILENAME };
  if (existing) {
    const updated = await guidelines.replaceDocument(input.organizationSlug, existing.id, upload);
    return ok({ documentId: updated.id, revisionId: updated.revisionId });
  }
  const created = await guidelines.uploadDocument(input.organizationSlug, {
    ...upload,
    title: ENGINE_SETUP_DOCUMENT_TITLE,
  });
  return ok({ documentId: created.id, revisionId: created.revisionId });
}
