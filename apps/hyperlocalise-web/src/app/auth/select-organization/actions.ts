"use server";

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
import { redirect } from "next/navigation";

import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import { setStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";
import {
  acceptPendingInvitation,
  type AcceptInvitationError,
} from "@/lib/workos/pending-invitations";
import { withAuth } from "@/lib/workos/server-auth";

const logger = createLogger("accept-invitation-action");

export type AcceptInvitationActionState = {
  error?: AcceptInvitationError["code"];
};

export async function acceptInvitationAction(
  _previousState: AcceptInvitationActionState,
  formData: FormData,
): Promise<AcceptInvitationActionState> {
  const organizationSlug = formData.get("organizationSlug");
  if (typeof organizationSlug !== "string" || !organizationSlug) {
    return { error: "invitation_not_found" };
  }

  const session = await withAuth({ ensureSignedIn: true });
  if (!session.user) {
    redirect("/auth/sign-in?returnTo=/auth/select-organization");
  }

  const result = await acceptPendingInvitation({
    sessionUser: session.user,
    organizationSlug,
  });

  if (isErr(result)) {
    logger.warn("accept_invitation_refused", {
      workosUserId: session.user.id,
      code: result.error.code,
    });
    return { error: result.error.code };
  }

  await setStoredActiveOrganizationSlug(result.value.organizationSlug);
  redirect(`/org/${result.value.organizationSlug}/dashboard`);
}
