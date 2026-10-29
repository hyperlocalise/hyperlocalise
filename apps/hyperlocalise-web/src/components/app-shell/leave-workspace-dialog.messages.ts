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

export const leaveWorkspaceDialogMessages = defineMessages({
  title: {
    defaultMessage: "Leave {name}?",
    id: "a6AWYfXez+",
    description: "Title of the dialog confirming that the person leaves a workspace",
  },
  description: {
    defaultMessage:
      "You will lose access to this workspace and its projects. To come back, an admin has to invite you again.",
    id: "xzl3uN35Vr",
    description: "What leaving a workspace means, in the leave workspace dialog",
  },
  checking: {
    defaultMessage: "Checking what changes when you leave…",
    id: "lsoHEzfNM1",
    description: "Shown while the leave workspace dialog loads the API keys and automations",
  },
  onlyWorkspace: {
    defaultMessage:
      "This is your only workspace. Afterwards you can create a new one or accept an invitation.",
    id: "9MMt/YNSGT",
    description: "Added to the leave workspace dialog when the person has no other workspace",
  },
  moreItems: {
    defaultMessage: "and {count} more",
    id: "Kg5oomFJK7",
    description:
      "Last line of a shortened list in the leave workspace dialog, counting the items not shown",
  },
  noLongerMember: {
    defaultMessage: "You are no longer a member of this workspace.",
    id: "d62LeLJXFa",
    description:
      "Shown in the leave workspace dialog when the person lost access after opening the menu",
  },
  continue: {
    defaultMessage: "Continue",
    id: "+u6bMZ2pRz",
    description:
      "Button in the leave workspace dialog that moves on to another workspace after access was lost",
  },
  checkFailed: {
    defaultMessage: "Could not check what changes when you leave.",
    id: "oiJegD5+SZ",
    description: "Shown when the leave workspace dialog could not load what stops working",
  },
  tryAgain: {
    defaultMessage: "Try again",
    id: "Siv+JUHnHq",
    description: "Button that retries loading what changes when the person leaves a workspace",
  },
  lastAdmin: {
    defaultMessage:
      "You are the only admin of this workspace. Make another member an admin before you leave.",
    id: "rXMDxSDgo4",
    description: "Why the only admin of a workspace cannot leave it",
  },
  manageMembers: {
    defaultMessage: "Manage members",
    id: "jH/ffXiBlp",
    description:
      "Link to the members page from the leave workspace dialog, shown to the only admin",
  },
  apiKeys: {
    defaultMessage:
      "{count, plural, one {This API key stops working:} other {These API keys stop working:}}",
    id: "eIdejZFXxK",
    description: "Heading above the person's API keys that leaving the workspace revokes",
  },
  automations: {
    defaultMessage:
      "{count, plural, one {This automation uses an account you connected and may stop working:} other {These automations use accounts you connected and may stop working:}}",
    id: "W3dD2MKin0",
    description:
      "Heading above automations that sign in to other services with the leaving person's accounts",
  },
  leaveFailed: {
    defaultMessage: "Could not leave the workspace. Try again.",
    id: "P3hJ1/69DS",
    description: "Error in the leave workspace dialog when leaving failed",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "qr+n6Od9jO",
    description: "Button that closes the leave workspace dialog without leaving",
  },
  leave: {
    defaultMessage: "Leave workspace",
    id: "Y9y6zTkXYd",
    description: "Button in the leave workspace dialog that removes the person from the workspace",
  },
  leaving: {
    defaultMessage: "Leaving…",
    id: "wTouXDwM8N",
    description: "Leave workspace button label while the person is being removed",
  },
});
