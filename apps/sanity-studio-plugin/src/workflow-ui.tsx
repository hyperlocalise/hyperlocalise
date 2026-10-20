import { Box, Button, Card, Flex, Spinner, Stack, Text } from "@sanity/ui";
import type { ReactNode } from "react";

import { HyperlocaliseIcon } from "./hyperlocalise-icon";

export function publishedDocumentId(documentId: string): string {
  return documentId.replace(/^drafts\./, "");
}

export function documentListLabel(document: {
  _id: string;
  title?: string;
  name?: string;
}): string {
  const title = document.title?.trim();
  if (title) {
    return title;
  }
  const name = document.name?.trim();
  if (name) {
    return name;
  }
  return publishedDocumentId(document._id);
}

export function isInFlightJobStatus(status: string): boolean {
  return (
    status === "queued" ||
    status === "running" ||
    status === "processing" ||
    status === "waiting_for_review"
  );
}

/** Job still executing — show indeterminate progress and poll for updates. */
export function isActiveTranslationJobStatus(status: string): boolean {
  return status === "queued" || status === "running" || status === "processing";
}

export function isTerminalJobSuccess(status: string): boolean {
  return status === "succeeded" || status === "completed";
}

function jobProgressPercent(status: string): number {
  switch (status) {
    case "queued":
      return 12;
    case "running":
    case "processing":
      return 55;
    case "waiting_for_review":
      return 85;
    case "succeeded":
    case "completed":
    case "collected":
      return 100;
    case "failed":
    case "cancelled":
      return 100;
    case "missing":
      return 0;
    default:
      return 30;
  }
}

function jobProgressLabel(status: string): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
    case "processing":
      return "Translating";
    case "waiting_for_review":
      return "Ready for review";
    case "succeeded":
    case "completed":
      return "Translation complete";
    case "collected":
      return "Uploaded";
    case "failed":
      return "Translation failed";
    case "cancelled":
      return "Cancelled";
    case "missing":
      return "Not uploaded";
    default:
      return "In progress";
  }
}

function progressTone(
  status: string,
): "default" | "primary" | "positive" | "caution" | "critical" {
  if (status === "failed") {
    return "critical";
  }
  if (status === "cancelled") {
    return "caution";
  }
  if (isTerminalJobSuccess(status) || status === "collected") {
    return "positive";
  }
  if (isInFlightJobStatus(status)) {
    return "primary";
  }
  return "default";
}

export function TranslationProgressBar({
  status,
  lastError,
  compact = false,
}: {
  status: string;
  lastError?: string | null;
  compact?: boolean;
}) {
  const percent = jobProgressPercent(status);
  const label = jobProgressLabel(status);
  const indeterminate = isActiveTranslationJobStatus(status);
  const tone = progressTone(status);

  return (
    <Stack gap={compact ? 2 : 3}>
      <Flex align="center" justify="space-between" gap={3}>
        <Text size={1} weight="medium">
          {label}
        </Text>
        {!indeterminate ? (
          <Text muted size={1}>
            {percent}%
          </Text>
        ) : (
          <Text muted size={1}>
            …
          </Text>
        )}
      </Flex>
      <Box
        style={{
          height: compact ? 4 : 6,
          borderRadius: 999,
          background: "var(--card-border-color)",
          overflow: "hidden",
        }}
      >
        <Box
          style={{
            height: "100%",
            width: indeterminate ? "45%" : `${percent}%`,
            borderRadius: 999,
            background:
              tone === "critical"
                ? "var(--card-badge-critical-fg-color)"
                : tone === "positive"
                  ? "var(--card-badge-positive-fg-color)"
                  : "var(--card-badge-primary-fg-color)",
            transition: indeterminate ? undefined : "width 240ms ease",
            animation: indeterminate
              ? "hyperlocalise-progress-indeterminate 1.2s ease-in-out infinite"
              : undefined,
          }}
        />
      </Box>
      {lastError ? (
        <Text size={1} style={{ color: "var(--card-badge-critical-fg-color)" }}>
          {lastError}
        </Text>
      ) : null}
      <style>{`
        @keyframes hyperlocalise-progress-indeterminate {
          0% { transform: translateX(-60%); width: 40%; }
          50% { transform: translateX(40%); width: 55%; }
          100% { transform: translateX(120%); width: 40%; }
        }
      `}</style>
    </Stack>
  );
}

