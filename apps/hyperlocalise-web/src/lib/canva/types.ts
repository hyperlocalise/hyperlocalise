export type CanvaDesignSegment = {
  key: string;
  pageIndex: number;
  contentIndex: number;
  regionIndex: number;
  text: string;
};

export type CanvaConnectionSummary = {
  id: string;
  organizationId: string;
  apiKeyId: string;
  projectId: string;
  displayName: string;
  sourceLocale: string;
  targetLocales: string[];
  canvaBrandId: string | null;
  connectionTokenPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CanvaConnectionSecretResult = {
  connection: CanvaConnectionSummary;
  connectionToken: string;
};

export type LocalizeCanvaDesignResult = {
  jobId: string;
  translationsByLocale: Record<string, Record<string, string>>;
};

export type CanvaVerifiedUser = {
  userId: string;
  brandId: string;
};
