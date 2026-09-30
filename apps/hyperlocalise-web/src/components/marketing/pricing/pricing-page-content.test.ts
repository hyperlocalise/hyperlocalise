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
import { describe, expect, it } from "vite-plus/test";

import { buildPricingFaqJsonLd, getPricingFaqItems } from "./pricing-faq-content";
import { hyperlocaliseAgentModelId } from "@/lib/agent-runtime/loops/model-id";
import {
  hyperlocaliseImageModelId,
  hyperlocaliseTranscribeModelId,
  hyperlocaliseTtsModelId,
  hyperlocaliseVideoModelId,
} from "@/lib/providers/managed-model-ids";
import { llmProviderContentEditoralog } from "@/lib/providers/shared/catalog";
import { curatedOpenAiNativeModels } from "@/lib/providers/shared/vercel-ai-gateway-openai-models";

import {
  getPricingAiFeatures,
  getPricingMatrixSections,
  getPricingModelsSectionContent,
  getPricingPlans,
  pricingPlanOrder,
} from "./pricing-page-content";

describe("pricing page content", () => {
  it("exposes four plans with signup CTAs except Enterprise demo", () => {
    const plans = getPricingPlans("en");

    expect(plans.map((plan) => plan.id)).toEqual([...pricingPlanOrder]);
    expect(plans.find((plan) => plan.id === "free")?.features).toEqual(["1 project", "1 seat"]);
    expect(plans.find((plan) => plan.id === "starter")?.price).toBe("$20");
    expect(plans.find((plan) => plan.id === "growth")?.price).toBe("$2,000");
    expect(plans.find((plan) => plan.id === "growth")?.popular).toBe(true);
    expect(plans.find((plan) => plan.id === "free")?.badge).toBe("Auto-enable");
    expect(plans.find((plan) => plan.id === "free")?.price).toBe("Free");
    expect(plans.find((plan) => plan.id === "starter")?.features).toEqual([
      "2 integrations",
      "Unlimited projects",
      "5 seats",
      "AI Feature",
      "Queries Board",
      "$20 per month AI credit",
    ]);
    expect(plans.find((plan) => plan.id === "growth")?.features).toEqual([
      "20 automations",
      "5 integrations",
      "Unlimited projects",
      "Unlimited seats",
      "2,000 agent runs per month",
      "Unlimited translation jobs",
      "AI Feature",
      "Automation Workflow",
      "Queries Board",
      "$2,000 per month AI credit",
    ]);
    expect(plans.find((plan) => plan.id === "free")?.cta).toEqual({
      kind: "signup",
      label: "Start for free",
    });
    expect(plans.find((plan) => plan.id === "starter")?.cta).toEqual({
      kind: "signup",
      label: "Get started",
    });
    expect(plans.find((plan) => plan.id === "growth")?.cta).toEqual({
      kind: "signup",
      label: "Get started",
    });
    expect(plans.find((plan) => plan.id === "enterprise")?.cta).toEqual({
      kind: "demo",
      label: "Contact Sales",
    });
  });

  it("builds a matrix covering every plan column", () => {
    const sections = getPricingMatrixSections("en");
    const rows = sections.flatMap((section) => section.rows);

    expect(sections.length).toBeGreaterThan(0);
    expect(rows.find((row) => row.id === "automations")?.label).toBe("Automations");
    expect(rows.find((row) => row.id === "ai-tokens")?.label).toBe("AI credit / month");
    expect(rows.find((row) => row.id === "ai-tokens")?.cells.starter).toEqual({
      kind: "text",
      value: "$20",
    });
    expect(rows.find((row) => row.id === "ai-tokens")?.cells.growth).toEqual({
      kind: "text",
      value: "$2,000",
    });
    expect(rows.find((row) => row.id === "ai-tokens")?.detail).toContain("monthly AI credit");
    expect(rows.find((row) => row.id === "ai-token-overage")).toBeUndefined();
    expect(rows.find((row) => row.id === "ai-features")?.cells.starter).toEqual({ kind: "check" });
    const queriesSection = sections.find((section) => section.id === "queries-automation");
    expect(queriesSection?.title).toBe("Queries & automation");
    expect(queriesSection?.rows.find((row) => row.id === "queries-board")?.detail).toContain(
      "localization questions",
    );
    expect(queriesSection?.rows.find((row) => row.id === "automation-workflow")?.detail).toContain(
      "deterministic",
    );
    for (const row of rows) {
      for (const planId of pricingPlanOrder) {
        expect(row.cells[planId]).toBeTruthy();
      }
    }
  });

  it("describes included models and BYOK providers in plain language", () => {
    const section = getPricingModelsSectionContent("en");
    const catalog = section.models;

    expect(section.heading).toBe("Models your team can use");
    expect(section.footnote).toContain("AI Engine");
    expect(catalog[0]?.name).toBe("GPT-6 Luna");
    expect(catalog[0]?.highlight).toBe("Workspace default");
    expect(catalog[0]?.story).toContain("monthly AI credit");

    const includedOpenAi = catalog
      .filter((model) => model.providerId === "openai" && model.job === "write")
      .map((model) => model.modelId);
    expect(new Set(includedOpenAi)).toEqual(
      new Set(curatedOpenAiNativeModels.map((slug) => `openai/${slug}`)),
    );
    expect(includedOpenAi).toContain(`openai/${hyperlocaliseAgentModelId}`);

    expect(catalog.find((model) => model.modelId === hyperlocaliseTtsModelId)?.name).toBe(
      "Fish Audio",
    );
    expect(catalog.find((model) => model.modelId === hyperlocaliseTranscribeModelId)?.job).toBe(
      "listen",
    );
    expect(catalog.find((model) => model.modelId === hyperlocaliseImageModelId)?.access).toBe(
      "included",
    );
    expect(catalog.find((model) => model.modelId === hyperlocaliseVideoModelId)?.access).toBe(
      "included",
    );
    expect(
      new Set(
        catalog.filter((model) => model.providerId === "anthropic").map((model) => model.modelId),
      ),
    ).toEqual(new Set(llmProviderContentEditoralog.anthropic.models));
    expect(
      new Set(
        catalog
          .filter((model) => model.providerId === "gemini" && model.access === "byok")
          .map((model) => model.modelId),
      ),
    ).toEqual(new Set(llmProviderContentEditoralog.gemini.models));
    expect(catalog.find((model) => model.modelId === "claude-sonnet-5")?.billingLabel).toBe(
      "Your account",
    );
    expect(catalog.filter((model) => model.recommended).map((model) => model.name)).toEqual([
      "GPT-6 Luna",
      "GPT-6 Luna Fast",
      "GPT-6.1 Sol",
      "Claude Sonnet 5",
      "Claude Opus 5.5",
      "Gemini 3.8 Flash",
      "Fish Audio",
      "Gemini transcription",
      "GPT Image",
      "Seedance",
    ]);
  });

  it("lists eight AI feature capabilities", () => {
    const features = getPricingAiFeatures("en");

    expect(features).toHaveLength(8);
    expect(features.map((feature) => feature.id)).toEqual([
      "ask-about-any-string",
      "visual-context",
      "translate-in-chat",
      "recent-change-briefs",
      "organization-memory",
      "tms-aware-drafting-qa",
      "agent-automations",
      "bring-your-own-llm",
    ]);
    expect(features.map((feature) => feature.title)).toEqual([
      "Ask about any string",
      "See the UI context",
      "Translate in chat",
      "Catch what changed",
      "Remember your rules",
      "Draft and check in your TMS",
      "Automate the busywork",
      "Use the model you prefer",
    ]);
    expect(features.map((feature) => feature.description)).toEqual([
      "Get meaning, where it appears in the product, and how to translate it.",
      "Screenshots so reviewers know where copy shows up.",
      "Send files, text, or images in web, Slack, or email.",
      "Briefs on new or updated source copy, with context.",
      "Keep tone and terminology guidance for the next job.",
      "Fill missing locales and run QA while people stay in control.",
      "Sync, validate, and notify the team on a schedule or when something lands.",
      "OpenAI, Anthropic, or Gemini — without changing how you work.",
    ]);
  });

  it("builds matching FAQ content and FAQPage structured data", () => {
    const items = getPricingFaqItems("en");
    const jsonLd = buildPricingFaqJsonLd("en", items);

    expect(items.length).toBeGreaterThan(0);
    expect(jsonLd).toMatchObject({
      "@type": "FAQPage",
      inLanguage: "en",
      mainEntity: items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  });
});
