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

import { TypographyH2, TypographyP } from "@/components/ui/typography";

import { ContentOpsMockStage } from "./content-ops/content-ops-mock-stage";
import { principlesSectionMessages } from "./principles-section.messages";

export function PrinciplesSection() {
  return (
    <section id="overview">
      <div className="max-w-3xl space-y-4">
        <TypographyH2>
          <FormattedMessage {...principlesSectionMessages.headline} />
        </TypographyH2>
        <TypographyP className="text-lg text-muted-foreground">
          <FormattedMessage {...principlesSectionMessages.subline} />
        </TypographyP>
      </div>

      <ContentOpsMockStage className="mt-12 sm:mt-16" priority />
    </section>
  );
}
