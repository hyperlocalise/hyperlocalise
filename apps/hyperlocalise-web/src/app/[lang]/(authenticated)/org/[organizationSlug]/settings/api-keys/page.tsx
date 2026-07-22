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
import { requireAppCapability } from "@/lib/workos/app-auth";
import { ApiKeySettingsPageContent } from "../_components/api-keys-page-content";

export default async function ApiKeySettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppCapability("api_keys:read", { organizationSlug });

  return <ApiKeySettingsPageContent organizationSlug={organizationSlug} />;
}
