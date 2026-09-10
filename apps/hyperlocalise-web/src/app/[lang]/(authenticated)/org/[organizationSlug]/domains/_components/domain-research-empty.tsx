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
import type { ReactNode } from "react";
import { Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { domainResearchSharedMessages as messages } from "./domain-research-shared.messages";

export function DomainResearchEmpty({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Empty className="border border-dashed border-border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Globe02Icon} strokeWidth={1.8} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function DomainResearchMissingDomain({ organizationSlug }: { organizationSlug: string }) {
  return (
    <DomainResearchEmpty
      title={<FormattedMessage {...messages.missingTitle} />}
      description={<FormattedMessage {...messages.missingDescription} />}
      action={
        <Button
          size="sm"
          variant="outline"
          render={<OrgNavLink href={`/org/${organizationSlug}/domains`} />}
        >
          <FormattedMessage {...messages.backToDomains} />
        </Button>
      }
    />
  );
}
