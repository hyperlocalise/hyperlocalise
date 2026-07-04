import type {
  CatFormatCheckStatus,
  CatGlossaryTerm,
  CatRiskLevel,
  CatSegmentStatus,
} from "@/components/cat/shared/types";

export type CatTone = "safe" | "watch" | "risk" | "info";

export function catToneClass(tone: CatTone) {
  switch (tone) {
    case "safe":
      return "border-grove-700/25 bg-grove-100 text-grove-900 dark:border-grove-500/30 dark:bg-grove-100 dark:text-grove-900";
    case "watch":
      return "border-warning/25 bg-warning/10 text-warning-foreground dark:border-warning/30 dark:bg-warning/20 dark:text-warning-foreground";
    case "risk":
      return "border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/30 dark:bg-destructive/20 dark:text-destructive";
    default:
      return "border-blue-700/25 bg-blue-100 text-blue-1000 dark:border-blue-600/30 dark:bg-blue-100 dark:text-blue-900";
  }
}

export function segmentStatusTone(status: CatSegmentStatus): CatTone {
  switch (status) {
    case "reviewed":
      return "safe";
    case "needs_review":
      return "watch";
    case "skipped":
      return "info";
    default:
      return "info";
  }
}

export function segmentStatusLabel(status: CatSegmentStatus) {
  switch (status) {
    case "reviewed":
      return "Reviewed";
    case "needs_review":
      return "Needs review";
    case "skipped":
      return "Skipped";
    default:
      return "Pending";
  }
}

export function riskLevelTone(level: CatRiskLevel): CatTone {
  switch (level) {
    case "good":
    case "low":
      return "safe";
    case "medium":
      return "watch";
    case "high":
      return "risk";
    default:
      return "info";
  }
}

export function formatCheckTone(status: CatFormatCheckStatus): CatTone {
  switch (status) {
    case "pass":
      return "safe";
    case "warn":
      return "watch";
    case "fail":
      return "risk";
    default:
      return "info";
  }
}

export function formatCheckRowBackgroundClass(status: CatFormatCheckStatus) {
  switch (formatCheckTone(status)) {
    case "safe":
      return "bg-grove-500/10 dark:bg-grove-500/15";
    case "watch":
      return "bg-warning/10 dark:bg-warning/20";
    case "risk":
      return "bg-destructive/10 dark:bg-destructive/20";
    default:
      return "bg-muted";
  }
}

export function formatCheckStatusClass(status: CatFormatCheckStatus) {
  switch (formatCheckTone(status)) {
    case "safe":
      return "text-grove-900 dark:text-grove-300";
    case "watch":
      return "text-beam-900 dark:text-warning-foreground";
    case "risk":
      return "text-destructive";
    default:
      return "text-info";
  }
}

export function glossaryTermStatusClass(term: CatGlossaryTerm, forbiddenInTarget: boolean) {
  if (forbiddenInTarget) {
    return "text-destructive";
  }

  if (term.approved && !term.forbidden) {
    return "text-grove-900 dark:text-grove-300";
  }

  if (term.forbidden) {
    return "text-beam-900 dark:text-warning-foreground";
  }

  return "text-muted-foreground";
}

export function suggestionSourceLabel(source: string) {
  switch (source) {
    case "ai":
      return "AI";
    case "glossary":
      return "Glossary";
    case "tm":
      return "TM";
    default:
      return source;
  }
}
