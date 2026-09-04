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
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MessageDescriptor } from "react-intl";
import { FormattedMessage, useIntl } from "react-intl";

import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

import { FeatureTeaserBenefits } from "./feature-teaser-benefits";
import { featureTeaserMessages } from "./feature-teaser-registry";

export function FeatureTeaserCtaPanel({
  title,
  description,
  benefits,
  contactSubject,
  className,
}: {
  title: MessageDescriptor;
  description: MessageDescriptor;
  benefits: readonly MessageDescriptor[];
  contactSubject: MessageDescriptor;
  className?: string;
}) {
  const intl = useIntl();
  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    intl.formatMessage(contactSubject),
  )}`;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="space-y-3">
        <TypographyH2 className="md:text-2xl" size="xlarge" weight="medium" tone="content">
          <FormattedMessage {...title} />
        </TypographyH2>
        <TypographyP className="leading-6 sm:text-base" size="small" tone="subtle">
          <FormattedMessage {...description} />
        </TypographyP>
      </div>

      <FeatureTeaserBenefits benefits={benefits} />

      <div className="flex flex-wrap gap-2">
        <Button
          nativeButton={false}
          render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
        >
          <FormattedMessage {...featureTeaserMessages.requestDemo} />
          <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" className="size-4" />
        </Button>
        <Button variant="outline" nativeButton={false} render={<a href={mailtoHref} />}>
          <FormattedMessage {...featureTeaserMessages.contactSupport} />
        </Button>
      </div>
    </div>
  );
}
