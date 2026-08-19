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
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  buildWorkspaceAutomationWebChatHref,
  buildWorkspaceAutomationWebChatPath,
  buildWorkspaceAutomationWebChatUrl,
} from "./workspace-automation-web-chat-url";
import {
  getWorkspaceAutomationById,
  type WorkspaceAutomationRecord,
} from "./workspace-automations";

export {
  buildWorkspaceAutomationWebChatHref,
  buildWorkspaceAutomationWebChatPath,
  buildWorkspaceAutomationWebChatUrl,
};

export const WEB_CHAT_VISITOR_COOKIE_NAME = "hl_web_chat_visitor";
export const WEB_CHAT_MAX_IMAGE_FILES = 4;
export const WEB_CHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const WEB_CHAT_IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function buildWebChatSourceThreadId(input: { automationId: string; visitorId: string }) {
  return `web-chat:${input.automationId}:${input.visitorId}`;
}

export function isWebChatImageContentType(contentType: string) {
  return WEB_CHAT_IMAGE_CONTENT_TYPES.has(contentType.toLowerCase());
}

export async function findOrganizationBySlug(slug: string) {
  const [organization] = await db
    .select({
      id: schema.organizations.id,
      slug: schema.organizations.slug,
      name: schema.organizations.name,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, slug))
    .limit(1);

  return organization ?? null;
}

export type PublicWebChatAgent = {
  organization: { id: string; slug: string; name: string };
  automation: WorkspaceAutomationRecord;
};

export async function resolvePublicWebChatAgent(input: {
  organizationSlug: string;
  automationId: string;
}): Promise<PublicWebChatAgent | null> {
  const organization = await findOrganizationBySlug(input.organizationSlug);
  if (!organization?.slug) {
    return null;
  }

  const automation = await getWorkspaceAutomationById({
    automationId: input.automationId,
    organizationId: organization.id,
  });
  if (!automation) {
    return null;
  }

  if (automation.triggerConfig.mode !== "web_chat") {
    return null;
  }

  return {
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
    },
    automation,
  };
}

export async function findWebChatInteraction(input: {
  organizationId: string;
  automationId: string;
  visitorId: string;
}) {
  const sourceThreadId = buildWebChatSourceThreadId(input);
  const [interaction] = await db
    .select()
    .from(schema.interactions)
    .where(
      and(
        eq(schema.interactions.organizationId, input.organizationId),
        eq(schema.interactions.source, "web_chat"),
        eq(schema.interactions.sourceThreadId, sourceThreadId),
      ),
    )
    .limit(1);

  return interaction ?? null;
}
