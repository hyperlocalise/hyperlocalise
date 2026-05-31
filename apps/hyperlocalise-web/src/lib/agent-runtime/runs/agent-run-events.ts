import type { Thread } from "chat";

import { addInteractionMessage } from "@/lib/conversations/interactions";

type AddAgentMessage = (input: {
  interactionId: string;
  senderType: "agent";
  text: string;
}) => Promise<unknown>;

type TrackedPostState = {
  addMessage: AddAgentMessage;
  interactionId: string;
};

const trackedThreadPosts = new WeakMap<object, TrackedPostState>();

function getPostText(content: unknown) {
  if (typeof content === "string") {
    return content;
  }
  if (
    typeof content === "object" &&
    content !== null &&
    "raw" in content &&
    typeof content.raw === "string"
  ) {
    return content.raw;
  }
  if (
    typeof content === "object" &&
    content !== null &&
    "markdown" in content &&
    typeof content.markdown === "string"
  ) {
    return content.markdown;
  }
  return "";
}

export function wrapThreadPostForInteraction<TState>(
  thread: Thread<TState>,
  interactionId: string,
  addMessage: AddAgentMessage = addInteractionMessage,
) {
  const existing = trackedThreadPosts.get(thread);
  if (existing) {
    existing.interactionId = interactionId;
    existing.addMessage = addMessage;
    return;
  }

  const trackedState: TrackedPostState = { interactionId, addMessage };
  trackedThreadPosts.set(thread, trackedState);

  const originalPost = thread.post.bind(thread);
  thread.post = async (...args: Parameters<typeof originalPost>) => {
    const result = await originalPost(...args);

    try {
      const text = getPostText(args[0]);
      if (text) {
        await trackedState.addMessage({
          interactionId: trackedState.interactionId,
          senderType: "agent",
          text,
        });
      }
    } catch {
      // Best-effort tracking
    }

    return result;
  };
}
