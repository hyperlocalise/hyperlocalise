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

function countSourceWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

export type FigmaTranslationPullSummary = {
  total: number;
  realTranslation: number;
  missing: number;
  sameAsSourceOneWord: number;
  sameAsSourceMultiWord: number;
  sameAsSourceKeys: Array<{ key: string; wordCount: number }>;
};

export function summarizeTranslationPull(
  translations: Record<string, string>,
  sourceByKey: Record<string, string> = {},
): FigmaTranslationPullSummary {
  let realTranslation = 0;
  let missing = 0;
  let sameAsSourceOneWord = 0;
  let sameAsSourceMultiWord = 0;
  const sameAsSourceKeys: Array<{ key: string; wordCount: number }> = [];

  for (const [key, target] of Object.entries(translations)) {
    const targetTrim = target.trim();
    const source = (sourceByKey[key] ?? "").trim();
    if (!targetTrim) {
      missing += 1;
      continue;
    }
    if (source && targetTrim === source) {
      const wordCount = countSourceWords(source);
      if (wordCount >= 2) {
        sameAsSourceMultiWord += 1;
      } else {
        sameAsSourceOneWord += 1;
      }
      sameAsSourceKeys.push({ key, wordCount });
      continue;
    }
    realTranslation += 1;
  }

  return {
    total: Object.keys(translations).length,
    realTranslation,
    missing,
    sameAsSourceOneWord,
    sameAsSourceMultiWord,
    sameAsSourceKeys: sameAsSourceKeys.slice(0, 24),
  };
}

export function emptyTranslationPullSummary(): FigmaTranslationPullSummary {
  return {
    total: 0,
    realTranslation: 0,
    missing: 0,
    sameAsSourceOneWord: 0,
    sameAsSourceMultiWord: 0,
    sameAsSourceKeys: [],
  };
}

export function mergeTranslationPullSummaries(
  summaries: FigmaTranslationPullSummary[],
): FigmaTranslationPullSummary {
  const merged = emptyTranslationPullSummary();
  for (const summary of summaries) {
    merged.total += summary.total;
    merged.realTranslation += summary.realTranslation;
    merged.missing += summary.missing;
    merged.sameAsSourceOneWord += summary.sameAsSourceOneWord;
    merged.sameAsSourceMultiWord += summary.sameAsSourceMultiWord;
    if (merged.sameAsSourceKeys.length < 24) {
      merged.sameAsSourceKeys.push(...summary.sameAsSourceKeys);
    }
  }
  merged.sameAsSourceKeys = merged.sameAsSourceKeys.slice(0, 24);
  return merged;
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
      case "figma_project_not_found":
        return "That project is no longer available. Choose another project.";
      case "figma_api_key_unauthorized":
        return "The API key for this Figma connection is invalid or missing permissions.";
      case "figma_locales_failed":
        return "Unable to load locale status.";
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
  pullSummary?: FigmaTranslationPullSummary,
): { message: string; tone: ToastTone } {
  if (segmentTotal > 0) {
    return {
      message: `Applied ${localeLabel(locale)} to ${pageCount} page${pageCount === 1 ? "" : "s"}.`,
      tone: "positive",
    };
  }

  const label = localeLabel(locale);
  const pages = `${pageCount} page${pageCount === 1 ? "" : "s"}`;

  if (pullSummary && pullSummary.realTranslation > 0) {
    return {
      message: `${label} translations are already on the selected ${pages}.`,
      tone: "positive",
    };
  }

  if (
    pullSummary &&
    pullSummary.total > 0 &&
    pullSummary.realTranslation === 0 &&
    pullSummary.sameAsSourceOneWord + pullSummary.sameAsSourceMultiWord >= pullSummary.total
  ) {
    return {
      message: `Hyperlocalise only has source-language text for ${label} on the selected ${pages}. Finish untranslated rows in the editor, then Apply again.`,
      tone: "warn",
    };
  }

  return {
    message: `No ${label} translations for the selected pages yet. Run Translate or finish untranslated segments in the editor.`,
    tone: "critical",
  };
}

export function toastBannerVariant(tone: ToastTone): "success" | "warning" {
  return tone === "positive" || tone === "info" ? "success" : "warning";
}
