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
import type {
  HyperlabAllocation,
  HyperlabAssignment,
  HyperlabAudience,
  HyperlabClientKey,
  HyperlabExperiment,
  HyperlabFlag,
  HyperlabFlagConfig,
  HyperlabVariant,
} from "./hyperlab-api";

export const hyperlabOrganizationSlug = "acme";

const createdAt = "2026-08-12T02:00:00.000Z";
const updatedAt = "2026-09-08T04:30:00.000Z";

export const hyperlabJapanAudience: HyperlabAudience = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Visitors in Japan",
  description: "People browsing from Japan",
  criterion: {
    type: "attribute",
    name: "country",
    match: "exact",
    value: "JP",
  },
  createdAt,
  updatedAt,
};

export const hyperlabPaidAudience: HyperlabAudience = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Paid plans",
  description: "Visitors on a paid plan",
  criterion: {
    type: "attribute",
    name: "plan",
    match: "exact",
    value: "pro",
  },
  createdAt,
  updatedAt,
};

export const hyperlabCheckoutFlag: HyperlabFlag = {
  id: "55555555-5555-4555-8555-555555555555",
  key: "japan-checkout-cta",
  description: "Japan checkout button",
  kind: "experiment",
  createdAt,
  updatedAt,
};

export const hyperlabThemeFlag: HyperlabFlag = {
  id: "66666666-6666-4666-8666-666666666666",
  key: "homepage-theme",
  description: "Homepage theme",
  kind: "config",
  createdAt,
  updatedAt,
};

export const hyperlabThemeConfig: HyperlabFlagConfig = {
  flagId: hyperlabThemeFlag.id,
  value: { palette: "grove" },
};

export const hyperlabAbExperiment: HyperlabExperiment = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Japan checkout headline",
  status: "active",
  kind: "ab",
  audienceId: hyperlabJapanAudience.id,
  rolloutPercentage: 10000,
  startAt: "2026-09-01T00:00:00.000Z",
  endAt: "2027-03-01T08:00:00.000Z",
  timezone: "Asia/Tokyo",
  createdAt,
  updatedAt,
};

export const hyperlabToggleExperiment: HyperlabExperiment = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "France homepage banner",
  status: "draft",
  kind: "toggle",
  audienceId: null,
  rolloutPercentage: 2500,
  startAt: "2026-10-01T07:00:00.000Z",
  endAt: "2026-12-15T16:00:00.000Z",
  timezone: "Europe/Paris",
  createdAt,
  updatedAt,
};

export const hyperlabAbControlVariant: HyperlabVariant = {
  id: "77777777-7777-4777-8777-777777777777",
  experimentId: hyperlabAbExperiment.id,
  key: "control",
  audienceId: null,
  rolloutPercentage: 5000,
  isControl: true,
};

export const hyperlabAbTreatmentVariant: HyperlabVariant = {
  id: "88888888-8888-4888-8888-888888888888",
  experimentId: hyperlabAbExperiment.id,
  key: "new-headline",
  audienceId: null,
  rolloutPercentage: 5000,
  isControl: false,
};

export const hyperlabToggleVariant: HyperlabVariant = {
  id: "99999999-9999-4999-8999-999999999999",
  experimentId: hyperlabToggleExperiment.id,
  key: "control",
  audienceId: null,
  rolloutPercentage: 10000,
  isControl: true,
};

export const hyperlabAbAllocations: HyperlabAllocation[] = [
  { id: "alloc-control", variantId: hyperlabAbControlVariant.id, start: 0, end: 4999 },
  { id: "alloc-treatment", variantId: hyperlabAbTreatmentVariant.id, start: 5000, end: 9999 },
];

export const hyperlabToggleAllocations: HyperlabAllocation[] = [
  { id: "alloc-toggle", variantId: hyperlabToggleVariant.id, start: 0, end: 9999 },
];

export const hyperlabCheckoutAssignment: HyperlabAssignment = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  flagId: hyperlabCheckoutFlag.id,
  variantId: hyperlabAbTreatmentVariant.id,
  enabled: true,
  payload: null,
};

export const hyperlabProductionKey: HyperlabClientKey = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Production website",
  keyPrefix: "hlk_prod",
  lastUsedAt: "2026-09-09T11:20:00.000Z",
  revokedAt: null,
  createdAt,
};

export const hyperlabAudiencesFixture = [hyperlabJapanAudience, hyperlabPaidAudience];
export const hyperlabFlagsFixture = [hyperlabCheckoutFlag, hyperlabThemeFlag];
export const hyperlabExperimentsFixture = [hyperlabAbExperiment, hyperlabToggleExperiment];
export const hyperlabAssignmentsFixture = [hyperlabCheckoutAssignment];
export const hyperlabKeysFixture = [hyperlabProductionKey];

export const hyperlabAbExperimentDetail = {
  experiment: hyperlabAbExperiment,
  variants: [hyperlabAbControlVariant, hyperlabAbTreatmentVariant],
  allocations: hyperlabAbAllocations,
};

export const hyperlabToggleExperimentDetail = {
  experiment: hyperlabToggleExperiment,
  variants: [hyperlabToggleVariant],
  allocations: hyperlabToggleAllocations,
};
