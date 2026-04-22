import { Sandbox } from "@vercel/sandbox";
import { Resend } from "resend";

import { env } from "@/lib/env";
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
): Promise<{ exitCode: number; output: string }> {
  const sandbox = await Sandbox.get({ sandboxId });
  const result = await sandbox.runCommand(command, args);
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

async function runTranslationCommand(
  sandboxId: string,
  inputFile: string,
  outputFile: string,
  sourceLocale: string,
  targetLocale: string,
): Promise<{ exitCode: number; output: string }> {
  "use step";

  return runSandboxCommand(sandboxId, "bash", [
    "-lc",
    `export PATH="$HOME/.local/bin:$PATH"; hl translate --input ${shellQuote(inputFile)} --output ${shellQuote(outputFile)} --source ${shellQuote(sourceLocale)} --target ${shellQuote(targetLocale)}`,
  ]);
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

async function sendReplyEmail(
  event: EmailTranslationEventData,
  translatedContent: Buffer,
  outputFilename: string,
): Promise<void> {
  "use step";

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_ADDRESS) {
    throw new Error("Resend is not configured");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: `${env.RESEND_FROM_NAME ?? "Hyperlocalise"} <${env.RESEND_FROM_ADDRESS}>`,
    to: event.senderEmail,
    subject: `Re: ${event.subject}`,
    text: `Here is your translated file (${event.sourceLocale} → ${event.targetLocale}).`,
    attachments: [
      {
        filename: outputFilename,
        content: translatedContent,
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

export async function emailTranslationWorkflow(event: EmailTranslationEventData) {
  "use workflow";

  const { sandboxId } = await createTranslationSandbox();
  const inputFile = `input-${sanitizeFilename(event.senderEmail)}`;
  const outputFile = getOutputFilename(
    sanitizeFilename(event.attachmentFilename),
    event.targetLocale,
  );

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
  } finally {
    await stopTranslationSandbox(sandboxId);
  }
}
