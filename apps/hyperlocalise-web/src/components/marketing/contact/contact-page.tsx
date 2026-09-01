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
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

import { getContactPageCopy, supportEmailMailto } from "./contact-page-content";

type ContactPageProps = {
  locale: string;
};

export function ContactPage({ locale }: ContactPageProps) {
  const copy = getContactPageCopy(locale);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="px-5 pt-16 pb-24 sm:px-8 sm:pt-20 sm:pb-28 lg:px-10">
          <div className="max-w-4xl space-y-6">
            <TypographyH1>{copy.headline}</TypographyH1>
            <TypographyP className="max-w-2xl text-lg text-muted-foreground">
              {copy.subcopy}
            </TypographyP>
            <div className="pt-2">
              <Button size="lg" nativeButton={false} render={<a href={supportEmailMailto} />}>
                {copy.emailCta}
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="px-5 pt-20 sm:px-8 sm:pt-24 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </div>
    </div>
  );
}
