import type { OrganizationMembershipRole } from "@/lib/database/types";
import { isAiActionAllowed } from "@/api/auth/capability-guards";

function isReadableAgentMessagePart(part: unknown) {
  if (!part || typeof part !== "object" || !("type" in part)) {
    return false;
  }

  const type = (part as { type: string }).type;
  return type === "text" || type.startsWith("source-");
}

function textFromReadableParts(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .flatMap((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return [part.text];
      }
      return [];
    })
    .join("\n");
}

export function redactSensitiveAgentMessageParts(parts: unknown, role: OrganizationMembershipRole) {
  if (!parts || isAiActionAllowed(role)) {
    return parts;
  }

  if (!Array.isArray(parts)) {
    return parts;
  }

  return parts.filter(isReadableAgentMessagePart);
}

export function sanitizeInteractionMessagesForRole<
  T extends { senderType: string; text?: string; parts?: unknown },
>(messages: T[], role: OrganizationMembershipRole): T[] {
  return messages.map((message) => {
    if (message.senderType !== "agent" || isAiActionAllowed(role)) {
      return message;
    }

    if (message.parts == null) {
      return message;
    }

    const parts = redactSensitiveAgentMessageParts(message.parts, role);
    return {
      ...message,
      parts,
      text: textFromReadableParts(parts),
    };
  });
}

export function sanitizeLastMessagePreviewForRole<
  T extends { text: string; senderType: string; parts?: unknown },
>(message: T | null | undefined, role: OrganizationMembershipRole): Omit<T, "parts"> | null {
  if (!message) {
    return null;
  }

  const { parts, ...preview } = message;
  if (message.senderType !== "agent" || isAiActionAllowed(role)) {
    return preview;
  }

  if (parts == null) {
    return preview;
  }

  return {
    ...preview,
    text: textFromReadableParts(redactSensitiveAgentMessageParts(parts, role)),
  };
}
