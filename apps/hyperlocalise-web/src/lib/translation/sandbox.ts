import { Sandbox, StreamError } from "@vercel/sandbox";

import { env } from "@/lib/env";
import { createConfiguredVercelSandbox } from "@/lib/vercel-sandbox-config";
import {
  inferSupportedFileTranslationFileFormat,
  isSupportedFileTranslationFileFormat,
  type SupportedTranslationFileFormat,
} from "@/lib/translation/file-formats";
import { translationPromptPolicy } from "@/lib/translation/generation";
import type { SandboxTranslationContext } from "@/lib/translation/domain";

export const sandboxTimeoutMs = 10 * 60 * 1000;
export const crowdinSandboxConfigPath = "/tmp/crowdin.yml";
/** Colocated with sandbox source/output files so CLI pathguard root matches.
 *  Reserved name so a user source named i18n.yml is not overwritten. */
export const sandboxI18nConfigPath = ".hl-sandbox-i18n.yml";
export const sandboxFileBucketName = "file";

export type { SandboxTranslationContext };

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

function errorCauseMessage(error: unknown): string {
  if (!error || typeof error !== "object" || !("cause" in error)) {
    return "";
  }
  return errorMessage((error as { cause?: unknown }).cause);
}

/**
 * True when the sandbox command stream itself died (session no longer accepts commands).
 * The SDK's withResume only recovers HTTP 410/422 stopped states — not StreamError —
 * so callers must stop+resume (or recreate) before retrying commands.
 */
