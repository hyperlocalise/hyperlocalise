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
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { resolvePublicWebChatAgent } from "@/lib/agents/workspace-automation-web-chat";

import { WebChatPage } from "./web-chat-page";

type WebChatRouteProps = {
  params: Promise<{
    lang: string;
    organizationSlug: string;
    automationId: string;
  }>;
};

export async function generateMetadata({ params }: WebChatRouteProps): Promise<Metadata> {
  const { organizationSlug, automationId } = await params;
  const agent = await resolvePublicWebChatAgent({ organizationSlug, automationId });

  return {
    title: agent ? `${agent.automation.name}` : "Chat",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PublicWebChatRoute({ params }: WebChatRouteProps) {
  const { organizationSlug, automationId } = await params;
  const agent = await resolvePublicWebChatAgent({ organizationSlug, automationId });
  if (!agent || agent.automation.status === "archived") {
    notFound();
  }

  return (
    <WebChatPage
      organizationSlug={organizationSlug}
      automationId={automationId}
      agentName={agent.automation.name}
      organizationName={agent.organization.name}
      status={agent.automation.status === "paused" ? "paused" : "active"}
    />
  );
}
