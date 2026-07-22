"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";

import { crowdinAppInboxMessages } from "./crowdin-app-inbox.messages";

export type CrowdinAppInboxErrorCode =
  | "unauthorized"
  | "crowdin_org_not_linked"
  | "crowdin_org_ambiguous"
  | "crowdin_user_not_linked"
  | "crowdin_project_not_linked"
  | "organization_slug_missing"
  | "crowdin_app_not_configured"
  | "crowdin_jwt_invalid"
  | "crowdin_jwt_missing_user_id"
  | "crowdin_jwt_missing_organization_id"
  | "crowdin_jwt_missing_project_id";

function messageForError(error: CrowdinAppInboxErrorCode) {
  switch (error) {
    case "crowdin_org_not_linked":
    case "crowdin_org_ambiguous":
    case "organization_slug_missing":
      return {
        title: crowdinAppInboxMessages.orgNotLinkedTitle,
        body: crowdinAppInboxMessages.orgNotLinkedBody,
      };
    case "crowdin_user_not_linked":
      return {
        title: crowdinAppInboxMessages.userNotLinkedTitle,
        body: crowdinAppInboxMessages.userNotLinkedBody,
      };
    case "crowdin_project_not_linked":
      return {
        title: crowdinAppInboxMessages.projectNotLinkedTitle,
        body: crowdinAppInboxMessages.projectNotLinkedBody,
      };
    default:
      return {
        title: crowdinAppInboxMessages.unauthorizedTitle,
        body: crowdinAppInboxMessages.unauthorizedBody,
      };
  }
}

export function CrowdinAppInboxLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6 text-sm text-muted-foreground">
      <FormattedMessage {...crowdinAppInboxMessages.loading} />
    </div>
  );
}

export function CrowdinAppInboxErrorState({
  error,
  appBaseUrl,
}: {
  error: CrowdinAppInboxErrorCode;
  appBaseUrl?: string;
}) {
  const copy = messageForError(error);

  return (
    <div className="flex min-h-svh flex-col items-start justify-center gap-4 p-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">
          <FormattedMessage {...copy.title} />
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          <FormattedMessage {...copy.body} />
        </p>
      </div>
      {appBaseUrl ? (
        <Button
          nativeButton={false}
          render={<a href={appBaseUrl} rel="noreferrer" target="_blank" />}
          variant="default"
        >
          <FormattedMessage {...crowdinAppInboxMessages.openIntegrations} />
        </Button>
      ) : null}
    </div>
  );
}
