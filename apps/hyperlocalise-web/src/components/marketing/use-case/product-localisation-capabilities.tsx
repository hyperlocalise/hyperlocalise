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

import * as React from "react";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  BookOpenIcon,
  CheckCircleIcon,
  GitPullRequestIcon,
  GlobeIcon,
  ShieldCheckIcon,
  TranslateIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { IntegrationLogoMark } from "@/components/marketing/integrations/integration-logo-mark";
import { TypographyH2, TypographyP } from "@/components/ui/typography";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { getIntegrationCatalogEntry } from "@/lib/integrations/integration-catalog";
import { resolveIntegrationBySlug } from "@/lib/integrations/resolve-integration-catalog";

import type { UseCasePageContent } from "./use-case-page-content";
import { useCasePageMessages, type UseCaseMessageKey } from "./use-case-page-content.messages";

type Props = {
  content: UseCasePageContent;
};

type Capability = UseCasePageContent["capabilities"]["items"][number];

function Message({ messageKey }: { messageKey: UseCaseMessageKey }) {
  return <FormattedMessage {...useCasePageMessages[messageKey]} />;
}

const icons = [
  GlobeIcon,
  ShieldCheckIcon,
  BookOpenIcon,
  GitPullRequestIcon,
  TranslateIcon,
  UsersIcon,
] as const;

const tmsIntegrations = ["crowdin", "lokalise", "phrase", "smartling"] as const;

/* -------------------------------------------------------------------------- */
/* Integration preview                                                        */
/* -------------------------------------------------------------------------- */

