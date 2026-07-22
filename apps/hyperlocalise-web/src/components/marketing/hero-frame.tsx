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
import { motion, useReducedMotion } from "motion/react";
import type { IntlShape } from "react-intl";
import { useIntl } from "react-intl";

import { CatWorkspaceContainer } from "@/components/cat/workspace/cat-workspace-container";
import { toQueueSegment } from "@/components/cat/workspace/store/cat-segment-view";
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "@/components/cat/shared/types";

import { heroFrameMessages } from "./hero-frame.messages";

const heroDemoSegments: CatSegment[] = [
  {
    id: "hero-title",
    index: 1,
    key: "home.hero.title",
    sourceText: "Launch globally in days, not quarters.",
    targetText: "Lancez-vous à l'international en quelques jours, pas en quelques trimestres.",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Homepage hero",
    status: "needs_review",
    tags: ["marketing", "headline"],
    maxLength: 78,
  },
  {
    id: "hero-cta",
    index: 2,
    key: "home.hero.cta",
    sourceText: "Join the waitlist",
    targetText: "Rejoindre la liste d'attente",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Primary CTA",
    status: "pending",
    tags: ["cta"],
    maxLength: 34,
  },
  {
    id: "usage-limit",
    index: 3,
    key: "billing.usage.remaining",
    sourceText: "{count, plural, one {# string left} other {# strings left}}",
    targetText: "{count, plural, one {# chaîne restante} other {# chaînes restantes}}",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Usage meter",
    status: "reviewed",
    tags: ["icu", "billing"],
  },
  {
    id: "qa-warning",
    index: 4,
    key: "reviews.pending.banner",
    sourceText: "Reviews waiting for approval",
    targetText: "Révisions en attente d'approbation",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Review queue",
    status: "pending",
    tags: ["review"],
    maxLength: 42,
  },
  {
    id: "hero-subtitle",
    index: 5,
    key: "home.hero.subtitle",
    sourceText:
      "Ship localized releases with agent workflows, TMS sync, and regression checks in one pipeline.",
    targetText:
      "Déployez des versions localisées avec des workflows d'agents, la synchro TMS et des contrôles de régression dans un seul pipeline.",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Homepage hero",
    status: "needs_review",
    tags: ["marketing"],
    maxLength: 120,
  },
  {
    id: "nav-product",
    index: 6,
    key: "nav.product",
    sourceText: "Product",
    targetText: "Produit",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Site navigation",
    status: "reviewed",
    tags: ["nav"],
    maxLength: 16,
  },
  {
    id: "nav-pricing",
    index: 7,
    key: "nav.pricing",
    sourceText: "Pricing",
    targetText: "Tarifs",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Site navigation",
    status: "pending",
    tags: ["nav"],
    maxLength: 16,
  },
  {
    id: "features-agents-title",
    index: 8,
    key: "features.agents.title",
    sourceText: "Assign agents to translate, review, and sync",
    targetText: "Assignez des agents pour traduire, relire et synchroniser",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Features section",
    status: "needs_review",
    tags: ["marketing", "feature"],
    maxLength: 56,
  },
  {
    id: "features-tms-body",
    index: 9,
    key: "features.tms.description",
    sourceText: "Keep your TMS while adding AI-assisted workflows on top.",
    targetText: "Conservez votre TMS tout en ajoutant des workflows assistés par IA.",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Features section",
    status: "pending",
    tags: ["marketing"],
    maxLength: 72,
  },
  {
    id: "onboarding-welcome",
    index: 10,
    key: "onboarding.welcome.title",
    sourceText: "Connect your first repository",
    targetText: "Connectez votre premier dépôt",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Onboarding",
    status: "reviewed",
    tags: ["onboarding"],
    maxLength: 40,
  },
  {
    id: "onboarding-locale",
    index: 11,
    key: "onboarding.locale.prompt",
    sourceText: "Which locales do you ship today?",
    targetText: "Quelles locales publiez-vous aujourd'hui ?",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Onboarding",
    status: "needs_review",
    tags: ["onboarding"],
    maxLength: 48,
  },
  {
    id: "projects-empty-title",
    index: 12,
    key: "projects.empty.title",
    sourceText: "No projects yet",
    targetText: "Aucun projet pour le moment",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Projects list",
    status: "pending",
    tags: ["empty-state"],
    maxLength: 28,
  },
  {
    id: "projects-empty-body",
    index: 13,
    key: "projects.empty.description",
    sourceText: "Create a project to start syncing source strings from GitHub.",
    targetText: "Créez un projet pour commencer à synchroniser les chaînes source depuis GitHub.",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Projects list",
    status: "pending",
    tags: ["empty-state"],
    maxLength: 80,
  },
  {
    id: "sync-running",
    index: 14,
    key: "sync.status.running",
    sourceText: "Syncing {localeCount, plural, one {# locale} other {# locales}}…",
    targetText: "Synchronisation de {localeCount, plural, one {# locale} other {# locales}}…",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Sync progress",
    status: "reviewed",
    tags: ["icu", "status"],
  },
  {
    id: "sync-complete",
    index: 15,
    key: "sync.status.complete",
    sourceText:
      "Sync finished with {issueCount, plural, =0 {no issues} one {# issue} other {# issues}}",
    targetText:
      "Synchronisation terminée avec {issueCount, plural, =0 {aucun problème} one {# problème} other {# problèmes}}",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Sync progress",
    status: "needs_review",
    tags: ["icu", "status"],
  },
  {
    id: "error-network-title",
    index: 16,
    key: "errors.network.title",
    sourceText: "Connection lost",
    targetText: "Connexion perdue",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Error banner",
    status: "pending",
    tags: ["error"],
    maxLength: 24,
  },
  {
    id: "error-network-retry",
    index: 17,
    key: "errors.network.retry",
    sourceText: "Try again",
    targetText: "Réessayer",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Error action",
    status: "reviewed",
    tags: ["cta", "error"],
    maxLength: 20,
  },
  {
    id: "settings-team-invite",
    index: 18,
    key: "settings.team.invite",
    sourceText: "Invite teammate",
    targetText: "Inviter un collègue",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Team settings",
    status: "needs_review",
    tags: ["settings"],
    maxLength: 24,
  },
  {
    id: "settings-api-keys",
    index: 19,
    key: "settings.api.keys.label",
    sourceText: "API keys",
    targetText: "Clés API",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Settings",
    status: "pending",
    tags: ["settings"],
    maxLength: 20,
  },
  {
    id: "toast-saved",
    index: 20,
    key: "toast.translation.saved",
    sourceText: "Translation saved",
    targetText: "Traduction enregistrée",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Toast",
    status: "reviewed",
    tags: ["toast"],
    maxLength: 28,
  },
  {
    id: "pricing-pro-name",
    index: 21,
    key: "pricing.plan.pro.name",
    sourceText: "Pro",
    targetText: "Pro",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Pricing",
    status: "skipped",
    tags: ["pricing", "do-not-translate"],
    maxLength: 12,
  },
  {
    id: "pricing-pro-cta",
    index: 22,
    key: "pricing.plan.pro.cta",
    sourceText: "Start free trial",
    targetText: "Commencer l'essai gratuit",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Pricing CTA",
    status: "needs_review",
    tags: ["cta", "pricing"],
    maxLength: 32,
  },
  {
    id: "github-checks-passed",
    index: 23,
    key: "github.checks.passed",
    sourceText: "Localization checks passed",
    targetText: "Contrôles de localisation réussis",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "GitHub check",
    status: "reviewed",
    tags: ["github", "status"],
    maxLength: 36,
  },
  {
    id: "eval-drift-warning",
    index: 24,
    key: "eval.drift.warning",
    sourceText: "Translation drift detected in {fileName}",
    targetText: "Dérive de traduction détectée dans {fileName}",
    sourceLocale: "en-US",
    targetLocale: "fr-FR",
    contextLabel: "Eval gate",
    status: "needs_review",
    tags: ["eval", "placeholder"],
    maxLength: 52,
  },
];

