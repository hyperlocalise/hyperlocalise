import type { Thread } from "chat";

import { addInteractionMessage } from "@/lib/interactions";

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
      const content = args[0];
      const text = typeof content === "string" ? content : "";
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
