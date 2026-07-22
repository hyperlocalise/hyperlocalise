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
import { isErr } from "@/lib/primitives/result/results";
import { formatSsrfGuardError, normalizeHostname } from "@/lib/security/ssrf-guard";
import { resolveResolvablePublicHost } from "@/lib/security/ssrf-guard-dns";

import { isSafeProviderUrl } from "@/lib/providers/shared/provider-url-safety";

export async function assertProviderUrlResolvable(url: string): Promise<void> {
  const parsed = new URL(url);
  if (!isSafeProviderUrl(parsed)) {
    throw new Error("Provider URL is invalid or unsafe.");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname.endsWith(".test")) {
    return;
  }

  const hostResult = await resolveResolvablePublicHost(hostname);
  if (isErr(hostResult)) {
    throw new Error(formatSsrfGuardError(hostResult.error));
  }
}
