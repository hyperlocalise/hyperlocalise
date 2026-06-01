"use client";

import { SlackIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ClockIcon, MailIcon } from "lucide-react";
import { siGithub } from "simple-icons";

import {
  getWorkspaceAutomationTemplateFlow,
  type WorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplateFlowNode,
} from "@/lib/agents/workspace-automation-templates";
import { cn } from "@/lib/primitives/cn";
import { SimpleBrandIcon } from "../../integrations/_components/simple-brand-icon";

type IconBucket = "schedule" | "github" | "slack" | "email";

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
      return <HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-4" />;
    case "email":
      return <MailIcon className="size-4" />;
    case "schedule":
      return <ClockIcon className="size-4" strokeWidth={1.8} />;
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
          <span className="h-px w-3 shrink-0 bg-foreground/25" aria-hidden />
          {toolBuckets.map((bucket) => (
            <FlowIcon key={bucket} bucket={bucket} />
          ))}
        </>
      ) : null}
    </div>
  );
}
