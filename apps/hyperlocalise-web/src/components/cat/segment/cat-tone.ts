import type {
  CatFormatCheckStatus,
  CatRiskLevel,
  CatSegmentStatus,
} from "@/components/cat/shared/types";

export type CatTone = "safe" | "watch" | "risk" | "info";

export function catToneClass(tone: CatTone) {
  switch (tone) {
    case "safe":
      return "border-grove-300/25 bg-grove-300/10 text-grove-300";
    case "watch":
      return "border-bud-500/25 bg-bud-500/10 text-bud-300";
    case "risk":
      return "border-flame-700/25 bg-flame-700/10 text-flame-100";
    default:
      return "border-dew-500/25 bg-dew-500/10 text-dew-100";
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
