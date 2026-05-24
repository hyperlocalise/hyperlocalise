import type { ProviderReviewReport, ProviderReviewSummary, ProviderReviewThread } from "./types";

function buildSummary(threads: ProviderReviewThread[]): ProviderReviewSummary {
  const summary: ProviderReviewSummary = {
    total: threads.length,
    open: 0,
    resolved: 0,
    byKind: {},
  };

  for (const thread of threads) {
    if (thread.state === "resolved") {
      summary.resolved += 1;
    } else if (thread.state === "open") {
      summary.open += 1;
    }

    summary.byKind[thread.kind] = (summary.byKind[thread.kind] ?? 0) + 1;
  }

  return summary;
}

export function normalizeProviderReviewThread(thread: ProviderReviewThread): ProviderReviewThread {
  return {
    ...thread,
    subject: thread.subject?.trim() || null,
    issueType: thread.issueType?.trim() || null,
    locale: thread.locale?.trim() || null,
    comments: thread.comments.map((comment) => ({
      ...comment,
      body: comment.body.trim(),
      author: comment.author
        ? {
            externalUserId: comment.author.externalUserId ?? null,
            username: comment.author.username?.trim() || null,
            displayName: comment.author.displayName?.trim() || null,
          }
        : null,
      createdAt: comment.createdAt ?? null,
      updatedAt: comment.updatedAt ?? null,
    })),
    author: thread.author
      ? {
          externalUserId: thread.author.externalUserId ?? null,
          username: thread.author.username?.trim() || null,
          displayName: thread.author.displayName?.trim() || null,
        }
      : null,
    resolver: thread.resolver
      ? {
          externalUserId: thread.resolver.externalUserId ?? null,
          username: thread.resolver.username?.trim() || null,
          displayName: thread.resolver.displayName?.trim() || null,
        }
      : null,
    providerContext: {
      ...thread.providerContext,
      providerUrl: thread.providerContext.providerUrl?.trim() || null,
      externalCommentId: thread.providerContext.externalCommentId ?? null,
    },
  };
}

export function normalizeProviderReviewThreads(
  threads: ProviderReviewThread[],
): ProviderReviewThread[] {
  return threads.map((thread) => normalizeProviderReviewThread(thread));
}

export function buildProviderReviewReport(threads: ProviderReviewThread[]): ProviderReviewReport {
  const normalized = normalizeProviderReviewThreads(threads);
  return {
    threads: normalized,
    summary: buildSummary(normalized),
  };
}

export function mergeProviderReviewReports(
  previous: ProviderReviewReport | null | undefined,
  incoming: ProviderReviewReport,
): ProviderReviewReport {
  const byThreadId = new Map<string, ProviderReviewThread>();

  for (const thread of previous?.threads ?? []) {
    byThreadId.set(thread.threadId, thread);
  }

  for (const thread of incoming.threads) {
    byThreadId.set(thread.threadId, normalizeProviderReviewThread(thread));
  }

  const threads = [...byThreadId.values()].sort((left, right) => {
    const leftTime = left.updatedAt ?? left.createdAt ?? "";
    const rightTime = right.updatedAt ?? right.createdAt ?? "";
    return rightTime.localeCompare(leftTime);
  });

  return buildProviderReviewReport(threads);
}
