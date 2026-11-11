export type SanitySegment = {
  key: string;
  documentId: string;
  documentType: string;
  text: string;
};

export type SanityDocumentJob = {
  jobId: string;
  status: string;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
  lastError: string | null;
  translationsByLocale: Record<string, Record<string, string>>;
};
