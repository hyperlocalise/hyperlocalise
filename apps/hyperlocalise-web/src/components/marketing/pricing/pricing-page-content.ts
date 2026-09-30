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
import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";
import { getIntlShape } from "@/lib/app-i18n/intl";
import {
  hyperlocaliseImageModelId,
  hyperlocaliseTranscribeModelId,
  hyperlocaliseTtsModelId,
  hyperlocaliseVideoModelId,
} from "@/lib/providers/managed-model-ids";

import {
  getPricingByokProviderModelIds,
  pricingByokProviderIds,
  pricingManagedAgentGatewayModelIds,
  type PricingByokProviderId,
} from "./pricing-supported-models";

export type PricingPlanId = "free" | "starter" | "growth" | "enterprise";

export type PricingPlanCta = {
  label: string;
  kind: "signup" | "demo";
};

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  /** Optional badge beside the plan name (for example Auto-enable on Free). */
  badge: string | null;
  price: string;
  priceSuffix: string | null;
  description: string;
  popular: boolean;
  includesFrom: string | null;
  features: string[];
  cta: PricingPlanCta;
};

export type PricingMatrixCell =
  | { kind: "check" }
  | { kind: "dash" }
  | { kind: "text"; value: string };

export type PricingMatrixRow = {
  id: string;
  label: string;
  /** Optional supporting copy shown under the row label in the comparison matrix. */
  detail?: string;
  cells: Record<PricingPlanId, PricingMatrixCell>;
};

export type PricingMatrixSection = {
  id: string;
  title: string;
  description: string;
  rows: PricingMatrixRow[];
};

export const pricingPlanOrder: readonly PricingPlanId[] = [
  "free",
  "starter",
  "growth",
  "enterprise",
] as const;