function buildHeroDemoChecks(intl: IntlShape): CatFormatCheck[] {
  return [
    {
      id: "check-tone",
      label: intl.formatMessage(heroFrameMessages.checkLaunchToneLabel),
      status: "pass",
      message: intl.formatMessage(heroFrameMessages.checkLaunchToneMessage),
      category: "qa",
    },
    {
      id: "check-length",
      label: intl.formatMessage(heroFrameMessages.checkHeroFitLabel),
      status: "warn",
      message: intl.formatMessage(heroFrameMessages.checkHeroFitMessage),
      category: "length",
    },
    {
      id: "check-placeholders",
      label: intl.formatMessage(heroFrameMessages.checkPlaceholdersLabel),
      status: "pass",
      message: intl.formatMessage(heroFrameMessages.checkPlaceholdersMessage),
      category: "placeholder",
    },
  ];
}

function localizeHeroDemoSegments(intl: IntlShape): CatSegment[] {
  const contextById: Record<string, string> = {
    "hero-title": intl.formatMessage(heroFrameMessages.contextLabelHomepageHero),
    "hero-cta": intl.formatMessage(heroFrameMessages.contextLabelPrimaryCta),
    "usage-limit": intl.formatMessage(heroFrameMessages.contextLabelUsageMeter),
    "qa-warning": intl.formatMessage(heroFrameMessages.contextLabelReviewQueue),
    "hero-subtitle": intl.formatMessage(heroFrameMessages.contextLabelHomepageHero),
    "nav-product": intl.formatMessage(heroFrameMessages.contextLabelSiteNavigation),
    "nav-pricing": intl.formatMessage(heroFrameMessages.contextLabelSiteNavigation),
    "features-agents-title": intl.formatMessage(heroFrameMessages.contextLabelFeatures),
    "features-tms-body": intl.formatMessage(heroFrameMessages.contextLabelFeatures),
    "onboarding-welcome": intl.formatMessage(heroFrameMessages.contextLabelOnboarding),
    "onboarding-locale": intl.formatMessage(heroFrameMessages.contextLabelOnboarding),
    "projects-empty-title": intl.formatMessage(heroFrameMessages.contextLabelProjectsList),
    "projects-empty-body": intl.formatMessage(heroFrameMessages.contextLabelProjectsList),
    "sync-running": intl.formatMessage(heroFrameMessages.contextLabelSyncProgress),
    "sync-complete": intl.formatMessage(heroFrameMessages.contextLabelSyncProgress),
    "error-network-title": intl.formatMessage(heroFrameMessages.contextLabelErrorBanner),
    "error-network-retry": intl.formatMessage(heroFrameMessages.contextLabelErrorAction),
    "settings-team-invite": intl.formatMessage(heroFrameMessages.contextLabelTeamSettings),
    "settings-api-keys": intl.formatMessage(heroFrameMessages.contextLabelSettings),
    "toast-saved": intl.formatMessage(heroFrameMessages.contextLabelToast),
    "pricing-pro-name": intl.formatMessage(heroFrameMessages.contextLabelPricing),
    "pricing-pro-cta": intl.formatMessage(heroFrameMessages.contextLabelPricingCta),
    "github-checks-passed": intl.formatMessage(heroFrameMessages.contextLabelGithubCheck),
    "eval-drift-warning": intl.formatMessage(heroFrameMessages.contextLabelEvalGate),
  };

  return heroDemoSegments.map((segment) => ({
    ...segment,
    contextLabel: contextById[segment.id] ?? segment.contextLabel,
  }));
}

