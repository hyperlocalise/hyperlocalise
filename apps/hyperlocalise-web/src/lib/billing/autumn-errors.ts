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
import { AutumnClientError } from "autumn-js/react";

/** Maps Autumn/API billing failures to stable, user-safe messages. */
export function formatAutumnBillingError(error: unknown): string {
  if (error instanceof AutumnClientError) {
    switch (error.code) {
      case "billing_read_forbidden":
        return "You do not have permission to view billing for this workspace.";
      case "billing_write_forbidden":
        return "Only workspace admins can change plans or open the billing portal.";
      case "billing_customer_unavailable":
        return "Billing is not available for this workspace.";
      case "unauthorized":
        return "Sign in again to manage billing.";
      default:
        return error.message || "Billing request failed. Try again in a moment.";
    }
  }

  if (error && typeof error === "object" && ("error" in error || "code" in error)) {
    const apiError = error as { error?: string; code?: string; message?: string };
    switch (apiError.error ?? apiError.code) {
      case "billing_read_forbidden":
        return "You do not have permission to view billing for this workspace.";
      case "billing_write_forbidden":
        return "Only workspace admins can change plans or open the billing portal.";
      case "billing_customer_unavailable":
        return "Billing is not available for this workspace.";
      case "unauthorized":
        return "Sign in again to manage billing.";
      default:
        return apiError.message || "Billing request failed. Try again in a moment.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Billing request failed. Try again in a moment.";
}
