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

import { TypographyH2 } from "@/components/ui/typography";

import { HeroFrameMeshStage } from "./hero-frame-mesh-stage";
import { principlesSectionMessages } from "./principles-section.messages";

export function PrinciplesSection() {
  return (
    <section id="overview">
      <div className="max-w-5xl">
        <TypographyH2>
          <FormattedMessage
            {...principlesSectionMessages.headline}
            values={{
              muted: (chunks) => <span className="text-muted-foreground">{chunks}</span>,
            }}
          />
        </TypographyH2>
      </div>

      <HeroFrameMeshStage className="mt-10 sm:mt-12" />
    </section>
  );
}
