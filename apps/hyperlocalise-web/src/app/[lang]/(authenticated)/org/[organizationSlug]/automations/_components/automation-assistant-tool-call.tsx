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
import { CaretDownIcon, CheckIcon, WarningIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/github-repository-automation-view-model.messages";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import type {
  AutomationSetupCallSummary,
  AutomationSetupChangeLine,
} from "@/lib/agents/workspace-automation-assistant";
import type { WorkspaceAutomationTriggerSummary } from "@/lib/agents/workspace-automation-proposal-form";
import { assertNever } from "@/lib/primitives/assert-never/assert-never";

import { AUTOMATION_ASSISTANT_INTEGRATION_LABELS } from "./automation-assistant-summary";
import { automationAssistantMessages as messages } from "./automation-assistant.messages";
import { workspaceAutomationFormMessages } from "./workspace-automation-form.messages";
import { workspaceAutomationTriggerMessages } from "./workspace-automation-trigger-settings.messages";

const ROW_CLASS = "flex items-center gap-1.5 text-xs text-muted-foreground";

function clockHour(hour: number | undefined): string {
  return `${String(hour ?? 0).padStart(2, "0")}:00`;
}

/** When the automation runs, in the words the trigger menu and the form's summary use. */
function describeTrigger(intl: IntlShape, trigger: WorkspaceAutomationTriggerSummary): string {
  switch (trigger.mode) {
    case "manual":
      return intl.formatMessage(workspaceAutomationTriggerMessages.manual);
    case "contentful":
      return intl.formatMessage(workspaceAutomationTriggerMessages.contentful);
    case "source_upload":
      return intl.formatMessage(workspaceAutomationTriggerMessages.sourceUpload);
    case "web_chat":
      return intl.formatMessage(workspaceAutomationTriggerMessages.webChat);
    case "scheduled": {
      if (trigger.cadence === "hourly") {
        return intl.formatMessage(workspaceAutomationFormMessages.scheduledTriggerHourly);
      }
      const time = clockHour(trigger.hour);
      if (trigger.cadence === "weekly") {
        const weekday =
          AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[
            trigger.dayOfWeek as keyof typeof AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE
          ] ?? AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[1];
        return intl.formatMessage(workspaceAutomationFormMessages.scheduledTriggerWeekly, {
          weekday: intl.formatMessage(weekday),
          time,
          timezone: trigger.timeZone,
        });
      }
      return intl.formatMessage(workspaceAutomationFormMessages.scheduledTriggerDaily, {
        time,
        timezone: trigger.timeZone,
      });
    }
    case "github": {
      const push = trigger.events.includes("push");
      const pullRequest = trigger.events.includes("pull_request");
      const event = intl.formatMessage(
        push && pullRequest
          ? workspaceAutomationTriggerMessages.githubPushOrPullRequest
          : pullRequest
            ? workspaceAutomationTriggerMessages.githubPullRequest
            : workspaceAutomationTriggerMessages.githubPush,
      );
      return trigger.branches.length > 0
        ? intl.formatMessage(messages.toolLineTriggerBranches, {
            trigger: event,
            branches: trigger.branches.join(", "),
          })
        : event;
    }
    default:
      return assertNever(trigger);
  }
}

function describeLine(intl: IntlShape, line: AutomationSetupChangeLine): string {
  switch (line.kind) {
    case "name":
      return intl.formatMessage(messages.toolLineName, { name: line.name });
    case "instructions":
      return intl.formatMessage(
        line.cleared
          ? messages.toolLineInstructionsCleared
          : messages.toolLineInstructionsRewritten,
      );
    case "trigger":
      return intl.formatMessage(messages.toolLineTrigger, {
        trigger: describeTrigger(intl, line.trigger),
      });
    case "skill_added":
      return intl.formatMessage(messages.toolLineSkillAdded, { skill: line.skillName });
    case "skill_removed":
      return intl.formatMessage(messages.toolLineSkillRemoved, { skill: line.skillName });
    case "skill_not_added":
      return line.reason === "needs_connection" && line.integrations.length > 0
        ? intl.formatMessage(messages.toolLineSkillNeedsConnection, {
            skill: line.skillName,
            integrations: intl.formatList(
              line.integrations.map((integration) =>
                intl.formatMessage(AUTOMATION_ASSISTANT_INTEGRATION_LABELS[integration]),
              ),
              { type: "conjunction" },
            ),
          })
        : intl.formatMessage(messages.toolLineSkillWrongTrigger, { skill: line.skillName });
    default:
      return assertNever(line);
  }
}

function Row({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className={ROW_CLASS}>
      {icon}
      {children}
    </p>
  );
}

/**
 * One call of the setup tool inside a reply: a line saying how it went, which opens to list what
 * the call changed on the page and what it left out. A call with nothing to list is a plain line.
 */
export function AutomationAssistantToolCall({ summary }: { summary: AutomationSetupCallSummary }) {
  const intl = useIntl();

  if (summary.state === "running") {
    return (
      <Row icon={<Spinner className="size-3" />}>
        <FormattedMessage {...messages.toolUpdating} />
      </Row>
    );
  }
  if (summary.state === "failed") {
    return (
      <Row icon={<WarningIcon className="size-3.5 shrink-0" />}>
        <FormattedMessage {...messages.toolFailed} />
      </Row>
    );
  }
  if (summary.changes === null) {
    return (
      <Row icon={<CheckIcon className="size-3.5 shrink-0" />}>
        <FormattedMessage {...messages.toolUpdated} />
      </Row>
    );
  }

  const made = summary.changes.filter((line) => line.kind !== "skill_not_added").length;
  const title =
    made > 0 ? (
      <FormattedMessage {...messages.toolUpdatedCount} values={{ count: made }} />
    ) : (
      <FormattedMessage {...messages.toolNoChanges} />
    );
  if (summary.changes.length === 0) {
    return <Row>{title}</Row>;
  }

  return (
    <Collapsible>
      <CollapsibleTrigger
        className={`group ${ROW_CLASS} cursor-pointer rounded-sm text-start transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
      >
        {made > 0 ? <CheckIcon className="size-3.5 shrink-0" /> : null}
        <span>{title}</span>
        <CaretDownIcon className="size-3 shrink-0 transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-1.5 flex flex-col gap-1 border-s-2 border-border ps-3 text-xs leading-5 text-muted-foreground">
          {summary.changes.map((line, index) => (
            <li key={index} className={line.kind === "skill_not_added" ? "text-foreground" : ""}>
              {describeLine(intl, line)}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