export function BulkActionProgress({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  const safeTotal = Math.max(total, 1);
  const percent = Math.round((current / safeTotal) * 100);

  return (
    <Card padding={3} tone="primary">
      <Stack gap={3}>
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold">
            {label}
          </Text>
          <Text muted size={1}>
            {current} / {total}
          </Text>
        </Flex>
        <Box
          style={{
            height: 6,
            borderRadius: 999,
            background: "var(--card-border-color)",
            overflow: "hidden",
          }}
        >
          <Box
            style={{
              height: "100%",
              width: `${percent}%`,
              borderRadius: 999,
              background: "var(--card-badge-primary-fg-color)",
              transition: "width 200ms ease",
            }}
          />
        </Box>
      </Stack>
    </Card>
  );
}

export function WorkflowPanel({ children }: { children: ReactNode }) {
  return (
    <Flex align="flex-start" justify="center" style={{ width: "100%", boxSizing: "border-box" }}>
      <Box padding={4} style={{ width: "100%", maxWidth: 440, boxSizing: "border-box" }}>
        <Stack gap={4}>{children}</Stack>
      </Box>
    </Flex>
  );
}

export function WorkflowSessionLoading() {
  return (
    <WorkflowPanel>
      <Flex align="center" direction="column" gap={4} padding={5} justify="center">
        <Spinner muted />
        <Text muted size={1}>
          Loading workspace…
        </Text>
      </Flex>
    </WorkflowPanel>
  );
}

export function WorkflowHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string | null;
}) {
  return (
    <Stack gap={2} style={{ textAlign: "center" }}>
      <Flex align="center" gap={2} justify="center">
        <HyperlocaliseIcon width={18} height={18} />
        <Text size={2} weight="semibold">
          {title}
        </Text>
      </Flex>
      {subtitle ? (
        <Text muted size={1}>
          {subtitle}
        </Text>
      ) : null}
    </Stack>
  );
}

/** Matches the Figma plugin project / account CTAs on the workflow screen. */
export function WorkflowProjectLine({
  projectName,
  disabled = false,
  onChangeProject,
  onSwitchAccount,
}: {
  projectName: string;
  disabled?: boolean;
  onChangeProject: () => void;
  onSwitchAccount: () => void;
}) {
  return (
    <Card padding={3} radius={2} tone="transparent" border>
      <Flex align="center" gap={2} wrap="wrap" justify="center">
        <Text size={1} weight="medium">
          Project: {projectName}
        </Text>
        <Flex align="center" gap={1} justify="center">
          <Button
            mode="ghost"
            tone="primary"
            padding={2}
            fontSize={1}
            text="Change"
            disabled={disabled}
            onClick={onChangeProject}
          />
          <Button
            mode="ghost"
            tone="default"
            padding={2}
            fontSize={1}
            text="Switch Account"
            disabled={disabled}
            onClick={onSwitchAccount}
          />
        </Flex>
      </Flex>
    </Card>
  );
}

export function DocumentHero({
  displayName,
  documentType,
  meta,
}: {
  displayName: string;
  documentType: string;
  meta?: string;
}) {
  return (
    <Card padding={4} radius={3} shadow={1}>
      <Stack gap={2}>
        <Text size={2} weight="semibold">
          {displayName}
        </Text>
        <Text muted size={1}>
          {documentType}
          {meta ? ` · ${meta}` : ""}
        </Text>
      </Stack>
    </Card>
  );
}

export function WorkflowSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Stack gap={2} style={{ width: "100%" }}>
      <Text size={1} weight="semibold" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {children}
    </Stack>
  );
}
