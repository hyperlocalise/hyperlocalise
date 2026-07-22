/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { InboxPageContent } from "../_components/inbox-page-content";

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; conversationId: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const currentUserName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;

  return (
    <InboxPageContent
      currentUser={{
        avatarUrl: auth.sessionUser.profilePictureUrl ?? null,
        email: auth.sessionUser.email,
        name: currentUserName,
      }}
      organizationSlug={organizationSlug}
    />
  );
}
