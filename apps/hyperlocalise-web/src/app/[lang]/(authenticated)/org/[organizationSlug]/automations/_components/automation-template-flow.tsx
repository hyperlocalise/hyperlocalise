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

import { Clock01Icon, Mail01Icon, Search01Icon } from "@hugeicons/core-free-icons";
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

type IconBucket = "schedule" | "github" | "slack" | "email" | "contentful" | "web-search";

function iconBucketForNode(node: WorkspaceAutomationTemplateFlowNode): IconBucket {
  switch (node.id) {
    case "github-push":
    case "github":
    case "push-source":
    case "pull-translations":
    case "validation":
      return "github";
    case "slack":
      return "slack";
    case "email":
      return "email";
    case "contentful-webhook":
    case "contentful":
      return "contentful";
    case "web-search":
      return "web-search";
    case "scheduled":
    case "manual":
    default:
      return "schedule";
  }
}

function FlowIcon({ bucket }: { bucket: IconBucket }) {
  switch (bucket) {
    case "github":
      return <SimpleBrandIcon icon={siGithub} colored className="size-4" />;
    case "slack":
      return (
        <Image src="/images/slack-logo.svg" alt="Slack" width={16} height={16} className="size-4" />
      );
    case "email":
      return <HugeiconsIcon icon={Mail01Icon} className="size-4" />;
    case "contentful":
      return (
        <Image
          src="/images/contentful-logo.svg"
          alt="Contentful"
          width={16}
          height={16}
          className="size-4"
        />
      );
    case "web-search":
      return <HugeiconsIcon icon={Search01Icon} className="size-4" strokeWidth={1.8} />;
    case "schedule":
      return <HugeiconsIcon icon={Clock01Icon} className="size-4" strokeWidth={1.8} />;
  }
}

function uniqueToolBuckets(
  trigger: WorkspaceAutomationTemplateFlowNode,
  tools: WorkspaceAutomationTemplateFlowNode[],
) {
  const triggerBucket = iconBucketForNode(trigger);
  const buckets: IconBucket[] = [];

  for (const tool of tools) {
    const bucket = iconBucketForNode(tool);
    if (bucket === triggerBucket || buckets.includes(bucket)) {
      continue;
    }
    buckets.push(bucket);
  }

  return buckets;
}

export function AutomationTemplateFlow({
  className,
  template,
}: {
  className?: string;
  template: WorkspaceAutomationTemplate;
}) {
  const flow = getWorkspaceAutomationTemplateFlow(template);
  const triggerBucket = iconBucketForNode(flow.trigger);
  const toolBuckets = uniqueToolBuckets(flow.trigger, flow.tools);
  const summary = [flow.trigger.label, ...flow.tools.map((tool) => tool.label)].join(" → ");

  return (
    <div
      className={cn("flex items-center gap-2 text-muted-foreground", className)}
      title={summary}
      aria-label={summary}
    >
      <FlowIcon bucket={triggerBucket} />
      {toolBuckets.length > 0 ? (
        <>
          <span className="h-px w-3 shrink-0 bg-muted5" aria-hidden />
          {toolBuckets.map((bucket) => (
            <FlowIcon key={bucket} bucket={bucket} />
          ))}
        </>
      ) : null}
    </div>
  );
}
