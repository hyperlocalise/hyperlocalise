import { HyperlocaliseClientError } from "./hyperlocalise-client";
import type { FigmaSegment } from "./plugin-messages";
import { normalizeSegmentText } from "./segment-normalize";

export type ToastTone = "positive" | "critical" | "warn" | "info";

export type AppToast = {
  tone: ToastTone;
  message: string;
};

export type StepProgress = {
  label: string;
  value: number;
};

export type FigmaUploadPreview = {
  pageIds: string[];
  segmentsByPage: Array<{ pageId: string; segments: FigmaSegment[] }>;
};

export function uploadPreviewSummary(pageCount: number, textCount: number) {
  const pages = `${pageCount} page${pageCount === 1 ? "" : "s"}`;
  const texts = `${textCount} text${textCount === 1 ? "" : "s"}`;
  return `${pages} · ${texts}`;
}

export function uniqueUploadedTextCount(segments: FigmaSegment[]) {
  const seen = new Set<string>();
  for (const segment of segments) {
    const normalized = normalizeSegmentText(segment.text);
    if (!normalized) {
      continue;
    }
    seen.add(normalized);
  }
  return seen.size;
}

export function formatPageList(
  pageIds: string[],
  pages: Array<{ pageId: string; pageName: string }>,
) {
  const nameById = new Map(pages.map((page) => [page.pageId, page.pageName]));
  return pageIds.map((pageId) => nameById.get(pageId) ?? pageId).join(", ");
}

export function formatActionError(error: unknown): string {
  if (error instanceof HyperlocaliseClientError) {
    switch (error.code) {
      case "figma_project_not_bound":
        return "Choose a project in the app before applying.";
      case "figma_page_not_collected":
        return "Upload the selected pages first, then apply.";
      case "job_target_locale_not_in_project":
        return "That language is not in the project. Reload languages or update project settings.";
      default:
        return error.message;
    }
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

export function applyOutcomeMessage(
  locale: string,
  pageCount: number,
  segmentTotal: number,
  localeLabel: (locale: string) => string,
): { message: string; tone: ToastTone } {
  if (segmentTotal === 0) {
    return {
      message: `No ${localeLabel(locale)} translations for the selected pages yet.`,
      tone: "critical",
    };
  }
  return {
    message: `Applied ${localeLabel(locale)} to ${pageCount} page${pageCount === 1 ? "" : "s"}.`,
    tone: "positive",
  };
}

export function toastBannerVariant(tone: ToastTone): "success" | "warning" {
  return tone === "positive" || tone === "info" ? "success" : "warning";
}
