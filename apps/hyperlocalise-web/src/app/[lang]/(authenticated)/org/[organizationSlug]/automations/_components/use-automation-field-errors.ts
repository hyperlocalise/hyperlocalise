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

import { useState, type Dispatch, type SetStateAction } from "react";

import {
  pruneWorkspaceAutomationFieldErrors,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

type FieldErrors = Record<string, string | undefined>;

/**
 * The errors a save turned up, kept only while they still hold. Whenever the form changes, by
 * typing, the assistant or a reload, the ones its fields no longer earn are dropped.
 */
export function useAutomationFieldErrors(
  form: WorkspaceAutomationFormState | null,
): [FieldErrors, Dispatch<SetStateAction<FieldErrors>>] {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [checkedForm, setCheckedForm] = useState(form);

  if (form !== checkedForm) {
    setCheckedForm(form);
    if (form) {
      setErrors((current) => pruneWorkspaceAutomationFieldErrors(current, form));
    }
  }

  return [errors, setErrors];
}
