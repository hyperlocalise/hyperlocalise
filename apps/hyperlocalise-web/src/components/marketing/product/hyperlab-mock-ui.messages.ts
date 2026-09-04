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
import { defineMessages } from "react-intl";

export const hyperlabMockMessages = defineMessages({
  eyebrow: {
    defaultMessage: "Hyperlab",
    id: "BWPiMioFAx",
    description: "Hyperlab mock UI eyebrow label",
  },
  headline: {
    defaultMessage: "Flags, experiments, and live evaluation in one workspace",
    id: "gwEqR0+wNr",
    description: "Hyperlab mock UI section heading",
  },
  requestDemo: {
    defaultMessage: "Request a Demo",
    id: "ZnyV6xQJFB",
    description: "Hyperlab mock UI call-to-action button",
  },

  useCaseFlagsTitle: {
    defaultMessage: "Feature flags",
    id: "m17mlZ3/Yb",
    description: "Hyperlab mock UI flags use case title",
  },
  useCaseFlagsDescription: {
    defaultMessage: "Experiment and config flags scoped to your workspace",
    id: "Lnk8DKi9bA",
    description: "Hyperlab mock UI flags use case description",
  },
  useCaseExperimentsTitle: {
    defaultMessage: "A/B experiments",
    id: "Jg5QWOEhGR",
    description: "Hyperlab mock UI experiments use case title",
  },
  useCaseExperimentsDescription: {
    defaultMessage: "Split traffic, set rollout %, and activate when ready",
    id: "JoFuLmCZ9Z",
    description: "Hyperlab mock UI experiments use case description",
  },
  useCaseAudiencesTitle: {
    defaultMessage: "Audience targeting",
    id: "t7vmy3s2y1",
    description: "Hyperlab mock UI audiences use case title",
  },
  useCaseAudiencesDescription: {
    defaultMessage: "Attribute rules evaluated live on every request",
    id: "bBNT4RDo7G",
    description: "Hyperlab mock UI audiences use case description",
  },

  navOverview: {
    defaultMessage: "Overview",
    id: "spEEMpmq/e",
    description: "Hyperlab mock UI nav tab",
  },
  navFlags: {
    defaultMessage: "Flags",
    id: "du55QFnCON",
    description: "Hyperlab mock UI nav tab",
  },
  navExperiments: {
    defaultMessage: "Experiments",
    id: "r3TGVfZPDe",
    description: "Hyperlab mock UI nav tab",
  },
  navAudiences: {
    defaultMessage: "Audiences",
    id: "jEVZfFEPYx",
    description: "Hyperlab mock UI nav tab",
  },
  navKeys: {
    defaultMessage: "Keys",
    id: "0tIFgw5ysH",
    description: "Hyperlab mock UI nav tab",
  },

  flagsPanelTitle: {
    defaultMessage: "Flags",
    id: "KS/H7AoEPP",
    description: "Hyperlab mock UI flags panel title",
  },
  flagsPanelSubtitle: {
    defaultMessage: "3 flags · 2 experiment, 1 config",
    id: "PNw9tng+1C",
    description: "Hyperlab mock UI flags panel subtitle",
  },
  flagCheckoutCta: {
    defaultMessage: "checkout-cta",
    id: "V/sRu8J8dR",
    description: "Hyperlab mock UI sample flag key",
  },
  flagThemePalette: {
    defaultMessage: "theme.palette",
    id: "JM0AnSPCmK",
    description: "Hyperlab mock UI sample flag key",
  },
  flagOnboardingFlow: {
    defaultMessage: "onboarding.flow",
    id: "a4wQu11D5D",
    description: "Hyperlab mock UI sample flag key",
  },
  kindExperiment: {
    defaultMessage: "Experiment",
    id: "QT9sZSgQql",
    description: "Hyperlab mock UI flag kind badge",
  },
  kindConfig: {
    defaultMessage: "Config",
    id: "QZTQDCT8kY",
    description: "Hyperlab mock UI flag kind badge",
  },

  experimentsPanelTitle: {
    defaultMessage: "Experiments",
    id: "/BDbP6ag0g",
    description: "Hyperlab mock UI experiments panel title",
  },
  experimentsPanelSubtitle: {
    defaultMessage: "checkout-cta-test · A/B · Active",
    id: "bLqYNXsXHH",
    description: "Hyperlab mock UI experiments panel subtitle",
  },
  statusActive: {
    defaultMessage: "Active",
    id: "lIN1Ui+fCv",
    description: "Hyperlab mock UI experiment status badge",
  },
  variantControl: {
    defaultMessage: "control",
    id: "EoS+At6qci",
    description: "Hyperlab mock UI experiment variant label",
  },
  variantTreatment: {
    defaultMessage: "treatment",
    id: "jQ86ApxA97",
    description: "Hyperlab mock UI experiment variant label",
  },
  rolloutLabel: {
    defaultMessage: "Rollout",
    id: "V5bvOi6wCN",
    description: "Hyperlab mock UI rollout section label",
  },

  audiencesPanelTitle: {
    defaultMessage: "Audiences",
    id: "gDPRQKf6Ay",
    description: "Hyperlab mock UI audiences panel title",
  },
  audiencesPanelSubtitle: {
    defaultMessage: "Pro users · 1 rule",
    id: "75wQzkw69+",
    description: "Hyperlab mock UI audiences panel subtitle",
  },
  audienceProUsers: {
    defaultMessage: "Pro users",
    id: "GMgwhbm+0k",
    description: "Hyperlab mock UI audience name",
  },
  criterionAttribute: {
    defaultMessage: "plan",
    id: "x1FhjXZK5S",
    description: "Hyperlab mock UI criterion attribute",
  },
  criterionMatch: {
    defaultMessage: "exact",
    id: "Jr30TY5iBo",
    description: "Hyperlab mock UI criterion match operator",
  },
  criterionValue: {
    defaultMessage: "pro",
    id: "cVva7Hlu9m",
    description: "Hyperlab mock UI criterion value",
  },
  evaluateTitle: {
    defaultMessage: "OFREP evaluate",
    id: "UEAwre36YT",
    description: "Hyperlab mock UI evaluate response section title",
  },
  evaluateEnabled: {
    defaultMessage: '"enabled": true',
    id: "ezlEf15Nuz",
    description: "Hyperlab mock UI evaluate response field",
  },
  evaluateVariant: {
    defaultMessage: '"variant": "treatment"',
    id: "aTqbNUoZhT",
    description: "Hyperlab mock UI evaluate response field",
  },
  evaluateReason: {
    defaultMessage: '"reason": "TARGETING_MATCH"',
    id: "aAxceYKye/",
    description: "Hyperlab mock UI evaluate response field",
  },
});
