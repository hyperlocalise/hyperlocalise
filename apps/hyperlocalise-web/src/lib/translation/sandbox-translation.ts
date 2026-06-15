import { Sandbox } from "@vercel/sandbox";

import { env } from "@/lib/env";
import { createConfiguredVercelSandbox } from "@/lib/vercel-sandbox-config";

export const sandboxTimeoutMs = 10 * 60 * 1000;

export type SandboxTranslationContext = {
  projectName?: string | null;
  projectTranslationContext?: string | null;
  jobContext?: string | null;
  glossaryTerms?: Array<{
    sourceTerm: string;
    targetTerm: string;
    targetLocale: string;
    forbidden?: boolean | null;
    caseSensitive?: boolean | null;
    description?: string | null;
  }>;
};

export async function createTranslationSandbox(): Promise<{ sandboxId: string }> {
  const sandbox = await createConfiguredVercelSandbox({
    timeout: sandboxTimeoutMs,
  });

  return { sandboxId: sandbox.name };
}

export async function stopTranslationSandbox(sandboxId: string): Promise<void> {
  const sandbox = await Sandbox.get({ name: sandboxId });
  await sandbox.stop();
}

export async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
  options?: { env?: Record<string, string>; output?: "stdout" | "stderr" | "both" },
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ name: sandboxId });
  const result = await sandbox.runCommand({
    cmd: command,
    args,
    env: options?.env,
  });
  return {
    exitCode: result.exitCode,
    output: await result.output(options?.output ?? "both"),
  };
}

export async function prepareSandbox(sandboxId: string): Promise<void> {
  const installResult = await runSandboxCommand(sandboxId, "bash", [
    "-lc",
    'command -v hl >/dev/null 2>&1 || command -v hyperlocalise >/dev/null 2>&1 || (curl -fsSL https://hyperlocalise.com/install | bash); command -v hl >/dev/null 2>&1 || { mkdir -p ~/.local/bin; ln -sf "$(command -v hyperlocalise)" ~/.local/bin/hl; }',
  ]);
  if (installResult.exitCode !== 0) {
    throw new Error(`hyperlocalise CLI installation failed: ${installResult.output}`);
  }
}

export async function downloadAttachment(
  sandboxId: string,
  downloadUrl: string,
  filename: string,
): Promise<void> {
  const result = await runSandboxCommand(sandboxId, "curl", ["-fsSL", "-o", filename, downloadUrl]);
  if (result.exitCode !== 0) {
    throw new Error(`failed to download attachment: ${result.output}`);
  }
}

export async function writeFileToSandbox(
  sandboxId: string,
  filename: string,
  content: Buffer,
): Promise<void> {
  await writeFilesToSandbox(sandboxId, [{ path: filename, content }]);
}

