/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";

/** As often as the job page polls a running job. */
const KEY_TRANSLATION_JOB_POLL_INTERVAL_MS = 3000;

const activeJobStatuses = new Set(["queued", "running"]);

/**
 * Marks every cached queue and translation of the project as out of date, so the strings on screen
 * reload and lists cached for other filters or tasks reload when opened again.
 */
export function invalidateProjectContentEditorData(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationSlug: string,
  projectId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["project-file-content-editor-queue", organizationSlug, projectId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["project-file-content-editor-segment-target", organizationSlug, projectId],
    }),
  ]);
}

/**
 * Follows AI translation jobs started from the editor: while one runs, the editor's strings
 * reload after each poll, so translations appear batch by batch, and once more when it ends.
 */
export function useKeyTranslationJobRefresh(input: {
  organizationSlug: string;
  projectId: string;
  goSvcClient: GoSvcClient | null | undefined;
}) {
  const { organizationSlug, projectId, goSvcClient } = input;
  const queryClient = useQueryClient();
  const [jobIds, setJobIds] = useState<string[]>([]);

  const jobs = useQueries({
    queries: jobIds.map((jobId) => ({
      queryKey: ["content-editor-key-translation-job", organizationSlug, jobId],
      queryFn: async () =>
        (await goSvcClient!.job.get<{ status: string }>(organizationSlug, jobId)).job,
      enabled: Boolean(goSvcClient),
      staleTime: 0,
      refetchInterval: KEY_TRANSLATION_JOB_POLL_INTERVAL_MS,
    })),
  });

  // The jobs' statuses by id, read when a poll answers; `jobs` is a new array every render.
  const statusesRef = useRef(new Map<string, string>());
  statusesRef.current = new Map(
    jobIds.flatMap((jobId, index) => {
      const status = jobs[index]?.data?.status;
      return status ? [[jobId, status] as const] : [];
    }),
  );
  // Changes once per poll answer, so each answer reloads the strings once.
  const pollSignature = jobs.map((job) => job.dataUpdatedAt).join(",");
  const anyAnswered = jobs.some((job) => job.dataUpdatedAt > 0);
  useEffect(() => {
    if (!anyAnswered) return;
    void invalidateProjectContentEditorData(queryClient, organizationSlug, projectId);
    const finished = [...statusesRef.current]
      .filter(([, status]) => !activeJobStatuses.has(status))
      .map(([jobId]) => jobId);
    if (finished.length > 0) {
      setJobIds((current) => current.filter((jobId) => !finished.includes(jobId)));
    }
  }, [anyAnswered, organizationSlug, pollSignature, projectId, queryClient]);

  return useCallback((jobId: string) => {
    setJobIds((current) => (current.includes(jobId) ? current : [...current, jobId]));
  }, []);
}
