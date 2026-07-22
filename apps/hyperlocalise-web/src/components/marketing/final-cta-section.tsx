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

import { finalCtaSectionMessages } from "./final-cta-section.messages";
import { Button } from "@/components/ui/button";
import { TypographyH2 } from "@/components/ui/typography";
import { env } from "@/lib/env";

export function FinalCtaSection() {
  return (
    <section id="waitlist" className="text-center">
      <TypographyH2 className="pb-0 text-4xl leading-[1.04] font-semibold tracking-[-0.04em] normal-case sm:text-5xl">
        <FormattedMessage {...finalCtaSectionMessages.headline} />
      </TypographyH2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          nativeButton={false}
          render={
            <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          <FormattedMessage {...finalCtaSectionMessages.joinEarlyAccess} />
        </Button>
      </div>
    </section>
  );
}
