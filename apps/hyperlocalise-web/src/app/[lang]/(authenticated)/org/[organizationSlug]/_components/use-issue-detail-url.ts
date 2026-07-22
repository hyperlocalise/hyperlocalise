"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  buildIssueListHref,
  stripIssueDetailFromState,
  type IssueListUrlState,
} from "./issue-list-url-state";

export function useIssueDetailUrl(options: {
  includeProject?: boolean;
  state: IssueListUrlState;
  updateState: (patch: Partial<IssueListUrlState>) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const includeProject = options.includeProject ?? false;
  const openedViaPushRef = useRef(false);

  const issueId = options.state.issue;
  const issueProjectId = options.state.issueProject;
  const isOpen = Boolean(issueId);

  useEffect(() => {
    if (!issueId) {
      openedViaPushRef.current = false;
    }
  }, [issueId]);

  const openIssueDetail = useCallback(
    ({ issueId: nextIssueId, projectId }: { issueId: string; projectId?: string }) => {
      openedViaPushRef.current = true;
      const next: IssueListUrlState = {
        ...options.state,
        issue: nextIssueId,
        ...(projectId ? { issueProject: projectId } : {}),
      };
      const href = buildIssueListHref(pathname, next, { includeProject });
      router.push(href, { scroll: false });
    },
    [includeProject, options.state, pathname, router],
  );

  const closeIssueDetail = useCallback(() => {
    if (openedViaPushRef.current) {
      openedViaPushRef.current = false;
      router.back();
      return;
    }

    const next = stripIssueDetailFromState(options.state);
    const href = buildIssueListHref(pathname, next, { includeProject });
    router.replace(href, { scroll: false });
    options.updateState({ issue: undefined, issueProject: undefined });
  }, [includeProject, options, pathname, router]);

  return {
    issueId,
    issueProjectId,
    isOpen,
    openIssueDetail,
    closeIssueDetail,
  };
}
