export type CanvaDesignSegment = {
  key: string;
  pageIndex: number;
  contentIndex: number;
  regionIndex: number;
  text: string;
};

export type StartCanvaLocalizationResult = {
  jobId: string;
};

export type CanvaLocalizationStatus =
  | {
      jobId: string;
      status: "queued" | "running";
    }
  | {
      jobId: string;
      status: "succeeded";
      translationsByLocale: Record<string, Record<string, string>>;
    };

export type CanvaVerifiedUser = {
  userId: string;
  brandId: string;
};

export type CanvaOrganizationSummary = {
  id: string;
  name: string;
  slug: string | null;
  role: string;
};

export type CanvaProjectSummary = {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[];
};
