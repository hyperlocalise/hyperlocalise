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
import { useMemo, useState, type ReactNode } from "react";
import { LightningIcon, LockSimpleIcon, TranslateIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import {
  workspaceAutomationTemplateMatchesCategory,
  type WorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplateCategory,
} from "@/lib/agents/workspace-automation-templates";
import { cn } from "@/lib/primitives/cn";
import {
  VISUAL_WORKFLOW_TEMPLATE_IDS,
  type VisualWorkflowTemplateId,
} from "@/lib/visual-workflows/templates/visual-workflow-templates";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { AutomationAssistantPrompt } from "./automation-assistant-prompt";
import { AutomationIconTile } from "./automation-icon-tile";
import {
  AutomationTemplateCard,
  defaultRenderAutomationLink,
  type AutomationsLinkRenderer,
} from "./automation-template-card";
import { automationsCreatePageViewMessages as messages } from "./automations-create-page-view.messages";
import { AUTOMATION_TYPE_ICONS, type AutomationsPageAssistant } from "./automations-page-view";
import { automationsPageViewMessages } from "./automations-page-view.messages";
import {
  resolveTemplateCategoryTabs,
  resolveUsableAutomationTemplates,
} from "./automations-page-view-model";

/** How many templates show before "Show all", so the page stays a choice and not a catalogue. */
const COLLAPSED_TEMPLATE_COUNT = 6;

const TEMPLATE_CATEGORY_MESSAGES = {
  popular: automationsPageViewMessages.categoryPopular,
  "source-content": automationsPageViewMessages.categorySourceContent,
  marketing: automationsPageViewMessages.categoryMarketing,
  "translation-delivery": automationsPageViewMessages.categoryTranslationDelivery,
  quality: automationsPageViewMessages.categoryQuality,
  release: automationsPageViewMessages.categoryRelease,
} as const;

/**
 * Whether this person can start a workflow: on a plan without workflows the card offers an
 * upgrade, and a role that cannot create them sees why. A project's page leaves the card out.
 */
export type AutomationWorkflowAccess = "available" | "upgrade" | "restricted" | "hidden";

const BUILD_CARD_CLASS =
  "flex h-full flex-col gap-3 rounded-xl border border-border bg-card px-5 py-5 text-left";
const BUILD_CARD_INTERACTIVE_CLASS =
  "transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";

function BuildCardBody({
  type,
  title,
  badge,
  description,
  bestFor,
  footer,
}: {
  type: "agent" | "workflow";
  title: ReactNode;
  badge?: ReactNode;
  description: ReactNode;
  bestFor: ReactNode;
  footer?: ReactNode;
}) {
  const TypeIcon = AUTOMATION_TYPE_ICONS[type];

  return (
    <>
      <div className="flex items-center gap-3">
        <AutomationIconTile tone="builtIn" className="size-9 rounded-lg">
          <TypeIcon className="size-5" />
        </AutomationIconTile>
        <span className="font-sans text-base font-medium text-foreground">{title}</span>
        {badge}
      </div>
      <p className="text-sm text-pretty text-foreground">{description}</p>
      <p className="text-xs text-pretty text-muted-foreground">{bestFor}</p>
      {footer ? <div className="mt-auto pt-1">{footer}</div> : null}
    </>
  );
}

function WorkflowCard({
  access,
  organizationSlug,
  creating,
  disabled,
  onCreate,
}: {
  access: Exclude<AutomationWorkflowAccess, "hidden">;
  organizationSlug: string;
  creating: boolean;
  /** Another workflow, such as one from a template, is being created. */
  disabled: boolean;
  onCreate: () => void;
}) {
  const body = {
    type: "workflow" as const,
    title: <FormattedMessage {...messages.workflowTitle} />,
    description: <FormattedMessage {...messages.workflowDescription} />,
    bestFor: <FormattedMessage {...messages.workflowBestFor} />,
  };

  if (access === "available") {
    return (
      <button
        type="button"
        className={cn(BUILD_CARD_CLASS, BUILD_CARD_INTERACTIVE_CLASS, "disabled:opacity-60")}
        disabled={disabled}
        aria-busy={creating}
        onClick={() => onCreate()}
      >
        <BuildCardBody
          {...body}
          footer={
            creating ? (
              <span className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.workflowCreating} />
              </span>
            ) : null
          }
        />
      </button>
    );
  }

  return (
    <div className={cn(BUILD_CARD_CLASS, "bg-muted/40")}>
      <BuildCardBody
        {...body}
        badge={
          access === "upgrade" ? (
            <Badge variant="outline">
              <FormattedMessage {...messages.workflowUpgrade} />
            </Badge>
          ) : (
            <LockSimpleIcon aria-hidden className="size-4 text-muted-foreground" />
          )
        }
        footer={
          access === "upgrade" ? (
            <div className="flex flex-col items-start gap-2">
              <span className="text-xs text-muted-foreground">
                <FormattedMessage {...messages.workflowUpgradeNote} />
              </span>
              <UpgradePlanButton organizationSlug={organizationSlug} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              <FormattedMessage {...messages.workflowRestrictedNote} />
            </span>
          )
        }
      />
    </div>
  );
}