export async function writeFilesToSandbox(
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

export function buildTempConfig(
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
  instructions: string | null = null,
  context: SandboxTranslationContext | null = null,
): string {
  const yamlString = (value: string) => JSON.stringify(value);
  const normalizedInstructions = instructions?.trim();
  const glossaryTerms = context?.glossaryTerms ?? [];
  const systemPrompt = [
    "You are a translation assistant. Translate the user-provided source text into the requested target language.",
    "Preserve meaning, placeholders, variables, formatting, HTML/Markdown structure, and ICU message syntax.",
    "Do not translate programmatic identifiers inside placeholders or ICU selectors.",
    "Follow project context, job context, and glossary rules as binding translation guidance.",
    "If constraints conflict, preserve placeholders and markup first, then glossary rules, then project and job context.",
    context?.projectName ? `Project: ${context.projectName}` : null,
    context?.projectTranslationContext?.trim()
      ? `Project translation context: ${context.projectTranslationContext.trim()}`
      : null,
    context?.jobContext?.trim() ? `Job context: ${context.jobContext.trim()}` : null,
    normalizedInstructions ? `User style instructions: ${normalizedInstructions}` : null,
    glossaryTerms.length > 0
      ? [
          "Glossary terms:",
          ...glossaryTerms.map((term) =>
            [
              `- ${term.sourceTerm} -> ${term.targetTerm} (${term.targetLocale})`,
              term.forbidden ? "forbidden" : null,
              term.description ? `note: ${term.description}` : null,
            ]
              .filter(Boolean)
              .join("; "),
          ),
        ].join("\n")
      : null,
    "Return only the translated text with no explanations, labels, markdown fences, or quotes unless the translated content itself requires them.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  const userPrompt = ["Translate from {{source}} to {{target}}.", "", "{{input}}"].join("\n");

  return [
    "locales:",
    `  source: ${yamlString(sourceLocale ?? "auto")}`,
    "  targets:",
    `    - ${yamlString(targetLocale)}`,
    "",
    "buckets:",
    "  email:",
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

export async function writeTempConfig(
  sandboxId: string,
  configContent: string,
  configPath: string,
): Promise<void> {
  await writeFilesToSandbox(sandboxId, [{ path: configPath, content: configContent }]);
}

export async function runTranslationCommand(
  sandboxId: string,
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
  instructions: string | null,
): Promise<{ exitCode: number; output: string }> {
  const configPath = "/tmp/hyperlocalise-email.yml";
  const config = buildTempConfig(inputFile, outputFile, sourceLocale, targetLocale, instructions);
  await writeTempConfig(sandboxId, config, configPath);

  return runSandboxCommand(
    sandboxId,
    "bash",
    [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; hl run --config ${shellQuote(configPath)} --locale ${shellQuote(targetLocale)} --force --progress off`,
    ],
    {
      env: getSandboxTranslationEnv(),
    },
  );
}

export async function readTranslatedFile(sandboxId: string, outputFile: string): Promise<Buffer> {
  const sandbox = await Sandbox.get({ name: sandboxId });
  const content = await sandbox.readFileToBuffer({ path: outputFile });
  if (!content) {
    throw new Error(`failed to read translated file: ${outputFile}`);
  }
  return Buffer.from(content);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function getSandboxTranslationEnv(): Record<string, string> {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
  };
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

export const crowdinSandboxConfigPath = "/tmp/crowdin.yml";

export function buildCrowdinTranslationPath(sourceFilename: string): string {
  const lastDot = sourceFilename.lastIndexOf(".");
  if (lastDot === -1) {
    return `${sourceFilename}-%locale%`;
  }

  return `${sourceFilename.slice(0, lastDot)}-%locale%${sourceFilename.slice(lastDot)}`;
}

export function buildCrowdinFileSandboxConfig(input: {
  sourceFilename: string;
  includeBaseUrl: boolean;
}): string {
  const lines = ["project_id_env: CROWDIN_PROJECT_ID", "api_token_env: CROWDIN_PERSONAL_TOKEN"];
  if (input.includeBaseUrl) {
    lines.push("base_url_env: CROWDIN_BASE_URL");
  }

  lines.push(
    "base_path: .",
    "files:",
    `  - source: ${input.sourceFilename}`,
    `    translation: ${buildCrowdinTranslationPath(input.sourceFilename)}`,
  );

  return lines.join("\n");
}

export function getCrowdinSandboxEnv(input: {
  externalProjectId: string;
  secretMaterial: string;
  baseUrl?: string | null;
}): Record<string, string> {
  const env: Record<string, string> = {
    CROWDIN_PROJECT_ID: input.externalProjectId,
    CROWDIN_PERSONAL_TOKEN: input.secretMaterial,
  };
  if (input.baseUrl?.trim()) {
    env.CROWDIN_BASE_URL = input.baseUrl.trim();
  }
  return env;
}

export async function writeCrowdinFileSandboxConfig(input: {
  sandboxId: string;
  sourceFilename: string;
  baseUrl?: string | null;
}): Promise<void> {
  const config = buildCrowdinFileSandboxConfig({
    sourceFilename: input.sourceFilename,
    includeBaseUrl: Boolean(input.baseUrl?.trim()),
  });
  await writeFilesToSandbox(input.sandboxId, [{ path: crowdinSandboxConfigPath, content: config }]);
}

export async function extractSandboxEntries(
  sandboxId: string,
  path: string,
): Promise<Record<string, string> | null> {
  const result = await runSandboxCommand(
    sandboxId,
    "bash",
    ["-lc", `export PATH="$HOME/.local/bin:$PATH"; hl entries ${shellQuote(path)}`],
    { env: getSandboxTranslationEnv(), output: "stdout" },
  );
  if (result.exitCode !== 0) {
    return null;
  }

  return JSON.parse(result.output) as Record<string, string>;
}

export async function downloadCrowdinSourceInSandbox(input: {
  sandboxId: string;
  externalFileId: string;
  sourceFilename: string;
  externalProjectId: string;
  secretMaterial: string;
  baseUrl?: string | null;
}): Promise<void> {
  await writeCrowdinFileSandboxConfig({
    sandboxId: input.sandboxId,
    sourceFilename: input.sourceFilename,
    baseUrl: input.baseUrl,
  });

  const fileId = Number(input.externalFileId);
  if (Number.isNaN(fileId)) {
    throw new Error("Provider file identifiers are invalid");
  }

  const result = await runSandboxCommand(
    input.sandboxId,
    "bash",
    [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; hl crowdin download sources --config ${shellQuote(crowdinSandboxConfigPath)} --file-id ${fileId} --output ${shellQuote(input.sourceFilename)} --force`,
    ],
    { env: getCrowdinSandboxEnv(input) },
  );

  if (result.exitCode !== 0) {
    throw new Error(`crowdin source download failed: ${result.output}`);
  }
}

export async function downloadCrowdinTranslationsInSandbox(input: {
  sandboxId: string;
  targetLocale: string;
  externalProjectId: string;
  secretMaterial: string;
  baseUrl?: string | null;
  mergeApproved?: boolean;
}): Promise<{ ok: true } | { ok: false; output: string }> {
  const mergeFlag = input.mergeApproved ? " --merge-approved" : "";
  const result = await runSandboxCommand(
    input.sandboxId,
    "bash",
    [
      "-lc",
      `export PATH="$HOME/.local/bin:$PATH"; hl crowdin download translations --config ${shellQuote(crowdinSandboxConfigPath)} --language ${shellQuote(input.targetLocale)}${mergeFlag}`,
    ],
    { env: getCrowdinSandboxEnv(input) },
  );

  if (result.exitCode !== 0) {
    return { ok: false, output: result.output };
  }

  return { ok: true };
}

export function userFacingFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown translation failure";

  if (message.startsWith("glossary validation failed")) {
    return message;
  }

  if (message.includes("hyperlocalise CLI installation failed")) {
    return "something went wrong while setting up the translation environment on our end.";
  }

  if (message.includes("failed to download attachment")) {
    return "the attachment couldn't be retrieved. It may have been too large or the link expired.";
  }

  if (message.includes("crowdin source download failed")) {
    return "the source file couldn't be downloaded from Crowdin. This is usually temporary.";
  }

  if (message.includes("translation failed")) {
    return "the file format may not be supported, or the content didn't match what the translator expected.";
  }

  if (message.includes("failed to read translated file")) {
    return "the translation finished, but the output file couldn't be read back. This is usually temporary.";
  }

  return "the translation failed before it could finish. This is usually temporary.";
}
