import { Sandbox } from "@vercel/sandbox";

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
/** Colocated with sandbox source/output files so CLI pathguard root matches. */
export const sandboxI18nConfigPath = "i18n.yml";
export const sandboxFileBucketName = "file";

export type { SandboxTranslationContext };

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
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

  async runCommand(
    sandboxId: string,
    command: string,
    args: string[],
    options?: { env?: Record<string, string>; output?: "stdout" | "stderr" | "both" },
  ): Promise<{ exitCode: number; output: string }> {
    const sandbox = await Sandbox.get({ name: sandboxId });
    const result = await sandbox.runCommand({ cmd: command, args, env: options?.env });
    return {
      exitCode: result.exitCode,
      output: await result.output(options?.output ?? "both"),
    };
  }

  async writeFiles(
    sandboxId: string,
    files: Array<{ path: string; content: string | Buffer }>,
  ): Promise<void> {
    const sandbox = await Sandbox.get({ name: sandboxId });
    await sandbox.writeFiles(
      files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
    );
  }

  async readFile(sandboxId: string, outputFile: string): Promise<Buffer> {
    const sandbox = await Sandbox.get({ name: sandboxId });
    const content = await sandbox.readFileToBuffer({ path: outputFile });
    if (!content) {
      throw new Error(`failed to read translated file: ${outputFile}`);
    }
    return Buffer.from(content);
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
    const yamlString = (value: string) => JSON.stringify(value);
    const systemPrompt = translationPromptPolicy.buildSandboxConfigPrompt(context, instructions);
    const userPrompt = ["Translate from {{source}} to {{target}}.", "", "{{input}}"].join("\n");

    return [
      "locales:",
      `  source: ${yamlString(sourceLocale ?? "auto")}`,
      "  targets:",
      `    - ${yamlString(targetLocale)}`,
      "",
      "buckets:",
      `  ${sandboxFileBucketName}:`,
      "    files:",
      `      - from: ${yamlString(inputFile)}`,
      `        to: ${yamlString(outputFile)}`,
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
    options?: { locale?: string },
  ): Promise<Record<string, string> | null> {
    const locale = options?.locale?.trim();
    const localeFlag = locale ? ` --locale ${shellQuote(locale)}` : "";
    const result = await this.lifecycle.runCommand(
      sandboxId,
      "bash",
      ["-lc", `hl entries ${shellQuote(path)}${localeFlag}`],
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
  options?: { locale?: string },
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
