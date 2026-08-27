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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock01Icon, Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";

import {
  LAVENDER_MESH_GRADIENT_SRC,
  MeshStage,
  SAGE_MESH_GRADIENT_SRC,
} from "@/components/marketing/hero-frame-mesh-stage";
import { cn } from "@/lib/primitives/cn";

import {
  ContentOpsActivityFeed,
  type ContentOpsActivityItem,
  type ContentOpsMockTabId,
} from "./content-ops-activity-feed";
import { ContentOpsAgentTerminal, type ContentOpsTerminalScene } from "./content-ops-agent-terminal";
import { ContentOpsBrandPanel } from "./content-ops-brand-panel";
import { ContentOpsFlowPanel } from "./content-ops-flow-panel";
import { ContentOpsIssuesPanel } from "./content-ops-issues-panel";
import { contentOpsMockStageMessages } from "./content-ops-mock-stage.messages";

const TAB_HOLD_MS = 9000;
const TAB_ORDER: ContentOpsMockTabId[] = [
  "triage",
  "campaign",
  "seo-blog",
  "brand",
  "brief-to-publish",
];

const MESH_BY_TAB: Record<ContentOpsMockTabId, string> = {
  triage: SAGE_MESH_GRADIENT_SRC,
  campaign: LAVENDER_MESH_GRADIENT_SRC,
  "seo-blog": SAGE_MESH_GRADIENT_SRC,
  brand: LAVENDER_MESH_GRADIENT_SRC,
  "brief-to-publish": SAGE_MESH_GRADIENT_SRC,
};

type TabConfig = {
  id: ContentOpsMockTabId;
  labelKey: keyof typeof contentOpsMockStageMessages;
};

const TABS: TabConfig[] = [
  { id: "triage", labelKey: "tabTriage" },
  { id: "campaign", labelKey: "tabCampaign" },
  { id: "seo-blog", labelKey: "tabSeoBlog" },
  { id: "brand", labelKey: "tabBrand" },
  { id: "brief-to-publish", labelKey: "tabBriefToPublish" },
];

