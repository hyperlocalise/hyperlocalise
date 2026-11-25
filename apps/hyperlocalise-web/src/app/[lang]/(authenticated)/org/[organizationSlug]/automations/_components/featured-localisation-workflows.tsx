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
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CaretRightIcon,
  CheckCircleIcon,
  PencilSimpleLineIcon,
  SealCheckIcon,
  SlackLogoIcon,
  TranslateIcon,
  UploadSimpleIcon,
  UserCheckIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { FormattedMessage, type MessageDescriptor } from "react-intl";

import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { cn } from "@/lib/primitives/cn";
import {
  RECOMMENDED_VISUAL_WORKFLOW_TEMPLATE_ID,
  VISUAL_WORKFLOW_TEMPLATE_IDS,
  type VisualWorkflowTemplateId,
} from "@/lib/visual-workflows/templates/visual-workflow-templates";

import type { AutomationWorkflowAccess } from "./automations-create-page-view";
import { automationsCreatePageViewMessages as messages } from "./automations-create-page-view.messages";

type FlowStep = { icon: Icon; label: MessageDescriptor };

const STEP = {
  upload: { icon: UploadSimpleIcon, label: messages.stepUpload },
  aiTranslate: { icon: TranslateIcon, label: messages.stepAiTranslate },
  translate: { icon: TranslateIcon, label: messages.stepTranslate },
  postEdit: { icon: PencilSimpleLineIcon, label: messages.stepPostEdit },
  edit: { icon: PencilSimpleLineIcon, label: messages.stepEdit },
  proofread: { icon: UserCheckIcon, label: messages.stepProofread },
  taskDone: { icon: CheckCircleIcon, label: messages.stepTaskDone },
  qa: { icon: SealCheckIcon, label: messages.stepQa },
  fixOrShip: { icon: ArrowsClockwiseIcon, label: messages.stepFixOrShip },
  reviewIfNeeded: { icon: UserCheckIcon, label: messages.stepReviewIfNeeded },
  slack: { icon: SlackLogoIcon, label: messages.stepSlack },
} satisfies Record<string, FlowStep>;

const FEATURED_WORKFLOWS: Record<
  VisualWorkflowTemplateId,
  { title: MessageDescriptor; description: MessageDescriptor; steps: FlowStep[] }
> = {
  "ai-translate-on-upload": {
    title: messages.workflowTemplateAiTranslateTitle,
    description: messages.workflowTemplateAiTranslateDescription,
    steps: [STEP.upload, STEP.aiTranslate, STEP.qa, STEP.slack],
  },
  "mtpe-on-upload": {
    title: messages.workflowTemplateMtpeTitle,
    description: messages.workflowTemplateMtpeDescription,
    steps: [STEP.upload, STEP.aiTranslate, STEP.postEdit, STEP.slack],
  },
  "tep-on-upload": {
    title: messages.workflowTemplateTepTitle,
    description: messages.workflowTemplateTepDescription,
    steps: [STEP.upload, STEP.translate, STEP.edit, STEP.proofread],
  },
  "review-done-qa": {
    title: messages.workflowTemplateReviewDoneTitle,
    description: messages.workflowTemplateReviewDoneDescription,
    steps: [STEP.taskDone, STEP.qa, STEP.fixOrShip],
  },
  "ai-translate-qa-gate": {
    title: messages.workflowTemplateQaGateTitle,
    description: messages.workflowTemplateQaGateDescription,
    steps: [STEP.upload, STEP.aiTranslate, STEP.qa, STEP.reviewIfNeeded],
  },
};

