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
import {
  ContentOpsAgentTerminal,
  type ContentOpsTerminalScene,
} from "./content-ops-agent-terminal";
import { ContentOpsBrandPanel, type BrandPlaybackPhase } from "./content-ops-brand-panel";
import { ContentOpsEditorPanel } from "./content-ops-editor-panel";
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
  "editor",
];

const MESH_BY_TAB: Record<ContentOpsMockTabId, string> = {
  triage: SAGE_MESH_GRADIENT_SRC,
  campaign: LAVENDER_MESH_GRADIENT_SRC,
  "seo-blog": SAGE_MESH_GRADIENT_SRC,
  brand: LAVENDER_MESH_GRADIENT_SRC,
  "brief-to-publish": SAGE_MESH_GRADIENT_SRC,
  editor: LAVENDER_MESH_GRADIENT_SRC,
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
  { id: "editor", labelKey: "tabEditor" },
];

type ActivityMessages = typeof contentOpsMockStageMessages;

function activityMsg(
  intl: ReturnType<typeof useIntl>,
  timeKey: keyof ActivityMessages,
  sourceKey: keyof ActivityMessages,
  messageKey: keyof ActivityMessages,
): ContentOpsActivityItem {
  return {
    time: intl.formatMessage(contentOpsMockStageMessages[timeKey]),
    source: intl.formatMessage(contentOpsMockStageMessages[sourceKey]),
    message: intl.formatMessage(contentOpsMockStageMessages[messageKey]),
  };
}

function activityIssue(
  intl: ReturnType<typeof useIntl>,
  timeKey: keyof ActivityMessages,
  issueId: string,
  messageKey: keyof ActivityMessages,
): ContentOpsActivityItem {
  return {
    time: intl.formatMessage(contentOpsMockStageMessages[timeKey]),
    source: issueId,
    message: intl.formatMessage(contentOpsMockStageMessages[messageKey]),
  };
}

