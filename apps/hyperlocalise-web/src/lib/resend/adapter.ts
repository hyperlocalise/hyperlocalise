import {
  ConsoleLogger,
  Message,
  NotImplementedError,
  type Adapter,
  type AdapterPostableMessage,
  type Author,
  type ChannelInfo,
  type ChannelVisibility,
  type ChatInstance,
  type FetchResult,
  type FormattedContent,
  type Logger,
  type RawMessage,
  type ThreadInfo,
  type WebhookOptions,
} from "chat";
import { createHash } from "node:crypto";
import { Resend } from "resend";

import { toBase64AttachmentContent } from "@/lib/resend/attachments";

export type ResendThreadId = {
  senderEmail: string;
  threadHash: string;
};

export type ResendRawMessage = {
  type: "email.received";
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  messageId: string;
  attachments: Array<{
    id: string;
    filename: string | null;
    contentType: string;
  }>;
};

export interface ResendAdapterConfig {
  fromAddress: string;
  fromName?: string;
  replyToAddress?: string;
  apiKey?: string;
  webhookSecret?: string;
  userName?: string;
  logger?: Logger;
}

function normalizeSubject(subject: string): string {
  let s = subject.trim();
  const prefix = /^(?:re|fwd|fw):\s*/i;
  while (prefix.test(s)) {
    s = s.replace(prefix, "");
  }
  return s.toLowerCase();
}

function hashString(str: string): string {
  return createHash("sha256").update(str).digest("hex").slice(0, 12);
}

function getThreadHash(subject: string, replyToAddress?: string): string {
  return hashString(`${normalizeSubject(subject)}:${replyToAddress?.toLowerCase() ?? ""}`);
}

function parseEmailAddress(address: string): { name?: string; email: string } {
  const bracketed = address.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  if (bracketed) {
    return { name: bracketed[1]?.trim(), email: bracketed[2]?.trim() ?? address };
  }
  return { email: address.trim() };
}

function getReplyToAddress(addresses: string[]) {
  const parsed = addresses.map((address) => parseEmailAddress(address).email);
  return (
    parsed.find((email) => email.toLowerCase().endsWith("@inbox.hyperlocalise.com")) ?? parsed[0]
  );
}

const THREAD_METADATA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

class ResendAdapter implements Adapter<ResendThreadId, ResendRawMessage> {
  readonly name = "resend";
  readonly userName: string;
  readonly lockScope = "thread" as const;
  readonly persistMessageHistory = true;

  private readonly resend: Resend;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly replyToAddress?: string;
  private readonly webhookSecret: string;
  private readonly logger: Logger;
  private chat?: ChatInstance;

  constructor(config: ResendAdapterConfig) {
    this.fromAddress = config.fromAddress;
    this.fromName = config.fromName ?? "Bot";
    this.replyToAddress = config.replyToAddress;
    this.userName = config.userName ?? "email-bot";
    this.webhookSecret = config.webhookSecret ?? process.env.RESEND_WEBHOOK_SECRET ?? "";
    this.resend = new Resend(config.apiKey ?? process.env.RESEND_API_KEY);
    this.logger = config.logger ?? new ConsoleLogger("info");
  }

  async initialize(chat: ChatInstance): Promise<void> {
    this.chat = chat;
  }

  private getStateAdapter() {
    if (!this.chat) {
      throw new Error("Adapter not initialized");
    }
    return this.chat.getState();
  }

  private getThreadStateKey(threadId: string): string {
    return `resend:thread:${threadId}:metadata`;
  }

  private async getThreadMetadata(
    threadId: string,
  ): Promise<{ subject: string; messageId: string; replyToAddress?: string } | null> {
    const state = this.getStateAdapter();
    return state.get(this.getThreadStateKey(threadId));
  }

  private async setThreadMetadata(
    threadId: string,
    metadata: { subject: string; messageId: string; replyToAddress?: string },
  ): Promise<void> {
    const state = this.getStateAdapter();
    await state.set(this.getThreadStateKey(threadId), metadata, THREAD_METADATA_TTL_MS);
  }

