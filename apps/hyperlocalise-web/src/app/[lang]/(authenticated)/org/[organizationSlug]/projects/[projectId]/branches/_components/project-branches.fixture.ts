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
import type { ProjectBranchApiRecord } from "@/api/routes/project/project-branches.schema";

export const projectBranchesStoryNow = "2026-06-06T12:00:00.000Z";

const mainBranchId = "11111111-1111-4111-8111-111111111111";
const featureBranchId = "22222222-2222-4222-8222-222222222222";
const releaseBranchId = "33333333-3333-4333-8333-333333333333";

function createProjectBranchRecord(
  overrides: Partial<ProjectBranchApiRecord>,
): ProjectBranchApiRecord {
  return {
    id: mainBranchId,
    projectId: "project_website",
    name: "main",
    title: null,
    baseBranchId: null,
    isDefault: true,
    isProtected: false,
    status: "active",
    lastSyncedAt: null,
    createdByUserId: "44444444-4444-4444-8444-444444444444",
    mergedAt: null,
    mergedIntoBranchId: null,
    createdAt: projectBranchesStoryNow,
    updatedAt: projectBranchesStoryNow,
    fileCount: 12,
    keyCount: 86,
    ...overrides,
  };
}

export const projectBranchesMainFixture = createProjectBranchRecord({});

export const projectBranchesFeatureFixture = createProjectBranchRecord({
  id: featureBranchId,
  name: "feature-checkout",
  title: "Checkout",
  baseBranchId: mainBranchId,
  isDefault: false,
  fileCount: 14,
  keyCount: 91,
});

export const projectBranchesProtectedFixture = createProjectBranchRecord({
  id: featureBranchId,
  name: "feature-checkout",
  title: "Checkout",
  baseBranchId: mainBranchId,
  isDefault: false,
  isProtected: true,
  fileCount: 14,
  keyCount: 91,
});

export const projectBranchesMergedFixture = createProjectBranchRecord({
  id: releaseBranchId,
  name: "release-ios",
  title: "iOS release",
  baseBranchId: mainBranchId,
  isDefault: false,
  status: "merged",
  mergedAt: projectBranchesStoryNow,
  mergedIntoBranchId: mainBranchId,
  fileCount: 0,
  keyCount: 0,
});

export const projectBranchesFixture: ProjectBranchApiRecord[] = [
  projectBranchesMainFixture,
  projectBranchesFeatureFixture,
];

export const projectBranchesWithHistoryFixture: ProjectBranchApiRecord[] = [
  projectBranchesMainFixture,
  projectBranchesFeatureFixture,
  projectBranchesMergedFixture,
];

export const nativeProjectBranchOptionsFixture = [
  { name: "main", title: null as string | null },
  { name: "feature-checkout", title: "Feature checkout" },
];