function IntegrationPreview() {
  const locale = useAppLocale();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
      {tmsIntegrations.map((slug) => {
        const entry = getIntegrationCatalogEntry(slug);
        const resolved = resolveIntegrationBySlug(locale, slug);
        const name = resolved?.name ?? slug;

        return (
          <div
            key={slug}
            className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background px-2 py-4"
          >
            <IntegrationLogoMark
              iconKey={entry?.iconKey}
              logoSrc={entry?.logoSrc}
              name={name}
              size="sm"
            />

            <span className="max-w-full truncate text-xs font-medium text-foreground">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small visual previews                                                      */
/* -------------------------------------------------------------------------- */

function PreviewFlow({
  firstIcon: FirstIcon,
  secondIcon: SecondIcon,
  thirdIcon: ThirdIcon,
  labels,
}: {
  firstIcon: React.ElementType;
  secondIcon: React.ElementType;
  thirdIcon: React.ElementType;
  labels: UseCaseMessageKey[];
}) {
  const flowIcons = [FirstIcon, SecondIcon, ThirdIcon];

  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
      {flowIcons.map((Icon, index) => (
        <React.Fragment key={index}>
          {index > 0 ? (
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : null}

          <div className="flex min-w-0 flex-col items-center gap-3 rounded-xl border border-border bg-background px-2 py-4 text-center">
            <span
              className={[
                "flex size-10 items-center justify-center rounded-xl",
                index === 2 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>

            <span className="text-xs font-medium leading-snug text-foreground">
              {labels[index] ? <Message messageKey={labels[index]} /> : null}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

function CapabilityPreviewContent({
  index,
  workflow,
}: {
  index: number;
  workflow: UseCasePageContent["workflow"];
}) {
  const steps = workflow.steps;

  const label = (stepIndex: number) => steps[stepIndex]?.labelKey;

  if (index === 4) {
    return <IntegrationPreview />;
  }

  if (index === 5) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <ShieldCheckIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">
            {label(5) ? <Message messageKey={label(5)!} /> : null}
          </span>
          <CheckCircleIcon className="ml-auto size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[GlobeIcon, TranslateIcon, ShieldCheckIcon].map((Icon, itemIndex) => (
            <div
              key={itemIndex}
              className="flex items-center justify-center rounded-lg border border-border bg-background py-4"
            >
              <Icon className="size-5 text-primary" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const config = [
    {
      icons: [GitPullRequestIcon, BookOpenIcon, GlobeIcon],
      indexes: [0, 1, 2],
    },
    {
      icons: [BookOpenIcon, TranslateIcon, CheckCircleIcon],
      indexes: [1, 2, 3],
    },
    {
      icons: [BookOpenIcon, ShieldCheckIcon, CheckCircleIcon],
      indexes: [1, 2, 3],
    },
    {
      icons: [TranslateIcon, UsersIcon, CheckCircleIcon],
      indexes: [2, 3, 4],
    },
  ][index];

  if (!config) return null;

  return (
    <PreviewFlow
      firstIcon={config.icons[0]}
      secondIcon={config.icons[1]}
      thirdIcon={config.icons[2]}
      labels={config.indexes
        .map((stepIndex) => label(stepIndex))
        .filter((key): key is UseCaseMessageKey => Boolean(key))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Right preview card                                                         */
/* -------------------------------------------------------------------------- */

function CapabilityPreview({
  capability,
  index,
  workflow,
  panelRef,
}: {
  capability: Capability;
  index: number;
  workflow: UseCasePageContent["workflow"];
  panelRef: React.RefObject<HTMLDivElement | null>;
}) {
  const SelectedIcon = icons[index] ?? GlobeIcon;

  return (
    <div
      ref={panelRef}
      className="relative z-10 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-5 sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <SelectedIcon className="size-5 text-primary" aria-hidden="true" />
        </span>

        <p className="min-w-0 text-sm font-semibold leading-snug text-foreground sm:text-base">
          <Message messageKey={capability.titleKey} />
        </p>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          <Message messageKey={capability.descriptionKey} />
        </p>

        <CapabilityPreviewContent index={index} workflow={workflow} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Animated dashed connectors                                                 */
/* -------------------------------------------------------------------------- */

type ConnectorGeometry = {
  width: number;
  height: number;
  paths: string[];
};

function useCapabilityConnectors(
  containerRef: React.RefObject<HTMLDivElement | null>,
  buttonRefs: React.RefObject<(HTMLButtonElement | null)[]>,
  previewRef: React.RefObject<HTMLDivElement | null>,
  count: number,
  selectedIndex: number,
) {
  const [geometry, setGeometry] = React.useState<ConnectorGeometry | null>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    const preview = previewRef.current;

    if (!container || !preview) return;

    const measure = () => {
      const root = container.getBoundingClientRect();
      const target = preview.getBoundingClientRect();

      if (!root.width || !root.height || !target.width) {
        return;
      }

      const endX = target.left - root.left;
      const endY = target.top - root.top + target.height / 2;

      const paths = buttonRefs.current.slice(0, count).map((button) => {
        if (!button) return "";

        const rect = button.getBoundingClientRect();

        const startX = rect.right - root.left;
        const startY = rect.top - root.top + rect.height / 2;

        /*
         * Smooth S-shaped connector:
         * leaves the capability card horizontally,
         * bends toward the preview midpoint,
         * enters the preview horizontally.
         */
        const distance = Math.max(0, endX - startX);
        const bend = Math.min(72, distance * 0.45);

        return [
          `M ${startX} ${startY}`,
          `C ${startX + bend} ${startY},`,
          `${endX - bend} ${endY},`,
          `${endX} ${endY}`,
        ].join(" ");
      });

      setGeometry({
        width: root.width,
        height: root.height,
        paths,
      });
    };

    measure();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;

    observer?.observe(container);
    observer?.observe(preview);

    buttonRefs.current.slice(0, count).forEach((button) => {
      if (button) observer?.observe(button);
    });

    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, buttonRefs, previewRef, count, selectedIndex]);

  return geometry;
}

function CapabilityConnectors({
  geometry,
  selectedIndex,
}: {
  geometry: ConnectorGeometry | null;
  selectedIndex: number;
}) {
  if (!geometry) return null;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-0 hidden size-full overflow-visible lg:block"
    >
      {/* Muted inactive connectors */}
      <g fill="none" strokeWidth="1.25" strokeDasharray="4 7" className="stroke-border">
        {geometry.paths.map((path, index) =>
          index !== selectedIndex && path ? <path key={index} d={path} /> : null,
        )}
      </g>

      {/* Highlighted selected connector */}
      {geometry.paths[selectedIndex] ? (
        <path
          key={selectedIndex}
          d={geometry.paths[selectedIndex]}
          fill="none"
          strokeWidth="2.25"
          strokeDasharray="6 6"
          strokeLinecap="round"
          className="stroke-primary"
        />
      ) : null}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Main capabilities section                                                  */
/* -------------------------------------------------------------------------- */

export function ProductLocalisationCapabilities({ content }: Props) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const capabilities = content.capabilities.items;
  const selectedCapability = capabilities[selectedIndex];

  const geometry = useCapabilityConnectors(
    containerRef,
    buttonRefs,
    previewRef,
    capabilities.length,
    selectedIndex,
  );

  if (!selectedCapability) return null;

  return (
    <section>
      <div
        ref={containerRef}
        className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20"
      >
        <CapabilityConnectors geometry={geometry} selectedIndex={selectedIndex} />

        {/* LEFT — Heading and selectable capability cards */}
        <div className="relative z-10 min-w-0">
          <div className="mb-9 space-y-4">
            <TypographyP className="text-[0.95rem] tracking-[-0.02em]" tone="subtle">
              <Message messageKey={content.capabilities.labelKey} />
            </TypographyP>

            <TypographyH2
              className="max-w-lg text-3xl leading-[1.12] tracking-[-0.04em] sm:text-4xl"
              wrapStyle="balance"
            >
              <Message messageKey={content.capabilities.titleKey} />
            </TypographyH2>
          </div>

          <div className="flex flex-col gap-2">
            {capabilities.map((capability, index) => {
              const Icon = icons[index] ?? GlobeIcon;
              const active = selectedIndex === index;

              return (
                <button
                  key={capability.titleKey}
                  ref={(element) => {
                    buttonRefs.current[index] = element;
                  }}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  aria-pressed={active}
                  className={[
                    "relative z-10 flex min-h-16 w-full cursor-pointer items-center gap-3",
                    "rounded-xl border px-4 py-3 text-left",
                    "transition-[background-color,border-color] duration-200",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted/50",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
                    <Message messageKey={capability.titleKey} />
                  </span>

                  <ArrowRightIcon
                    className={[
                      "size-4 shrink-0 transition-colors",
                      active ? "text-primary" : "text-muted-foreground",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT — Compact vertically centred preview */}
        <div className="relative z-10 flex min-w-0 items-center">
          <CapabilityPreview
            panelRef={previewRef}
            capability={selectedCapability}
            index={selectedIndex}
            workflow={content.workflow}
          />
        </div>
      </div>
    </section>
  );
}
