import { Button } from "@/components/ui/button";
import { TypographyH2 } from "@/components/ui/typography";
import { env } from "@/lib/env";

import { githubRepoUrl } from "./marketing-page-content";

export function FinalCtaSection() {
  return (
    <section id="waitlist" className="text-center">
      <TypographyH2 className="pb-0 text-4xl leading-[1.04] font-semibold tracking-[-0.04em] normal-case sm:text-5xl">
        Built for localization teams. Available soon.
      </TypographyH2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          className="rounded-full bg-white px-5 text-black hover:bg-white/90"
          nativeButton={false}
          render={<a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noreferrer" />}
        >
          Join waitlist
        </Button>
        <Button
          variant="outline"
          className="rounded-full border-white/12 bg-white/[0.03] px-5 text-white hover:bg-white/[0.06]"
          nativeButton={false}
          render={<a href={githubRepoUrl} target="_blank" rel="noreferrer" />}
        >
          View GitHub
        </Button>
      </div>
    </section>
  );
}
