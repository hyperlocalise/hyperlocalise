import { Sandbox } from "@vercel/sandbox";
import { Resend } from "resend";
import { fetch as workflowFetch, getWorkflowMetadata } from "workflow";

import { env } from "@/lib/env";
import { inferAttachmentContentType, toBase64AttachmentContent } from "@/lib/resend/attachments";
import { getTranslatedFileDiagnostics } from "@/lib/translation/diagnostics";
import type { EmailAgentTask, EmailAgentTaskAttachment } from "@/lib/workflow/types";
import { getInternalApiUrl, internalApiHeaders } from "./internal-api";

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

export function buildTempConfig(
  inputFile: string,
  outputFile: string,
  sourceLocale: string | null,
  targetLocale: string,
  instructions: string | null = null,
): string {
  const yamlString = (value: string) => JSON.stringify(value);
  const normalizedInstructions = instructions?.trim();
  const systemPrompt = [
    "You are a translation assistant. Translate the user-provided source text into the requested target language.",
    "Preserve meaning, placeholders, variables, formatting, HTML/Markdown structure, and ICU message syntax.",
    "Do not translate programmatic identifiers inside placeholders or ICU selectors.",
    normalizedInstructions ? `User style instructions: ${normalizedInstructions}` : null,
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
  instructions: string | null,
): Promise<{ exitCode: number; output: string }> {
  "use step";

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

async function readTranslatedFile(sandboxId: string, outputFile: string): Promise<Buffer> {
  "use step";

  const sandbox = await Sandbox.get({ sandboxId });
  const content = await sandbox.readFileToBuffer({ path: outputFile });
  if (!content) {
    throw new Error(`failed to read translated file: ${outputFile}`);
  }
  return Buffer.from(content);
}

async function logTranslatedFileDiagnostics(
  task: EmailAgentTask,
  attachment: EmailAgentTaskAttachment,
  translatedContent: Buffer,
  outputFilename: string,
): Promise<void> {
  "use step";

  const diagnostics = await getTranslatedFileDiagnostics(translatedContent, outputFilename);

  console.info("[email-translation-workflow] translated email attachment diagnostics", {
    requestId: task.requestId,
    attachmentId: attachment.id,
    sourceFilename: attachment.filename,
    targetLocale: task.parameters.translate.targetLocale,
    diagnostics,
  });
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
  task: EmailAgentTask,
  attachment: EmailAgentTaskAttachment,
  translatedContent: Buffer,
  outputFilename: string,
): Promise<void> {
  "use step";

  if (!env.RESEND_API_KEY) {
    throw new Error("Resend is not configured");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { sourceLocale, targetLocale, instructions } = task.parameters.translate;
  const result = await resend.emails.send({
    from: `${env.RESEND_FROM_NAME ?? "Hyperlocalise"} <${task.inboundEmailAddress}>`,
    to: task.senderEmail,
    replyTo: task.inboundEmailAddress,
    subject: `Re: ${task.subject}`,
    text: [
      `Your translation is ready. I've converted ${attachment.filename} into ${targetLocale} and attached it as ${outputFilename}.`,
      "",
      sourceLocale
        ? `Source: ${sourceLocale} -> ${targetLocale}`
        : `Source: auto-detect -> ${targetLocale}`,
      instructions ? `Instructions applied: ${instructions}` : null,
      "",
      "Let me know if anything looks off or if you need another language.",
      "",
      "—Hyperlocalise Agent",
      `Request ID: ${task.requestId}`,
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
      "In-Reply-To": task.originalMessageId,
      References: task.originalMessageId,
    },
  });

  if (result.error) {
    throw new Error(`failed to send reply email: ${result.error.message}`);
  }
}

async function sendFailureReplyEmail(
  task: EmailAgentTask,
  attachment: EmailAgentTaskAttachment,
  reason: string,
): Promise<void> {
  "use step";

  if (!env.RESEND_API_KEY) {
    throw new Error("Resend is not configured");
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: `${env.RESEND_FROM_NAME ?? "Hyperlocalise"} <${task.inboundEmailAddress}>`,
    to: task.senderEmail,
    replyTo: task.inboundEmailAddress,
    subject: `Re: ${task.subject}`,
    text: [
      `Sorry — I hit a snag while processing ${attachment.filename} and couldn't finish the task.`,
      "",
      `What happened: ${reason}`,
      "Could you double-check the file and send it again? If it fails a second time, just reply and I'll flag it for the team.",
      "",
      "—Hyperlocalise Agent",
      `Request ID: ${task.requestId}`,
    ].join("\n"),
    headers: {
      "In-Reply-To": task.originalMessageId,
      References: task.originalMessageId,
    },
  });

  if (result.error) {
    throw new Error(`failed to send failure reply email: ${result.error.message}`);
  }
}

function userFacingFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown translation failure";

  if (message.includes("hyperlocalise CLI installation failed")) {
    return "something went wrong while setting up the translation environment on our end.";
  }

  if (message.includes("failed to download attachment")) {
    return "the attachment couldn't be retrieved from the email. It may have been too large or the link expired.";
  }

  if (message.includes("translation failed")) {
    return "the file format may not be supported, or the content didn't match what the translator expected (for example, nested JSON keys that don't match a standard i18n structure).";
  }

  if (message.includes("failed to read translated file")) {
    return "the translation finished, but the output file couldn't be read back. This is usually temporary.";
  }

  return "the translation failed before it could finish. This is usually temporary.";
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

function firstTaskAttachment(task: EmailAgentTask): EmailAgentTaskAttachment {
  const attachment = task.inputs.attachments[0];
  if (!attachment) {
    throw new Error("email agent task has no attachments");
  }
  return attachment;
}

async function markEmailTranslationJobRunning(input: {
  jobId: string;
  workflowRunId: string;
}): Promise<void> {
  "use step";

  const response = await workflowFetch(
    getInternalApiUrl(`/email-translation-jobs/${input.jobId}/mark-running`),
    {
      method: "POST",
      headers: internalApiHeaders(),
      body: JSON.stringify({ workflowRunId: input.workflowRunId }),
    },
  );

  if (!response.ok) {
    throw new Error(`failed to mark email translation job running: ${response.status}`);
  }
}

async function markEmailTranslationJobSucceeded(input: {
  jobId: string;
  attachment: EmailAgentTaskAttachment;
  outputFilename: string;
  targetLocale: string;
}): Promise<void> {
  "use step";

  const response = await workflowFetch(
    getInternalApiUrl(`/email-translation-jobs/${input.jobId}/succeed`),
    {
      method: "POST",
      headers: internalApiHeaders(),
      body: JSON.stringify({
        attachment: input.attachment,
        outputFilename: input.outputFilename,
        targetLocale: input.targetLocale,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`failed to mark email translation job succeeded: ${response.status}`);
  }
}

async function markEmailTranslationJobFailed(input: {
  jobId: string;
  reason: string;
}): Promise<void> {
  "use step";

  const response = await workflowFetch(
    getInternalApiUrl(`/email-translation-jobs/${input.jobId}/fail`),
    {
      method: "POST",
      headers: internalApiHeaders(),
      body: JSON.stringify({ reason: input.reason }),
    },
  );

  if (!response.ok) {
    throw new Error(`failed to mark email translation job failed: ${response.status}`);
  }
}

export async function emailTranslationWorkflow(task: EmailAgentTask) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  const attachment = firstTaskAttachment(task);
  const { sourceLocale, targetLocale, instructions } = task.parameters.translate;
  const { sandboxId } = await createTranslationSandbox();
  const inputFile = getSandboxInputFilename(attachment.filename);
  const outputFile = getSandboxOutputFilename(attachment.filename, targetLocale);

  try {
    await markEmailTranslationJobRunning({ jobId: task.jobId, workflowRunId });
    await prepareSandbox(sandboxId);
    await downloadAttachment(sandboxId, attachment.downloadUrl, inputFile);

    const translation = await runTranslationCommand(
      sandboxId,
      inputFile,
      outputFile,
      sourceLocale,
      targetLocale,
      instructions,
    );

    if (translation.exitCode !== 0) {
      throw new Error(`translation failed: ${translation.output}`);
    }

    const translatedContent = await readTranslatedFile(sandboxId, outputFile);
    await logTranslatedFileDiagnostics(task, attachment, translatedContent, outputFile);
    await sendReplyEmail(task, attachment, translatedContent, outputFile);
    await markEmailTranslationJobSucceeded({
      jobId: task.jobId,
      attachment,
      outputFilename: outputFile,
      targetLocale,
    });
  } catch (error) {
    const reason = userFacingFailureReason(error);
    try {
      await sendFailureReplyEmail(task, attachment, reason);
    } catch {
      // Best-effort notification; keep the original workflow error.
    }
    await markEmailTranslationJobFailed({ jobId: task.jobId, reason });
    throw error;
  } finally {
    await stopTranslationSandbox(sandboxId);
  }
}
