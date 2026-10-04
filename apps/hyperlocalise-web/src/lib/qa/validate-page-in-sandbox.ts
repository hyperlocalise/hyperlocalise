/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { z } from "zod";

import { createVercelSandboxWorkspace } from "@/lib/agent-runtime/workspaces/vercel-sandbox-runtime";
import { createLogger, serializeErrorForLog } from "@/lib/log";
import { installQaSpellingSandboxCommand } from "@/lib/vercel-sandbox-config";
import type { QaCheckPolicy } from "./qa-policy";
import type { TranslationQaGlossaryTerm } from "./types";

const logger = createLogger("translation-qa-sandbox");

const QA_WORKSPACE_DIR = ".hyperlocalise-qa";
const INPUT_PATH = `${QA_WORKSPACE_DIR}/segments.json`;
const POLICY_PATH = `${QA_WORKSPACE_DIR}/policy.json`;
const OUTPUT_PATH = `${QA_WORKSPACE_DIR}/results.json`;
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;

export class QaCliUnavailableError extends Error {
  constructor() {
    super("The sandbox CLI does not support hl validate yet");
    this.name = "QaCliUnavailableError";
  }
}

const findingSchema = z.object({
  checkType: z.string(),
  severity: z.enum(["error", "warning"]),
  category: z.enum(["qa", "length", "placeholder", "glossary", "syntax", "spelling"]),
  message: z.string(),
  relatedTokens: z.array(z.string()),
});

const outputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      checks: z.array(findingSchema),
      skippedChecks: z.array(z.string()).optional(),
    }),
  ),
});

export type QaPageSegment = {
  id: string;
  sourceText: string;
  targetText: string;
  sourcePath: string;
  targetLocale: string;
  maxLength: number;
};

async function cleanupQaWorkspaceFiles(workspace: {
  runCommand: (command: string, args: string[]) => Promise<{ exitCode: number }>;
}) {
  await workspace.runCommand("bash", ["-lc", `rm -rf ${QA_WORKSPACE_DIR}`]).catch(() => undefined);
}

function utf8Bytes(value: string) {
  return Buffer.byteLength(value, "utf8");
}

function outputBytes(output: string | undefined) {
  return output ? utf8Bytes(output) : 0;
}

