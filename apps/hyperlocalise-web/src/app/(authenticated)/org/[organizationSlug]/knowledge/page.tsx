import Link from "next/link";

import { buildKnowledgeNavigationItems } from "@/components/app-shell/navigation-config";
import { TypographyH1, TypographyP } from "@/components/ui/typography";

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const items = buildKnowledgeNavigationItems(organizationSlug);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="space-y-2">
        <TypographyH1 className="font-heading text-4xl font-semibold text-foreground md:text-5xl">
          Knowledge
        </TypographyH1>
        <TypographyP className="max-w-2xl text-sm leading-6 text-foreground/58">
          Shared workspace intelligence that agents and localisation teams reuse across projects —
          context, terminology, memories, and voice.
        </TypographyP>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="rounded-lg border border-foreground/8 bg-foreground/2.5 p-4 transition-colors hover:border-foreground/14 hover:bg-foreground/4"
          >
            <p className="text-sm font-medium text-foreground">{item.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
