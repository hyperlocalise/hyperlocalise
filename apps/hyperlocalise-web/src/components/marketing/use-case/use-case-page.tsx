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

import type { HomepageFaqItem } from "@/components/marketing/homepage-faq-content";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { cn } from "@/lib/primitives/cn";

import { DotGrid } from "./use-case-backdrops";
import type { UseCasePageContent } from "./use-case-page-content";
import { UseCasePersonaSection } from "./use-case-persona-section";
import {
  UseCaseCapabilitiesSection,
  UseCaseCtaSection,
  UseCaseGuideSection,
  UseCaseHero,
  UseCaseIntegrationsRow,
  UseCaseScenarioSection,
  UseCaseShiftSection,
  UseCaseVideoSection,
} from "./use-case-sections";
import { useCaseStoriesBySlug } from "./use-case-stories";

type UseCasePageProps = {
  page: UseCasePageContent;
  faqItems: HomepageFaqItem[];
  faqHeading: string;
  faqSubheading: string;
};

const SECTION_INNER_CLASS = "mx-auto max-w-7xl px-5 sm:px-8 lg:px-10";

/** Full-bleed band with an optional dot grid; content stays in the 7xl column. */
function UseCaseBand({
  children,
  dots = false,
  bordered = true,
  className,
}: {
  children: ReactNode;
  dots?: boolean;
  bordered?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden py-20 lg:py-28",
        bordered && "border-t border-border",
        className,
      )}
    >
      {dots ? <DotGrid fade="radial" /> : null}
      <div className={SECTION_INNER_CLASS}>{children}</div>
    </section>
  );
}

export function UseCasePage({ page, faqItems, faqHeading, faqSubheading }: UseCasePageProps) {
  const story = useCaseStoriesBySlug[page.slug];

  if (!story) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <UseCaseHero page={page} story={story} />

      <main>
        <UseCaseBand bordered={false} className="pt-6 lg:pt-10">
          <UseCaseShiftSection story={story} />
        </UseCaseBand>

        <UseCaseBand dots className="bg-muted/30">
          <UseCaseGuideSection page={page} story={story} />
        </UseCaseBand>

        <UseCaseBand>
          <UseCaseVideoSection slug={page.slug} />
        </UseCaseBand>

        <UseCaseBand dots className="py-16 lg:py-20">
          <UseCaseIntegrationsRow story={story} />
        </UseCaseBand>

        <UseCaseBand>
          <UseCaseCapabilitiesSection page={page} story={story} />
        </UseCaseBand>

        <UseCaseBand className="bg-muted/30">
          <UseCaseScenarioSection story={story} />
        </UseCaseBand>

        <UseCaseBand dots>
          <UseCasePersonaSection page={page} />
        </UseCaseBand>

        <UseCaseBand>
          <HomepageFaqSection items={faqItems} heading={faqHeading} subheading={faqSubheading} />
        </UseCaseBand>

        <UseCaseBand bordered={false} className="pb-20 pt-4 lg:pt-4">
          <UseCaseCtaSection slug={page.slug} story={story} />
        </UseCaseBand>

        <section className="border-t border-border">
          <div className={cn(SECTION_INNER_CLASS, "pt-16")}>
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </main>
    </div>
  );
}
