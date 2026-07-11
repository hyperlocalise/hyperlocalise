type ChatRequestMessage = {
  id: string;
  role: string;
  parts?: unknown[];
};

function extractTextFromParts(parts: unknown[] | undefined) {
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

export function extractLastUserMessage(messages: ChatRequestMessage[] | undefined) {
  if (!messages?.length) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    return {
      id: message.id,
      text: extractTextFromParts(message.parts),
    };
  }

  return null;
}
