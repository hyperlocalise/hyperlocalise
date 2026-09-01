"use client";

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
import { useCustomer } from "autumn-js/react";

import { autumnFeatureIds } from "@/lib/billing/autumn-ids";

export type AiFeaturesAccessStatus = "loading" | "allowed" | "denied";

/**
 * Local Autumn entitlement for `ai_features`. Missing customer data or a
 * thrown `useCustomer` (no provider) is treated as denied so AI actions stay closed.
 */
export function useAiFeaturesAccess(): { status: AiFeaturesAccessStatus } {
  try {
    const { check, isLoading, error, data } = useCustomer();
    if (isLoading) {
      return { status: "loading" };
    }
    if (error || !data) {
      return { status: "denied" };
    }

    return {
      status: check({ featureId: autumnFeatureIds.aiFeatures }).allowed ? "allowed" : "denied",
    };
  } catch {
    return { status: "denied" };
  }
}
