"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 */
import * as React from "react";
import Image from "next/image";
import { FormattedMessage, useIntl } from "react-intl";

import { productLocalisationVisualMessages as messages } from "./product-localisation-hero-visual.messages";

const languages = [
  {
    code: "fr",
    label: messages.french,
    progress: 100,
    status: messages.approved,
    color: "bg-green-700",
  },
  {
    code: "de",
    label: messages.german,
    progress: 68,
    status: messages.inReview,
    color: "bg-primary",
  },
  {
    code: "ja",
    label: messages.japanese,
    progress: 32,
    status: messages.needsAttention,
    color: "bg-amber-600",
  },
] as const;

const stages = [
  { key: "changes", label: messages.stageChanges },
  { key: "translation", label: messages.stageTranslation },
  { key: "review", label: messages.stageReview },
  { key: "release", label: messages.stageRelease },
] as const;

export function ProductLocalisationHeroVisual() {
  const intl = useIntl();

  const [selectedLanguage, setSelectedLanguage] =
    React.useState<(typeof languages)[number]["code"]>("de");

  const [activeStage, setActiveStage] = React.useState<(typeof stages)[number]["key"]>("review");

  const language = languages.find((item) => item.code === selectedLanguage)!;

  const stageDescriptions = {
    changes: messages.descriptionChanges,
    translation: messages.descriptionTranslation,
    review: messages.descriptionReview,
    release: messages.descriptionRelease,
  };

  return (
    <div className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem]">
      <Image
        src="/images/mesh/mesh-gradient-1784864145512.jpg"
        alt=""
        aria-hidden
        fill
        priority
        unoptimized
        sizes="(min-width: 1024px) 55vw, 100vw"
        className="pointer-events-none object-cover"
      />

      <div className="relative p-4 sm:p-6 lg:p-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-[0_20px_48px_rgba(0,0,0,0.14)]">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <p className="text-sm font-semibold text-foreground">
                <FormattedMessage {...messages.releaseTitle} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                <FormattedMessage {...messages.releaseSubtitle} />
              </p>
            </div>

            <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs">
              <FormattedMessage {...messages.inProgress} />
            </span>
          </div>

          {/* Workflow stage selector */}
          <div className="grid grid-cols-4 border-b border-border">
            {stages.map((stage) => (
              <button
                key={stage.key}
                type="button"
                onClick={() => setActiveStage(stage.key)}
                aria-pressed={activeStage === stage.key}
                className={`min-w-0 cursor-pointer border-b-2 px-2 py-4 text-center text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-3 ${
                  activeStage === stage.key
                    ? "border-primary bg-primary/5 font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                <FormattedMessage {...stage.label} />
              </button>
            ))}
          </div>

          {/* Stage detail */}
          <div className="border-b border-border bg-muted/30 p-5">
            <p className="text-sm font-medium text-foreground">
              {intl.formatMessage(stages.find((stage) => stage.key === activeStage)!.label)}
            </p>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <FormattedMessage {...stageDescriptions[activeStage]} />
            </p>
          </div>

          {/* Locale selector */}
          <div className="p-5">
            <p className="mb-4 text-sm font-semibold text-foreground">
              <FormattedMessage {...messages.translationProgress} />
            </p>

            <div className="grid grid-cols-3 gap-2">
              {languages.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => setSelectedLanguage(item.code)}
                  aria-pressed={selectedLanguage === item.code}
                  className={`cursor-pointer rounded-lg border p-3 text-center text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    selectedLanguage === item.code
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <FormattedMessage {...item.label} />
                </button>
              ))}
            </div>

            {/* Selected language details */}
            <div aria-live="polite" className="mt-5 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  <FormattedMessage {...language.label} />
                </p>

                <p className="text-xs text-muted-foreground">
                  <FormattedMessage {...language.status} />
                </p>
              </div>

              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={intl.formatMessage(messages.translationProgress)}
                aria-valuenow={language.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${language.color}`}
                  style={{ width: `${language.progress}%` }}
                />
              </div>

              <p className="mt-2 text-right text-xs text-muted-foreground">
                {intl
                  .formatNumber(language.progress, {
                    style: "percent",
                    maximumFractionDigits: 0,
                  })
                  .replace(
                    intl.formatNumber(1, {
                      style: "percent",
                      maximumFractionDigits: 0,
                    }),
                    "",
                  )}
                {intl.formatNumber(language.progress / 100, {
                  style: "percent",
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
          </div>

          <div className="border-t border-border bg-muted/40 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.demoData} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
