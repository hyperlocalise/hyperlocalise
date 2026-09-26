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
import { GoSvcActivityLogApi } from "./go-svc-activity-log-api";
import { GoSvcCatApi } from "./go-svc-cat-api";
import { GoSvcDictionaryApi } from "./go-svc-dictionary-api";
import { GoSvcGlossaryApi } from "./go-svc-glossary-api";
import { GoSvcIssueSheetApi } from "./go-svc-issue-sheet-api";
import { GoSvcMemoryApi } from "./go-svc-memory-api";
import { GoSvcQaReportApi } from "./go-svc-qa-report-api";
import {
  DEFAULT_GO_SVC_BASE_URL,
  GoSvcClientError,
  GoSvcRequest,
  type GoSvcClientOptions,
} from "./go-svc-request";
import { GoSvcDomainsApi } from "./go-svc-domains-api";
import { createHyperlabGoSvcClient, type HyperlabGoSvcClient } from "./go-svc-hyperlab-client";
import { GoSvcTeamApi } from "./go-svc-team-api";

export { DEFAULT_GO_SVC_BASE_URL, GoSvcClientError, type GoSvcClientOptions };
export type { HyperlabGoSvcClient };

export class GoSvcClient {
  readonly baseUrl: string;
  readonly activityLog: GoSvcActivityLogApi;
  readonly cat: GoSvcCatApi;
  readonly dictionary: GoSvcDictionaryApi;
  readonly domains: GoSvcDomainsApi;
  readonly glossary: GoSvcGlossaryApi;
  readonly hyperlab: HyperlabGoSvcClient;
  readonly issueSheet: GoSvcIssueSheetApi;
  readonly memory: GoSvcMemoryApi;
  readonly qaReport: GoSvcQaReportApi;
  readonly team: GoSvcTeamApi;

  constructor(options: GoSvcClientOptions) {
    const request = new GoSvcRequest(options);
    this.baseUrl = request.baseUrl;
    this.activityLog = new GoSvcActivityLogApi(request);
    this.cat = new GoSvcCatApi(request);
    this.dictionary = new GoSvcDictionaryApi(request);
    this.domains = new GoSvcDomainsApi(request);
    this.glossary = new GoSvcGlossaryApi(request);
    this.hyperlab = createHyperlabGoSvcClient(request);
    this.issueSheet = new GoSvcIssueSheetApi(request);
    this.memory = new GoSvcMemoryApi(request);
    this.qaReport = new GoSvcQaReportApi(request);
    this.team = new GoSvcTeamApi(request);
  }
}
