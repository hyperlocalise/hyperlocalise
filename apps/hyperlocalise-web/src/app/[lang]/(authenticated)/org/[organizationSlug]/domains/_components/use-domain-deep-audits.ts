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
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
import type {
  LocalisationDeepAuditFindingQuery,
  LocalisationDeepAuditRunListItem,
  LocalisationDeepAuditStatus,
} from "@/lib/localisation-audit/deep/types";

const IN_FLIGHT_POLL_MS = 4_000;

export function isDeepAuditInFlight(status: LocalisationDeepAuditStatus) {
  return status === "queued" || status === "crawling" || status === "scoring";
}

export function domainDeepAuditsQueryKey(organizationSlug: string, linkedDomainId: string) {
  return ["domain-deep-audits", organizationSlug, linkedDomainId] as const;
}

export function useDomainDeepAudits(input: {
  organizationSlug: string;
  linkedDomainId: string;
  enabled: boolean;
}) {
  const { client } = useGoSvcClient();
  return useQuery({
    queryKey: domainDeepAuditsQueryKey(input.organizationSlug, input.linkedDomainId),
    enabled: input.enabled,
    queryFn: async (): Promise<LocalisationDeepAuditRunListItem[]> => {
      try {
        const body = await client.domains.listDeepAudits(
          input.organizationSlug,
          input.linkedDomainId,
        );
        return body.deepAudits;
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load deep audits."));
      }
    },
    refetchInterval: (query) =>
      query.state.data?.some((run) => isDeepAuditInFlight(run.status)) ? IN_FLIGHT_POLL_MS : false,
  });
}

export function useDomainDeepAuditDetail(input: {
  organizationSlug: string;
  linkedDomainId: string;
  runId: string | null;
  query: LocalisationDeepAuditFindingQuery;
}) {
  const { client } = useGoSvcClient();
  return useQuery({
    queryKey: [
      ...domainDeepAuditsQueryKey(input.organizationSlug, input.linkedDomainId),
      input.runId,
      input.query,
    ] as const,
    enabled: input.runId !== null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        return await client.domains.getDeepAudit(
          input.organizationSlug,
          input.linkedDomainId,
          input.runId!,
          input.query,
        );
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to load the deep audit."));
      }
    },
  });
}

export function useDeepAuditActions(input: { organizationSlug: string; linkedDomainId: string }) {
  const { client } = useGoSvcClient();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: domainDeepAuditsQueryKey(input.organizationSlug, input.linkedDomainId),
    });

  const start = useMutation({
    mutationFn: async () => {
      try {
        return await client.domains.startDeepAudit(input.organizationSlug, input.linkedDomainId);
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to start the deep audit."));
      }
    },
    onSettled: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (runId: string) => {
      try {
        return await client.domains.cancelDeepAudit(
          input.organizationSlug,
          input.linkedDomainId,
          runId,
        );
      } catch (error) {
        throw new Error(goSvcErrorMessage(error, "Failed to cancel the deep audit."));
      }
    },
    onSettled: invalidate,
  });

  return { start, cancel };
}
