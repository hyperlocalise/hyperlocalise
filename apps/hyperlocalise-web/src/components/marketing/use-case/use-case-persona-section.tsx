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
import type { Icon } from "@phosphor-icons/react";
import { ArrowUpRightIcon, CodeIcon, RocketLaunchIcon, TranslateIcon } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { FormattedMessage } from "react-intl";

import {
  BLUSH_MESH_GRADIENT_SRC,
  DUSK_MESH_GRADIENT_SRC,
  SAGE_MESH_GRADIENT_SRC,
} from "@/components/marketing/hero-frame-mesh-stage";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { cn } from "@/lib/primitives/cn";

import { DotGrid } from "./use-case-backdrops";
import {
  useCasePagesBySlug,
  type UseCasePageContent,
  type UseCasePersona,
} from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type PersonaDefinition = {
  id: UseCasePersona;
  icon: Icon;
  meshSrc: string;
  tagKey: UseCaseMessageKey;
  nameKey: UseCaseMessageKey;
  descriptionKey: UseCaseMessageKey;
  /** Use cases this persona cares about, most relevant first. Lists may overlap. */
  slugs: string[];
};

const PERSONAS: PersonaDefinition[] = [
  {
    id: "localisation-manager",
    icon: TranslateIcon,
    meshSrc: SAGE_MESH_GRADIENT_SRC,
    tagKey: "personaLocalisationManagerLabel",
    nameKey: "personaLocalisationManagerName",
    descriptionKey: "personaLocalisationManagerDescription",
    slugs: [
      "localisation-operations",
      "localisation-quality-monitoring",
      "help-center-localisation",
    ],
  },
  {
    id: "international-growth",
    icon: RocketLaunchIcon,
    meshSrc: BLUSH_MESH_GRADIENT_SRC,
    tagKey: "personaGrowthLabel",
    nameKey: "personaGrowthName",
    descriptionKey: "personaGrowthDescription",
    slugs: ["market-entry", "marketing-localisation", "market-experimentation"],
  },
  {
    id: "developer",
    icon: CodeIcon,
    meshSrc: DUSK_MESH_GRADIENT_SRC,
    tagKey: "personaDeveloperLabel",
    nameKey: "personaDeveloperName",
    descriptionKey: "personaDeveloperDescription",
    slugs: [
      "github-release-localisation",
      "localisation-cli-and-api",
      "localisation-for-ai-coding-agents",
    ],
  },
];

const PERSONAS_BY_ID = Object.fromEntries(
  PERSONAS.map((persona) => [persona.id, persona]),
) as Record<UseCasePersona, PersonaDefinition>;

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

/** Glass pill naming the page's primary audience. Sits on the dark hero mesh. */
export function UseCasePersonaTag({ persona }: { persona: UseCasePersona }) {
  const definition = PERSONAS_BY_ID[persona];
  const PersonaIcon = definition.icon;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 py-1 ps-1.5 pe-3.5 text-xs font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-md">
      <span className="flex size-6 items-center justify-center rounded-full bg-white/90 text-neutral-900">
        <PersonaIcon aria-hidden className="size-3.5" weight="bold" />
      </span>
      <Message messageKey={definition.tagKey} />
    </span>
  );
}

export function UseCasePersonaSection({ page: current }: { page: UseCasePageContent }) {
  const locale = useAppLocale();

  return (
    <section className="relative isolate">
      <DotGrid fade="radial" />

      <div className="mx-auto max-w-3xl space-y-5 text-center">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          <Message messageKey="personaSectionLabel" />
        </p>
        <h2 className="font-heading text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.08] tracking-[-0.03em] text-balance">
          <Message messageKey="personaSectionTitle" />
        </h2>
        <p className="mx-auto max-w-2xl text-base leading-7 text-pretty text-muted-foreground">
          <Message messageKey="personaSectionDescription" />
        </p>
      </div>

      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {PERSONAS.map((persona) => {
          const PersonaIcon = persona.icon;
          const isActivePersona = persona.id === current.persona;

          return (
            <article
              key={persona.id}
              className={cn(
                "group/persona relative flex flex-col overflow-hidden rounded-[1.75rem] border bg-background/85 backdrop-blur-sm transition-shadow duration-300",
                isActivePersona
                  ? "border-foreground/15 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.28)]"
                  : "border-border shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:shadow-[0_18px_48px_-24px_rgba(0,0,0,0.25)]",
              )}
            >
              <div className="relative isolate h-28 overflow-hidden">
                <Image
                  src={persona.meshSrc}
                  alt=""
                  aria-hidden
                  fill
                  unoptimized
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  className="-z-20 object-cover transition-transform duration-700 ease-out group-hover/persona:scale-105 motion-reduce:transition-none"
                />
                <DotGrid tone="light" fade="bottom" />
                <span className="absolute bottom-0 left-6 flex size-12 translate-y-1/2 items-center justify-center rounded-2xl border border-border bg-background text-foreground shadow-[0_10px_24px_-10px_rgba(0,0,0,0.35)]">
                  <PersonaIcon aria-hidden className="size-5" weight="duotone" />
                </span>
              </div>

              <div className="flex flex-1 flex-col px-6 pb-6 pt-10">
                <h3 className="text-xl font-semibold tracking-[-0.03em]">
                  <Message messageKey={persona.nameKey} />
                </h3>
                <p className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">
                  <Message messageKey={persona.descriptionKey} />
                </p>

                <ul className="mt-6 flex flex-col gap-1.5 border-t border-border pt-4">
                  {persona.slugs.map((slug) => {
                    const page = useCasePagesBySlug[slug];
                    if (!page) {
                      return null;
                    }
                    const isCurrent = slug === current.slug;

                    return (
                      <li key={slug}>
                        <Link
                          href={rewriteAppLocalePath(`/use-cases/${slug}`, locale)}
                          aria-current={isCurrent ? "page" : undefined}
                          className={cn(
                            "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none",
                            isCurrent
                              ? "bg-muted text-foreground"
                              : "text-foreground/80 hover:bg-muted/70 hover:text-foreground",
                          )}
                        >
                          <Message messageKey={page.labelKey} />
                          {isCurrent ? (
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                              <Message messageKey="personaCurrentPage" />
                            </span>
                          ) : (
                            <ArrowUpRightIcon
                              aria-hidden
                              className="size-4 shrink-0 text-muted-foreground"
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
