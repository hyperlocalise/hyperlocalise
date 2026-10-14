import { fetchFigmaLocaleStatusesFromApi, type FigmaResourceAuth } from "./hyperlocalise-client";
import type { FigmaPageJob } from "./plugin-messages";

export type FigmaLocalePageStatus = {
  pageId: string;
  status: FigmaPageJob["status"] | "missing" | "idle";
};

export type FigmaLocaleStatus = {
  locale: string;
  isSource: boolean;
  pages: FigmaLocalePageStatus[];
};

export function pageHasPullableTranslations(entry: FigmaLocaleStatus, page: FigmaLocalePageStatus) {
  if (entry.isSource) {
    return page.status === "succeeded";
  }
  return page.status === "succeeded" || page.status === "waiting_for_review";
}

export function selectedPagesMissingFromCollect(
  entry: FigmaLocaleStatus | undefined,
  selected: string[],
): string[] {
  if (!entry) {
    return selected;
  }
  return selected.filter((pageId) => {
    const page = entry.pages.find((item) => item.pageId === pageId);
    return !page || page.status === "missing";
  });
}

export function selectedPagesCollected(entry: FigmaLocaleStatus | undefined, selected: string[]) {
  return selected.length > 0 && selectedPagesMissingFromCollect(entry, selected).length === 0;
}

export function canApplySelectedPages(entry: FigmaLocaleStatus | undefined, selected: string[]) {
  if (!entry || selected.length === 0) {
    return false;
  }
  return selected.every((pageId) => {
    const page = entry.pages.find((item) => item.pageId === pageId);
    if (!page) {
      return false;
    }
    return pageHasPullableTranslations(entry, page);
  });
}

export async function fetchFigmaLocaleStatuses(input: {
  appUrl: string;
  auth: FigmaResourceAuth;
  projectId: string;
  fileKey: string;
  pageIds: string[];
  sourceLocale: string;
  targetLocales: string[];
}): Promise<FigmaLocaleStatus[]> {
  void input.sourceLocale;
  void input.targetLocales;
  const result = await fetchFigmaLocaleStatusesFromApi({
    appUrl: input.appUrl,
    auth: input.auth,
    projectId: input.projectId,
    fileKey: input.fileKey,
    pageIds: input.pageIds,
  });
  return result.locales;
}