function useActivityItems(
  tabId: ContentOpsMockTabId,
  stepIndex: number,
): ContentOpsActivityItem[] {
  const intl = useIntl();

  return useMemo(() => {
    const triageSets: ContentOpsActivityItem[][] = [
      [
        { time: "now", source: "WEB-2", message: "Assigned · FR checkout CTA too long" },
        { time: "4m", source: "MOB-1", message: "Glossary break · es-ES · unassigned" },
        { time: "10m", source: "WEB-3", message: "QA failure resolved · de-DE headline" },
      ],
      [
        { time: "now", source: "MOB-1", message: "Glossary break · es-ES · unassigned" },
        { time: "4m", source: "WEB-2", message: "In progress · payment button label" },
        { time: "10m", source: "CAT", message: "Open in CAT · checkout.json" },
      ],
      [
        { time: "now", source: "WEB-3", message: "Resolved · hero headline length check" },
        { time: "6m", source: "WEB-2", message: "Translation mistake flagged · fr-FR" },
        { time: "12m", source: "QA", message: "Length check failed · de-DE" },
      ],
    ];

    const campaignSets: ContentOpsActivityItem[][] = [
      [
        { time: "now", source: "Brief", message: "Q2 launch · 4 markets · 12 assets" },
        { time: "4m", source: "Drafts", message: "Localized landing pages generating" },
        { time: "8m", source: "Review", message: "FR and DE queued" },
      ],
      [
        { time: "now", source: "Agent", message: intl.formatMessage(contentOpsMockStageMessages.stepGtm2) },
        { time: "4m", source: "Brief", message: intl.formatMessage(contentOpsMockStageMessages.stepGtm1) },
        { time: "8m", source: "Review", message: intl.formatMessage(contentOpsMockStageMessages.stepGtm3) },
      ],
      [
        { time: "now", source: "Review", message: intl.formatMessage(contentOpsMockStageMessages.stepGtm3) },
        { time: "4m", source: "Staging", message: intl.formatMessage(contentOpsMockStageMessages.stepGtm4) },
        { time: "8m", source: "Slack", message: "Notified #gtm" },
      ],
      [
        { time: "now", source: "Staging", message: intl.formatMessage(contentOpsMockStageMessages.stepGtm4) },
        { time: "6m", source: "CMS", message: "12 assets published to staging" },
        { time: "10m", source: "Brief", message: "Q2 launch brief complete" },
      ],
    ];

    const seoStep3 = intl.formatMessage(contentOpsMockStageMessages.stepSeo3);
    const seoSets: ContentOpsActivityItem[][] = [
      [
        { time: "now", source: "Research", message: "Pulling search volume · core terms" },
        { time: "4m", source: "Locales", message: "EN · FR · DE · JA compared" },
        { time: "8m", source: "Gaps", message: seoStep3 },
      ],
      [
        { time: "now", source: "Gaps", message: seoStep3 },
        { time: "4m", source: "Draft", message: intl.formatMessage(contentOpsMockStageMessages.stepSeo4) },
        { time: "8m", source: "QA", message: "Meta + H1 adapted for DE intent" },
      ],
      [
        { time: "now", source: "Draft", message: intl.formatMessage(contentOpsMockStageMessages.stepSeo4) },
        { time: "4m", source: "CMS", message: intl.formatMessage(contentOpsMockStageMessages.stepSeo5) },
        { time: "8m", source: "Slack", message: "Notified #content" },
      ],
      [
        { time: "now", source: "CMS", message: intl.formatMessage(contentOpsMockStageMessages.stepSeo5) },
        { time: "6m", source: "Research", message: "Monthly SEO run complete" },
        { time: "10m", source: "Gaps", message: seoStep3 },
      ],
      [
        { time: "now", source: "Publish", message: "DE SEO draft awaiting review" },
        { time: "5m", source: "Intent", message: "Adapted for local search · not literal EN→DE" },
        { time: "9m", source: "Schedule", message: "Next run · 1st of month" },
      ],
    ];

    const brandSets: ContentOpsActivityItem[][] = [
      [
        { time: "now", source: "Chat", message: "Brand review asked · DE checkout CTA" },
        { time: "4m", source: "Guide", message: "Style guide recalled · tone + CTA rules" },
        { time: "8m", source: "Verdict", message: "Off-brand · suggested rewrite ready" },
      ],
      [
        { time: "now", source: "Knowledge", message: "brand-voice-style-guide.pdf matched" },
        { time: "4m", source: "Rule", message: "Tone: friendly, direct" },
        { time: "8m", source: "Copy", message: "Suggested · Jetzt starten" },
      ],
      [
        { time: "now", source: "Applied", message: "Style correction applied to DE CTA" },
        { time: "5m", source: "Chat", message: "Brand review asked · DE checkout CTA" },
        { time: "10m", source: "Guide", message: "CTA length rule enforced" },
      ],
    ];

    const flowSets: ContentOpsActivityItem[][] = [
      [
        { time: "now", source: "Flow", message: "Brief to publish · workflow active" },
        { time: "4m", source: "Step", message: "GTM brief received" },
        { time: "8m", source: "Handoff", message: "Routing to localise" },
      ],
      [
        { time: "now", source: "Localise", message: "Locale drafts in progress" },
        { time: "4m", source: "Brand QA", message: "Style rules checking" },
        { time: "8m", source: "Review", message: "Reviewer queue updated" },
      ],
      [
        { time: "now", source: "CMS", message: "Draft ready for publish" },
        { time: "4m", source: "Slack", message: "Team notified · #content" },
        { time: "8m", source: "Flow", message: "Brief to publish complete" },
      ],
      [
        { time: "now", source: "Template", message: "SEO blog workflow selected" },
        { time: "4m", source: "Keywords", message: "Research node active" },
        { time: "8m", source: "Draft", message: "CMS draft handoff" },
      ],
      [
        { time: "now", source: "Template", message: "Campaign workflow selected" },
        { time: "4m", source: "Staging", message: "Assets routed for review" },
        { time: "8m", source: "Slack", message: "Launch channel notified" },
      ],
    ];

    const setsByTab: Record<ContentOpsMockTabId, ContentOpsActivityItem[][]> = {
      triage: triageSets,
      campaign: campaignSets,
      "seo-blog": seoSets,
      brand: brandSets,
      "brief-to-publish": flowSets,
    };

    const sets = setsByTab[tabId];
    return sets[Math.min(stepIndex, sets.length - 1)] ?? sets[0]!;
  }, [intl, stepIndex, tabId]);
}

