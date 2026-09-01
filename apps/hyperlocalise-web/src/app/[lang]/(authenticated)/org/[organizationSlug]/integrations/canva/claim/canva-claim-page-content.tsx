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
import { FormattedMessage } from "react-intl";

import { TypographyH1 } from "@/components/ui/typography";

import { CanvaConnectionPanel } from "../../_components/canva-connection-panel";
import { canvaConnectionPanelMessages } from "../../_components/canva-connection-panel.messages";

export function CanvaClaimPageContent({
  organizationSlug,
  claimId,
  userIsAdmin,
}: {
  organizationSlug: string;
  claimId: string | null;
  userIsAdmin: boolean;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <TypographyH1>
          <FormattedMessage {...canvaConnectionPanelMessages.claimPageTitle} />
        </TypographyH1>
        <p className="text-sm text-muted-foreground">
          {claimId ? (
            <FormattedMessage {...canvaConnectionPanelMessages.claimPageDescription} />
          ) : (
            <FormattedMessage {...canvaConnectionPanelMessages.claimMissing} />
          )}
        </p>
      </div>
      <CanvaConnectionPanel
        organizationSlug={organizationSlug}
        disabled={!userIsAdmin}
        claimId={claimId}
        isLast
      />
    </div>
  );
}
