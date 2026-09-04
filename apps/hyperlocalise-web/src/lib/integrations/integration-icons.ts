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
import type { SimpleIcon } from "simple-icons";
import {
  siCrowdin,
  siGithub,
  siGitlab,
  siGoogledrive,
  siHubspot,
  siIntercom,
  siJira,
  siLinear,
  siLoops,
  siMailchimp,
  siNotion,
  siResend,
  siSemrush,
} from "simple-icons";

import type { IntegrationIconKey } from "@/lib/integrations/integration-catalog.types";

export const integrationIconsByKey: Record<IntegrationIconKey, SimpleIcon> = {
  github: siGithub,
  gitlab: siGitlab,
  jira: siJira,
  linear: siLinear,
  notion: siNotion,
  resend: siResend,
  hubspot: siHubspot,
  mailchimp: siMailchimp,
  loops: siLoops,
  googledrive: siGoogledrive,
};

const integrationIconsBySlug: Partial<Record<string, SimpleIcon>> = {
  crowdin: siCrowdin,
  gitlab: siGitlab,
  intercom: siIntercom,
  jira: siJira,
  linear: siLinear,
  notion: siNotion,
  resend: siResend,
  hubspot: siHubspot,
  mailchimp: siMailchimp,
  loops: siLoops,
  semrush: siSemrush,
  "google-drive": siGoogledrive,
};

export function getIntegrationIconForKey(iconKey: IntegrationIconKey): SimpleIcon {
  return integrationIconsByKey[iconKey];
}

export function getIntegrationIconForSlug(slug: string): SimpleIcon | undefined {
  return integrationIconsBySlug[slug];
}
