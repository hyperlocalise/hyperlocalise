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
import { ArrowUpIcon } from "@phosphor-icons/react";
import { useState, type Ref } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { AUTOMATION_ASSISTANT_TEXT_MAX_CHARS } from "@/api/routes/workspace-automation/automation-assistant.schema";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import type { AiFeaturesAccessStatus } from "@/lib/billing/use-ai-features-access";

import { automationAssistantPromptMessages } from "./automation-assistant-prompt.messages";

/**
 * The box where a person describes the automation they want the assistant to set up. A plan
 * without AI features gets an upgrade notice in its place.
 */
export function AutomationAssistantPrompt({
  aiFeaturesStatus,
  inputRef,
  onSubmitPrompt,
  organizationSlug,
  pending = false,
}: {
  aiFeaturesStatus: AiFeaturesAccessStatus;
  inputRef?: Ref<HTMLTextAreaElement>;
  onSubmitPrompt: (text: string) => void;
  organizationSlug: string;
  /** The request was sent and the setup page is opening. */
  pending?: boolean;
}) {
  const intl = useIntl();
  const [prompt, setPrompt] = useState("");
  const disabled = aiFeaturesStatus !== "allowed" || pending;

  if (aiFeaturesStatus === "denied") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-muted px-4 py-4 text-sm">
        <p className="text-muted-foreground">
          <FormattedMessage {...automationAssistantPromptMessages.aiFeaturesRequired} />
        </p>
        <UpgradePlanButton organizationSlug={organizationSlug} />
      </div>
    );
  }

  return (
    <PromptInput
      onSubmit={({ text }) => {
        const trimmed = text.trim();
        if (trimmed && !disabled) {
          onSubmitPrompt(trimmed);
        }
      }}
      className="overflow-hidden rounded-xl border border-border bg-muted/30 text-foreground shadow-sm [&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:rounded-xl [&_[data-slot=input-group]]:border-0 [&_[data-slot=input-group]]:bg-transparent"
    >
      <PromptInputBody>
        <PromptInputTextarea
          ref={inputRef}
          aria-label={intl.formatMessage(automationAssistantPromptMessages.promptLabel)}
          disabled={disabled}
          maxLength={AUTOMATION_ASSISTANT_TEXT_MAX_CHARS}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          className="min-h-24 max-h-60 px-4 py-3 text-sm leading-6"
          placeholder={intl.formatMessage(automationAssistantPromptMessages.promptPlaceholder)}
          rows={3}
        />
      </PromptInputBody>
      <PromptInputFooter className="justify-end border-0 bg-transparent px-2 pb-2">
        <PromptInputSubmit
          size="sm"
          aria-label={intl.formatMessage(automationAssistantPromptMessages.submitPrompt)}
          disabled={disabled || !prompt.trim()}
          className="shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <ArrowUpIcon />
          <FormattedMessage {...automationAssistantPromptMessages.submitPrompt} />
        </PromptInputSubmit>
      </PromptInputFooter>
    </PromptInput>
  );
}
