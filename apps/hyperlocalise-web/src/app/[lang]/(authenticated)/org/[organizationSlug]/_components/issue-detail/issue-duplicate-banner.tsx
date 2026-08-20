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
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { buildIssueDetailHref } from "./issue-detail-utils";
import { issueDuplicateBannerMessages as messages } from "./issue-duplicate-banner.messages";
import type { IssueRelationship } from "./use-issue-relationships-query";

/** Renders nothing unless `relationships` contains an outgoing "duplicate_of" entry. */
export function IssueDuplicateBanner({
  organizationSlug,
  relationships,
}: {
  organizationSlug: string;
  relationships: IssueRelationship[];
}) {
  const canonical = relationships.find(
    (relationship) => relationship.presentedKind === "duplicate_of",
  );
  if (!canonical) {
    return null;
  }

  return (
    <Alert className="mb-3">
      <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} />
      <AlertTitle>
        <FormattedMessage {...messages.title} />
      </AlertTitle>
      <AlertDescription>
        <FormattedMessage
          {...messages.description}
          values={{ title: canonical.otherIssue.title }}
        />
      </AlertDescription>
      <AlertAction>
        <Button
          type="button"
          size="sm"
          variant="outline"
          render={
            <a
              href={buildIssueDetailHref({
                organizationSlug,
                projectId: canonical.otherIssue.projectId,
                issueId: canonical.otherIssue.issueId,
              })}
            />
          }
        >
          <FormattedMessage {...messages.viewCanonical} />
        </Button>
      </AlertAction>
    </Alert>
  );
}
