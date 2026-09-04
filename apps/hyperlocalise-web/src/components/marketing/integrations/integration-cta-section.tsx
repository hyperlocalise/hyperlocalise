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
  secondaryCtaLabel: string;
};

export function IntegrationCtaSection({
  headline,
  description,
  primaryCtaLabel,
  secondaryCtaLabel,
}: IntegrationCtaSectionProps) {
  return (
    <Box paddingX="3u" paddingY="8u">
      <div className="mx-auto max-w-4xl">
        <Box background="surface" border="standard" borderRadius="large" padding="6u">
          <div className="text-center">
            <Rows spacing="3u" align="center">
              <TypographyH2 alignment="center" size="medium">
                {headline}
              </TypographyH2>
              <TypographyP alignment="center" tone="subtle">
                {description}
              </TypographyP>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  nativeButton={false}
                  render={<a href={REQUEST_DEMO_URL} rel="noopener noreferrer" target="_blank" />}
                >
                  {primaryCtaLabel}
                </Button>
                <Button
                  nativeButton={false}
                  render={<a href="/auth/sign-in" rel="noopener noreferrer" />}
                  variant="outline"
                >
                  {secondaryCtaLabel}
                </Button>
              </div>
            </Rows>
          </div>
        </Box>
      </div>
    </Box>
  );
}
