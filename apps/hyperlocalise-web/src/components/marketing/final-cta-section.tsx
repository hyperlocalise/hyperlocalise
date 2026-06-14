import { Button } from "@/components/ui/button";
import { TypographyH2 } from "@/components/ui/typography";
import { env } from "@/lib/env";

export function FinalCtaSection() {
  return (
    <section id="waitlist" className="text-center">
      <TypographyH2 className="pb-0 text-4xl leading-[1.04] font-semibold tracking-[-0.04em] normal-case sm:text-5xl">
        Built for localization teams. Available soon.
      </TypographyH2>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          nativeButton={false}
          render={
            <a href={env.NEXT_PUBLIC_WAITLIST_URL} target="_blank" rel="noopener noreferrer" />
          }
        >
          Join early access
        </Button>
      </div>
    </section>
  );
}
