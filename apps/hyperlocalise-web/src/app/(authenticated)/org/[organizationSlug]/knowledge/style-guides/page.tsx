import { TypographyH1, TypographyP } from "@/components/ui/typography";

export default function StyleGuidesPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
        Style Guides
      </TypographyH1>
      <TypographyP className="text-sm leading-6 text-foreground/58">
        Centralise locale-specific style rules, formatting conventions, and editorial standards for
        agents and reviewers. This workspace library will connect to project execution soon.
      </TypographyP>
    </div>
  );
}
