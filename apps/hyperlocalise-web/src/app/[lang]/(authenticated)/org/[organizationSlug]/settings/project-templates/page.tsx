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
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { ProjectTemplatesPageContent } from "../_components/project-templates-page-content";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "settingsProjectTemplates");
}

export default function ProjectTemplatesSettingsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  return <ProjectTemplatesSettingsPageLoader params={params} />;
}

async function ProjectTemplatesSettingsPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });

  // go-svc lets admins and localization managers manage templates; workspace:update is the web
  // capability those two roles share.
  return (
    <ProjectTemplatesPageContent
      organizationSlug={organizationSlug}
      canManage={auth.capabilities.includes("workspace:update")}
    />
  );
}
