import { createHash } from "node:crypto";

import { convertWordsToLorem } from "../src/intents/design_editor/lorem_generator";
import {
  buildSourcePath,
  parseTranslationFile,
  segmentsToTranslationFile,
} from "../src/intents/design_editor/segment-file";
import type { DesignSegment } from "../src/intents/design_editor/types";

export type HyperlocaliseConfig = {
  apiUrl: string;
  apiKey?: string;
};

export type LocalizeDesignInput = {
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  designId: string;
  segments: DesignSegment[];
};

export type LocalizeDesignResult = {
  jobId: string;
  translationsByLocale: Record<string, Record<string, string>>;
  mode: "hyperlocalise" | "preview";
};

type HyperlocaliseErrorResponse = {
  error?: string;
  message?: string;
};

type UploadedFileResponse = {
  file: {
    id: string;
  };
};

type CreatedJobResponse = {
  job: {
    id: string;
    status: string;
  };
};

type JobStatusResponse = {
  job: {
    id: string;
    status: string;
    lastError?: string | null;
    outputFiles?: Array<{
      fileId: string;
      locale: string;
      filename: string;
    }> | null;
  };
};

const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_ATTEMPTS = 120;

function apiHeaders(apiKey: string): HeadersInit {
  return {
    "x-api-key": apiKey,
  };
}

async function readError(response: Response): Promise<HyperlocaliseErrorResponse> {
  return (await response.json().catch(() => ({}))) as HyperlocaliseErrorResponse;
}

function previewTranslations(
  segments: DesignSegment[],
  targetLocales: string[],
): Record<string, Record<string, string>> {
  const sourceTexts = segments.map((segment) => segment.text);
  const loremTexts = convertWordsToLorem(sourceTexts);

  return Object.fromEntries(
    targetLocales.map((locale) => [
      locale,
      Object.fromEntries(
        segments.map((segment, index) => [
          segment.key,
          `[${locale}] ${loremTexts[index] ?? segment.text}`,
        ]),
      ),
    ]),
  );
}

async function uploadSourceFile(
  config: HyperlocaliseConfig,
  input: {
    projectId: string;
    designId: string;
    segments: DesignSegment[];
  },
): Promise<string> {
  const sourcePath = buildSourcePath(input.designId);
  const translationFile = segmentsToTranslationFile(input.segments);
  const fileBody = JSON.stringify(translationFile, null, 2);
  const sourceHash = createHash("sha256").update(fileBody).digest("hex");

  const formData = new FormData();
  formData.set("projectId", input.projectId);
  formData.set("sourcePath", sourcePath);
  formData.set("sourceHash", sourceHash);
  formData.set(
    "file",
    new Blob([fileBody], { type: "application/json" }),
    `${input.designId}.json`,
  );

  const response = await fetch(`${config.apiUrl}/files`, {
    method: "POST",
    headers: apiHeaders(config.apiKey!),
    body: formData,
  });

  if (!response.ok) {
    const error = await readError(response);
    throw new Error(error.message ?? error.error ?? "file_upload_failed");
  }

  const payload = (await response.json()) as UploadedFileResponse;
  return payload.file.id;
}

async function createTranslationJob(
  config: HyperlocaliseConfig,
  input: {
    projectId: string;
    sourceFileId: string;
    sourceLocale: string;
    targetLocales: string[];
  },
): Promise<string> {
  const response = await fetch(`${config.apiUrl}/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey!,
    },
    body: JSON.stringify({
      type: "file",
      projectId: input.projectId,
      fileInput: {
        sourceFileId: input.sourceFileId,
        fileFormat: "json",
        sourceLocale: input.sourceLocale,
        targetLocales: input.targetLocales,
        metadata: {
          integration: "canva-app",
        },
      },
    }),
  });

  if (!response.ok) {
    const error = await readError(response);
    throw new Error(error.message ?? error.error ?? "job_create_failed");
  }

  const payload = (await response.json()) as CreatedJobResponse;
  return payload.job.id;
}

async function waitForJob(
  config: HyperlocaliseConfig,
  jobId: string,
): Promise<JobStatusResponse["job"]> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${config.apiUrl}/jobs/${jobId}`, {
      headers: apiHeaders(config.apiKey!),
    });

    if (!response.ok) {
      const error = await readError(response);
      throw new Error(error.message ?? error.error ?? "job_status_failed");
    }

    const payload = (await response.json()) as JobStatusResponse;
    const job = payload.job;

    if (job.status === "succeeded") {
      return job;
    }

    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(job.lastError ?? "translation_job_failed");
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("translation_job_timed_out");
}

async function downloadTranslatedFile(
  config: HyperlocaliseConfig,
  fileId: string,
): Promise<Record<string, string>> {
  const response = await fetch(`${config.apiUrl}/files/${fileId}/download`, {
    headers: apiHeaders(config.apiKey!),
  });

  if (!response.ok) {
    const error = await readError(response);
    throw new Error(error.message ?? error.error ?? "file_download_failed");
  }

  const content = (await response.json()) as Record<string, unknown>;
  return parseTranslationFile(content);
}

export async function localizeDesignWithHyperlocalise(
  config: HyperlocaliseConfig,
  input: LocalizeDesignInput,
): Promise<LocalizeDesignResult> {
  if (!config.apiKey) {
    return {
      jobId: "preview",
      translationsByLocale: previewTranslations(input.segments, input.targetLocales),
      mode: "preview",
    };
  }

  const sourceFileId = await uploadSourceFile(config, {
    projectId: input.projectId,
    designId: input.designId,
    segments: input.segments,
  });

  const jobId = await createTranslationJob(config, {
    projectId: input.projectId,
    sourceFileId,
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });

  const completedJob = await waitForJob(config, jobId);
  const outputFiles = completedJob.outputFiles ?? [];

  const translationsByLocale: Record<string, Record<string, string>> = {};
  for (const outputFile of outputFiles) {
    translationsByLocale[outputFile.locale] = await downloadTranslatedFile(
      config,
      outputFile.fileId,
    );
  }

  return {
    jobId,
    translationsByLocale,
    mode: "hyperlocalise",
  };
}
