export const PAGE_BINDING_KEY = "hyperlocalise:binding:v1";

export type FigmaPageJobBinding = {
  projectId: string;
  jobId: string;
  sourcePath: string;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parsePageJobBinding(value: string | null | undefined): FigmaPageJobBinding | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      !hasValue(candidate.projectId) ||
      !hasValue(candidate.jobId) ||
      !hasValue(candidate.sourcePath)
    ) {
      return null;
    }
    return {
      projectId: candidate.projectId.trim(),
      jobId: candidate.jobId.trim(),
      sourcePath: candidate.sourcePath.trim(),
    };
  } catch {
    return null;
  }
}

export function serializePageJobBinding(binding: FigmaPageJobBinding): string {
  return JSON.stringify({
    projectId: binding.projectId,
    jobId: binding.jobId,
    sourcePath: binding.sourcePath,
  });
}

function parseHttpUrl(value: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  return parsed;
}

export function buildFigmaJobUrl(input: {
  appUrl: string;
  organizationSlug: string;
  projectId: string;
  jobId: string;
}): string | null {
  const parsed = parseHttpUrl(input.appUrl);
  if (!parsed) {
    return null;
  }

  return new URL(
    `/org/${encodeURIComponent(input.organizationSlug)}/projects/${encodeURIComponent(input.projectId)}/jobs/${encodeURIComponent(input.jobId)}`,
    parsed.origin,
  ).href;
}