const WORKFLOW_TEMPLATE_MESSAGES = {
  "ai-translate-on-upload": {
    title: messages.workflowTemplateAiTranslateTitle,
    description: messages.workflowTemplateAiTranslateDescription,
  },
  "mtpe-on-upload": {
    title: messages.workflowTemplateMtpeTitle,
    description: messages.workflowTemplateMtpeDescription,
  },
  "tep-on-upload": {
    title: messages.workflowTemplateTepTitle,
    description: messages.workflowTemplateTepDescription,
  },
  "review-done-qa": {
    title: messages.workflowTemplateReviewDoneTitle,
    description: messages.workflowTemplateReviewDoneDescription,
  },
} as const satisfies Record<VisualWorkflowTemplateId, unknown>;

function WorkflowTemplateSection({
  creatingTemplateId,
  disabled,
  onCreate,
}: {
  creatingTemplateId: VisualWorkflowTemplateId | null;
  disabled: boolean;
  onCreate: (templateId: VisualWorkflowTemplateId) => void;
}) {
  return (
    <section aria-labelledby="workflow-templates-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2
          id="workflow-templates-title"
          className="font-sans text-base font-medium text-balance text-foreground"
        >
          <FormattedMessage {...messages.workflowTemplatesTitle} />
        </h2>
        <TypographyP tone="subtle">
          <FormattedMessage {...messages.workflowTemplatesDescription} />
        </TypographyP>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {VISUAL_WORKFLOW_TEMPLATE_IDS.map((templateId) => {
          const creating = creatingTemplateId === templateId;
          return (
            <button
              key={templateId}
              type="button"
              className={cn(BUILD_CARD_CLASS, BUILD_CARD_INTERACTIVE_CLASS, "disabled:opacity-60")}
              disabled={disabled}
              aria-busy={creating}
              onClick={() => onCreate(templateId)}
            >
              <div className="flex items-center gap-3">
                <AutomationIconTile tone="builtIn" className="size-9 rounded-lg">
                  <TranslateIcon className="size-5" />
                </AutomationIconTile>
                <span className="font-sans text-base font-medium text-foreground">
                  <FormattedMessage {...WORKFLOW_TEMPLATE_MESSAGES[templateId].title} />
                </span>
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                <FormattedMessage {...WORKFLOW_TEMPLATE_MESSAGES[templateId].description} />
              </p>
              {creating ? (
                <span className="mt-auto pt-1 text-xs text-muted-foreground">
                  <FormattedMessage {...messages.workflowCreating} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Where a new automation starts: describe it to the assistant, choose to build an agent or a
 * workflow yourself, or begin from a template.
 */
export function AutomationsCreatePageView({
  organizationSlug,
  projectId,
  templates,
  assistant,
  workflowAccess,
  creatingWorkflow = false,
  creatingTemplateId = null,
  onCreateWorkflow,
  renderAutomationLink = defaultRenderAutomationLink,
}: {
  organizationSlug: string;
  projectId?: string;
  templates: WorkspaceAutomationTemplate[];
  assistant?: AutomationsPageAssistant;
  workflowAccess: AutomationWorkflowAccess;
  creatingWorkflow?: boolean;
  /** The template a workflow is being created from, while it is. */
  creatingTemplateId?: VisualWorkflowTemplateId | null;
  /** Starts a blank workflow, or one from a template. */
  onCreateWorkflow: (templateId?: VisualWorkflowTemplateId) => void;
  renderAutomationLink?: AutomationsLinkRenderer;
}) {
  const intl = useIntl();
  const automationsBasePath = buildAutomationsPath(organizationSlug, { projectId });
  const [templateCategory, setTemplateCategory] =
    useState<WorkspaceAutomationTemplateCategory>("popular");
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  const usableTemplates = useMemo(() => resolveUsableAutomationTemplates(templates), [templates]);
  const templateCategoryTabs = useMemo(
    () => resolveTemplateCategoryTabs(usableTemplates),
    [usableTemplates],
  );
  const categoryTemplates = useMemo(
    () =>
      usableTemplates.filter((template) =>
        workspaceAutomationTemplateMatchesCategory(template, templateCategory),
      ),
    [templateCategory, usableTemplates],
  );
  const shownTemplates = showAllTemplates
    ? categoryTemplates
    : categoryTemplates.slice(0, COLLAPSED_TEMPLATE_COUNT);

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={LightningIcon}
        label={intl.formatMessage(
          projectId
            ? automationsPageViewMessages.pageLabelProject
            : automationsPageViewMessages.pageLabel,
        )}
        title={intl.formatMessage(messages.pageTitle)}
      />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        {assistant ? (
          <section aria-labelledby="describe-automation-title" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2
                id="describe-automation-title"
                className="font-sans text-lg font-medium text-balance text-foreground"
              >
                <FormattedMessage {...messages.describeTitle} />
              </h2>
              {assistant.aiFeaturesStatus === "denied" ? null : (
                <TypographyP tone="subtle">
                  <FormattedMessage {...messages.describeDescription} />
                </TypographyP>
              )}
            </div>
            <AutomationAssistantPrompt
              aiFeaturesStatus={assistant.aiFeaturesStatus}
              onSubmitPrompt={assistant.onSubmitPrompt}
              organizationSlug={organizationSlug}
              pending={assistant.pending}
            />
          </section>
        ) : null}

        <section aria-labelledby="build-automation-title" className="flex flex-col gap-4">
          <h2
            id="build-automation-title"
            className="font-sans text-base font-medium text-balance text-foreground"
          >
            <FormattedMessage {...(assistant ? messages.buildTitle : messages.buildTitleAlone)} />
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {renderAutomationLink({
              href: `${automationsBasePath}/new`,
              className: cn(BUILD_CARD_CLASS, BUILD_CARD_INTERACTIVE_CLASS),
              children: (
                <BuildCardBody
                  type="agent"
                  title={<FormattedMessage {...messages.agentTitle} />}
                  badge={
                    <Badge variant="secondary">
                      <FormattedMessage {...messages.recommended} />
                    </Badge>
                  }
                  description={<FormattedMessage {...messages.agentDescription} />}
                  bestFor={<FormattedMessage {...messages.agentBestFor} />}
                />
              ),
            })}
            {workflowAccess === "hidden" ? null : (
              <WorkflowCard
                access={workflowAccess}
                organizationSlug={organizationSlug}
                creating={creatingWorkflow && creatingTemplateId === null}
                disabled={creatingWorkflow}
                onCreate={onCreateWorkflow}
              />
            )}
          </div>
        </section>

        {workflowAccess === "available" ? (
          <WorkflowTemplateSection
            creatingTemplateId={creatingWorkflow ? creatingTemplateId : null}
            disabled={creatingWorkflow}
            onCreate={onCreateWorkflow}
          />
        ) : null}

        {usableTemplates.length > 0 ? (
          <section aria-labelledby="automation-templates-title" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2
                id="automation-templates-title"
                className="font-sans text-base font-medium text-balance text-foreground"
              >
                <FormattedMessage {...messages.templatesTitle} />
              </h2>
              <TypographyP tone="subtle">
                <FormattedMessage {...messages.templatesDescription} />
              </TypographyP>
            </div>
            <Tabs
              value={templateCategory}
              onValueChange={(value) => {
                setTemplateCategory(value as WorkspaceAutomationTemplateCategory);
                setShowAllTemplates(false);
              }}
              className="gap-5"
            >
              {templateCategoryTabs.length > 1 ? (
                <TabsList>
                  {templateCategoryTabs.map((category) => (
                    <TabsTrigger key={category.id} value={category.id}>
                      <FormattedMessage {...TEMPLATE_CATEGORY_MESSAGES[category.id]} />
                    </TabsTrigger>
                  ))}
                </TabsList>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                {shownTemplates.map((template) => (
                  <AutomationTemplateCard
                    key={template.id}
                    automationsBasePath={automationsBasePath}
                    renderAutomationLink={renderAutomationLink}
                    template={template}
                  />
                ))}
              </div>
            </Tabs>
            {categoryTemplates.length > COLLAPSED_TEMPLATE_COUNT ? (
              <div>
                <Button variant="outline" onClick={() => setShowAllTemplates((shown) => !shown)}>
                  {showAllTemplates ? (
                    <FormattedMessage {...messages.showFewerTemplates} />
                  ) : (
                    <FormattedMessage
                      {...messages.showAllTemplates}
                      values={{ count: categoryTemplates.length }}
                    />
                  )}
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </WorkspacePageShell>
  );
}
