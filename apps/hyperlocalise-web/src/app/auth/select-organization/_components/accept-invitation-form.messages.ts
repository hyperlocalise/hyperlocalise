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
import { defineMessages } from "react-intl";

export const acceptInvitationFormMessages = defineMessages({
  accept: {
    defaultMessage: "Accept",
    id: "X6NUPESd72",
    description:
      "Button on the workspace picker that accepts an invitation and opens that workspace",
  },
  accepting: {
    defaultMessage: "Accepting…",
    id: "0UO1BREBTM",
    description: "Accept invitation button label while the invitation is being accepted",
  },
  acceptLabel: {
    defaultMessage: "Accept invitation to {name}",
    id: "n0CHcDaj4y",
    description:
      "Screen-reader label for the button that accepts an invitation to the named workspace",
  },
  emailNotVerified: {
    defaultMessage: "Verify your email address before accepting an invitation, then try again.",
    id: "dInHga4hn8",
    description: "Error under an invitation when the person's email address is not verified",
  },
  membershipNotActivated: {
    defaultMessage:
      "Your invitation was accepted, but the workspace is not ready yet. Reload this page in a moment.",
    id: "HVWNQgqVcW",
    description:
      "Error under an invitation when it was accepted but the workspace membership has not appeared yet",
  },
  tryAgain: {
    defaultMessage: "We could not reach the sign-in service. Try again in a moment.",
    id: "hxaX4oOeRm",
    description: "Error under an invitation when the sign-in service failed while accepting it",
  },
  invitationNotFound: {
    defaultMessage:
      "This invitation has expired or was withdrawn. Ask the workspace admin to invite you again.",
    id: "L9HXNtVWvN",
    description: "Error under an invitation that can no longer be accepted",
  },
});
