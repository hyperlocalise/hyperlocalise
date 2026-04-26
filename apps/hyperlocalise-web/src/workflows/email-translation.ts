import { Sandbox } from "@vercel/sandbox";
import { Resend } from "resend";

import { env } from "@/lib/env";
import { inferAttachmentContentType, toBase64AttachmentContent } from "@/lib/resend/attachments";
import type { EmailTranslationEventData } from "@/lib/workflow/types";

const sandboxTimeoutMs = 10 * 60 * 1000;

async function createTranslationSandbox(): Promise<{ sandboxId: string }> {
  "use step";

  const sandbox = await Sandbox.create({
    timeout: sandboxTimeoutMs,
  });

  return { sandboxId: sandbox.sandboxId };
}

async function stopTranslationSandbox(sandboxId: string): Promise<void> {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.stop();
}

async function runSandboxCommand(
  sandboxId: string,
  command: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ sandboxId });
  const result = await sandbox.runCommand({
    cmd: command,
    args,
    env: options?.env,
  });
  return {
    exitCode: result.exitCode,
    output: await result.output("both"),
  };
}

async function prepareSandbox(sandboxId: string): Promise<void> {
  "use step";

  const installResult = await runSandboxCommand(sandboxId, "bash", [
    "-lc",
    'command -v hl >/dev/null 2>&1 || command -v hyperlocalise >/dev/null 2>&1 || (curl -fsSL https://hyperlocalise.com/install | bash); command -v hl >/dev/null 2>&1 || { mkdir -p ~/.local/bin; ln -sf "$(command -v hyperlocalise)" ~/.local/bin/hl; }',
  ]);
  if (installResult.exitCode !== 0) {
    throw new Error(`hyperlocalise CLI installation failed: ${installResult.output}`);
  }
}

async function downloadAttachment(
  sandboxId: string,
  downloadUrl: string,
  filename: string,
): Promise<void> {
  "use step";

  const result = await runSandboxCommand(sandboxId, "curl", ["-fsSL", "-o", filename, downloadUrl]);
  if (result.exitCode !== 0) {
    throw new Error(`failed to download attachment: ${result.output}`);
  }
}

function buildTempConfig(
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
): string {
  const yamlString = (value: string) => JSON.stringify(value);

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
  ].join("\n");
}

async function writeTempConfig(
  sandboxId: string,
  configContent: string,
  configPath: string,
): Promise<void> {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId });
  await sandbox.writeFiles([{ path: configPath, content: configContent }]);
}

async function runTranslationCommand(
  sandboxId: string,
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
): Promise<{ exitCode: number; output: string }> {
  "use step";

  const configPath = "/tmp/hyperlocalise-email.yml";
  const config = buildTempConfig(inputFile, outputFile, sourceLocale, targetLocale);
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

async function readTranslatedFile(sandboxId: string, outputFile: string): Promise<Buffer> {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId });
  const content = await sandbox.readFileToBuffer({ path: outputFile });
  if (!content) {
    throw new Error(`failed to read translated file: ${outputFile}`);
  }
  return content;
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

async function sendReplyEmail(
  event: EmailTranslationEventData,
  translatedContent: Buffer,
  outputFilename: string,
): Promise<void> {
  "use step";

  if (!env.RESEND_API_KEY) {
    throw new Error("Resend is not configured");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: `${env.RESEND_FROM_NAME ?? "Hyperlocalise"} <${event.inboundEmailAddress}>`,
    to: event.senderEmail,
    replyTo: event.inboundEmailAddress,
    subject: `Re: ${event.subject}`,
    text: [
      `Done: ${event.attachmentFilename}`,
      event.sourceLocale
        ? `Translated: ${event.sourceLocale} -> ${event.targetLocale}`
        : `Translated: auto-detect -> ${event.targetLocale}`,
      `Attached: ${outputFilename}`,
      event.instructions
        ? "Note: style instructions were captured, but email translation does not apply them yet."
        : null,
      "",
      `Request ID: ${event.requestId}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    attachments: [
      {
        filename: outputFilename,
        content: toBase64AttachmentContent(translatedContent),
        contentType: inferAttachmentContentType(outputFilename),
      },
    ],
    headers: {
      "In-Reply-To": event.originalMessageId,
      References: event.originalMessageId,
    },
  });

  if (result.error) {
    throw new Error(`failed to send reply email: ${result.error.message}`);
  }
}

async function sendFailureReplyEmail(
  event: EmailTranslationEventData,
  reason: string,
): Promise<void> {
  "use step";

  if (!env.RESEND_API_KEY) {
    throw new Error("Resend is not configured");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: `${env.RESEND_FROM_NAME ?? "Hyperlocalise"} <${event.inboundEmailAddress}>`,
    to: event.senderEmail,
    replyTo: event.inboundEmailAddress,
    subject: `Re: ${event.subject}`,
    text: [
      `I couldn't translate ${event.attachmentFilename}.`,
      "",
      `Reason: ${reason}`,
      "You can reply with a corrected file or try sending the request again.",
      "",
      `Request ID: ${event.requestId}`,
    ].join("\n"),
    headers: {
      "In-Reply-To": event.originalMessageId,
      References: event.originalMessageId,
    },
  });

  if (result.error) {
    throw new Error(`failed to send failure reply email: ${result.error.message}`);
  }
}

function userFacingFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown translation failure";

  if (message.includes("hyperlocalise CLI installation failed")) {
    return "the translation runner could not be prepared.";
  }

  if (message.includes("failed to download attachment")) {
    return "the attachment could not be downloaded.";
  }

  if (message.includes("translation failed")) {
    return "the translation runner could not process this file.";
  }

  if (message.includes("failed to read translated file")) {
    return "the translated output file could not be read.";
  }

  return "the translation workflow failed before it could finish.";
}

function getOutputFilename(inputFilename: string, targetLocale: string): string {
  const lastDot = inputFilename.lastIndexOf(".");
  if (lastDot === -1) {
    return `${inputFilename}-${targetLocale}`;
  }
  const name = inputFilename.slice(0, lastDot);
  const ext = inputFilename.slice(lastDot);
  return `${name}-${targetLocale}${ext}`;
}

function sanitizeFilename(email: string): string {
  return email.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getSandboxInputFilename(attachmentFilename: string): string {
  return sanitizeFilename(attachmentFilename);
}

export function getSandboxOutputFilename(attachmentFilename: string, targetLocale: string): string {
  return getOutputFilename(sanitizeFilename(attachmentFilename), targetLocale);
}

export async function emailTranslationWorkflow(event: EmailTranslationEventData) {
  "use workflow";

  const { sandboxId } = await createTranslationSandbox();
  const inputFile = getSandboxInputFilename(event.attachmentFilename);
  const outputFile = getSandboxOutputFilename(event.attachmentFilename, event.targetLocale);

  try {
    await prepareSandbox(sandboxId);
    await downloadAttachment(sandboxId, event.attachmentDownloadUrl, inputFile);

    const translation = await runTranslationCommand(
      sandboxId,
      inputFile,
      outputFile,
      event.sourceLocale,
      event.targetLocale,
    );

    if (translation.exitCode !== 0) {
      throw new Error(`translation failed: ${translation.output}`);
    }

    const translatedContent = await readTranslatedFile(sandboxId, outputFile);
    await sendReplyEmail(event, translatedContent, outputFile);
  } catch (error) {
    try {
      await sendFailureReplyEmail(event, userFacingFailureReason(error));
    } catch {
      // Best-effort notification; keep the original workflow error.
    }
    throw error;
  } finally {
    await stopTranslationSandbox(sandboxId);
  }
}