  encodeThreadId(platformData: ResendThreadId): string {
    return `resend:${platformData.senderEmail}:${platformData.threadHash}`;
  }

  decodeThreadId(threadId: string): ResendThreadId {
    const parts = threadId.split(":");
    if (parts.length < 3 || parts[0] !== "resend") {
      throw new Error(`Invalid resend thread ID: ${threadId}`);
    }
    const senderEmail = parts[1]!;
    const threadHash = parts[2]!;
    return { senderEmail, threadHash };
  }

  channelIdFromThreadId(threadId: string): string {
    const { senderEmail } = this.decodeThreadId(threadId);
    return `resend:${senderEmail}`;
  }

  parseMessage(
    raw: ResendRawMessage,
    replyToAddress = getReplyToAddress(raw.to),
  ): Message<ResendRawMessage> {
    const { email } = parseEmailAddress(raw.from);
    const threadId = this.encodeThreadId({
      senderEmail: email,
      threadHash: getThreadHash(raw.subject, replyToAddress),
    });

    const author: Author = {
      userId: email,
      userName: email,
      fullName: email,
      isBot: false,
      isMe: false,
    };

    const attachments = raw.attachments.map((att) => {
      const isImage = att.contentType.startsWith("image/");
      return {
        type: isImage ? ("image" as const) : ("file" as const),
        name: att.filename ?? "attachment",
        mimeType: att.contentType,
        fetchData: async () => {
          const result = await this.resend.emails.receiving.attachments.get({
            emailId: raw.emailId,
            id: att.id,
          });
          let downloadUrl = result.data?.download_url;
          if (!downloadUrl) {
            const listResult = await this.resend.emails.receiving.attachments.list({
              emailId: raw.emailId,
            });
            const fallback = listResult.data?.data.find(
              (candidate) =>
                candidate.id === att.id ||
                (candidate.filename === att.filename && candidate.content_type === att.contentType),
            );
            downloadUrl = fallback?.download_url;
          }
          if (!downloadUrl) {
            throw new Error(`Failed to fetch attachment: ${result.error?.message ?? "unknown"}`);
          }
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`Failed to download attachment: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          return Buffer.from(arrayBuffer);
        },
      };
    });

    return new Message({
      id: raw.emailId,
      threadId,
      text: raw.text,
      formatted: {
        type: "root",
        children: [{ type: "paragraph", children: [{ type: "text", value: raw.text }] }],
      },
      raw,
      author,
      metadata: { dateSent: new Date(), edited: false },
      attachments,
      isMention: true,
    });
  }

  async handleWebhook(request: Request, options?: WebhookOptions): Promise<Response> {
    const body = await request.text();

    const id = request.headers.get("svix-id") ?? "";
    const timestamp = request.headers.get("svix-timestamp") ?? "";
    const signature = request.headers.get("svix-signature") ?? "";

    if (!this.webhookSecret) {
      this.logger.warn("Resend webhook secret not configured, skipping verification");
    } else {
      try {
        this.resend.webhooks.verify({
          payload: body,
          headers: { id, timestamp, signature },
          webhookSecret: this.webhookSecret,
        });
      } catch (error) {
        this.logger.error("Webhook verification failed", error);
        return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
      }
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
    }

    const event = payload as { type?: string; data?: Record<string, unknown> };
    if (event.type !== "email.received") {
      return new Response(JSON.stringify({ status: "ignored" }), { status: 200 });
    }

    const data = event.data;
    if (!data) {
      return new Response(JSON.stringify({ error: "missing_data" }), { status: 400 });
    }

    const getString = (value: unknown, defaultValue = ""): string => {
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") return String(value);
      return defaultValue;
    };

    const rawMessage: ResendRawMessage = {
      type: "email.received",
      emailId: getString(data.email_id),
      from: getString(data.from),
      to: Array.isArray(data.to) ? data.to.map((v) => getString(v)) : [],
      subject: getString(data.subject),
      text: getString(data.text),
      html: getString(data.html) || undefined,
      messageId: getString(data.message_id),
      attachments: Array.isArray(data.attachments)
        ? data.attachments.map((att: Record<string, unknown>) => ({
            id: getString(att.id),
            filename: att.filename ? getString(att.filename) : null,
            contentType: getString(att.content_type, "application/octet-stream"),
          }))
        : [],
    };

    if (!rawMessage.text && rawMessage.emailId) {
      const result = await this.resend.emails.receiving.get(rawMessage.emailId);
      if (result.error || !result.data) {
        this.logger.warn(
          `Failed to fetch received email content: ${result.error?.message ?? "unknown"}`,
        );
      } else {
        rawMessage.text = result.data.text ?? "";
        rawMessage.html = result.data.html ?? rawMessage.html;
        rawMessage.subject = result.data.subject || rawMessage.subject;
        rawMessage.from = result.data.from || rawMessage.from;
        rawMessage.to = result.data.to.length > 0 ? result.data.to : rawMessage.to;
        rawMessage.messageId = result.data.message_id || rawMessage.messageId;
        if (rawMessage.attachments.length === 0 && result.data.attachments.length > 0) {
          rawMessage.attachments = result.data.attachments.map((att) => ({
            id: att.id,
            filename: att.filename,
            contentType: att.content_type,
          }));
        }
      }
    }

    const replyToAddress = getReplyToAddress(rawMessage.to);
    const message = this.parseMessage(rawMessage, replyToAddress);

    const metadata = {
      subject: rawMessage.subject,
      messageId: rawMessage.messageId,
      replyToAddress,
    };
    await this.setThreadMetadata(message.threadId, metadata);

    if (!this.chat) {
      return new Response(JSON.stringify({ error: "not_initialized" }), { status: 503 });
    }

    this.chat.processMessage(this, message.threadId, message, options);
    return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
  }

  async postMessage(
    threadId: string,
    message: AdapterPostableMessage,
  ): Promise<RawMessage<ResendRawMessage>> {
    const { senderEmail } = this.decodeThreadId(threadId);
    const metadata = await this.getThreadMetadata(threadId);

    let text = "";
    if (typeof message === "string") {
      text = message;
    } else if ("markdown" in message) {
      text = message.markdown;
    } else if ("raw" in message) {
      text = message.raw;
    } else if ("ast" in message) {
      text = this.renderFormatted(message.ast);
    }

    const attachments: Array<{ filename: string; content: Buffer }> = [];
    if (typeof message === "object" && "files" in message && Array.isArray(message.files)) {
      for (const file of message.files) {
        const data =
          file.data instanceof ArrayBuffer
            ? Buffer.from(file.data)
            : file.data instanceof Blob
              ? Buffer.from(await file.data.arrayBuffer())
              : file.data;
        attachments.push({ filename: file.filename, content: data });
      }
    }

    const subject = metadata ? `Re: ${metadata.subject}` : "Reply";
    const headers: Record<string, string> = {};
    if (metadata?.messageId) {
      headers["In-Reply-To"] = metadata.messageId;
      headers["References"] = metadata.messageId;
    }

    const result = await this.resend.emails.send({
      from: `${this.fromName} <${this.fromAddress}>`,
      to: senderEmail,
      replyTo: metadata?.replyToAddress ?? this.replyToAddress,
      subject,
      text,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: toBase64AttachmentContent(a.content),
      })),
      headers,
    });

    if (result.error) {
      throw new Error(`Failed to send email: ${result.error.message}`);
    }

    const emailId = result.data?.id ?? `resend-${Date.now()}`;

    return {
      id: emailId,
      threadId,
      raw: {
        type: "email.received",
        emailId,
        from: this.fromAddress,
        to: [senderEmail],
        subject,
        text,
        messageId: emailId,
        attachments: [],
      },
    };
  }

  async editMessage(): Promise<RawMessage<ResendRawMessage>> {
    throw new NotImplementedError("Email messages cannot be edited", "editMessage");
  }

  async deleteMessage(): Promise<void> {
    throw new NotImplementedError("Email messages cannot be deleted", "deleteMessage");
  }

  async addReaction(): Promise<void> {
    throw new NotImplementedError("Reactions are not supported for email", "addReaction");
  }

  async removeReaction(): Promise<void> {
    throw new NotImplementedError("Reactions are not supported for email", "removeReaction");
  }

  async startTyping(): Promise<void> {
    // No-op for email
  }

  async fetchMessages(): Promise<FetchResult<ResendRawMessage>> {
    return { messages: [] };
  }

  async fetchThread(threadId: string): Promise<ThreadInfo> {
    const { senderEmail } = this.decodeThreadId(threadId);
    return {
      id: threadId,
      channelId: this.channelIdFromThreadId(threadId),
      metadata: { senderEmail },
      isDM: true,
    };
  }

  async fetchChannelInfo(channelId: string): Promise<ChannelInfo> {
    return {
      id: channelId,
      metadata: {},
      name: channelId,
      isDM: true,
      channelVisibility: "private",
    };
  }

  isDM(): boolean {
    return true;
  }

  getChannelVisibility(): ChannelVisibility {
    return "private";
  }

  renderFormatted(content: FormattedContent): string {
    const extractText = (node: unknown): string => {
      if (!node || typeof node !== "object") return "";
      const n = node as Record<string, unknown>;
      if (n.type === "text") {
        const value = n.value;
        if (typeof value === "string") return value;
        if (typeof value === "number" || typeof value === "boolean") return String(value);
        return "";
      }
      if (Array.isArray(n.children)) {
        return n.children.map(extractText).join("");
      }
      return "";
    };
    return extractText(content);
  }

  async openDM(userId: string): Promise<string> {
    return this.encodeThreadId({ senderEmail: userId, threadHash: "default" });
  }

  async fetchMessage(): Promise<Message<ResendRawMessage> | null> {
    return null;
  }

  async postChannelMessage(): Promise<RawMessage<ResendRawMessage>> {
    throw new NotImplementedError(
      "Channel messages are not supported for email",
      "postChannelMessage",
    );
  }

  async postEphemeral(): Promise<{
    id: string;
    raw: ResendRawMessage;
    threadId: string;
    usedFallback: boolean;
  }> {
    throw new NotImplementedError(
      "Ephemeral messages are not supported for email",
      "postEphemeral",
    );
  }

  async scheduleMessage(): Promise<{
    scheduledMessageId: string;
    postAt: Date;
    raw: ResendRawMessage;
    channelId: string;
    cancel: () => Promise<void>;
  }> {
    throw new NotImplementedError(
      "Scheduled messages are not supported for email",
      "scheduleMessage",
    );
  }

  async stream(): Promise<RawMessage<ResendRawMessage>> {
    throw new NotImplementedError("Streaming is not supported for email", "stream");
  }

  async listThreads(): Promise<{
    threads: Array<{
      id: string;
      rootMessage: Message<ResendRawMessage>;
      lastReplyAt?: Date;
      replyCount?: number;
    }>;
    nextCursor?: string;
  }> {
    return { threads: [] };
  }

  async openModal(): Promise<{ viewId: string }> {
    throw new NotImplementedError("Modals are not supported for email", "openModal");
  }

  async onThreadSubscribe(): Promise<void> {
    // No-op
  }

  async editObject(): Promise<RawMessage<ResendRawMessage>> {
    throw new NotImplementedError("Objects are not supported for email", "editObject");
  }

  async postObject(): Promise<RawMessage<ResendRawMessage>> {
    throw new NotImplementedError("Objects are not supported for email", "postObject");
  }
}

export function createResendAdapter(config: ResendAdapterConfig): ResendAdapter {
  return new ResendAdapter(config);
}

export type { ResendAdapter };
