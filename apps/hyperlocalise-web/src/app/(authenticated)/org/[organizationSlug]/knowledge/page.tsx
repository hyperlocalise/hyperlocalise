import { Badge } from "@/components/ui/badge";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

export default function KnowledgePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div className="space-y-3">
        <Badge variant="outline" className="border-foreground/12 text-foreground/58">
          Coming soon
        </Badge>
        <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
          Knowledge
        </TypographyH1>
        <TypographyP className="max-w-2xl text-sm leading-6 text-foreground/58">
          Workspace memory for Hyperlocalise — similar to a shared{" "}
          <span className="font-mono text-foreground/72">MEMORY.md</span> that agents and
          localisation teams can read and update over time.
        </TypographyP>
      </div>

      <section className="space-y-4 rounded-lg border border-foreground/8 bg-foreground/2.5 p-5">
        <TypographyP className="text-sm font-medium text-foreground">
          What will live here
        </TypographyP>
        <ul className="list-disc space-y-2 ps-5 text-sm leading-6 text-foreground/58">
          <li>Product facts, release context, and decisions that should persist across projects</li>
          <li>Locale and market notes agents apply during translation and review</li>
          <li>Pointers to terminology and translation memories</li>
        </ul>
        <TypographyP className="text-sm leading-6 text-foreground/48">
          Terminology and Translation Memories remain available in the sidebar while Knowledge is
          being built.
        </TypographyP>
      </section>
    </div>
  );
}
