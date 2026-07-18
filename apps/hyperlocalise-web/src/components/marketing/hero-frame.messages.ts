"use client";

import { defineMessages } from "react-intl";

export const heroFrameMessages = defineMessages({
  breadcrumbMarketing: {
    defaultMessage: "Marketing",
    id: "tn+bJsIn8B",
    description: "First breadcrumb in the marketing hero CAT workspace mock",
  },
  breadcrumbHomepage: {
    defaultMessage: "Homepage",
    id: "vS1y/FWsvD",
    description: "Second breadcrumb in the marketing hero CAT workspace mock",
  },
  breadcrumbFrenchLaunch: {
    defaultMessage: "French launch",
    id: "TfjiaDPI2s",
    description: "Third breadcrumb in the marketing hero CAT workspace mock",
  },
  primaryActionApprove: {
    defaultMessage: "Approve",
    id: "/E/r2gr9Yu",
    description: "Primary action label in the marketing hero CAT workspace mock",
  },
  checkLaunchToneLabel: {
    defaultMessage: "Launch tone",
    id: "Nk/Q6qJpTk",
    description: "Format check label for launch tone in the hero CAT mock",
  },
  checkLaunchToneMessage: {
    defaultMessage: "Target keeps the concise, confident product positioning.",
    id: "szHXMDevSb",
    description: "Format check message for launch tone in the hero CAT mock",
  },
  checkHeroFitLabel: {
    defaultMessage: "Hero fit",
    id: "1UF6LNQQqI",
    description: "Format check label for hero layout fit in the hero CAT mock",
  },
  checkHeroFitMessage: {
    defaultMessage: "Translation is close to the button and hero layout limits.",
    id: "z/ZDPJKYLB",
    description: "Format check message for hero layout fit in the hero CAT mock",
  },
  checkPlaceholdersLabel: {
    defaultMessage: "Placeholders",
    id: "X1RIo1R/Sz",
    description: "Format check label for placeholders in the hero CAT mock",
  },
  checkPlaceholdersMessage: {
    defaultMessage: "No required placeholders are missing.",
    id: "xaHT3hr/g2",
    description: "Format check message for placeholders in the hero CAT mock",
  },
  checkIcuLabel: {
    defaultMessage: "ICU structure",
    id: "gcoMjtaFWO",
    description: "Format check label for ICU structure in the hero CAT mock",
  },
  checkIcuMessage: {
    defaultMessage: "Plural branches and the '{'count'}' token match the source.",
    id: "sZSpLe4vdi",
    description: "Format check message for ICU structure in the hero CAT mock",
  },
  checkLayoutLengthLabel: {
    defaultMessage: "Layout length",
    id: "62dvy/V1Tw",
    description: "Format check label when translation exceeds length limits",
  },
  checkLayoutLengthMessage: {
    defaultMessage: "Translation exceeds the recommended {maxLength} characters.",
    id: "4rKdbq38y5",
    description: "Format check message when translation exceeds length limits",
  },
  intelligenceProductMeaning: {
    defaultMessage: "Marketing hero headline shown above the primary waitlist call to action.",
    id: "RDClJmugvf",
    description: "Product meaning panel copy in the hero CAT mock",
  },
  intelligenceIntent: {
    defaultMessage: "Position speed as release confidence, not shortcut automation.",
    id: "Ts8Uopd5oT",
    description: "Intent panel copy in the hero CAT mock",
  },
  intelligenceBreadcrumb: {
    defaultMessage: "Marketing site / Hero",
    id: "wsHoyAw3d4",
    description: "Location breadcrumb in the hero CAT mock intelligence panel",
  },
  intelligenceReviewerPreference: {
    defaultMessage: "Prefer concise French that still feels executive.",
    id: "PEkJb1qGtI",
    description: "Reviewer preference in the hero CAT mock intelligence panel",
  },
  intelligenceConstraints: {
    defaultMessage: "Hero title · Max 2 lines on tablet",
    id: "3aTLgL6EAQ",
    description: "Constraints line in the hero CAT mock intelligence panel",
  },
  tmContextProductOverview: {
    defaultMessage: "Product overview",
    id: "lES6CzVw2i",
    description: "TM match context label in the hero CAT mock",
  },
  ctaProductMeaning: {
    defaultMessage: "Waitlist CTA button label on the marketing homepage.",
    id: "9z1rlSegXU",
    description: "Product meaning for the CTA segment in the hero CAT mock",
  },
  ctaIntent: {
    defaultMessage: "Keep it short and action-oriented.",
    id: "rfwh9IJwkl",
    description: "Intent for the CTA segment in the hero CAT mock",
  },
  ctaBreadcrumb: {
    defaultMessage: "Marketing site / Hero / CTA",
    id: "M4Yv0ZhXGX",
    description: "Location breadcrumb for the CTA segment in the hero CAT mock",
  },
  ctaConstraints: {
    defaultMessage: "Button label · Must stay compact on mobile",
    id: "MHiaxGXuxI",
    description: "Constraints for the CTA segment in the hero CAT mock",
  },
  ctaAiReasoning: {
    defaultMessage: "Direct and familiar French SaaS CTA phrasing.",
    id: "eogv8qHzO7",
    description: "AI reasoning for the CTA segment in the hero CAT mock",
  },
  usageProductMeaning: {
    defaultMessage: "Billing usage meter string with ICU plural branches.",
    id: "HWn4sCtDpN",
    description: "Product meaning for the usage segment in the hero CAT mock",
  },
  usageIntent: {
    defaultMessage: "Preserve ICU syntax exactly.",
    id: "AnTkr06Fzd",
    description: "Intent for the usage segment in the hero CAT mock",
  },
  usageBreadcrumb: {
    defaultMessage: "Billing / Usage meter",
    id: "AxfK8LOKrc",
    description: "Location breadcrumb for the usage segment in the hero CAT mock",
  },
  usageConstraints: {
    defaultMessage: "ICU plural · Preserve '{'count'}'",
    id: "S7DZvtatya",
    description: "Constraints for the usage segment in the hero CAT mock",
  },
  usageAiReasoning: {
    defaultMessage: "Keeps both plural branches and the required count placeholder.",
    id: "/ujbXfoTfW",
    description: "AI reasoning for the usage segment in the hero CAT mock",
  },
  qaProductMeaning: {
    defaultMessage: "Banner label for pending translation approvals in the review queue.",
    id: "BNLTXT9U9i",
    description: "Product meaning for the QA banner segment in the hero CAT mock",
  },
  qaIntent: {
    defaultMessage: "Avoid wording that implies public customer reviews.",
    id: "0bJOTNMqb9",
    description: "Intent for the QA banner segment in the hero CAT mock",
  },
  qaBreadcrumb: {
    defaultMessage: "CAT workspace / Review queue",
    id: "5P6X7lQjQL",
    description: "Location breadcrumb for the QA banner segment in the hero CAT mock",
  },
  qaConstraints: {
    defaultMessage: "Short label · Avoid ambiguity around reviews",
    id: "YApKomjAhZ",
    description: "Constraints for the QA banner segment in the hero CAT mock",
  },
  qaTmContext: {
    defaultMessage: "CAT action",
    id: "IJ3WXU/p3C",
    description: "TM match context for the QA banner segment in the hero CAT mock",
  },
  qaAiReasoning: {
    defaultMessage: "Clarifies this is an internal translation review queue.",
    id: "5qhRiOc85b",
    description: "AI reasoning for the QA banner segment in the hero CAT mock",
  },
  contextHeroTitle: {
    defaultMessage:
      "Homepage headline for a launch-focused localization platform. Keep the claim direct and outcome-led.",
    id: "y+p1YSpXU6",
    description: "Looked-up context for the hero title segment",
  },
  contextHeroCta: {
    defaultMessage: "Primary conversion button for the public waitlist.",
    id: "h/hbKtjuxJ",
    description: "Looked-up context for the hero CTA segment",
  },
  contextUsageLimit: {
    defaultMessage: "Usage meter copy shown in billing and review dashboards.",
    id: "wwl2e+kYrU",
    description: "Looked-up context for the usage limit segment",
  },
  contextQaWarning: {
    defaultMessage: "Queue banner for translation reviews that still need human approval.",
    id: "0lByDvasg5",
    description: "Looked-up context for the QA warning segment",
  },
  contextFallback: {
    defaultMessage:
      "Repository context: {key} is part of the product UI and should keep tone, placeholders, and layout constraints intact.",
    id: "vjzEvY5tL/",
    description: "Fallback looked-up context for other hero CAT mock segments",
  },
  aiReasoningHeroTitle: {
    defaultMessage:
      "Uses deployment language that fits a B2B product launch while staying short enough for the hero layout.",
    id: "ia1bjnUC4M",
    description: "AI reasoning for regenerating the hero title suggestion",
  },
  aiReasoningFallback: {
    defaultMessage:
      "Keeps terminology, placeholders, and layout constraints aligned with the source.",
    id: "WNMfw+TYVj",
    description: "Fallback AI reasoning in the hero CAT mock",
  },
  contextLabelHomepageHero: {
    defaultMessage: "Homepage hero",
    id: "9cLIkDwKkC",
    description: "Segment context label for homepage hero strings in the CAT mock",
  },
  contextLabelPrimaryCta: {
    defaultMessage: "Primary CTA",
    id: "yhk0AaA8SA",
    description: "Segment context label for the primary CTA in the CAT mock",
  },
  contextLabelUsageMeter: {
    defaultMessage: "Usage meter",
    id: "xTFJa5ogoK",
    description: "Segment context label for the usage meter in the CAT mock",
  },
  contextLabelReviewQueue: {
    defaultMessage: "Review queue",
    id: "FdB4nFTP4P",
    description: "Segment context label for the review queue in the CAT mock",
  },
  contextLabelSiteNavigation: {
    defaultMessage: "Site navigation",
    id: "2+26W6yyOs",
    description: "Segment context label for site navigation strings in the CAT mock",
  },
  contextLabelFeatures: {
    defaultMessage: "Features section",
    id: "Fa2m2wwKio",
    description: "Segment context label for features section strings in the CAT mock",
  },
  contextLabelOnboarding: {
    defaultMessage: "Onboarding",
    id: "aMPe6yzgje",
    description: "Segment context label for onboarding strings in the CAT mock",
  },
  contextLabelProjectsList: {
    defaultMessage: "Projects list",
    id: "IKolF7Cd7w",
    description: "Segment context label for projects list strings in the CAT mock",
  },
  contextLabelSyncProgress: {
    defaultMessage: "Sync progress",
    id: "O4mWh8yd0e",
    description: "Segment context label for sync progress strings in the CAT mock",
  },
  contextLabelErrorBanner: {
    defaultMessage: "Error banner",
    id: "/UqhyMEBOR",
    description: "Segment context label for error banner strings in the CAT mock",
  },
  contextLabelErrorAction: {
    defaultMessage: "Error action",
    id: "GE8cIcFElD",
    description: "Segment context label for error action strings in the CAT mock",
  },
  contextLabelTeamSettings: {
    defaultMessage: "Team settings",
    id: "OPbww1wvuh",
    description: "Segment context label for team settings strings in the CAT mock",
  },
  contextLabelSettings: {
    defaultMessage: "Settings",
    id: "p9ro5GVVLh",
    description: "Segment context label for settings strings in the CAT mock",
  },
  contextLabelToast: {
    defaultMessage: "Toast",
    id: "21hoHKkPQz",
    description: "Segment context label for toast strings in the CAT mock",
  },
  contextLabelPricing: {
    defaultMessage: "Pricing",
    id: "jKWiD5tx0t",
    description: "Segment context label for pricing strings in the CAT mock",
  },
  contextLabelPricingCta: {
    defaultMessage: "Pricing CTA",
    id: "EoUUnxtgJ8",
    description: "Segment context label for pricing CTA strings in the CAT mock",
  },
  contextLabelGithubCheck: {
    defaultMessage: "GitHub check",
    id: "nFfXJRrXDL",
    description: "Segment context label for GitHub check strings in the CAT mock",
  },
  contextLabelEvalGate: {
    defaultMessage: "Eval gate",
    id: "gEvKgHjWZC",
    description: "Segment context label for eval gate strings in the CAT mock",
  },
});