export function ContentOpsMockStage({ className, priority = false }: { className?: string; priority?: boolean }) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [activeTab, setActiveTab] = useState<ContentOpsMockTabId>("triage");
  const [isPaused, setIsPaused] = useState(false);
  const [playbackStep, setPlaybackStep] = useState(0);

  const campaignScene: ContentOpsTerminalScene = useMemo(
    () => ({
      id: "campaign",
      triggerIcon: <HugeiconsIcon icon={Rocket01Icon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(contentOpsMockStageMessages.triggerGtmBrief),
      tools: [
        intl.formatMessage(contentOpsMockStageMessages.toolCms),
        intl.formatMessage(contentOpsMockStageMessages.toolTranslate),
        intl.formatMessage(contentOpsMockStageMessages.toolSlack),
      ],
      steps: [
        intl.formatMessage(contentOpsMockStageMessages.stepGtm1),
        intl.formatMessage(contentOpsMockStageMessages.stepGtm2),
        intl.formatMessage(contentOpsMockStageMessages.stepGtm3),
        intl.formatMessage(contentOpsMockStageMessages.stepGtm4),
      ],
    }),
    [intl],
  );

  const seoScene: ContentOpsTerminalScene = useMemo(() => {
    const highlightStep = intl.formatMessage(contentOpsMockStageMessages.stepSeo3);
    return {
      id: "seo-blog",
      triggerIcon: <HugeiconsIcon icon={Clock01Icon} strokeWidth={1.8} className="size-3" />,
      triggerLabel: intl.formatMessage(contentOpsMockStageMessages.triggerSeoSchedule),
      tools: [
        intl.formatMessage(contentOpsMockStageMessages.toolSearch),
        intl.formatMessage(contentOpsMockStageMessages.toolAhrefs),
        intl.formatMessage(contentOpsMockStageMessages.toolCms),
        intl.formatMessage(contentOpsMockStageMessages.toolSlack),
      ],
      steps: [
        intl.formatMessage(contentOpsMockStageMessages.stepSeo1),
        intl.formatMessage(contentOpsMockStageMessages.stepSeo2),
        highlightStep,
        intl.formatMessage(contentOpsMockStageMessages.stepSeo4),
        intl.formatMessage(contentOpsMockStageMessages.stepSeo5),
      ],
      highlightSteps: new Set([highlightStep]),
    };
  }, [intl]);

  const activityItems = useActivityItems(activeTab, playbackStep);

  const handleTabSelect = useCallback((tabId: ContentOpsMockTabId) => {
    setIsPaused(true);
    setActiveTab(tabId);
    setPlaybackStep(0);
    window.setTimeout(() => setIsPaused(false), 600);
  }, []);

  useEffect(() => {
    if (isPaused || shouldReduceMotion) {
      return;
    }

    const timer = window.setTimeout(() => {
      setActiveTab((current) => {
        const index = TAB_ORDER.indexOf(current);
        const next = TAB_ORDER[(index + 1) % TAB_ORDER.length]!;
        return next;
      });
      setPlaybackStep(0);
    }, TAB_HOLD_MS);

    return () => window.clearTimeout(timer);
  }, [activeTab, isPaused, shouldReduceMotion]);

  const handleStepIndexChange = useCallback((stepIndex: number) => {
    setPlaybackStep(stepIndex);
  }, []);

  const handleFlowNodeChange = useCallback((nodeIndex: number) => {
    setPlaybackStep(nodeIndex);
  }, []);

  const pauseAutoplay = isPaused || shouldReduceMotion;

  useEffect(() => {
    if (activeTab !== "triage" || pauseAutoplay) {
      return;
    }

    const timer = window.setInterval(() => {
      setPlaybackStep((step) => step + 1);
    }, 2600);

    return () => window.clearInterval(timer);
  }, [activeTab, pauseAutoplay]);

  return (
    <div className={cn("space-y-5", className)}>
      <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabSelect(tab.id)}
            className={cn(
              "shrink-0 cursor-pointer rounded-full border px-4 py-2 text-left text-sm font-medium transition-all duration-200",
              activeTab === tab.id
                ? "border-primary/35 bg-primary/8 text-foreground shadow-sm"
                : "border-border/60 bg-background text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {intl.formatMessage(contentOpsMockStageMessages[tab.labelKey])}
          </button>
        ))}
      </div>

      <ContentOpsActivityFeed items={activityItems} />

      <MeshStage meshSrc={MESH_BY_TAB[activeTab]} priority={priority} layout="contained">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.19, 1, 0.22, 1] }}
            className="w-full"
          >
            {activeTab === "triage" ? (
              <ContentOpsIssuesPanel highlightedIndex={playbackStep % 3} />
            ) : null}
            {activeTab === "campaign" ? (
              <ContentOpsAgentTerminal
                scene={campaignScene}
                pauseAutoplay={pauseAutoplay}
                onStepIndexChange={handleStepIndexChange}
              />
            ) : null}
            {activeTab === "seo-blog" ? (
              <ContentOpsAgentTerminal
                scene={seoScene}
                pauseAutoplay={pauseAutoplay}
                onStepIndexChange={handleStepIndexChange}
              />
            ) : null}
            {activeTab === "brand" ? (
              <ContentOpsBrandPanel
                pauseAutoplay={pauseAutoplay}
                onPhaseChange={(phase) => {
                  if (phase === "done") {
                    setPlaybackStep(2);
                  } else if (phase === "playing") {
                    setPlaybackStep(0);
                  }
                }}
              />
            ) : null}
            {activeTab === "brief-to-publish" ? (
              <ContentOpsFlowPanel
                pauseAutoplay={pauseAutoplay}
                onActiveNodeChange={handleFlowNodeChange}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </MeshStage>
    </div>
  );
}
