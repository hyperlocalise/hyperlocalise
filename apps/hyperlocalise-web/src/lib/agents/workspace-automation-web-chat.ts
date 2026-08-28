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
import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import {
  WEB_CHAT_HISTORY_LIMIT,
  buildWebChatSourceThreadId,
} from "./workspace-automation-web-chat-constants";
import {
  buildWorkspaceAutomationWebChatHref,
  buildWorkspaceAutomationWebChatPath,
  buildWorkspaceAutomationWebChatUrl,
} from "./workspace-automation-web-chat-url";
import { getWorkspaceAutomationById } from "./workspace-automations";
import { type WorkspaceAutomationRecord } from "./workspace-automation-types";

export {
  buildWebChatSourceThreadId,
  isWebChatImageContentType,
  WEB_CHAT_HISTORY_LIMIT,
  WEB_CHAT_IMAGE_CONTENT_TYPES,
  WEB_CHAT_IMAGE_UPLOAD_MULTIPART_OVERHEAD_BYTES,
  WEB_CHAT_MAX_IMAGE_BYTES,
  WEB_CHAT_MAX_IMAGE_FILES,
  WEB_CHAT_MAX_IMAGE_REQUEST_BYTES,
  WEB_CHAT_VISITOR_COOKIE_NAME,
} from "./workspace-automation-web-chat-constants";

export {
  buildWorkspaceAutomationWebChatHref,
  buildWorkspaceAutomationWebChatPath,
  buildWorkspaceAutomationWebChatUrl,
};

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

export async function listRecentWebChatMessages(conversationId: string) {
  const rows = await db
    .select({
      id: schema.interactionMessages.id,
      senderType: schema.interactionMessages.senderType,
      text: schema.interactionMessages.text,
      attachments: schema.interactionMessages.attachments,
    })
    .from(schema.interactionMessages)
    .where(eq(schema.interactionMessages.interactionId, conversationId))
    .orderBy(desc(schema.interactionMessages.createdAt), desc(schema.interactionMessages.id))
    .limit(WEB_CHAT_HISTORY_LIMIT);

  return rows.toReversed();
}