function useActivityItems(tabId: ContentOpsMockTabId, stepIndex: number): ContentOpsActivityItem[] {
  const intl = useIntl();

  return useMemo(() => {
    const triageSets: ContentOpsActivityItem[][] = [
      [
        activityIssue(intl, "activityTimeNow", "WEB-2", "activityTriageAssignedFrCheckout"),
        activityIssue(intl, "activityTime4m", "MOB-1", "activityTriageGlossaryBreakEs"),
        activityIssue(intl, "activityTime10m", "WEB-3", "activityTriageQaResolvedDe"),
      ],
      [
        activityIssue(intl, "activityTimeNow", "MOB-1", "activityTriageGlossaryBreakEs"),
        activityIssue(intl, "activityTime4m", "WEB-2", "activityTriageInProgressPayment"),
        activityMsg(intl, "activityTime10m", "activitySourceCat", "activityTriageOpenInCat"),
      ],
      [
        activityIssue(intl, "activityTimeNow", "WEB-3", "activityTriageResolvedHero"),
        activityIssue(intl, "activityTime6m", "WEB-2", "activityTriageMistakeFr"),
        activityMsg(intl, "activityTime12m", "activitySourceQa", "activityTriageLengthFailedDe"),
      ],
    ];

    const campaignSets: ContentOpsActivityItem[][] = [
      [
        activityMsg(intl, "activityTimeNow", "activitySourceBrief", "activityCampaignQ2Launch"),
        activityMsg(
          intl,
          "activityTime4m",
          "activitySourceDrafts",
          "activityCampaignLandingDrafts",
        ),
        activityMsg(intl, "activityTime8m", "activitySourceReview", "activityCampaignFrDeQueued"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceAgent", "stepGtm2"),
        activityMsg(intl, "activityTime4m", "activitySourceBrief", "stepGtm1"),
        activityMsg(intl, "activityTime8m", "activitySourceReview", "stepGtm3"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceReview", "stepGtm3"),
        activityMsg(intl, "activityTime4m", "activitySourceStaging", "stepGtm4"),
        activityMsg(intl, "activityTime8m", "activitySourceSlack", "activityCampaignNotifiedGtm"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceStaging", "stepGtm4"),
        activityMsg(
          intl,
          "activityTime6m",
          "activitySourceCms",
          "activityCampaignPublishedStaging",
        ),
        activityMsg(
          intl,
          "activityTime10m",
          "activitySourceBrief",
          "activityCampaignBriefComplete",
        ),
      ],
    ];

    const seoSets: ContentOpsActivityItem[][] = [
      [
        activityMsg(intl, "activityTimeNow", "activitySourceResearch", "activitySeoPullingVolume"),
        activityMsg(intl, "activityTime4m", "activitySourceLocales", "activitySeoLocalesCompared"),
        activityMsg(intl, "activityTime8m", "activitySourceGaps", "stepSeo3"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceGaps", "stepSeo3"),
        activityMsg(intl, "activityTime4m", "activitySourceDraft", "stepSeo4"),
        activityMsg(intl, "activityTime8m", "activitySourceQa", "activitySeoMetaH1De"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceDraft", "stepSeo4"),
        activityMsg(intl, "activityTime4m", "activitySourceCms", "stepSeo5"),
        activityMsg(intl, "activityTime8m", "activitySourceSlack", "activitySeoNotifiedContent"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceCms", "stepSeo5"),
        activityMsg(intl, "activityTime6m", "activitySourceResearch", "activitySeoMonthlyComplete"),
        activityMsg(intl, "activityTime10m", "activitySourceGaps", "stepSeo3"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourcePublish", "activitySeoDeDraftReview"),
        activityMsg(intl, "activityTime5m", "activitySourceIntent", "activitySeoLocalSearchIntent"),
        activityMsg(intl, "activityTime9m", "activitySourceSchedule", "activitySeoNextRun"),
      ],
    ];

    const brandSets: ContentOpsActivityItem[][] = [
      [
        activityMsg(intl, "activityTimeNow", "activitySourceChat", "activityBrandReviewAsked"),
        activityMsg(intl, "activityTime4m", "activitySourceGuide", "activityBrandGuideRecalled"),
        activityMsg(
          intl,
          "activityTime8m",
          "activitySourceVerdict",
          "activityBrandOffBrandRewrite",
        ),
      ],
      [
        activityMsg(
          intl,
          "activityTimeNow",
          "activitySourceKnowledge",
          "activityBrandGuideMatched",
        ),
        activityMsg(intl, "activityTime4m", "activitySourceRule", "activityBrandToneRule"),
        activityMsg(intl, "activityTime8m", "activitySourceCopy", "activityBrandSuggestedCopy"),
      ],
      [
        activityMsg(
          intl,
          "activityTimeNow",
          "activitySourceApplied",
          "activityBrandCorrectionApplied",
        ),
        activityMsg(intl, "activityTime5m", "activitySourceChat", "activityBrandReviewAsked"),
        activityMsg(intl, "activityTime10m", "activitySourceGuide", "activityBrandCtaLengthRule"),
      ],
    ];

    const flowSets: ContentOpsActivityItem[][] = [
      [
        activityMsg(intl, "activityTimeNow", "activitySourceFlow", "activityFlowWorkflowActive"),
        activityMsg(intl, "activityTime4m", "activitySourceStep", "activityFlowGtmBriefReceived"),
        activityMsg(intl, "activityTime8m", "activitySourceHandoff", "activityFlowRoutingLocalise"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceLocalise", "activityFlowLocaleDrafts"),
        activityMsg(intl, "activityTime4m", "activitySourceBrandQa", "activityFlowStyleChecking"),
        activityMsg(intl, "activityTime8m", "activitySourceReview", "activityFlowReviewerQueue"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceCms", "activityFlowDraftReady"),
        activityMsg(intl, "activityTime4m", "activitySourceSlack", "activityFlowTeamNotified"),
        activityMsg(intl, "activityTime8m", "activitySourceFlow", "activityFlowComplete"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceTemplate", "activityFlowSeoSelected"),
        activityMsg(intl, "activityTime4m", "activitySourceKeywords", "activityFlowResearchActive"),
        activityMsg(intl, "activityTime8m", "activitySourceDraft", "activityFlowCmsHandoff"),
      ],
      [
        activityMsg(
          intl,
          "activityTimeNow",
          "activitySourceTemplate",
          "activityFlowCampaignSelected",
        ),
        activityMsg(intl, "activityTime4m", "activitySourceStaging", "activityFlowAssetsRouted"),
        activityMsg(intl, "activityTime8m", "activitySourceSlack", "activityFlowLaunchNotified"),
      ],
    ];

    const editorSets: ContentOpsActivityItem[][] = [
      [
        activityMsg(intl, "activityTimeNow", "activitySourceEditor", "activityEditorFileOpened"),
        activityMsg(
          intl,
          "activityTime4m",
          "activitySourceSegment",
          "activityEditorHeroNeedsReview",
        ),
        activityMsg(intl, "activityTime8m", "activitySourceQueue", "activityEditorSegmentsFlagged"),
      ],
      [
        activityMsg(
          intl,
          "activityTimeNow",
          "activitySourceGlossary",
          "activityEditorTermMismatch",
        ),
        activityMsg(intl, "activityTime4m", "activitySourceQa", "activityEditorTermSuggested"),
        activityMsg(intl, "activityTime8m", "activitySourceEditor", "activityEditorGlossaryCheck"),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceIssues", "activityEditorIssueLinked"),
        activityIssue(intl, "activityTime4m", "MOB-1", "activityEditorOpenQuestion"),
        activityMsg(
          intl,
          "activityTime8m",
          "activitySourceTriage",
          "activityEditorOpenedFromTriage",
        ),
      ],
      [
        activityMsg(intl, "activityTimeNow", "activitySourceIntelligence", "activityEditorTmMatch"),
        activityMsg(intl, "activityTime4m", "activitySourceContext", "activityEditorContextLoaded"),
        activityMsg(intl, "activityTime8m", "activitySourceAi", "activityEditorSuggestionReady"),
      ],
    ];

    const setsByTab: Record<ContentOpsMockTabId, ContentOpsActivityItem[][]> = {
      triage: triageSets,
      campaign: campaignSets,
      "seo-blog": seoSets,
      brand: brandSets,
      "brief-to-publish": flowSets,
      editor: editorSets,
    };

    const sets = setsByTab[tabId];
    return sets[Math.min(stepIndex, sets.length - 1)] ?? sets[0]!;
  }, [intl, stepIndex, tabId]);
}

export function ContentOpsMockStage({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [activeTab, setActiveTab] = useState<ContentOpsMockTabId>("triage");
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
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
    setAutoplayEnabled(false);
    setActiveTab(tabId);
    setPlaybackStep(0);
  }, []);

  const handleAutoplayToggle = useCallback(() => {
    setAutoplayEnabled((enabled) => !enabled);
  }, []);

  const handleBrandPhaseChange = useCallback((phase: BrandPlaybackPhase) => {
    if (phase === "done") {
      setPlaybackStep(2);
    } else if (phase === "playing") {
      setPlaybackStep(0);
    }
  }, []);

  useEffect(() => {
    if (!autoplayEnabled || shouldReduceMotion) {
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
  }, [activeTab, autoplayEnabled, shouldReduceMotion]);

  const handleStepIndexChange = useCallback((stepIndex: number) => {
    setPlaybackStep(stepIndex);
  }, []);

  const handleFlowNodeChange = useCallback((nodeIndex: number) => {
    setPlaybackStep(nodeIndex);
  }, []);

  const pauseAutoplay = !autoplayEnabled || shouldReduceMotion;

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

      <ContentOpsActivityFeed
        items={activityItems}
        autoplayEnabled={autoplayEnabled && !shouldReduceMotion}
        onAutoplayToggle={handleAutoplayToggle}
      />

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
                onPhaseChange={handleBrandPhaseChange}
              />
            ) : null}
            {activeTab === "brief-to-publish" ? (
              <ContentOpsFlowPanel
                pauseAutoplay={pauseAutoplay}
                onActiveNodeChange={handleFlowNodeChange}
              />
            ) : null}
            {activeTab === "editor" ? (
              <ContentOpsEditorPanel
                pauseAutoplay={pauseAutoplay}
                onSceneChange={handleStepIndexChange}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </MeshStage>
    </div>
  );
}
