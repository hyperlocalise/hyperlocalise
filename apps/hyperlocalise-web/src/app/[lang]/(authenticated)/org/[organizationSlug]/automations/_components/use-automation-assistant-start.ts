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
import { useState } from "react";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { stashAutomationAssistantHandoff } from "@/lib/automation-assistant/handoff";
import { useAiFeaturesAccess } from "@/lib/billing/use-ai-features-access";
import { useOrgRouter } from "@/lib/navigation/use-org-router";

import type { AutomationsPageAssistant } from "./automations-page-view";

/**
 * The prompt box's side of the setup assistant: what a person describes is handed to the agent
 * setup page, which opens with the assistant working on it. Undefined when the assistant is off.
 */
export function useAutomationAssistantStart({
  organizationSlug,
  projectId,
  enabled,
}: {
  organizationSlug: string;
  projectId?: string;
  enabled: boolean;
}): AutomationsPageAssistant | undefined {
  const router = useOrgRouter();
  const aiFeaturesAccess = useAiFeaturesAccess();
  const [pending, setPending] = useState(false);

  if (!enabled) {
    return undefined;
  }

  return {
    aiFeaturesStatus: aiFeaturesAccess.status,
    pending,
    onSubmitPrompt: (text) => {
      stashAutomationAssistantHandoff(text);
      setPending(true);
      router.push(`${buildAutomationsPath(organizationSlug, { projectId })}/new`);
    },
  };
}
