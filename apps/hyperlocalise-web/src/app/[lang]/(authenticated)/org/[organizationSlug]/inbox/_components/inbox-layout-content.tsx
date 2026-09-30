"use client";

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
import { useParams } from "next/navigation";

import { useAppShellSession } from "@/components/app-shell/store/app-shell-session-context";

import { InboxPageContent } from "./inbox-page-content";

export function InboxLayoutContent() {
  const params = useParams();
  const organizationSlug =
    typeof params?.organizationSlug === "string" ? params.organizationSlug : "";
  const session = useAppShellSession();

  if (!organizationSlug) {
    return null;
  }

  return (
    <InboxPageContent
      canDeleteQueries={session.canDeleteQueries}
      currentUser={session.currentUser}
      organizationSlug={organizationSlug}
    />
  );
}
