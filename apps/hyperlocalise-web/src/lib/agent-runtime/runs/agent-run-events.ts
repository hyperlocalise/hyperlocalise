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
  originalPost: Thread<unknown>["post"];
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

  const originalPost = thread.post.bind(thread);
  const trackedState: TrackedPostState = { interactionId, addMessage, originalPost };
  trackedThreadPosts.set(thread, trackedState);

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

/** Posts to Slack (or other chat surfaces) without persisting to the interaction message store. */
export async function postThreadMessageWithoutTracking<TState>(
  thread: Thread<TState>,
  ...args: Parameters<Thread<TState>["post"]>
) {
  const tracked = trackedThreadPosts.get(thread);
  if (tracked) {
    return tracked.originalPost(...args);
  }

  return thread.post(...args);
}