export function isSandboxStreamClosedError(error: unknown): boolean {
  if (error instanceof StreamError) {
    return error.code === "sandbox_stream_closed" || error.code === "stream_ended_early";
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as { name?: unknown; code?: unknown; message?: unknown };
  const code = typeof err.code === "string" ? err.code : null;
  if (code === "sandbox_stream_closed" || code === "stream_ended_early") {
    return true;
  }

  const message = errorMessage(error);
  return (
    message.includes("Sandbox stream was closed and is not accepting commands") ||
    message.includes("sandbox_stream_closed") ||
    message.includes("stream_ended_early")
  );
}

/**
 * Transient transport failures while talking to a still-running sandbox.
 * Commonly undici `TypeError: terminated` when the NDJSON/wait connection drops.
 */
export function isSandboxTransientNetworkError(error: unknown): boolean {
  if (isSandboxStreamClosedError(error)) {
    return false;
  }

  const message = errorMessage(error);
  const cause = errorCauseMessage(error);
  const combined = `${message}\n${cause}`;

  if (error instanceof TypeError && message === "terminated") {
    return true;
  }

  return (
    message === "terminated" ||
    combined.includes("fetch failed") ||
    combined.includes("ECONNRESET") ||
    combined.includes("ECONNREFUSED") ||
    combined.includes("ETIMEDOUT") ||
    combined.includes("socket hang up") ||
    combined.includes("other side closed") ||
    combined.includes("UND_ERR_")
  );
}

/** Any disconnect that should trigger sandbox recovery or workflow recreate. */
export function isSandboxDisconnectError(error: unknown): boolean {
  return isSandboxStreamClosedError(error) || isSandboxTransientNetworkError(error);
}

export class SandboxErrorMapper {
  userFacingFailureReason(
    error: unknown,
    detection?: {
      fileFormat?: string | null;
      sourceExtension?: string | null;
    },
  ): string {
    const message = error instanceof Error ? error.message : "Unknown translation failure";

    if (message.startsWith("glossary validation failed")) {
      return message;
    }

    if (
      message.includes("hyperlocalise CLI installation failed") ||
      message.includes("sandbox tool installation failed")
    ) {
      return "something went wrong while setting up the translation environment on our end.";
    }

    if (message.includes("failed to download attachment")) {
      return "the attachment couldn't be retrieved. It may have been too large or the link expired.";
    }

    if (message.includes("crowdin source download failed")) {
      return "the source file couldn't be downloaded from Crowdin. This is usually temporary.";
    }

    if (message.includes("translation failed") || message.includes("failed to extract entries")) {
      const fileFormat = detection?.fileFormat?.trim() || null;
      const extension = detection?.sourceExtension?.trim() || null;
      const inferredFromExtension = extension
        ? inferSupportedFileTranslationFileFormat(
            `file${extension.startsWith(".") ? extension : `.${extension}`}`,
          )
        : null;
      const supportedFormat =
        (fileFormat &&
        isSupportedFileTranslationFileFormat(fileFormat as SupportedTranslationFileFormat)
          ? (fileFormat as SupportedTranslationFileFormat)
          : null) || inferredFromExtension;
      const detected = fileFormat || supportedFormat || extension?.replace(/^\./, "") || null;
      const kindMatch = /kind=([a-z0-9_]+)/i.exec(message);
      const kind = kindMatch?.[1] ?? null;

      if (kind === "markdown_ast_parity_mismatch" || kind === "markdown_parity_retry_exhausted") {
        return "markdown translation finished but the output structure no longer matched the source. Try again, or simplify complex markdown in the source file.";
      }
      if (kind === "placeholder_parity_mismatch") {
        return "the translation changed placeholders or markup that must stay identical to the source.";
      }
      if (kind === "parser_failed" || kind === "missing_file_extension") {
        if (detected && !supportedFormat) {
          return `the detected file format (${detected}) is not supported for file translation.`;
        }
        return detected
          ? `the ${detected} file couldn't be parsed for translation.`
          : "the file couldn't be parsed for translation.";
      }
      if (supportedFormat && detected) {
        return `translating the ${detected} file failed. This is usually temporary — try again.`;
      }
      if (detected) {
        return `the detected file format (${detected}) may not be supported, or the content didn't match what the translator expected.`;
      }
      return "the file format may not be supported, or the content didn't match what the translator expected.";
    }

    if (message.includes("failed to read translated file")) {
      return "the translation finished, but the output file couldn't be read back. This is usually temporary.";
    }

    if (isSandboxDisconnectError(error)) {
      return "the translation environment disconnected mid-run. This is usually temporary — try again.";
    }

    return "the translation failed before it could finish. This is usually temporary.";
  }
}

export class SandboxLifecycle {
  async create(): Promise<{ sandboxId: string }> {
    const sandbox = await createConfiguredVercelSandbox({ timeout: sandboxTimeoutMs });
    return { sandboxId: sandbox.name };
  }

  async stop(sandboxId: string): Promise<void> {
    const sandbox = await Sandbox.get({ name: sandboxId });
    await sandbox.stop();
  }

  /**
   * Force a new session after the command stream dies.
   * Persistent sandboxes restore filesystem from the last snapshot on resume.
   */
  async recoverSession(sandboxId: string): Promise<void> {
    try {
      const sandbox = await Sandbox.get({ name: sandboxId, resume: false });
      await sandbox.stop();
    } catch (error) {
      // Already stopped / gone — still try resume below.
      if (!isSandboxDisconnectError(error)) {
        console.warn("[sandbox] stop before resume failed", {
          sandboxId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    await Sandbox.get({ name: sandboxId, resume: true });
  }

  private async withDisconnectRecovery<T>(sandboxId: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (!isSandboxDisconnectError(error)) {
        throw error;
      }

      console.warn("[sandbox] disconnect during sandbox IO; recovering session", {
        sandboxId,
        streamClosed: isSandboxStreamClosedError(error),
        transientNetwork: isSandboxTransientNetworkError(error),
        error: error instanceof Error ? error.message : "unknown",
      });
      try {
        await this.recoverSession(sandboxId);
      } catch (recoverError) {
        console.warn("[sandbox] session recovery failed", {
          sandboxId,
          error: recoverError instanceof Error ? recoverError.message : "unknown",
        });
        throw error;
      }
      return fn();
    }
  }

  async runCommand(
    sandboxId: string,
    command: string,
    args: string[],
    options?: { env?: Record<string, string>; output?: "stdout" | "stderr" | "both" },
  ): Promise<{ exitCode: number; output: string }> {
    return this.withDisconnectRecovery(sandboxId, async () => {
      const sandbox = await Sandbox.get({ name: sandboxId });
      // Detached start + wait avoids the long-lived NDJSON wait:true stream that
      // undici often aborts with TypeError: terminated on long hl runs.
      const started = await sandbox.runCommand({
        cmd: command,
        args,
        env: options?.env,
        detached: true,
      });

      let finished;
      try {
        finished = await started.wait();
      } catch (error) {
        if (!isSandboxTransientNetworkError(error)) {
          throw error;
        }
        // Wait connection dropped, but the command may still be running.
        // Poll getCommand again without tearing down the sandbox.
        console.warn("[sandbox] wait connection dropped; retrying command wait", {
          sandboxId,
          cmdId: started.cmdId,
          error: error instanceof Error ? error.message : "unknown",
        });
        finished = await started.wait();
      }

      return {
        exitCode: finished.exitCode,
        output: await finished.output(options?.output ?? "both"),
      };
    });
  }

  async writeFiles(
    sandboxId: string,
    files: Array<{ path: string; content: string | Buffer }>,
  ): Promise<void> {
    return this.withDisconnectRecovery(sandboxId, async () => {
      const sandbox = await Sandbox.get({ name: sandboxId });
      await sandbox.writeFiles(
        files.map((file) => ({
          path: file.path,
          content: file.content,
        })),
      );
    });
  }

  async readFile(sandboxId: string, outputFile: string): Promise<Buffer> {
    return this.withDisconnectRecovery(sandboxId, async () => {
      const sandbox = await Sandbox.get({ name: sandboxId });
      const content = await sandbox.readFileToBuffer({ path: outputFile });
      if (!content) {
        throw new Error(`failed to read translated file: ${outputFile}`);
      }
      return Buffer.from(content);
    });
  }
}

export class HyperlocaliseCliConfigBuilder {
  build(
    inputFile: string,
    outputFile: string,
    sourceLocale: string | null,
    targetLocale: string,
    instructions: string | null = null,
    context: SandboxTranslationContext | null = null,
  ): string {
    return this.buildMultiLocale(
      inputFile,
      outputFile,
      sourceLocale,
      [targetLocale],
      instructions,
      context,
    );
  }

  buildMultiLocale(
    inputFile: string,
    outputPattern: string,
    sourceLocale: string | null,
    targetLocales: string[],
    instructions: string | null = null,
    context: SandboxTranslationContext | null = null,
  ): string {
    const yamlString = (value: string) => JSON.stringify(value);
    const systemPrompt = translationPromptPolicy.buildSandboxConfigPrompt(context, instructions);
    const userPrompt = ["Translate from {{source}} to {{target}}.", "", "{{input}}"].join("\n");
    const targets = targetLocales.map((locale) => `    - ${yamlString(locale)}`);

    return [
      "locales:",
      `  source: ${yamlString(sourceLocale ?? "auto")}`,
      "  targets:",
      ...targets,
      "",
      "buckets:",
      `  ${sandboxFileBucketName}:`,
      "    files:",
      `      - from: ${yamlString(inputFile)}`,
      `        to: ${yamlString(outputPattern)}`,
      "",
      "llm:",
      "  profiles:",
      "    default:",
      "      provider: openai",
      "      model: gpt-5.4-mini",
      `      system_prompt: ${yamlString(systemPrompt)}`,
      `      user_prompt: ${yamlString(userPrompt)}`,
    ].join("\n");
  }
}

export class CrowdinSandboxOperations {
  constructor(private readonly lifecycle = new SandboxLifecycle()) {}

  buildTranslationPath(sourceFilename: string): string {
    const lastDot = sourceFilename.lastIndexOf(".");
    if (lastDot === -1) {
      return `${sourceFilename}-%locale%`;
    }

    return `${sourceFilename.slice(0, lastDot)}-%locale%${sourceFilename.slice(lastDot)}`;
  }

  buildFileConfig(input: { sourceFilename: string; includeBaseUrl: boolean }): string {
    const lines = ["project_id_env: CROWDIN_PROJECT_ID", "api_token_env: CROWDIN_PERSONAL_TOKEN"];
    if (input.includeBaseUrl) {
      lines.push("base_url_env: CROWDIN_BASE_URL");
    }

    lines.push(
      "base_path: .",
      "files:",
      `  - source: ${input.sourceFilename}`,
      `    translation: ${this.buildTranslationPath(input.sourceFilename)}`,
    );

    return lines.join("\n");
  }

  getEnv(input: {
    externalProjectId: string;
    secretMaterial: string;
    baseUrl?: string | null;
  }): Record<string, string> {
    const crowdinEnv: Record<string, string> = {
      CROWDIN_PROJECT_ID: input.externalProjectId,
      CROWDIN_PERSONAL_TOKEN: input.secretMaterial,
    };
    if (input.baseUrl?.trim()) {
      crowdinEnv.CROWDIN_BASE_URL = input.baseUrl.trim();
    }
    return crowdinEnv;
  }

  async writeFileConfig(input: {
    sandboxId: string;
    sourceFilename: string;
    baseUrl?: string | null;
  }): Promise<void> {
    const config = this.buildFileConfig({
      sourceFilename: input.sourceFilename,
      includeBaseUrl: Boolean(input.baseUrl?.trim()),
    });
    await this.lifecycle.writeFiles(input.sandboxId, [
      { path: crowdinSandboxConfigPath, content: config },
    ]);
  }

  async downloadSource(input: {
    sandboxId: string;
    externalFileId: string;
    sourceFilename: string;
    externalProjectId: string;
    secretMaterial: string;
    baseUrl?: string | null;
  }): Promise<void> {
    await this.writeFileConfig({
      sandboxId: input.sandboxId,
      sourceFilename: input.sourceFilename,
      baseUrl: input.baseUrl,
    });

    const fileId = Number(input.externalFileId);
    if (Number.isNaN(fileId)) {
      throw new Error("Provider file identifiers are invalid");
    }

    const result = await this.lifecycle.runCommand(
      input.sandboxId,
      "bash",
      [
        "-lc",
        `hl crowdin download sources --config ${shellQuote(crowdinSandboxConfigPath)} --file-id ${fileId} --output ${shellQuote(input.sourceFilename)} --force`,
      ],
      { env: this.getEnv(input) },
    );

    if (result.exitCode !== 0) {
      throw new Error(`crowdin source download failed: ${result.output}`);
    }
  }

  async downloadTranslations(input: {
    sandboxId: string;
    targetLocale: string;
    externalProjectId: string;
    secretMaterial: string;
    baseUrl?: string | null;
    mergeApproved?: boolean;
  }): Promise<{ ok: true } | { ok: false; output: string }> {
    const mergeFlag = input.mergeApproved ? " --merge-approved" : "";
    const result = await this.lifecycle.runCommand(
      input.sandboxId,
      "bash",
      [
        "-lc",
        `hl crowdin download translations --config ${shellQuote(crowdinSandboxConfigPath)} --language ${shellQuote(input.targetLocale)}${mergeFlag}`,
      ],
      { env: this.getEnv(input) },
    );

    if (result.exitCode !== 0) {
      return { ok: false, output: result.output };
    }

    return { ok: true };
  }
}

export class HyperlocaliseCliRunner {
  constructor(
    private readonly lifecycle = new SandboxLifecycle(),
    private readonly configBuilder = new HyperlocaliseCliConfigBuilder(),
    private readonly crowdinOps?: CrowdinSandboxOperations,
    private readonly errorMapper = new SandboxErrorMapper(),
  ) {
    this.crowdinOps ??= new CrowdinSandboxOperations(this.lifecycle);
  }

  get crowdin() {
    return this.crowdinOps!;
  }

  get errors() {
    return this.errorMapper;
  }

  async prepare(_sandboxId: string): Promise<void> {
    // hyperlocalise CLI is installed during sandbox creation in vercel-sandbox-config.
  }

  async downloadAttachment(
    sandboxId: string,
    downloadUrl: string,
    filename: string,
  ): Promise<void> {
    const result = await this.lifecycle.runCommand(sandboxId, "curl", [
      "-fsSL",
      "-o",
      filename,
      downloadUrl,
    ]);
    if (result.exitCode !== 0) {
      throw new Error(`failed to download attachment: ${result.output}`);
    }
  }

  async writeFile(sandboxId: string, filename: string, content: Buffer): Promise<void> {
    await this.lifecycle.writeFiles(sandboxId, [{ path: filename, content }]);
  }

  async writeFiles(
    sandboxId: string,
    files: Array<{ path: string; content: string | Buffer }>,
  ): Promise<void> {
    await this.lifecycle.writeFiles(sandboxId, files);
  }

  buildConfig(
    inputFile: string,
    outputFile: string,
    sourceLocale: string | null,
    targetLocale: string,
    instructions: string | null = null,
    context: SandboxTranslationContext | null = null,
  ): string {
    return this.configBuilder.build(
      inputFile,
      outputFile,
      sourceLocale,
      targetLocale,
      instructions,
      context,
    );
  }

  buildMultiLocaleConfig(
    inputFile: string,
    outputPattern: string,
    sourceLocale: string | null,
    targetLocales: string[],
    instructions: string | null = null,
    context: SandboxTranslationContext | null = null,
  ): string {
    return this.configBuilder.buildMultiLocale(
      inputFile,
      outputPattern,
      sourceLocale,
      targetLocales,
      instructions,
      context,
    );
  }

  async writeTempConfig(
    sandboxId: string,
    configContent: string,
    configPath: string,
  ): Promise<void> {
    await this.lifecycle.writeFiles(sandboxId, [{ path: configPath, content: configContent }]);
  }

  async runTranslation(
    sandboxId: string,
    inputFile: string,
    outputFile: string,
    sourceLocale: string | null,
    targetLocale: string,
    instructions: string | null,
  ): Promise<{ exitCode: number; output: string }> {
    const config = this.configBuilder.build(
      inputFile,
      outputFile,
      sourceLocale,
      targetLocale,
      instructions,
    );
    await this.writeTempConfig(sandboxId, config, sandboxI18nConfigPath);

    return this.lifecycle.runCommand(
      sandboxId,
      "bash",
      [
        "-lc",
        `hl run --config ${shellQuote(sandboxI18nConfigPath)} --locale ${shellQuote(targetLocale)} --force --progress off`,
      ],
      { env: getSandboxTranslationEnv() },
    );
  }

  async readTranslatedFile(sandboxId: string, outputFile: string): Promise<Buffer> {
    return this.lifecycle.readFile(sandboxId, outputFile);
  }

  async extractEntries(
    sandboxId: string,
    path: string,
    options?: { locale?: string; sourcePath?: string },
  ): Promise<Record<string, string> | null> {
    const locale = options?.locale?.trim();
    const localeFlag = locale ? ` --locale ${shellQuote(locale)}` : "";
    const sourcePath = options?.sourcePath?.trim();
    const sourceFlag = sourcePath ? ` --source ${shellQuote(sourcePath)}` : "";
    const result = await this.lifecycle.runCommand(
      sandboxId,
      "bash",
      ["-lc", `hl entries ${shellQuote(path)}${localeFlag}${sourceFlag}`],
      { env: getSandboxTranslationEnv(), output: "stdout" },
    );
    if (result.exitCode !== 0) {
      return null;
    }

    return JSON.parse(result.output) as Record<string, string>;
  }
}

const defaultLifecycle = new SandboxLifecycle();
const defaultRunner = new HyperlocaliseCliRunner(defaultLifecycle);

export function getSandboxTranslationEnv(): Record<string, string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return { OPENAI_API_KEY: env.OPENAI_API_KEY };
}

export function getOutputFilename(inputFilename: string, targetLocale: string): string {
  const lastDot = inputFilename.lastIndexOf(".");
  if (lastDot === -1) {
    return `${inputFilename}-${targetLocale}`;
  }
  const name = inputFilename.slice(0, lastDot);
  const ext = inputFilename.slice(lastDot);
  return `${name}-${targetLocale}${ext}`;
}

/** Output path pattern for multi-locale `hl run` configs (`{{target}}` resolved by the CLI). */
export function getOutputFilenamePattern(inputFilename: string): string {
  const lastDot = inputFilename.lastIndexOf(".");
  if (lastDot === -1) {
    return `${inputFilename}-{{target}}`;
  }
  const name = inputFilename.slice(0, lastDot);
  const ext = inputFilename.slice(lastDot);
  return `${name}-{{target}}${ext}`;
}

export function sanitizeFilename(email: string): string {
  return email.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getSandboxInputFilename(attachmentFilename: string): string {
  return sanitizeFilename(attachmentFilename);
}

export function getSandboxOutputFilename(attachmentFilename: string, targetLocale: string): string {
  return getOutputFilename(sanitizeFilename(attachmentFilename), targetLocale);
}

export async function createTranslationSandbox() {
  return defaultLifecycle.create();
}

export async function stopTranslationSandbox(sandboxId: string) {
  return defaultLifecycle.stop(sandboxId);
}

export async function recoverTranslationSandboxSession(sandboxId: string) {
  return defaultLifecycle.recoverSession(sandboxId);
}

export async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
  options?: { env?: Record<string, string>; output?: "stdout" | "stderr" | "both" },
) {
  return defaultLifecycle.runCommand(sandboxId, command, args, options);
}

export async function prepareSandbox(sandboxId: string) {
  return defaultRunner.prepare(sandboxId);
}

export async function downloadAttachment(sandboxId: string, downloadUrl: string, filename: string) {
  return defaultRunner.downloadAttachment(sandboxId, downloadUrl, filename);
}

export async function writeFileToSandbox(sandboxId: string, filename: string, content: Buffer) {
  return defaultRunner.writeFile(sandboxId, filename, content);
}

export async function writeFilesToSandbox(
  sandboxId: string,
  files: Array<{ path: string; content: string | Buffer }>,
) {
  return defaultRunner.writeFiles(sandboxId, files);
}

export function buildTempConfig(
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
  instructions: string | null = null,
  context: SandboxTranslationContext | null = null,
) {
  return defaultRunner.buildConfig(
    inputFile,
    outputFile,
    sourceLocale,
    targetLocale,
    instructions,
    context,
  );
}

export function buildMultiLocaleTempConfig(
  inputFile: string,
  outputPattern: string,
  sourceLocale: string | null,
  targetLocales: string[],
  instructions: string | null = null,
  context: SandboxTranslationContext | null = null,
) {
  return defaultRunner.buildMultiLocaleConfig(
    inputFile,
    outputPattern,
    sourceLocale,
    targetLocales,
    instructions,
    context,
  );
}

export async function writeTempConfig(
  sandboxId: string,
  configContent: string,
  configPath: string,
) {
  return defaultRunner.writeTempConfig(sandboxId, configContent, configPath);
}

export async function runTranslationCommand(
  sandboxId: string,
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
  instructions: string | null,
) {
  return defaultRunner.runTranslation(
    sandboxId,
    inputFile,
    outputFile,
    sourceLocale,
    targetLocale,
    instructions,
  );
}

export async function readTranslatedFile(sandboxId: string, outputFile: string) {
  return defaultRunner.readTranslatedFile(sandboxId, outputFile);
}

export function buildCrowdinTranslationPath(sourceFilename: string) {
  return defaultRunner.crowdin.buildTranslationPath(sourceFilename);
}

export function buildCrowdinFileSandboxConfig(input: {
  sourceFilename: string;
  includeBaseUrl: boolean;
}) {
  return defaultRunner.crowdin.buildFileConfig(input);
}

export function getCrowdinSandboxEnv(input: {
  externalProjectId: string;
  secretMaterial: string;
  baseUrl?: string | null;
}) {
  return defaultRunner.crowdin.getEnv(input);
}

export async function writeCrowdinFileSandboxConfig(input: {
  sandboxId: string;
  sourceFilename: string;
  baseUrl?: string | null;
}) {
  return defaultRunner.crowdin.writeFileConfig(input);
}

export async function extractSandboxEntries(
  sandboxId: string,
  path: string,
  options?: { locale?: string; sourcePath?: string },
) {
  return defaultRunner.extractEntries(sandboxId, path, options);
}

export async function downloadCrowdinSourceInSandbox(
  input: Parameters<CrowdinSandboxOperations["downloadSource"]>[0],
) {
  return defaultRunner.crowdin.downloadSource(input);
}

export async function downloadCrowdinTranslationsInSandbox(
  input: Parameters<CrowdinSandboxOperations["downloadTranslations"]>[0],
) {
  return defaultRunner.crowdin.downloadTranslations(input);
}

export function userFacingFailureReason(
  error: unknown,
  detection?: {
    fileFormat?: string | null;
    sourceExtension?: string | null;
  },
) {
  return defaultRunner.errors.userFacingFailureReason(error, detection);
}