export function getPricingPlans(locale: string): PricingPlan[] {
  const intl = getIntlShape(locale);
  const startForFree = intl.formatMessage({
    defaultMessage: "Start for free",
    id: "+FcGOPQu9Z",
    description: "Free plan CTA label on the pricing page",
  });
  const getStarted = intl.formatMessage({
    defaultMessage: "Get started",
    id: "8Oyr38Aj4F",
    description: "Paid self-serve plan CTA label on the pricing page",
  });
  const perMonth = intl.formatMessage({
    defaultMessage: "/mo.",
    id: "clr4hixI6B",
    description: "Monthly price suffix on pricing cards",
  });

  return [
    {
      id: "free",
      name: intl.formatMessage({
        defaultMessage: "Free Plan",
        id: "71I+YToKV7",
        description: "Free plan name on the pricing page",
      }),
      badge: intl.formatMessage({
        defaultMessage: "Auto-enable",
        id: "/a2VqYlgh4",
        description: "Badge on the Free pricing plan indicating automatic provisioning",
      }),
      price: intl.formatMessage({
        defaultMessage: "Free",
        id: "UL0g2ZIWhm",
        description: "Free plan price on the pricing page",
      }),
      priceSuffix: null,
      description: intl.formatMessage({
        defaultMessage: "Evaluate Hyperlocalise with a single-seat workspace.",
        id: "4Xya9zkpLQ",
        description: "Free plan description on the pricing page",
      }),
      popular: false,
      includesFrom: null,
      features: [
        intl.formatMessage({
          defaultMessage: "1 project",
          id: "73DwGFhZM/",
          description: "Free plan feature: project limit",
        }),
        intl.formatMessage({
          defaultMessage: "1 seat",
          id: "V1lR4mPTs5",
          description: "Free plan feature: seat limit",
        }),
      ],
      cta: { label: startForFree, kind: "signup" },
    },
    {
      id: "starter",
      name: intl.formatMessage({
        defaultMessage: "Starter",
        id: "dBWJx9vBQt",
        description: "Starter plan name on the pricing page",
      }),
      badge: null,
      price: intl.formatMessage({
        defaultMessage: "$20",
        id: "cTTX9n9kbk",
        description: "Starter plan price on the pricing page",
      }),
      priceSuffix: perMonth,
      description: intl.formatMessage({
        defaultMessage: "For small teams that need more seats and projects.",
        id: "x9qwrwtKqR",
        description: "Starter plan description on the pricing page",
      }),
      popular: false,
      includesFrom: intl.formatMessage({
        defaultMessage: "All Free features, plus:",
        id: "yoOShm3Zjk",
        description: "Starter plan intro above incremental features",
      }),
      features: [
        intl.formatMessage({
          defaultMessage: "2 integrations",
          id: "v0pahqQ3yE",
          description: "Starter plan feature: integration limit",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited projects",
          id: "iRIRASFRNC",
          description: "Starter plan feature: unlimited projects",
        }),
        intl.formatMessage({
          defaultMessage: "5 seats",
          id: "uc3WQiSxaw",
          description: "Starter plan feature: seat limit",
        }),
        intl.formatMessage({
          defaultMessage: "AI Feature",
          id: "EtJmzwZSzn",
          description: "Paid plan feature: AI feature access",
        }),
        intl.formatMessage({
          defaultMessage: "Queries Board",
          id: "+zBo713DAu",
          description: "Starter plan feature: Queries Board access",
        }),
        intl.formatMessage({
          defaultMessage: "$20 per month AI credit",
          id: "fnuHA5r7aQ",
          description: "Starter plan feature: included monthly AI credit",
        }),
      ],
      cta: { label: getStarted, kind: "signup" },
    },
    {
      id: "growth",
      name: intl.formatMessage({
        defaultMessage: "Growth Plan",
        id: "0x5bWok1f2",
        description: "Growth plan name on the pricing page",
      }),
      badge: null,
      price: intl.formatMessage({
        defaultMessage: "$2,000",
        id: "y9blutdtEE",
        description: "Growth plan price on the pricing page",
      }),
      priceSuffix: perMonth,
      description: intl.formatMessage({
        defaultMessage: "For teams running localisation in production every week.",
        id: "8yfcbh9AO6",
        description: "Growth plan description on the pricing page",
      }),
      popular: true,
      includesFrom: intl.formatMessage({
        defaultMessage: "All Starter features, plus:",
        id: "4HG5INMxUv",
        description: "Growth plan intro above incremental features",
      }),
      features: [
        intl.formatMessage({
          defaultMessage: "20 automations",
          id: "9J3EZADGbx",
          description: "Growth plan feature: automation limit",
        }),
        intl.formatMessage({
          defaultMessage: "5 integrations",
          id: "j0iC3VoekG",
          description: "Growth plan feature: integration limit",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited projects",
          id: "iRIRASFRNC",
          description: "Starter plan feature: unlimited projects",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited seats",
          id: "7X4JZ1+tNc",
          description: "Growth plan feature: unlimited seats",
        }),
        intl.formatMessage({
          defaultMessage: "2,000 agent runs per month",
          id: "saGDzW8Kz5",
          description: "Growth plan feature: agent run quota",
        }),
        intl.formatMessage({
          defaultMessage: "Unlimited translation jobs",
          id: "tFGX4qNX4h",
          description: "Growth plan feature: unlimited translation jobs",
        }),
        intl.formatMessage({
          defaultMessage: "AI Feature",
          id: "EtJmzwZSzn",
          description: "Paid plan feature: AI feature access",
        }),
        intl.formatMessage({
          defaultMessage: "Automation Workflow",
          id: "bfWw2Q3euR",
          description: "Growth plan feature: Automation Workflow access",
        }),
        intl.formatMessage({
          defaultMessage: "Queries Board",
          id: "+zBo713DAu",
          description: "Starter plan feature: Queries Board access",
        }),
        intl.formatMessage({
          defaultMessage: "$2,000 per month AI credit",
          id: "blxqR2KvgQ",
          description: "Growth plan feature: included monthly AI credit",
        }),
      ],
      cta: { label: getStarted, kind: "signup" },
    },
    {
      id: "enterprise",
      name: intl.formatMessage({
        defaultMessage: "Enterprise",
        id: "Bgy156rCP9",
        description: "Enterprise plan name on the pricing page",
      }),
      badge: null,
      price: intl.formatMessage({
        defaultMessage: "Custom",
        id: "fMyeM5BW3s",
        description: "Enterprise plan price label on the pricing page",
      }),
      priceSuffix: null,
      description: intl.formatMessage({
        defaultMessage: "For organizations that need custom limits and support.",
        id: "ZBij4iUX44",
        description: "Enterprise plan description on the pricing page",
      }),
      popular: false,
      includesFrom: intl.formatMessage({
        defaultMessage: "All Growth features, plus:",
        id: "uxTXRcu5Em",
        description: "Enterprise plan intro above incremental features",
      }),
      features: [
        intl.formatMessage({
          defaultMessage: "Custom usage limits",
          id: "e6PVBNU9Sg",
          description: "Enterprise plan feature: custom limits",
        }),
        intl.formatMessage({
          defaultMessage: "SSO / SAML",
          id: "OtoAcs/psJ",
          description: "Enterprise plan feature: SSO",
        }),
        intl.formatMessage({
          defaultMessage: "Service-level agreement",
          id: "AUcojcp0lZ",
          description: "Enterprise plan feature: SLA",
        }),
        intl.formatMessage({
          defaultMessage: "Dedicated support",
          id: "1M4Hu48OSE",
          description: "Enterprise plan feature: dedicated support",
        }),
        intl.formatMessage({
          defaultMessage: "Security review assistance",
          id: "vUcO7nkRNE",
          description: "Enterprise plan feature: security review help",
        }),
      ],
      cta: {
        label: intl.formatMessage({
          defaultMessage: "Contact Sales",
          id: "MRoAAfbdki",
          description: "Enterprise plan CTA label on the pricing page",
        }),
        kind: "demo",
      },
    },
  ];
}

