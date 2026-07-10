import type { OrganizationMembershipRole } from "@/lib/database/types";
import { isAiActionAllowed } from "@/api/auth/capability-guards";

function isReadableAgentMessagePart(part: unknown) {
  if (!part || typeof part !== "object" || !("type" in part)) {
    return false;
  }

  const type = (part as { type: string }).type;
  return type === "text" || type.startsWith("source-");
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
  T extends { senderType: string; parts?: unknown },
>(messages: T[], role: OrganizationMembershipRole): T[] {
  return messages.map((message) => {
    if (message.senderType !== "agent" || message.parts == null) {
      return message;
    }

    return {
      ...message,
      parts: redactSensitiveAgentMessageParts(message.parts, role),
    };
  });
}
