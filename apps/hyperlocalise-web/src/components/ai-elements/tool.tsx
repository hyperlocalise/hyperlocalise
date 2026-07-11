"use client";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/primitives/cn";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckmarkCircle02Icon,
  CircleIcon,
  Clock01Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { CodeBlock } from "./code-block";
import { AiElementErrorBoundary } from "./ai-element-error-boundary";
import { toolMessages } from "./tool.messages";
import { TypographyH4 } from "@/components/ui/typography";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, defaultOpen = false, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose mb-1 w-full", className)}
    defaultOpen={defaultOpen}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
  /** Optional muted trailing detail. Overrides auto-derived input/status detail. */
  detail?: string;
  input?: ToolPart["input"];
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusMessageKeys: Record<ToolPart["state"], keyof typeof toolMessages> = {
  "approval-requested": "statusApprovalRequested",
  "approval-responded": "statusApprovalResponded",
  "input-available": "statusInputAvailable",
  "input-streaming": "statusInputStreaming",
  "output-available": "statusOutputAvailable",
  "output-denied": "statusOutputDenied",
  "output-error": "statusOutputError",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": (
    <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 text-yellow-600" />
  ),
  "approval-responded": (
    <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4 text-blue-600" />
  ),
  "input-available": (
    <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-4 animate-pulse" />
  ),
  "input-streaming": <HugeiconsIcon icon={CircleIcon} strokeWidth={2} className="size-4" />,
  "output-available": (
    <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4 text-green-600" />
  ),
  "output-denied": (
    <HugeiconsIcon
      icon={MultiplicationSignCircleIcon}
      strokeWidth={2}
      className="size-4 text-orange-600"
    />
  ),
  "output-error": (
    <HugeiconsIcon
      icon={MultiplicationSignCircleIcon}
      strokeWidth={2}
      className="size-4 text-red-600"
    />
  ),
};

const INPUT_DETAIL_KEYS = [
  "path",
  "file",
  "filename",
  "filePath",
  "command",
  "query",
  "url",
  "name",
  "title",
  "pattern",
  "target",
] as const;

/** Pull a short, human-readable detail from tool input for the collapsed summary line. */
export function extractToolInputDetail(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;

  for (const key of INPUT_DETAIL_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return truncateDetail(value.trim());
    }
  }

  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.trim() && value.length < 120) {
      return truncateDetail(value.trim());
    }
  }

  return null;
}

function truncateDetail(value: string, max = 64): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

export const ToolStatusBadge = ({ status }: { status: ToolPart["state"] }) => {
  const intl = useIntl();

  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {statusIcons[status]}
      {intl.formatMessage(toolMessages[statusMessageKeys[status]])}
    </Badge>
  );
};

/** @deprecated Use `ToolStatusBadge` instead. */
export const getStatusBadge = (status: ToolPart["state"]) => <ToolStatusBadge status={status} />;

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  detail,
  input,
  ...props
}: ToolHeaderProps) => {
  const intl = useIntl();
  const derivedName =
    type === "dynamic-tool"
      ? toolName
      : typeof type === "string"
        ? type.split("-").slice(1).join("-")
        : "tool";

  const name = title ?? derivedName;
  const inputDetail = detail ?? extractToolInputDetail(input);
  // Match the screenshot: primary = action/subject, muted = trailing metadata only.
  // Prefer input detail as the muted trailer; fall back to status while in-flight/errored.
  const muted =
    inputDetail ??
    (state === "output-available"
      ? null
      : intl.formatMessage(toolMessages[statusMessageKeys[state]]));
  const isPending = state === "input-streaming" || state === "input-available";

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full cursor-pointer items-baseline gap-1.5 py-0.5 text-start text-sm",
        className,
      )}
      {...props}
    >
      <span className="truncate text-foreground">{name}</span>
      {muted ? (
        <span
          className={cn("min-w-0 truncate text-muted-foreground", isPending && "animate-pulse")}
        >
          {muted}
        </span>
      ) : null}
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-3 py-2 ps-0 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

/** `JSON.stringify(undefined)` returns `undefined`, which crashes CodeBlock's `.split`. */
export function serializeToolJson(value: unknown): string {
  if (value === undefined) {
    return "{}";
  }

  try {
    const serialized = JSON.stringify(value, null, 2);
    return typeof serialized === "string" ? serialized : "{}";
  } catch {
    return "{}";
  }
}

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => {
  const serializedInput = serializeToolJson(input);

  return (
    <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
      <TypographyH4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        <FormattedMessage {...toolMessages.parameters} />
      </TypographyH4>
      <div className="rounded-md bg-muted/50">
        <AiElementErrorBoundary scope="code-block" resetKeys={[serializedInput]}>
          <CodeBlock code={serializedInput} language="json" />
        </AiElementErrorBoundary>
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    const serializedOutput = serializeToolJson(output);
    Output = (
      <AiElementErrorBoundary scope="code-block" resetKeys={[serializedOutput]}>
        <CodeBlock code={serializedOutput} language="json" />
      </AiElementErrorBoundary>
    );
  } else if (typeof output === "string") {
    Output = (
      <AiElementErrorBoundary scope="code-block" resetKeys={[output]}>
        <CodeBlock code={output} language="json" />
      </AiElementErrorBoundary>
    );
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <TypographyH4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? (
          <FormattedMessage {...toolMessages.error} />
        ) : (
          <FormattedMessage {...toolMessages.result} />
        )}
      </TypographyH4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/50 text-foreground",
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
