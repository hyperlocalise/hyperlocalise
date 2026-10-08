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
import { SparkleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { Spinner } from "@/components/ui/spinner";
import type { WorkspaceAutomationSetupStep } from "@/lib/agents/workspace-automation-setup-steps";
import type { WorkspaceAutomationSkillIntegration } from "@/lib/agents/workspace-automation-skills";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { automationAssistantMessages as messages } from "./automation-assistant.messages";
import { useAutomationAssistant } from "./automation-assistant-provider";
import { workspaceAutomationFormMessages } from "./workspace-automation-form.messages";

const INTEGRATION_LABELS: Record<WorkspaceAutomationSkillIntegration, MessageDescriptor> = {
  github: workspaceAutomationFormMessages.skillIntegrationGithub,
  crowdin: workspaceAutomationFormMessages.skillIntegrationCrowdin,
  contentful: workspaceAutomationFormMessages.skillIntegrationContentful,
  intercom: workspaceAutomationFormMessages.skillIntegrationIntercom,
  slack: workspaceAutomationFormMessages.skillIntegrationSlack,
  email: workspaceAutomationFormMessages.skillIntegrationEmail,
};

function setupStepKey(step: WorkspaceAutomationSetupStep): string {
  switch (step.kind) {
    case "connect":
      return `connect:${step.integration}`;
    case "field":
      return `field:${step.field}`;
    case "repository_for_github_trigger":
    case "nothing_to_deliver":
      return step.kind;
    default:
      return assertNever(step);
  }
}

/**
 * One line above the form once the assistant has touched it: what happened, how many changes it
 * made, whether it is still working, and what the setup still needs before it can be saved.
 */
export function AutomationAssistantSummary({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const assistant = useAutomationAssistant();
  if (!assistant || (assistant.appliedCallCount === 0 && !assistant.working)) {
    return null;
  }

  const header =
    assistant.mode === "detail"
      ? messages.headerUpdatedAutomation
      : assistant.appliedCallCount === 1
        ? messages.headerCreated
        : messages.headerUpdatedSetup;

  const describeStep = (step: WorkspaceAutomationSetupStep): ReactNode => {
    switch (step.kind) {
      case "connect":
        return (
          <FormattedMessage
            {...messages.connectIntegration}
            values={{
              integration: intl.formatMessage(INTEGRATION_LABELS[step.integration]),
              link: (chunks) => (
                <Link
                  href={`/org/${organizationSlug}/integrations`}
                  target="_blank"
                  className="underline"
                >
                  {chunks}
                </Link>
              ),
            }}
          />
        );
      case "field":
        return step.message;
      case "repository_for_github_trigger":
        return <FormattedMessage {...messages.repositoryForGithubTrigger} />;
      case "nothing_to_deliver":
        return <FormattedMessage {...messages.nothingToDeliver} />;
      default:
        return assertNever(step);
    }
  };

  return (
    <section
      aria-live="polite"
      className="flex flex-col gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm"
    >
      {assistant.working ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-4" />
          <FormattedMessage
            {...(assistant.mode === "detail" ? messages.workingSettings : messages.workingSetup)}
          />
        </p>
      ) : null}
      {assistant.appliedCallCount > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="flex items-center gap-2 font-medium">
              <SparkleIcon className="size-4 shrink-0" />
              <FormattedMessage {...header} />
            </p>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
              <FormattedMessage {...messages.notSavedYet} />
            </span>
            <span className="text-xs text-muted-foreground">
              <FormattedMessage
                {...messages.changeCount}
                values={{ count: assistant.appliedChangeCount }}
              />
            </span>
          </div>
          {assistant.steps.length > 0 ? (
            <>
              <p className="text-xs font-medium text-muted-foreground">
                <FormattedMessage {...messages.stillNeeded} />
              </p>
              <ul className="list-disc space-y-1 ps-5">
                {assistant.steps.map((step) => (
                  <li key={setupStepKey(step)}>{describeStep(step)}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">
              <FormattedMessage
                {...(assistant.mode === "create"
                  ? messages.nothingNeededCreate
                  : messages.nothingNeededSave)}
              />
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
