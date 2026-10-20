import { Box, Button, Card, Flex, Spinner, Stack, Text } from "@sanity/ui";
import type { ReactNode } from "react";

import { HyperlocaliseIcon } from "./hyperlocalise-icon";

export type LocaleSegmentProgress = {
  segmentCount: number;
  approvedCount: number;
  reviewCount: number;
};

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

/** Generation finished enough to write a locale draft (approval not required). */
export function isJobReadyToWrite(status: string): boolean {
  return isTerminalJobSuccess(status) || status === "waiting_for_review";
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
      return "Needs review";
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
      return "Untranslated";
    default:
      return "In progress";
  }
}

function translationProgressLabel(
  status: string,
  progress: LocaleSegmentProgress | null | undefined,
  sourceOnly: boolean,
): string {
  if (status === "failed" || status === "cancelled") {
    return jobProgressLabel(status);
  }
  if (isActiveTranslationJobStatus(status)) {
    return jobProgressLabel(status);
  }
  if (sourceOnly) {
    return status === "missing" ? "Not uploaded" : "Uploaded";
  }
  const total = progress?.segmentCount ?? 0;
  const approved = progress?.approvedCount ?? 0;
  const review = progress?.reviewCount ?? 0;
  const filled = approved + review;
  if (total > 0) {
    if (filled === 0) {
      return "Untranslated";
    }
    if (approved === total) {
      return "Approved";
    }
    if (review > 0) {
      return "Needs review";
    }
    return "Partially translated";
  }
  if (status === "succeeded" || status === "completed" || status === "collected") {
    return "Untranslated";
  }
  return jobProgressLabel(status);
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

const APPROVED_BAR_COLOR = "var(--card-badge-positive-fg-color)";
const REVIEW_BAR_COLOR = "var(--card-badge-caution-fg-color)";

function segmentPercents(progress: LocaleSegmentProgress): {
  approvedPct: number;
  reviewPct: number;
} {
  const total = Math.max(progress.segmentCount, 0);
  if (total === 0) {
    return { approvedPct: 0, reviewPct: 0 };
  }
  return {
    approvedPct: (progress.approvedCount / total) * 100,
    reviewPct: (progress.reviewCount / total) * 100,
  };
}

export function TranslationProgressBar({
  status,
  lastError,
  compact = false,
  progress,
  sourceOnly = false,
}: {
  status: string;
  lastError?: string | null;
  compact?: boolean;
  progress?: LocaleSegmentProgress | null;
  sourceOnly?: boolean;
}) {
  const percent = jobProgressPercent(status);
  const label = translationProgressLabel(status, progress, sourceOnly);
  const tone = progressTone(status);
  const counts = progress ?? { segmentCount: 0, approvedCount: 0, reviewCount: 0 };
  const { approvedPct, reviewPct } = segmentPercents(counts);
  const filledCount = counts.approvedCount + counts.reviewCount;
  const hasSegmentTotal = counts.segmentCount > 0;
  const hasFilledSegments = filledCount > 0;
  const indeterminate = isActiveTranslationJobStatus(status) && !hasFilledSegments;
  const showSegmentBar = !sourceOnly && hasSegmentTotal && tone !== "critical" && !indeterminate;
  const rightLabel = showSegmentBar
    ? compact
      ? `${Math.round(approvedPct)}% · ${Math.round(reviewPct)}%`
      : `${Math.round(approvedPct)}% approved · ${Math.round(reviewPct)}% review`
    : indeterminate
      ? "…"
      : sourceOnly
        ? `${percent}%`
        : hasSegmentTotal
          ? compact
            ? "0% · 0%"
            : "0% approved · 0% review"
          : `${percent}%`;

  return (
    <Stack gap={compact ? 2 : 3}>
      <Flex align="center" justify="space-between" gap={3}>
        <Text size={1} weight="medium">
          {label}
        </Text>
        <Text muted size={1}>
          {rightLabel}
        </Text>
      </Flex>
      <Box
        style={{
          height: compact ? 4 : 6,
          borderRadius: 999,
          background: "var(--card-border-color)",
          overflow: "hidden",
          display: "flex",
        }}
      >
        {showSegmentBar ? (
          <>
            <Box
              style={{
                height: "100%",
                width: `${approvedPct}%`,
                background: APPROVED_BAR_COLOR,
                transition: "width 240ms ease",
              }}
            />
            <Box
              style={{
                height: "100%",
                width: `${reviewPct}%`,
                background: REVIEW_BAR_COLOR,
                transition: "width 240ms ease",
              }}
            />
          </>
        ) : (
          <Box
            style={{
              height: "100%",
              width: indeterminate ? "45%" : `${percent}%`,
              borderRadius: 999,
              background:
                tone === "critical"
                  ? "var(--card-badge-critical-fg-color)"
                  : tone === "positive"
                    ? APPROVED_BAR_COLOR
                    : "var(--card-badge-primary-fg-color)",
              transition: indeterminate ? undefined : "width 240ms ease",
              animation: indeterminate
                ? "hyperlocalise-progress-indeterminate 1.2s ease-in-out infinite"
                : undefined,
            }}
          />
        )}
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
      <Text size={1} weight="semibold">
        {title}
      </Text>
      {children}
    </Stack>
  );
}
