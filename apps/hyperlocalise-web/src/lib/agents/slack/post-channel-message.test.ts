import { describe, expect, it, vi } from "vite-plus/test";

const { chatConstructorMock, createSlackAdapterMock, initializeMock, postChannelMessageMock } =
  vi.hoisted(() => ({
    chatConstructorMock: vi.fn(),
    createSlackAdapterMock: vi.fn(() => ({ kind: "slack-adapter" })),
    initializeMock: vi.fn(),
    postChannelMessageMock: vi.fn(async () => undefined),
  }));

vi.mock("@/lib/env", () => ({
  env: {
    SLACK_CLIENT_ID: "test-client-id",
    SLACK_CLIENT_SECRET: "test-client-secret",
    SLACK_SIGNING_SECRET: "test-signing-secret",
  },
}));

vi.mock("@/lib/agents/runtime/state", () => ({
  createChatStateAdapter: vi.fn(() => ({ kind: "state-adapter" })),
}));

vi.mock("@chat-adapter/slack", () => ({
  createSlackAdapter: createSlackAdapterMock,
}));

vi.mock("chat", () => ({
  Chat: class MockChat {
    constructor(config: unknown) {
      chatConstructorMock(config);
    }

    initialize() {
      return initializeMock();
    }

    getAdapter(adapterName: string) {
      return {
        adapterName,
        postChannelMessage: postChannelMessageMock,
      };
    }
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

async function waitForInitializeCall() {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (initializeMock.mock.calls.length > 0) {
      return;
    }
    await Promise.resolve();
  }

  throw new Error("expected Slack chat initialization to start");
}

describe("postSlackChannelMessage", () => {
  it("shares initialization across concurrent callers before posting messages", async () => {
    const initialized = createDeferred<void>();
    initializeMock.mockReturnValueOnce(initialized.promise);
    const { postSlackChannelMessage } = await import("./post-channel-message");

    const firstPost = postSlackChannelMessage({
      channelId: "C123",
      text: "first",
    });
    await waitForInitializeCall();

    const secondPost = postSlackChannelMessage({
      channelId: "slack:C123",
      text: "second",
    });
    await Promise.resolve();

    expect(chatConstructorMock).toHaveBeenCalledOnce();
    expect(createSlackAdapterMock).toHaveBeenCalledOnce();
    expect(initializeMock).toHaveBeenCalledOnce();
    expect(postChannelMessageMock).not.toHaveBeenCalled();

    initialized.resolve();
    await Promise.all([firstPost, secondPost]);

    expect(postChannelMessageMock).toHaveBeenCalledTimes(2);
    expect(postChannelMessageMock).toHaveBeenNthCalledWith(1, "slack:C123", "first");
    expect(postChannelMessageMock).toHaveBeenNthCalledWith(2, "slack:C123", "second");
  });
});
