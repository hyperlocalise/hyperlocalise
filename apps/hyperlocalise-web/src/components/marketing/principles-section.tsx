import { LinkSquare02Icon, Shield01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Card, CardContent } from "@/components/ui/card";
import { TypographyH2, TypographyH4, TypographyMuted } from "@/components/ui/typography";

import { principles } from "./marketing-page-content";

const principleIconStyles = [
  {
    icon: SparklesIcon,
    badgeClassName: "border-bud-900/20 bg-bud-100 text-bud-900",
  },
  {
    icon: LinkSquare02Icon,
    badgeClassName: "border-dew-900/20 bg-dew-100 text-dew-900",
  },
  {
    icon: Shield01Icon,
    badgeClassName: "border-spruce-900/20 bg-spruce-100 text-spruce-900",
  },
] as const;

export function PrinciplesSection() {
  return (
    <section id="overview">
      <div className="max-w-5xl">
        <TypographyH2>
          A localization operating system in AI era.{" "}
          <span className="text-muted-foreground">
            Built for modern teams with translation, review, sync, and quality control in one
            workflow.
          </span>
        </TypographyH2>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-3">
        {principles.map((item, index) => {
          const iconStyle = principleIconStyles[index] ?? principleIconStyles[0];

          return (
            <Card
              key={item.title}
              className="rounded-[1.5rem] border border-white/8 bg-white/2 py-0 text-white shadow-none"
            >
              <CardContent className="px-5 py-5 space-y-2">
                <div
                  className={`mb-10 flex size-14 items-center justify-center rounded-2xl border ${iconStyle.badgeClassName}`}
                >
                  <HugeiconsIcon icon={iconStyle.icon} strokeWidth={1.8} className="size-6" />
                </div>
                <TypographyH4>{item.title}</TypographyH4>
                <TypographyMuted>{item.description}</TypographyMuted>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
