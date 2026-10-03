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
import { useState, type ReactNode } from "react";
import { SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import { Row } from "@/components/ui/layout/row";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/typography";
import { useAiFeaturesUpgradeHref } from "@/lib/billing/ai-features-upgrade-href";

import { contentEditorEditorPanelMessages } from "@/components/content-editor/shared/content-editor.messages";
import type { ContentEditorSegmentIntelligence } from "@/components/content-editor/shared/types";

function GenerateAiSuggestionButton({
  isLoading,
  onClick,
}: {
  isLoading?: boolean;
  onClick?: () => void;
}) {
  const intl = useIntl();
  const label = intl.formatMessage(contentEditorEditorPanelMessages.generateAiSuggestion);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClick}
              disabled={!onClick || isLoading}
              aria-label={label}
            />
          }
        >
          {isLoading ? (
            <Spinner className="size-4" />
          ) : (
            <HugeiconsIcon icon={SparklesIcon} className="size-4 text-grove-900" aria-hidden />
          )}
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function wrapAiSuggestion(
  trigger: ReactNode,
  panel: ReactNode,
  renderToolbar?: (trigger: ReactNode) => ReactNode,
) {
  const toolbar = renderToolbar ? renderToolbar(trigger) : trigger;
  if (!panel && !toolbar) {
    return null;
  }

  if (!panel) {
    return toolbar;
  }

  if (!toolbar) {
    return panel;
  }

  return (
    <div className="flex flex-col gap-3">
      {panel}
      {toolbar}
    </div>
  );
}

export function ContentEditorSideBySideAiSuggestion({
  intelligence,
  isLoading,
  error,
  onUseAiSuggestion,
  onGenerateAiRecommendation,
  renderToolbar,
}: {
  intelligence: ContentEditorSegmentIntelligence;
  isLoading: boolean;
  error?: string;
  onUseAiSuggestion: () => void;
  onGenerateAiRecommendation?: () => void;
  renderToolbar?: (trigger: ReactNode) => ReactNode;
}) {
  const upgradeHref = useAiFeaturesUpgradeHref();
  const [hasRequested, setHasRequested] = useState(false);
  const suggestion = intelligence.aiSuggestion?.trim() ?? "";
  const isOpen = hasRequested || isLoading;

  if (isLoading && !hasRequested) {
    setHasRequested(true);
  }

  if (upgradeHref) {
    return wrapAiSuggestion(
      <UpgradePlanButton
        organizationSlug={upgradeHref.organizationSlug}
        variant="ghost"
        size="xs"
      />,
      null,
      renderToolbar,
    );
  }

  if (!isOpen) {
    if (!onGenerateAiRecommendation) {
      return wrapAiSuggestion(null, null, renderToolbar);
    }

    return wrapAiSuggestion(
      <GenerateAiSuggestionButton
        onClick={() => {
          setHasRequested(true);
          if (!suggestion) {
            onGenerateAiRecommendation();
          }
        }}
      />,
      null,
      renderToolbar,
    );
  }

  if (isLoading && !suggestion && !error) {
    return wrapAiSuggestion(
      null,
      <div className="rounded-lg bg-muted/50 px-2.5 py-2">
        <Row spacing="0.5u" alignY="center" aria-busy>
          <Spinner className="size-3" />
          <Text size="xsmall" tone="subtle">
            <FormattedMessage {...contentEditorEditorPanelMessages.generatingAiSuggestion} />
          </Text>
        </Row>
      </div>,
      renderToolbar,
    );
  }

  if (error) {
    return wrapAiSuggestion(
      null,
      <div className="rounded-lg bg-muted/50 px-2.5 py-2">
        <Columns spacing="0.5u" alignY="center">
          <Column width="fluid">
            <Text size="xsmall" tone="critical" lineClamp={1}>
              {error}
            </Text>
          </Column>
          {onGenerateAiRecommendation ? (
            <Column width="content">
              <Button type="button" variant="ghost" size="xs" onClick={onGenerateAiRecommendation}>
                <FormattedMessage {...contentEditorEditorPanelMessages.regenerate} />
              </Button>
            </Column>
          ) : null}
        </Columns>
      </div>,
      renderToolbar,
    );
  }

  if (!suggestion) {
    return wrapAiSuggestion(
      <GenerateAiSuggestionButton isLoading={isLoading} onClick={onGenerateAiRecommendation} />,
      null,
      renderToolbar,
    );
  }

  return wrapAiSuggestion(
    null,
    <div className="rounded-lg bg-muted/50 px-2.5 py-2" aria-busy={isLoading}>
      <Columns spacing="0.5u" alignY="start">
        <Column width="content">
          <HugeiconsIcon
            icon={SparklesIcon}
            className="mt-0.5 size-3.5 text-grove-900"
            aria-hidden
          />
        </Column>
        <Column width="fluid">
          <Text size="xsmall" wrapStyle="pretty" lineClamp={2}>
            {suggestion}
          </Text>
        </Column>
        <Column width="content">
          <Row spacing="0.5u" alignY="center">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onUseAiSuggestion}
              disabled={isLoading}
            >
              <HugeiconsIcon icon={Tick02Icon} className="size-3" aria-hidden />
              <FormattedMessage {...contentEditorEditorPanelMessages.use} />
            </Button>
            {onGenerateAiRecommendation ? (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onGenerateAiRecommendation}
                disabled={isLoading}
              >
                {isLoading ? <Spinner className="size-3" /> : null}
                <FormattedMessage {...contentEditorEditorPanelMessages.regenerate} />
              </Button>
            ) : null}
          </Row>
        </Column>
      </Columns>
    </div>,
    renderToolbar,
  );
}
