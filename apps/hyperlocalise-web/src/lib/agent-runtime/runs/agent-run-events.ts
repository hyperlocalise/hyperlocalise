import type { Thread } from "chat";
import { eq, inArray } from "drizzle-orm";

import { addInteractionMessage } from "@/lib/conversations/interactions";
import { db, schema } from "@/lib/database";
import { getFileStorageAdapter } from "@/lib/file-storage";
import { createStoredFile } from "@/lib/file-storage/records";
import { createLogger, serializeErrorForLog } from "@/lib/log";

const logger = createLogger("agent-run-events");

type AddAgentMessage = (input: {
  attachments?: Array<{ id: string; filename: string; contentType: string; url: string }>;
  interactionId: string;
  senderType: "agent";
  text: string;
}) => Promise<unknown>;

type PostableFile = {
  data: ArrayBuffer | Blob | Buffer;
  filename: string;
  mimeType?: string;
};

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

function getPostFiles(content: unknown): PostableFile[] {
  if (typeof content !== "object" || content === null || !("files" in content)) {
    return [];
  }

  const files = (content as { files?: unknown }).files;
  if (!Array.isArray(files)) {
    return [];
  }

  return files.filter((file): file is PostableFile => {
    if (typeof file !== "object" || file === null) {
      return false;
    }

    const candidate = file as Partial<PostableFile>;
    return Boolean(candidate.data) && typeof candidate.filename === "string";
  });
}

async function persistPostFiles(interactionId: string, files: PostableFile[]) {
  if (files.length === 0) {
    return [];
  }

  const [interaction] = await db
    .select({
      organizationId: schema.interactions.organizationId,
      projectId: schema.interactions.projectId,
    })
    .from(schema.interactions)
    .where(eq(schema.interactions.id, interactionId))
    .limit(1);

  if (!interaction) {
    return [];
  }

  const uploadResults = await Promise.allSettled(
    files.map(async (file) =>
      createStoredFile({
        organizationId: interaction.organizationId,
        projectId: interaction.projectId,
        createdByUserId: null,
        role: "output",
        sourceKind: "chat_upload",
        sourceInteractionId: interactionId,
        filename: file.filename,
        contentType: file.mimeType || "application/octet-stream",
        content: file.data instanceof Blob ? await file.data.arrayBuffer() : file.data,
        metadata: {
          uploadSurface: "agent_post",
          chatPostFile: true,
        },
      }),
    ),
  );
  const storedFiles = uploadResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedUpload = uploadResults.find((result) => result.status === "rejected");

  if (failedUpload) {
    await cleanupStoredFiles(storedFiles);
    throw failedUpload.reason instanceof Error
      ? failedUpload.reason
      : new Error("failed to store agent post file");
  }

  return storedFiles.map((file) => ({
    id: file.id,
    filename: file.filename,
    contentType: file.contentType,
    url: file.downloadUrl ?? file.storageUrl,
  }));
}

async function cleanupStoredFiles(storedFiles: Array<typeof schema.storedFiles.$inferSelect>) {
  if (storedFiles.length === 0) {
    return;
  }

  await db.delete(schema.storedFiles).where(
    inArray(
      schema.storedFiles.id,
      storedFiles.map((file) => file.id),
    ),
  );
  const adapter = getFileStorageAdapter();
  await Promise.allSettled(
    storedFiles.map((file) => adapter.delete({ keyOrUrl: file.storageKey })),
  );
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
      const postFiles = getPostFiles(args[0]);
      const attachments = await persistPostFiles(trackedState.interactionId, postFiles).catch(
        (error) => {
          logger.warn(
            {
              err: serializeErrorForLog(error),
              fileCount: postFiles.length,
              interactionId: trackedState.interactionId,
            },
            "agent post file persistence failed",
          );
          return [];
        },
      );
      if (text || attachments.length > 0) {
        await trackedState.addMessage({
          ...(attachments.length > 0 ? { attachments } : {}),
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
