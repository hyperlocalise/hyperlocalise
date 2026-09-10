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
import { redirect } from "next/navigation";
import { buildDomainPath } from "@/components/app-shell/navigation-config";
export default async function DomainOverviewPage({
  params,
}: {
  params: Promise<{ lang: string; organizationSlug: string; linkedDomainId: string }>;
}) {
  const { lang, organizationSlug, linkedDomainId } = await params;
  redirect(`/${lang}${buildDomainPath(organizationSlug, linkedDomainId)}`);
}
