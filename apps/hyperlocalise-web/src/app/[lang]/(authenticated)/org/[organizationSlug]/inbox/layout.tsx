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
import type { ReactNode } from "react";

import { hasCapability } from "@/api/auth/policy";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { InboxPageContent } from "./_components/inbox-page-content";
import { OrgPageSuspense } from "../_components/org-page-suspense";

export default function InboxLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  return (
    <OrgPageSuspense>
      <InboxLayoutLoader params={params}>{children}</InboxLayoutLoader>
    </OrgPageSuspense>
  );
}

async function InboxLayoutLoader({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const currentUserName =
    [auth.sessionUser.firstName, auth.sessionUser.lastName].filter(Boolean).join(" ") ||
    auth.sessionUser.email;

  return (
    <>
      <InboxPageContent
        currentUser={{
          avatarUrl: auth.sessionUser.profilePictureUrl ?? null,
          email: auth.sessionUser.email,
          name: currentUserName,
        }}
        organizationSlug={organizationSlug}
        canDeleteQueries={hasCapability(auth.membership.role, "write_back:translation")}
      />
      {children}
    </>
  );
}