export async function validateQaPageInSandbox(input: {
  segments: QaPageSegment[];
  policy: QaCheckPolicy;
  glossaryTerms: TranslationQaGlossaryTerm[];
  acceptedWordsByLocale: Record<string, string[]>;
  logContext?: {
    runId?: string;
    projectId?: string;
    page?: number;
  };
}) {
  const policyJson = JSON.stringify({
    version: 1,
    checks: input.policy,
    glossaryTerms: input.glossaryTerms,
    acceptedWordsByLocale: input.acceptedWordsByLocale,
  });
  const segmentsJson = JSON.stringify({ segments: input.segments });
  const locales = new Set(input.segments.map((segment) => segment.targetLocale));
  const acceptedWordCount = Object.values(input.acceptedWordsByLocale).reduce(
    (count, words) => count + words.length,
    0,
  );
  const log = logger.child({
    runId: input.logContext?.runId,
    projectId: input.logContext?.projectId,
    page: input.logContext?.page,
  });
  const pageStartedAt = Date.now();
  let phase = "create_workspace";
  let sandboxId: string | undefined;

  log.info(
    {
      phase,
      segmentCount: input.segments.length,
      localeCount: locales.size,
      glossaryTermCount: input.glossaryTerms.length,
      acceptedWordCount,
      acceptedWordLocaleCount: Object.keys(input.acceptedWordsByLocale).length,
      policyBytes: utf8Bytes(policyJson),
      segmentBytes: utf8Bytes(segmentsJson),
    },
    "qa sandbox page validate started",
  );

  let workspace: Awaited<ReturnType<typeof createVercelSandboxWorkspace>> | undefined;
  try {
    const createStartedAt = Date.now();
    workspace = await createVercelSandboxWorkspace({
      timeoutMs: SANDBOX_TIMEOUT_MS,
      imageScope: "qa",
      sandboxOptions: {
        snapshotExpiration: 0,
        keepLastSnapshots: { count: 1 },
      },
    });
    sandboxId = workspace.id;
    log.info(
      { phase, sandboxId, durationMs: Date.now() - createStartedAt },
      "qa sandbox workspace created",
    );

    phase = "cli_availability";
    const availabilityStartedAt = Date.now();
    const availability = await workspace.runCommand("hl", ["validate", "--help"], {
      output: "stdout",
    });
    log.info(
      {
        phase,
        sandboxId,
        exitCode: availability.exitCode,
        outputBytes: outputBytes(availability.output),
        durationMs: Date.now() - availabilityStartedAt,
      },
      "qa sandbox cli_availability completed",
    );
    if (availability.exitCode !== 0) throw new QaCliUnavailableError();

    phase = "spelling_install";
    const spellingStartedAt = Date.now();
    const spellingInstall = await workspace.runCommand("bash", [
      "-lc",
      `export DICPATH=/usr/share/hunspell; ${installQaSpellingSandboxCommand}`,
    ]);
    log.info(
      {
        phase,
        sandboxId,
        exitCode: spellingInstall.exitCode,
        outputBytes: outputBytes(spellingInstall.output),
        durationMs: Date.now() - spellingStartedAt,
      },
      "qa sandbox spelling_install completed",
    );
    if (spellingInstall.exitCode !== 0) {
      throw new Error("QA sandbox spelling dependency installation failed");
    }

    phase = "write_policy";
    const policyStartedAt = Date.now();
    await workspace.writeFile(POLICY_PATH, policyJson);
    log.info(
      {
        phase,
        sandboxId,
        path: POLICY_PATH,
        bytes: utf8Bytes(policyJson),
        durationMs: Date.now() - policyStartedAt,
      },
      "qa sandbox write_policy completed",
    );

    phase = "write_segments";
    const segmentsStartedAt = Date.now();
    await workspace.writeFile(INPUT_PATH, segmentsJson);
    log.info(
      {
        phase,
        sandboxId,
        path: INPUT_PATH,
        bytes: utf8Bytes(segmentsJson),
        durationMs: Date.now() - segmentsStartedAt,
      },
      "qa sandbox write_segments completed",
    );

    phase = "validate";
    const validateStartedAt = Date.now();
    const command = await workspace.runCommand("bash", [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; export DICPATH=/usr/share/hunspell; hl validate --input-file ${INPUT_PATH} --policy-file ${POLICY_PATH} --format json > ${OUTPUT_PATH}`,
    ]);
    log.info(
      {
        phase,
        sandboxId,
        exitCode: command.exitCode,
        outputBytes: outputBytes(command.output),
        durationMs: Date.now() - validateStartedAt,
      },
      "qa sandbox validate completed",
    );
    if (command.exitCode !== 0) {
      throw new Error(`QA CLI validation failed (exit ${command.exitCode})`);
    }

    phase = "read_results";
    const readStartedAt = Date.now();
    const reportJson = await workspace.readFile(OUTPUT_PATH);
    const parsed = outputSchema.safeParse(JSON.parse(reportJson));
    if (!parsed.success || parsed.data.results.length !== input.segments.length) {
      log.warn(
        {
          phase,
          sandboxId,
          reportBytes: utf8Bytes(reportJson),
          resultCount: parsed.success ? parsed.data.results.length : 0,
          expectedResultCount: input.segments.length,
          parseSuccess: parsed.success,
          durationMs: Date.now() - readStartedAt,
        },
        "qa sandbox read_results invalid",
      );
      throw new Error("QA CLI returned an invalid validation report");
    }
    for (const [index, result] of parsed.data.results.entries()) {
      if (result.id !== input.segments[index]?.id) {
        throw new Error("QA CLI returned out-of-order validation results");
      }
    }
    const findingCount = parsed.data.results.reduce(
      (count, result) => count + result.checks.length,
      0,
    );
    log.info(
      {
        phase,
        sandboxId,
        reportBytes: utf8Bytes(reportJson),
        resultCount: parsed.data.results.length,
        findingCount,
        durationMs: Date.now() - readStartedAt,
        pageDurationMs: Date.now() - pageStartedAt,
      },
      "qa sandbox page validate completed",
    );
    return parsed.data.results;
  } catch (error) {
    if (error instanceof QaCliUnavailableError) {
      log.warn(
        {
          phase,
          sandboxId,
          pageDurationMs: Date.now() - pageStartedAt,
        },
        "qa sandbox cli unavailable",
      );
    } else {
      log.error(
        {
          phase,
          sandboxId,
          err: serializeErrorForLog(error),
          pageDurationMs: Date.now() - pageStartedAt,
        },
        "qa sandbox page validate failed",
      );
    }
    throw error;
  } finally {
    if (workspace) {
      await cleanupQaWorkspaceFiles(workspace);
      try {
        await workspace.stop();
        log.info({ phase: "stop", sandboxId }, "qa sandbox workspace stopped");
      } catch (error) {
        log.warn(
          { phase: "stop", sandboxId, err: serializeErrorForLog(error) },
          "qa sandbox workspace stop failed",
        );
      }
    }
  }
}
