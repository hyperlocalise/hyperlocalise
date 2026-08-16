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
import { http, HttpResponse } from "msw";

import { createProjectFileRecord } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/[projectId]/files/_components/project-files.fixture";

export const createJobDialogOrganizationSlug = "acme";
export const createJobDialogNativeProjectId = "project_website";
export const createJobDialogCrowdinProjectId = "ext:crowdin:902807";

export const createJobDialogNativeFiles = [
  createProjectFileRecord(),
  createProjectFileRecord({
    sourcePath: "marketing/pricing.json",
    storedFileId: "file_pricing_json",
    filename: "pricing.json",
  }),
];

export const createJobDialogNativeMembers = [
  {
    workosUserId: "user_mina",
    displayName: "Mina Chen",
    email: "mina@example.com",
    status: "active",
  },
  {
    workosUserId: "user_otto",
    displayName: "Otto Berg",
    email: "otto@example.com",
    status: "active",
  },
];

export const createJobDialogProviderFiles = [
  {
    sourcePath: "locales/home.json",
    filename: "home.json",
    provider: { externalResourceId: "crowdin_file_home", resourceType: "file" },
  },
  {
    sourcePath: "locales/pricing.json",
    filename: "pricing.json",
    provider: { externalResourceId: "crowdin_file_pricing", resourceType: "file" },
  },
];

export const createJobDialogProviderMembers = [
  {
    externalUserId: "crowdin_mina",
    username: "mina",
    displayName: "Mina Chen",
    role: "translator",
  },
  {
    externalUserId: "crowdin_otto",
    username: "otto",
    displayName: "Otto Berg",
    role: "proofreader",
  },
];

export const createJobDialogMswHandlers = [
  http.get("/api/orgs/:organizationSlug/projects/:projectId/files", () =>
    HttpResponse.json({ files: createJobDialogNativeFiles }),
  ),
  http.get("/api/orgs/:organizationSlug/members", () =>
    HttpResponse.json({ members: createJobDialogNativeMembers }),
  ),
  http.post("/api/orgs/:organizationSlug/projects/:projectId/jobs", () =>
    HttpResponse.json({ job: { id: "job_native_1" } }, { status: 201 }),
  ),
  http.get("/api/orgs/:organizationSlug/tms-provider/projects/:externalProjectId/files", () =>
    HttpResponse.json({ files: createJobDialogProviderFiles }),
  ),
  http.get("/api/orgs/:organizationSlug/tms-provider/projects/:externalProjectId/members", () =>
    HttpResponse.json({ members: createJobDialogProviderMembers }),
  ),
  http.post("/api/orgs/:organizationSlug/tms-provider/projects/:externalProjectId/jobs", () =>
    HttpResponse.json(
      { jobs: [{ id: "job_crowdin_fr" }, { id: "job_crowdin_de" }] },
      { status: 201 },
    ),
  ),
];
