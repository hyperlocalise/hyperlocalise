import { fetchCurrentFigmaJob, type FigmaResourceAuth } from "./hyperlocalise-client";
import type { FigmaPageJob } from "./plugin-messages";
import { isInFlightJobStatus } from "./page-job-ui";

export type FigmaLocalePageStatus = {
  pageId: string;
  status: FigmaPageJob["status"] | "missing";
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
  const pageIds = [...new Set(input.pageIds)];
  const jobs = await Promise.all(
    pageIds.map(async (pageId) => {
      try {
        const { job } = await fetchCurrentFigmaJob({
          appUrl: input.appUrl,
          auth: input.auth,
          fileKey: input.fileKey,
          pageId,
          projectId: input.projectId,
        });
        return { pageId, job };
      } catch {
        return { pageId, job: null as FigmaPageJob | null };
      }
    }),
  );

  const jobByPageId = new Map(jobs.map((entry) => [entry.pageId, entry.job]));

  const sourcePages: FigmaLocalePageStatus[] = pageIds.map((pageId) => {
    const job = jobByPageId.get(pageId);
    if (!job) {
      return { pageId, status: "missing" };
    }
    if (job.status === "failed" || job.status === "cancelled") {
      return { pageId, status: job.status };
    }
    if (isInFlightJobStatus(job.status)) {
      return { pageId, status: job.status };
    }
    return { pageId, status: job.status };
  });

  const locales: FigmaLocaleStatus[] = [
    {
      locale: input.sourceLocale,
      isSource: true,
      pages: sourcePages,
    },
  ];

  for (const locale of input.targetLocales) {
    const trimmed = locale.trim();
    if (!trimmed || trimmed === input.sourceLocale) {
      continue;
    }
    locales.push({
      locale: trimmed,
      isSource: false,
      pages: pageIds.map((pageId) => {
        const job = jobByPageId.get(pageId);
        if (!job) {
          return { pageId, status: "missing" as const };
        }
        const hasTranslations = Boolean(job.translationsByLocale[trimmed]);
        if (
          hasTranslations &&
          (job.status === "succeeded" || job.status === "waiting_for_review")
        ) {
          return { pageId, status: job.status };
        }
        if (job.targetLocales.includes(trimmed) && isInFlightJobStatus(job.status)) {
          return { pageId, status: job.status };
        }
        return { pageId, status: "missing" as const };
      }),
    });
  }

  return locales;
}
