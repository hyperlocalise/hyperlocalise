import { TypographyH1, TypographyP } from "@/components/ui/typography";

export default function BrandVoicePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
        Brand Voice
      </TypographyH1>
      <TypographyP className="text-sm leading-6 text-foreground/58">
        Define how your product sounds across markets — tone, persona, and do/don&apos;t guidance
        that agents apply during translation and review.
      </TypographyP>
    </div>
  );
}
