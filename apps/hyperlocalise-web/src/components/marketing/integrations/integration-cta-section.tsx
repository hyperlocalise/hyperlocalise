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
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import { Box } from "@/components/ui/layout/box";
import { Rows } from "@/components/ui/layout/rows";
import { TypographyH2, TypographyP } from "@/components/ui/typography";

type IntegrationCtaSectionProps = {
  headline: string;
  description: string;
  primaryCtaLabel: string;
  secondaryCtaLabel?: string;
};

export function IntegrationCtaSection({
  headline,
  description,
  primaryCtaLabel,
  secondaryCtaLabel,
}: IntegrationCtaSectionProps) {
  return (
    <Box paddingX="3u" paddingY="8u">
      <div className="mx-auto max-w-3xl">
        <Rows spacing="3u">
          <TypographyH2 size="medium">{headline}</TypographyH2>
          <TypographyP tone="subtle">{description}</TypographyP>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button
              nativeButton={false}
              render={<a href={REQUEST_DEMO_URL} rel="noopener noreferrer" target="_blank" />}
            >
              {primaryCtaLabel}
            </Button>
            {secondaryCtaLabel ? (
              <Button
                nativeButton={false}
                render={<a href="/auth/sign-in" rel="noopener noreferrer" />}
                variant="outline"
              >
                {secondaryCtaLabel}
              </Button>
            ) : null}
          </div>
        </Rows>
      </div>
    </Box>
  );
}
