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
import Image from "next/image";
import { FormattedMessage, defineMessages, useIntl } from "react-intl";

import { TRUSTED_BY_LOGOS } from "@/components/marketing/trusted-by-logos";

const messages = defineMessages({
  label: {
    defaultMessage: "Trusted by teams at",
    id: "2MAdJ856yN",
    description: "Integration strip label on the agents-automation hero",
  },
});

export function IntegrationStripSection() {
  const intl = useIntl();

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="shrink-0 whitespace-nowrap text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <FormattedMessage {...messages.label} />
      </p>
      <div className="flex flex-wrap items-center gap-6">
        {TRUSTED_BY_LOGOS.map((logo) => (
          <a
            key={logo.id}
            href={logo.href}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-50 grayscale-[80%] transition-all duration-300 hover:opacity-100 hover:grayscale-0 hover:scale-105 dark:invert dark:opacity-40 dark:hover:opacity-80"
          >
            <Image
              src={logo.src}
              alt={intl.formatMessage(logo.alt)}
              unoptimized={logo.src.endsWith(".svg")}
              width={logo.width}
              height={logo.height}
              className={logo.className + " w-auto object-contain"}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
