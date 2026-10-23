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
import { useCallback } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { isAiCreditExhaustedError } from "@/lib/billing/ai-credit-refusal";

import { aiCreditExhaustedMessages } from "./ai-credit-exhausted.messages";

/**
 * For AI actions with no place of their own to show a failure. Returns whether the error was a
 * refusal for used-up AI credit, which it then shows as a toast.
 */
export function useAiCreditRefusalToast() {
  const intl = useIntl();

  return useCallback(
    (error: unknown) => {
      if (!isAiCreditExhaustedError(error)) {
        return false;
      }

      toast.error(intl.formatMessage(aiCreditExhaustedMessages.exhausted));
      return true;
    },
    [intl],
  );
}
