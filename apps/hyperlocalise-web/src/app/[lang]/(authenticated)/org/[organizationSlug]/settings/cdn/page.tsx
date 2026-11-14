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
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";
import { CdnDestinationsPageContent } from "../_components/cdn-destinations-page-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "settingsCdn");
}

export default function CdnSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return <CdnSettingsPageLoader params={params} />;
}

async function CdnSettingsPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  await requireAppCapability("projects:read", { organizationSlug });

  return <CdnDestinationsPageContent organizationSlug={organizationSlug} />;
}