function FlowStrip({ steps }: { steps: readonly FlowStep[] }) {
  return (
    <span aria-hidden className="mt-auto flex flex-wrap items-center gap-1 pt-1">
      {steps.map((step, index) => {
        const StepIcon = step.icon;
        return (
          <span key={index} className="inline-flex items-center gap-1">
            {index > 0 ? <CaretRightIcon className="size-3 text-muted-foreground/70" /> : null}
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-foreground">
              <StepIcon className="size-3.5 text-primary" />
              <FormattedMessage {...step.label} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function FeaturedWorkflowCardBody({
  templateId,
  footer,
}: {
  templateId: VisualWorkflowTemplateId;
  footer?: ReactNode;
}) {
  const workflow = FEATURED_WORKFLOWS[templateId];
  const recommended = templateId === RECOMMENDED_VISUAL_WORKFLOW_TEMPLATE_ID;
  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <span
          id={`featured-workflow-${templateId}-title`}
          className="font-sans text-base font-medium text-balance text-foreground"
        >
          <FormattedMessage {...workflow.title} />
        </span>
        {recommended ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            <FormattedMessage {...messages.workflowTemplateRecommended} />
          </span>
        ) : null}
      </span>
      <span
        id={`featured-workflow-${templateId}-description`}
        className="text-sm text-pretty text-muted-foreground"
      >
        <FormattedMessage {...workflow.description} />
      </span>
      <FlowStrip steps={workflow.steps} />
      {footer}
    </>
  );
}

const CARD_CLASS =
  "flex h-full flex-col gap-2 rounded-xl border border-border bg-card px-5 py-4 text-left";

/**
 * The localisation workflows most teams start with, shown first on the new automation page. A card
 * creates the workflow from its template and opens it on the canvas. Where the plan or role cannot
 * create workflows, the cards stay visible and say why.
 */
export function FeaturedLocalisationWorkflows({
  access,
  organizationSlug,
  creatingTemplateId,
  disabled,
  onCreate,
}: {
  access: Exclude<AutomationWorkflowAccess, "hidden">;
  organizationSlug: string;
  creatingTemplateId: VisualWorkflowTemplateId | null;
  disabled: boolean;
  onCreate: (templateId: VisualWorkflowTemplateId) => void;
}) {
  const available = access === "available";

  return (
    <section
      aria-labelledby="featured-workflows-title"
      className="flex flex-col gap-5 rounded-2xl border border-border bg-muted/40 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="featured-workflows-title"
            className="font-sans text-lg font-medium text-balance text-foreground"
          >
            <FormattedMessage {...messages.workflowTemplatesTitle} />
          </h2>
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
            <FormattedMessage {...messages.workflowTemplatesDescription} />
          </p>
        </div>
        {access === "upgrade" ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.workflowUpgradeNote} />
            </span>
            <UpgradePlanButton organizationSlug={organizationSlug} />
          </div>
        ) : access === "restricted" ? (
          <span className="text-xs text-muted-foreground">
            <FormattedMessage {...messages.workflowRestrictedNote} />
          </span>
        ) : null}
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {VISUAL_WORKFLOW_TEMPLATE_IDS.map((templateId) => {
          const creating = creatingTemplateId === templateId;
          return (
            <li key={templateId}>
              {available ? (
                <button
                  type="button"
                  className={cn(
                    CARD_CLASS,
                    "group w-full transition-colors outline-none hover:border-primary/40 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  )}
                  disabled={disabled}
                  aria-busy={creating}
                  aria-labelledby={`featured-workflow-${templateId}-title`}
                  aria-describedby={`featured-workflow-${templateId}-description`}
                  onClick={() => onCreate(templateId)}
                >
                  <FeaturedWorkflowCardBody
                    templateId={templateId}
                    footer={
                      <span className="inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary">
                        <FormattedMessage
                          {...(creating ? messages.workflowCreating : messages.useTemplate)}
                        />
                        {creating ? null : (
                          <ArrowRightIcon
                            aria-hidden
                            className="size-3 transition-transform group-hover:translate-x-0.5"
                          />
                        )}
                      </span>
                    }
                  />
                </button>
              ) : (
                <div className={cn(CARD_CLASS, "opacity-70")}>
                  <FeaturedWorkflowCardBody templateId={templateId} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
