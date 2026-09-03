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

import { Fragment } from "react";
import {
  Clock01Icon,
  Comment01Icon,
  Mail01Icon,
  Search01Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
  Task01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { siGithub } from "simple-icons";
import Image from "next/image";

import {
  getWorkspaceAutomationTemplateFlow,
  type WorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplateFlowNode,
} from "@/lib/agents/workspace-automation-templates";
import { cn } from "@/lib/primitives/cn";
import { SimpleBrandIcon } from "../../integrations/_components/simple-brand-icon";

type IconBucket =
  | "schedule"
  | "github"
  | "slack"
  | "email"
  | "contentful"
  | "web-search"
  | "web-chat"
  | "upload"
  | "job"
  | "translate"
  | "validation";

function iconBucketForNode(node: WorkspaceAutomationTemplateFlowNode): IconBucket {
  switch (node.id) {
    case "github-push":
    case "github-pull-request":
    case "github":
    case "github-comment":
    case "push-source":
    case "pull-translations":
      return "github";
    case "validation":
      return "validation";
    case "slack":
      return "slack";
    case "email":
      return "email";
    case "contentful-webhook":
    case "contentful":
      return "contentful";
    case "web-search":
      return "web-search";
    case "web-chat":
    case "knowledge-files":
      return "web-chat";
    case "source-upload":
      return "upload";
    case "create-job":
      return "job";
    case "translate-with-agent":
      return "translate";
    case "scheduled":
    case "manual":
    default:
      return "schedule";
  }
}

function FlowIcon({ bucket, className }: { bucket: IconBucket; className?: string }) {
  const iconClassName = cn("size-3.5", className);

  switch (bucket) {
    case "github":
      return <SimpleBrandIcon icon={siGithub} colored className={iconClassName} />;
    case "slack":
      return (
        <Image
          src="/images/slack-logo.svg"
          alt=""
          width={16}
          height={16}
          className={iconClassName}
        />
      );
    case "email":
      return <HugeiconsIcon icon={Mail01Icon} className={iconClassName} strokeWidth={1.8} />;
    case "contentful":
      return (
        <Image
          src="/images/contentful-logo.svg"
          alt=""
          width={16}
          height={16}
          className={iconClassName}
        />
      );
    case "web-search":
      return <HugeiconsIcon icon={Search01Icon} className={iconClassName} strokeWidth={1.8} />;
    case "web-chat":
      return <HugeiconsIcon icon={Comment01Icon} className={iconClassName} strokeWidth={1.8} />;
    case "upload":
      return <HugeiconsIcon icon={Upload01Icon} className={iconClassName} strokeWidth={1.8} />;
    case "job":
      return <HugeiconsIcon icon={Task01Icon} className={iconClassName} strokeWidth={1.8} />;
    case "translate":
      return <HugeiconsIcon icon={SparklesIcon} className={iconClassName} strokeWidth={1.8} />;
    case "validation":
      return (
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className={iconClassName} strokeWidth={1.8} />
      );
    case "schedule":
      return <HugeiconsIcon icon={Clock01Icon} className={iconClassName} strokeWidth={1.8} />;
  }
}

export function AutomationTemplateTriggerIcon({
  template,
}: {
  template: WorkspaceAutomationTemplate;
}) {
  const flow = getWorkspaceAutomationTemplateFlow(template);
  return <FlowIcon bucket={iconBucketForNode(flow.trigger)} className="size-4" />;
}

export function AutomationTemplateFlow({
  className,
  template,
}: {
  className?: string;
  template: WorkspaceAutomationTemplate;
}) {
  const flow = getWorkspaceAutomationTemplateFlow(template);
  const steps = [flow.trigger, ...flow.tools];
  const summary = steps.map((step) => step.label).join(" → ");

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5 text-muted-foreground", className)}
      title={summary}
      aria-label={summary}
    >
      {steps.map((step, index) => (
        <Fragment key={`${step.id}-${index}`}>
          {index > 0 ? (
            <span aria-hidden className="text-xs">
              →
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">
            <FlowIcon bucket={iconBucketForNode(step)} />
            <span className="text-xs whitespace-nowrap">{step.label}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