function buildHeroDemoState(intl: IntlShape): CatWorkspaceState {
  const segments = localizeHeroDemoSegments(intl);
  const heroDemoChecks = buildHeroDemoChecks(intl);

  return {
    fileContext: {
      sourcePath: "apps/hyperlocalise-web/src/components/marketing/hero-section.tsx",
      filename: "hero-section.tsx",
      sourceLocale: "en-US",
      targetLocale: "fr-FR",
      providerKind: null,
      canEditTranslations: true,
      canAddComments: true,
    },
    segments,
    queueSegments: segments.map(toQueueSegment),
    selectedSegmentId: "hero-title",
    formatChecks: heroDemoChecks,
    segmentFormatChecks: {
      "hero-title": [],
      "usage-limit": [
        {
          id: "check-icu",
          label: intl.formatMessage(heroFrameMessages.checkIcuLabel),
          status: "pass",
          message: intl.formatMessage(heroFrameMessages.checkIcuMessage),
          category: "icu",
          relatedTokens: ["{count, plural}"],
        },
      ],
    },
    intelligence: {
      productMeaning: intl.formatMessage(heroFrameMessages.intelligenceProductMeaning),
      intent: intl.formatMessage(heroFrameMessages.intelligenceIntent),
      locationBreadcrumb: intl.formatMessage(heroFrameMessages.intelligenceBreadcrumb),
      filePath: "apps/hyperlocalise-web/src/components/marketing/hero-section.tsx",
      componentName: "HeroSection",
      reviewerPreference: intl.formatMessage(heroFrameMessages.intelligenceReviewerPreference),
      constraints: intl.formatMessage(heroFrameMessages.intelligenceConstraints),
      glossaryTerms: [
        {
          id: "term-global",
          source: "globally",
          target: "à l'international",
          approved: true,
          forbidden: false,
        },
        {
          id: "term-launch",
          source: "launch",
          target: "lancer",
          approved: true,
          forbidden: false,
        },
      ],
      translationMemoryMatches: [
        {
          id: "tm-launch",
          sourceText: "Launch every market from one workflow.",
          targetText: "Lancez chaque marché depuis un seul workflow.",
          matchPercent: 84,
          contextLabel: intl.formatMessage(heroFrameMessages.tmContextProductOverview),
        },
      ],
    },
    segmentIntelligence: {
      "hero-cta": {
        productMeaning: intl.formatMessage(heroFrameMessages.ctaProductMeaning),
        intent: intl.formatMessage(heroFrameMessages.ctaIntent),
        locationBreadcrumb: intl.formatMessage(heroFrameMessages.ctaBreadcrumb),
        filePath: "apps/hyperlocalise-web/src/components/marketing/hero-section.tsx",
        componentName: "Button",
        constraints: intl.formatMessage(heroFrameMessages.ctaConstraints),
        glossaryTerms: [],
        translationMemoryMatches: [],
        aiSuggestion: "Rejoindre la liste d'attente",
        aiReasoning: intl.formatMessage(heroFrameMessages.ctaAiReasoning),
      },
      "usage-limit": {
        productMeaning: intl.formatMessage(heroFrameMessages.usageProductMeaning),
        intent: intl.formatMessage(heroFrameMessages.usageIntent),
        locationBreadcrumb: intl.formatMessage(heroFrameMessages.usageBreadcrumb),
        filePath: "apps/hyperlocalise-web/src/app/[lang]/(authenticated)/billing/usage-card.tsx",
        componentName: "UsageCard",
        constraints: intl.formatMessage(heroFrameMessages.usageConstraints),
        glossaryTerms: [],
        translationMemoryMatches: [],
        aiSuggestion: "{count, plural, one {# chaîne restante} other {# chaînes restantes}}",
        aiReasoning: intl.formatMessage(heroFrameMessages.usageAiReasoning),
      },
      "qa-warning": {
        productMeaning: intl.formatMessage(heroFrameMessages.qaProductMeaning),
        intent: intl.formatMessage(heroFrameMessages.qaIntent),
        locationBreadcrumb: intl.formatMessage(heroFrameMessages.qaBreadcrumb),
        filePath: "apps/hyperlocalise-web/src/components/cat/queue/cat-queue-panel.tsx",
        componentName: "CatQueuePanel",
        constraints: intl.formatMessage(heroFrameMessages.qaConstraints),
        glossaryTerms: [
          {
            id: "term-review",
            source: "review",
            target: "validation",
            approved: true,
            forbidden: false,
          },
        ],
        translationMemoryMatches: [
          {
            id: "tm-review",
            sourceText: "Approve translation review",
            targetText: "Valider la traduction",
            matchPercent: 79,
            contextLabel: intl.formatMessage(heroFrameMessages.qaTmContext),
          },
        ],
        aiSuggestion: "Validations en attente d'approbation",
        aiReasoning: intl.formatMessage(heroFrameMessages.qaAiReasoning),
      },
    },
    breadcrumbs: [
      intl.formatMessage(heroFrameMessages.breadcrumbMarketing),
      intl.formatMessage(heroFrameMessages.breadcrumbHomepage),
      intl.formatMessage(heroFrameMessages.breadcrumbFrenchLaunch),
    ],
    primaryActionLabel: intl.formatMessage(heroFrameMessages.primaryActionApprove),
    canEditTranslations: true,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createHeroDemoServices(intl: IntlShape, heroDemoState: CatWorkspaceState) {
  const heroDemoChecks = heroDemoState.formatChecks;

  async function lookupHeroDemoContext(segment: CatSegment) {
    await wait(1700);

    if (segment.id === "hero-title") {
      return intl.formatMessage(heroFrameMessages.contextHeroTitle);
    }

    if (segment.id === "hero-cta") {
      return intl.formatMessage(heroFrameMessages.contextHeroCta);
    }

    if (segment.id === "usage-limit") {
      return intl.formatMessage(heroFrameMessages.contextUsageLimit);
    }

    if (segment.id === "qa-warning") {
      return intl.formatMessage(heroFrameMessages.contextQaWarning);
    }

    return intl.formatMessage(heroFrameMessages.contextFallback, { key: segment.key });
  }

  async function generateHeroAiRecommendation(
    segment: CatSegment,
    _targetText: string,
    intelligence?: CatSegmentIntelligence,
  ): Promise<{ aiSuggestion: string; aiReasoning: string; formatChecks: CatFormatCheck[] }> {
    await wait(1200);

    if (segment.id === "hero-title") {
      return {
        aiSuggestion: "Déployez à l'international en quelques jours, pas en quelques trimestres.",
        aiReasoning: intl.formatMessage(heroFrameMessages.aiReasoningHeroTitle),
        formatChecks: heroDemoChecks,
      };
    }

    const segmentIntelligence = intelligence ?? heroDemoState.segmentIntelligence?.[segment.id];

    return {
      aiSuggestion: segmentIntelligence?.aiSuggestion ?? segment.targetText,
      aiReasoning:
        segmentIntelligence?.aiReasoning ??
        intl.formatMessage(heroFrameMessages.aiReasoningFallback),
      formatChecks: heroDemoState.segmentFormatChecks?.[segment.id] ?? heroDemoChecks,
    };
  }

  async function validateHeroDemoFormat(
    segment: CatSegment,
    value: string,
  ): Promise<CatFormatCheck[]> {
    const checks = [...(heroDemoState.segmentFormatChecks?.[segment.id] ?? heroDemoChecks)];

    if (segment.maxLength && value.length > segment.maxLength) {
      return [
        {
          id: "check-length-over",
          label: intl.formatMessage(heroFrameMessages.checkLayoutLengthLabel),
          status: "warn",
          message: intl.formatMessage(heroFrameMessages.checkLayoutLengthMessage, {
            maxLength: segment.maxLength,
          }),
          category: "length",
        },
        ...checks.filter((check) => check.id !== "check-length"),
      ];
    }

    return checks;
  }

  return {
    validateFormat: validateHeroDemoFormat,
    lookupSegmentContext: lookupHeroDemoContext,
    generateAiRecommendation: generateHeroAiRecommendation,
  };
}

export function HeroFrame() {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();
  const heroDemoState = buildHeroDemoState(intl);
  const services = createHeroDemoServices(intl, heroDemoState);

  return (
    <div className="relative left-1/2 w-screen max-w-[calc(100vw-2.5rem)] -translate-x-1/2 lg:max-w-[min(92rem,calc(100vw-5rem))]">
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-2xl shadow-gray-alpha-200"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.72,
          ease: [0.19, 1, 0.22, 1],
        }}
      >
        <div className="flex h-[min(42rem,78svh)] min-h-136 flex-col lg:h-176 xl:h-184">
          <CatWorkspaceContainer
            initialState={heroDemoState}
            initialViewMode="comfortable"
            services={services}
          />
        </div>
      </motion.div>
    </div>
  );
}
