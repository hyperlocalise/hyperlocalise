// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { useIssueDetailMutations } from "./use-issue-detail-mutations";

const issue = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Original title",
  description: "Original description",
  issueType: "general_question",
  status: "open",
  targetLocale: null,
  sourcePath: null,
  segmentId: null,
  linkKind: null,
  linkLabel: null,
  linkUrl: null,
  assigneeUserId: null,
  reporter: null,
  assignee: null,
  key: null,
  sourceText: null,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
  resolvedAt: null,
  values: {},
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          {children}
        </IntlProvider>
      </QueryClientProvider>
    );
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useIssueDetailMutations", () => {
  it("does not abort an in-flight issue update when another field update starts", async () => {
    const titleSave = createDeferred<Response>();
    const statusSave = createDeferred<Response>();
    const titleSignalRef: { current: AbortSignal | undefined } = { current: undefined };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if ("title" in body) {
        titleSignalRef.current = init?.signal ?? undefined;
        return titleSave.promise;
      }
      if ("status" in body) {
        return statusSave.promise;
      }
      throw new Error(`unexpected request body: ${JSON.stringify(body)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useIssueDetailMutations({
          organizationSlug: "acme",
          projectId: "00000000-0000-4000-8000-000000000010",
          issueId: issue.id,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.updateIssue.mutate({ title: "Updated title" });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.updateIssue.mutate({ status: "in_progress" });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(titleSignalRef.current?.aborted).toBe(false);

    titleSave.resolve(
      new Response(JSON.stringify({ issue: { ...issue, title: "Updated title" } }), {
        status: 200,
      }),
    );
    statusSave.resolve(
      new Response(JSON.stringify({ issue: { ...issue, status: "in_progress" } }), {
        status: 200,
      }),
    );

    await waitFor(() => {
      expect(result.current.updateIssue.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(titleSignalRef.current?.aborted).toBe(false);
  });

  it("aborts in-flight updates when cancelPending is called", async () => {
    const titleSave = createDeferred<Response>();
    const titleSignalRef: { current: AbortSignal | undefined } = { current: undefined };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        titleSignalRef.current = init?.signal ?? undefined;
        return titleSave.promise;
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    const { result } = renderHook(
      () =>
        useIssueDetailMutations({
          organizationSlug: "acme",
          projectId: "00000000-0000-4000-8000-000000000010",
          issueId: issue.id,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.updateIssue.mutate({ title: "Updated title" });
    });

    await waitFor(() => {
      expect(titleSignalRef.current).toBeDefined();
    });

    act(() => {
      result.current.cancelPending();
    });

    expect(titleSignalRef.current?.aborted).toBe(true);
  });
});