export function getPricingMatrixSections(locale: string): PricingMatrixSection[] {
  const intl = getIntlShape(locale);
  const unlimited = intl.formatMessage({
    defaultMessage: "Unlimited",
    id: "SNl5ipNJ6A",
    description: "Matrix cell value for unlimited plan limits",
  });
  const custom = intl.formatMessage({
    defaultMessage: "Custom",
    id: "yEwFJfSgTY",
    description: "Matrix cell value for custom enterprise limits",
  });

  return [
    {
      id: "workspace",
      title: intl.formatMessage({
        defaultMessage: "Workspace",
        id: "DRiVk5mEAF",
        description: "Pricing matrix section title for workspace limits",
      }),
      description: intl.formatMessage({
        defaultMessage: "Projects, seats, and connected tools for your team.",
        id: "0HGkduChrS",
        description: "Pricing matrix section description for workspace limits",
      }),
      rows: [
        {
          id: "projects",
          label: intl.formatMessage({
            defaultMessage: "Projects",
            id: "Pd3edSzEYJ",
            description: "Pricing matrix row label for projects",
          }),
          cells: {
            free: { kind: "text", value: "1" },
            starter: { kind: "text", value: unlimited },
            growth: { kind: "text", value: unlimited },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "seats",
          label: intl.formatMessage({
            defaultMessage: "Seats",
            id: "X96S8fajCU",
            description: "Pricing matrix row label for seats",
          }),
          cells: {
            free: { kind: "text", value: "1" },
            starter: { kind: "text", value: "5" },
            growth: { kind: "text", value: unlimited },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "integrations",
          label: intl.formatMessage({
            defaultMessage: "Integrations",
            id: "3Zjg+fxxP+",
            description: "Pricing matrix row label for integrations",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "text", value: "2" },
            growth: { kind: "text", value: "5" },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "automations",
          label: intl.formatMessage({
            defaultMessage: "Automations",
            id: "llbzw/iXGP",
            description: "Pricing matrix row label for automations",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Scheduled and GitHub-triggered agent playbooks (not the visual workflow editor).",
            id: "P+MaWGCLAB",
            description: "Pricing matrix detail for agent automation quota row",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "text", value: "20" },
            enterprise: { kind: "text", value: custom },
          },
        },
      ],
    },
    {
      id: "usage",
      title: intl.formatMessage({
        defaultMessage: "Usage",
        id: "Kxj1NjlA8v",
        description: "Pricing matrix section title for usage quotas",
      }),
      description: intl.formatMessage({
        defaultMessage: "Monthly agent, token, and translation capacity.",
        id: "zEqfVrKbs/",
        description: "Pricing matrix section description for usage quotas",
      }),
      rows: [
        {
          id: "agent-runs",
          label: intl.formatMessage({
            defaultMessage: "Agent runs / month",
            id: "u1HpnCoRxX",
            description: "Pricing matrix row label for agent runs",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "text", value: "2,000" },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "ai-tokens",
          label: intl.formatMessage({
            defaultMessage: "AI credit / month",
            id: "csr373/O34",
            description: "Pricing matrix row label for included monthly AI credit",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Managed model usage draws down your monthly AI credit balance at published rates.",
            id: "2AFaXwgQin",
            description: "Pricing matrix detail explaining monthly AI credit",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "text", value: "$20" },
            growth: { kind: "text", value: "$2,000" },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "translation-jobs",
          label: intl.formatMessage({
            defaultMessage: "Translation jobs / month",
            id: "4WS98Fwfj2",
            description: "Pricing matrix row label for translation jobs",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "text", value: unlimited },
            enterprise: { kind: "text", value: custom },
          },
        },
        {
          id: "ai-features",
          label: intl.formatMessage({
            defaultMessage: "AI features",
            id: "bUBd4XGtBI",
            description: "Pricing matrix row label for AI features",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
      ],
    },
    {
      id: "queries-automation",
      title: intl.formatMessage({
        defaultMessage: "Queries & automation",
        id: "cBjVvDkrw1",
        description: "Pricing matrix section title for Queries and Automation Workflow",
      }),
      description: intl.formatMessage({
        defaultMessage:
          "Collaboration for copy and context issues, plus repeatable workflow tooling for production teams.",
        id: "7uZBXW8hcA",
        description: "Pricing matrix section description for Queries and Automation Workflow",
      }),
      rows: [
        {
          id: "queries-board",
          label: intl.formatMessage({
            defaultMessage: "Queries Board",
            id: "28A/J2yeKB",
            description: "Pricing matrix row label for Queries Board",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Central place to log localization questions, triage copy issues, and keep reviewers aligned.",
            id: "F+TDVIQeN4",
            description: "Pricing matrix detail for Queries Board overview row",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "queries-workspace-project",
          label: intl.formatMessage({
            defaultMessage: "Workspace & project views",
            id: "x5xGik3YFl",
            description: "Pricing matrix row for Queries workspace and project surfaces",
          }),
          detail: intl.formatMessage({
            defaultMessage: "Org-wide Queries list and per-project boards tied to your content.",
            id: "7611x1JIeq",
            description: "Pricing matrix detail for Queries workspace and project views",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "queries-collaboration",
          label: intl.formatMessage({
            defaultMessage: "Comments, assignees & links",
            id: "2emviDP0f7",
            description: "Pricing matrix row for Queries collaboration features",
          }),
          detail: intl.formatMessage({
            defaultMessage: "Thread on issues, assign owners, and relate work across projects.",
            id: "8P9Vlj8jx9",
            description: "Pricing matrix detail for Queries collaboration features",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "queries-import-bulk",
          label: intl.formatMessage({
            defaultMessage: "CSV import & bulk updates",
            id: "/GQj3K56LL",
            description: "Pricing matrix row for Queries import and bulk actions",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "check" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-workflow",
          label: intl.formatMessage({
            defaultMessage: "Automation Workflow",
            id: "oQ4ei78nry",
            description: "Pricing matrix row label for Automation Workflow",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Visual, deterministic workflows—fixed steps and approvals instead of one-off agent chat.",
            id: "g/rzrQHbSt",
            description: "Pricing matrix detail for Automation Workflow overview row",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-visual-editor",
          label: intl.formatMessage({
            defaultMessage: "Visual workflow editor",
            id: "IVt01o++9g",
            description: "Pricing matrix row for Automation Workflow visual editor",
          }),
          detail: intl.formatMessage({
            defaultMessage:
              "Compose triggers, branches, and actions on a canvas with typed bindings.",
            id: "8mV6lAbiyf",
            description: "Pricing matrix detail for Automation Workflow visual editor",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-integrations",
          label: intl.formatMessage({
            defaultMessage: "HTTP, webhooks & AI steps",
            id: "TrBjo12/3b",
            description: "Pricing matrix row for Automation Workflow step types",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "automation-runs",
          label: intl.formatMessage({
            defaultMessage: "Manual test & scheduled runs",
            id: "1Bz70bU/oj",
            description: "Pricing matrix row for Automation Workflow execution",
          }),
          detail: intl.formatMessage({
            defaultMessage: "Dry-run drafts, publish versions, and run on a schedule or on demand.",
            id: "Yzbs+0FanB",
            description: "Pricing matrix detail for Automation Workflow execution",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "check" },
            enterprise: { kind: "check" },
          },
        },
      ],
    },
    {
      id: "enterprise",
      title: intl.formatMessage({
        defaultMessage: "Enterprise",
        id: "8tw6rEaK51",
        description: "Pricing matrix section title for enterprise controls",
      }),
      description: intl.formatMessage({
        defaultMessage: "Security, support, and commercial controls for larger orgs.",
        id: "ilusC30/97",
        description: "Pricing matrix section description for enterprise controls",
      }),
      rows: [
        {
          id: "sso",
          label: intl.formatMessage({
            defaultMessage: "SSO / SAML",
            id: "pjTufHJtA+",
            description: "Pricing matrix row label for SSO",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "sla",
          label: intl.formatMessage({
            defaultMessage: "Service-level agreement",
            id: "q+3+ldE+Vn",
            description: "Pricing matrix row label for SLA",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "dedicated-support",
          label: intl.formatMessage({
            defaultMessage: "Dedicated support",
            id: "YJhLdtyhdj",
            description: "Pricing matrix row label for dedicated support",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
        {
          id: "security-review",
          label: intl.formatMessage({
            defaultMessage: "Security review assistance",
            id: "EJHq4HC1h1",
            description: "Pricing matrix row label for security review assistance",
          }),
          cells: {
            free: { kind: "dash" },
            starter: { kind: "dash" },
            growth: { kind: "dash" },
            enterprise: { kind: "check" },
          },
        },
      ],
    },
  ];
}

export type PricingAiFeature = {
  id: string;
  title: string;
  description: string;
};

export type PricingIncludedModelRow = {
  id: string;
  capability: string;
  models: readonly string[];
  detail?: string;
};

export type PricingByokProvider = {
  id: string;
  name: string;
  models: readonly string[];
};

export type PricingByokFeature = {
  id: string;
  text: string;
};

export type PricingModelsSectionContent = {
  heading: string;
  subcopy: string;
  includedTitle: string;
  includedDescription: string;
  includedRows: readonly PricingIncludedModelRow[];
  byokTitle: string;
  byokDescription: string;
  byokProviders: readonly PricingByokProvider[];
  byokFeatures: readonly PricingByokFeature[];
  byokFootnote: string;
};

export function getPricingModelsSectionContent(locale: string): PricingModelsSectionContent {
  const intl = getIntlShape(locale);

  const agentCapabilities = intl.formatMessage({
    defaultMessage: "Ask, Translation, and Coding",
    id: "hjwoGYZd+k",
    description: "Pricing models row label for agent text capabilities",
  });

  return {
    heading: intl.formatMessage({
      defaultMessage: "Models and BYOK",
      id: "zO4by8PZEN",
      description: "Heading for the models and BYOK section on the pricing page",
    }),
    subcopy: intl.formatMessage({
      defaultMessage:
        "Managed models draw down your monthly AI credit. Connect your own provider keys when you want direct billing with OpenAI, Anthropic, or Gemini.",
      id: "aEo791NENU",
      description: "Supporting copy for the models and BYOK section on the pricing page",
    }),
    includedTitle: intl.formatMessage({
      defaultMessage: "Included models",
      id: "X1Ie8nZW5a",
      description: "Subheading for Hyperlocalise-managed models on the pricing page",
    }),
    includedDescription: intl.formatMessage({
      defaultMessage:
        "Always available on paid plans. Speech and media capabilities use dedicated included models; agent work uses the managed catalog (default {defaultModel}) unless you connect BYOK.",
      id: "mnUPrGhGuI",
      description: "Description under included models on the pricing page",
    }, { defaultModel: hyperlocaliseAgentModelId }),
    includedRows: [
      {
        id: "agent-default",
        capability: agentCapabilities,
        models: pricingManagedAgentGatewayModelIds,
        detail: intl.formatMessage({
          defaultMessage: "Workspace default for chat, translation jobs, and coding agents.",
          id: "c+4z1kMqTq",
          description: "Detail for the managed agent default model on the pricing page",
        }),
      },
      {
        id: "tts",
        capability: intl.formatMessage({
          defaultMessage: "Text to speech",
          id: "WfOVeAc/hr",
          description: "Pricing models row label for text to speech",
        }),
        models: [hyperlocaliseTtsModelId],
      },
      {
        id: "transcribe",
        capability: intl.formatMessage({
          defaultMessage: "Transcribe",
          id: "aYuiXKzRRS",
          description: "Pricing models row label for transcription",
        }),
        models: [hyperlocaliseTranscribeModelId],
      },
      {
        id: "image",
        capability: intl.formatMessage({
          defaultMessage: "Image generation",
          id: "aq9uIWSdUf",
          description: "Pricing models row label for image generation",
        }),
        models: [hyperlocaliseImageModelId],
      },
      {
        id: "video",
        capability: intl.formatMessage({
          defaultMessage: "Video generation",
          id: "OhHPkKM0Ft",
          description: "Pricing models row label for video generation",
        }),
        models: [hyperlocaliseVideoModelId],
      },
    ],
    byokTitle: intl.formatMessage({
      defaultMessage: "Bring your own key (BYOK)",
      id: "xcNNt34EVn",
      description: "Subheading for BYOK on the pricing page",
    }),
    byokDescription: intl.formatMessage({
      defaultMessage:
        "Save a shared workspace API key in AI Engine. Hyperlocalise validates the key, encrypts it at rest, and routes agent and translation traffic through your provider account.",
      id: "cs1R2QyhSD",
      description: "Description under BYOK on the pricing page",
    }),
    byokProviders: pricingByokProviderIds.map((providerId) => {
      const providerNameById = {
        openai: intl.formatMessage({
          defaultMessage: "OpenAI",
          id: "ebSc/SgRuM",
          description: "OpenAI provider name on the pricing BYOK section",
        }),
        anthropic: intl.formatMessage({
          defaultMessage: "Anthropic",
          id: "zgB7RcHWk8",
          description: "Anthropic provider name on the pricing BYOK section",
        }),
        gemini: intl.formatMessage({
          defaultMessage: "Google Gemini",
          id: "4I4RDHWJ2Q",
          description: "Google Gemini provider name on the pricing BYOK section",
        }),
      } as const satisfies Record<PricingByokProviderId, string>;

      return {
        id: providerId,
        name: providerNameById[providerId],
        models: getPricingByokProviderModelIds(providerId),
      };
    }),
    byokFeatures: [
      {
        id: "curated-models",
        text: intl.formatMessage({
          defaultMessage:
            "Pick a default model from our curated catalog for each provider (for example GPT-6 Luna, Claude Sonnet, or Gemini Flash).",
          id: "ooSKNfcn90",
          description: "BYOK feature bullet about curated model catalog on pricing page",
        }),
      },
      {
        id: "no-credit-draw",
        text: intl.formatMessage({
          defaultMessage:
            "BYOK inference is billed by your provider and does not draw down Hyperlocalise monthly AI credit.",
          id: "8n+pwQn9aX",
          description: "BYOK feature bullet about AI credit on pricing page",
        }),
      },
      {
        id: "included-stays",
        text: intl.formatMessage({
          defaultMessage:
            "Included models for speech, transcription, image, and video stay available alongside BYOK.",
          id: "7FJ8bUMk8H",
          description: "BYOK feature bullet about included models on pricing page",
        }),
      },
      {
        id: "workspace-default",
        text: intl.formatMessage({
          defaultMessage:
            "Ask, Translation, Coding, file translation jobs, and workspace automations inherit your workspace default model.",
          id: "bbuRb12c5B",
          description: "BYOK feature bullet about workspace default inheritance on pricing page",
        }),
      },
    ],
    byokFootnote: intl.formatMessage({
      defaultMessage:
        "Configure providers in AI Engine after you upgrade to Starter, Growth, or Enterprise.",
      id: "aRW1mCoyPj",
      description: "Footnote under BYOK features on the pricing page",
    }),
  };
}

export function getPricingAiFeatures(locale: string): PricingAiFeature[] {
  const intl = getIntlShape(locale);

  return [
    {
      id: "ask-about-any-string",
      title: intl.formatMessage({
        defaultMessage: "Ask about any string",
        id: "rDFwnPnMxA",
        description: "AI feature capability title: ask about strings",
      }),
      description: intl.formatMessage({
        defaultMessage: "Get meaning, where it appears in the product, and how to translate it.",
        id: "GJZJnd3J8t",
        description: "AI feature capability body: ask about strings",
      }),
    },
    {
      id: "visual-context",
      title: intl.formatMessage({
        defaultMessage: "See the UI context",
        id: "2Y27cUhCTS",
        description: "AI feature capability title: visual context",
      }),
      description: intl.formatMessage({
        defaultMessage: "Screenshots so reviewers know where copy shows up.",
        id: "VFYJ+T/TTl",
        description: "AI feature capability body: visual context",
      }),
    },
    {
      id: "translate-in-chat",
      title: intl.formatMessage({
        defaultMessage: "Translate in chat",
        id: "rw4HCHelCR",
        description: "AI feature capability title: translate in chat",
      }),
      description: intl.formatMessage({
        defaultMessage: "Send files, text, or images in web, Slack, or email.",
        id: "9acpAUlA8Z",
        description: "AI feature capability body: translate in chat",
      }),
    },
    {
      id: "recent-change-briefs",
      title: intl.formatMessage({
        defaultMessage: "Catch what changed",
        id: "YNbxvilhkH",
        description: "AI feature capability title: recent change briefs",
      }),
      description: intl.formatMessage({
        defaultMessage: "Briefs on new or updated source copy, with context.",
        id: "36xVSohq0P",
        description: "AI feature capability body: recent change briefs",
      }),
    },
    {
      id: "organization-memory",
      title: intl.formatMessage({
        defaultMessage: "Remember your rules",
        id: "sVUx4aIt3x",
        description: "AI feature capability title: organization memory",
      }),
      description: intl.formatMessage({
        defaultMessage: "Keep tone and terminology guidance for the next job.",
        id: "hDNxzYjQkl",
        description: "AI feature capability body: organization memory",
      }),
    },
    {
      id: "tms-aware-drafting-qa",
      title: intl.formatMessage({
        defaultMessage: "Draft and check in your TMS",
        id: "hIOpWNAWDG",
        description: "AI feature capability title: TMS-aware drafting and QA",
      }),
      description: intl.formatMessage({
        defaultMessage: "Fill missing locales and run QA while people stay in control.",
        id: "6t3EqSwEpq",
        description: "AI feature capability body: TMS-aware drafting and QA",
      }),
    },
    {
      id: "agent-automations",
      title: intl.formatMessage({
        defaultMessage: "Automate the busywork",
        id: "iOJxHuvYs1",
        description: "AI feature capability title: agent automations",
      }),
      description: intl.formatMessage({
        defaultMessage:
          "Sync, validate, and notify the team on a schedule or when something lands.",
        id: "jNUm0wTEWX",
        description: "AI feature capability body: agent automations",
      }),
    },
    {
      id: "bring-your-own-llm",
      title: intl.formatMessage({
        defaultMessage: "Use the model you prefer",
        id: "hz8O9/ilG1",
        description: "AI feature capability title: bring your own LLM",
      }),
      description: intl.formatMessage({
        defaultMessage: "OpenAI, Anthropic, or Gemini — without changing how you work.",
        id: "kmECxTtxS5",
        description: "AI feature capability body: bring your own LLM",
      }),
    },
  ];
}

export function getPricingPageCopy(locale: string) {
  const intl = getIntlShape(locale);

  return {
    headline: intl.formatMessage({
      defaultMessage: "Scale localisation. Control your costs.",
      id: "gfUQK+bPpD",
      description: "Primary headline on the marketing pricing page",
    }),
    subcopy: intl.formatMessage({
      defaultMessage: "Simple plans for evaluating Hyperlocalise today.",
      id: "qRVA5sizhD",
      description: "Supporting copy under the pricing page headline",
    }),
    popularBadge: intl.formatMessage({
      defaultMessage: "Popular",
      id: "BhWHI3Tdnm",
      description: "Badge label on the featured Growth pricing plan",
    }),
    compareHeading: intl.formatMessage({
      defaultMessage: "Compare plans",
      id: "kqDNTw/sEr",
      description: "Heading above the pricing comparison matrix",
    }),
    compareSubcopy: intl.formatMessage({
      defaultMessage: "See what each plan includes before you choose a path.",
      id: "wNfaNj8oeP",
      description: "Supporting copy above the pricing comparison matrix",
    }),
    includedAriaLabel: intl.formatMessage({
      defaultMessage: "Included",
      id: "xEaoAlugPJ",
      description: "Accessible label for a checkmark in the pricing matrix",
    }),
    notIncludedAriaLabel: intl.formatMessage({
      defaultMessage: "Not included",
      id: "z9cqkREGyZ",
      description: "Accessible label for a dash in the pricing matrix",
    }),
    aiFeaturesHeading: intl.formatMessage({
      defaultMessage: "AI features",
      id: "Lmup4mp1Uh",
      description: "Heading for the AI features explainer on the pricing page",
    }),
    aiFeaturesSubcopy: intl.formatMessage({
      defaultMessage:
        "Included on Starter, Growth, and Enterprise. Clear answers on your copy, UI context, and localisation workflow.",
      id: "ULysfP8wxM",
      description: "Supporting copy under the AI features heading on the pricing page",
    }),
    undecidedHeading: intl.formatMessage({
      defaultMessage: "Can't decide?",
      id: "dOaxbDzrv5",
      description: "Heading for the undecided CTA band below the pricing FAQ",
    }),
    talkToSales: intl.formatMessage({
      defaultMessage: "Talk to sales",
      id: "MZ5aQR65ew",
      description: "Secondary CTA on the undecided pricing band",
    }),
    requestDemo: intl.formatMessage({
      defaultMessage: "Request a demo",
      id: "+iY8hxQCxr",
      description: "Primary CTA on the undecided pricing band",
    }),
  };
}
