"use client";

import { motion, useReducedMotion } from "motion/react";

import { CatWorkspaceContainer } from "@/components/cat/workspace/cat-workspace-container";
import type {
  CatFormatCheck,
  CatSegment,
  CatSegmentIntelligence,
  CatWorkspaceState,
} from "@/components/cat/shared/types";

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

const heroDemoChecks: CatFormatCheck[] = [
  {
    id: "check-tone",
    label: "Launch tone",
    status: "pass",
    message: "Target keeps the concise, confident product positioning.",
    category: "qa",
  },
  {
    id: "check-length",
    label: "Hero fit",
    status: "warn",
    message: "Translation is close to the button and hero layout limits.",
    category: "length",
  },
  {
    id: "check-placeholders",
    label: "Placeholders",
    status: "pass",
    message: "No required placeholders are missing.",
    category: "placeholder",
  },
];

const heroDemoState: CatWorkspaceState = {
  segments: heroDemoSegments,
  selectedSegmentId: "hero-title",
  formatChecks: heroDemoChecks,
  segmentFormatChecks: {
    "hero-title": [],
    "usage-limit": [
      {
        id: "check-icu",
        label: "ICU structure",
        status: "pass",
        message: "Plural branches and the {count} token match the source.",
        category: "icu",
        relatedTokens: ["{count, plural}"],
      },
    ],
  },
  intelligence: {
    productMeaning: "Marketing hero headline shown above the primary waitlist call to action.",
    intent: "Position speed as release confidence, not shortcut automation.",
    locationBreadcrumb: "Marketing site / Hero",
    filePath: "apps/hyperlocalise-web/src/components/marketing/hero-section.tsx",
    componentName: "HeroSection",
    reviewerPreference: "Prefer concise French that still feels executive.",
    constraints: "Hero title · Max 2 lines on tablet",
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
        contextLabel: "Product overview",
      },
    ],
  },
  segmentIntelligence: {
    "hero-cta": {
      productMeaning: "Waitlist CTA button label on the marketing homepage.",
      intent: "Keep it short and action-oriented.",
      locationBreadcrumb: "Marketing site / Hero / CTA",
      filePath: "apps/hyperlocalise-web/src/components/marketing/hero-section.tsx",
      componentName: "Button",
      constraints: "Button label · Must stay compact on mobile",
      glossaryTerms: [],
      translationMemoryMatches: [],
      aiSuggestion: "Rejoindre la liste d'attente",
      aiReasoning: "Direct and familiar French SaaS CTA phrasing.",
    },
    "usage-limit": {
      productMeaning: "Billing usage meter string with ICU plural branches.",
      intent: "Preserve ICU syntax exactly.",
      locationBreadcrumb: "Billing / Usage meter",
      filePath: "apps/hyperlocalise-web/src/app/[lang]/(authenticated)/billing/usage-card.tsx",
      componentName: "UsageCard",
      constraints: "ICU plural · Preserve {count}",
      glossaryTerms: [],
      translationMemoryMatches: [],
      aiSuggestion: "{count, plural, one {# chaîne restante} other {# chaînes restantes}}",
      aiReasoning: "Keeps both plural branches and the required count placeholder.",
    },
    "qa-warning": {
      productMeaning: "Banner label for pending translation approvals in the review queue.",
      intent: "Avoid wording that implies public customer reviews.",
      locationBreadcrumb: "CAT workspace / Review queue",
      filePath: "apps/hyperlocalise-web/src/components/cat/queue/cat-queue-panel.tsx",
      componentName: "CatQueuePanel",
      constraints: "Short label · Avoid ambiguity around reviews",
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
          contextLabel: "CAT action",
        },
      ],
      aiSuggestion: "Validations en attente d'approbation",
      aiReasoning: "Clarifies this is an internal translation review queue.",
    },
  },
  breadcrumbs: ["Marketing", "Homepage", "French launch"],
  primaryActionLabel: "Approve",
  canEditTranslations: true,
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function lookupHeroDemoContext(segment: CatSegment) {
  await wait(1700);

  if (segment.id === "hero-title") {
    return "Homepage headline for a launch-focused localization platform. Keep the claim direct and outcome-led.";
  }

  if (segment.id === "hero-cta") {
    return "Primary conversion button for the public waitlist.";
  }

  if (segment.id === "usage-limit") {
    return "Usage meter copy shown in billing and review dashboards.";
  }

  if (segment.id === "qa-warning") {
    return "Queue banner for translation reviews that still need human approval.";
  }

  return `Repository context: ${segment.key} is part of the product UI and should keep tone, placeholders, and layout constraints intact.`;
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
      aiReasoning:
        "Uses deployment language that fits a B2B product launch while staying short enough for the hero layout.",
      formatChecks: heroDemoChecks,
    };
  }

  const segmentIntelligence = intelligence ?? heroDemoState.segmentIntelligence?.[segment.id];

  return {
    aiSuggestion: segmentIntelligence?.aiSuggestion ?? segment.targetText,
    aiReasoning:
      segmentIntelligence?.aiReasoning ??
      "Keeps terminology, placeholders, and layout constraints aligned with the source.",
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
        label: "Layout length",
        status: "warn",
        message: `Translation exceeds the recommended ${segment.maxLength} characters.`,
        category: "length",
      },
      ...checks.filter((check) => check.id !== "check-length"),
    ];
  }

  return checks;
}

export function HeroFrame() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="relative left-1/2 w-screen max-w-[calc(100vw-2.5rem)] -translate-x-1/2 lg:max-w-[min(92rem,calc(100vw-5rem))]">
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-2xl shadow-foreground/8"
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
            services={{
              validateFormat: validateHeroDemoFormat,
              lookupSegmentContext: lookupHeroDemoContext,
              generateAiRecommendation: generateHeroAiRecommendation,
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}
