import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";

import type { UseCasePageContent } from "./use-case-page-content";
import {
  UseCaseCapabilitiesSection,
  UseCaseCtaSection,
  UseCaseDifferentiatorSection,
  UseCaseHero,
  UseCaseOverviewSection,
  UseCaseScenarioSection,
  UseCaseWorkflowSection,
} from "./use-case-sections";

type UseCasePageProps = {
  content: UseCasePageContent;
};

export function UseCasePage({ content }: UseCasePageProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl">
        <section className="px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10">
          <UseCaseHero content={content} />
        </section>

        <section className="px-5 py-16 sm:px-8 lg:px-10">
          <UseCaseOverviewSection content={content} />
        </section>

        <section className="border-t border-border px-5 py-20 sm:px-8 lg:px-10">
          <UseCaseWorkflowSection content={content.workflow} />
        </section>

        <section className="border-t border-border px-5 py-20 sm:px-8 lg:px-10">
          <UseCaseCapabilitiesSection content={content.capabilities} />
        </section>

        <section className="border-t border-border px-5 py-20 sm:px-8 lg:px-10">
          <UseCaseDifferentiatorSection content={content.differentiator} />
        </section>

        <section className="border-t border-border px-5 py-20 sm:px-8 lg:px-10">
          <UseCaseScenarioSection content={content.scenario} />
        </section>

        <section className="border-t border-border px-5 py-24 sm:px-8 lg:px-10">
          <UseCaseCtaSection content={content.cta} />
        </section>

        <section className="border-t border-border px-5 py-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </main>
    </div>
  );
}
