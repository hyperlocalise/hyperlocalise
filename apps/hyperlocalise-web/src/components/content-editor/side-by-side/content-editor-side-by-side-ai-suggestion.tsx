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
import { SparklesIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage } from "react-intl";

import { UpgradePlanButton } from "@/components/billing/upgrade-plan-button";
import { Button } from "@/components/ui/button";
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
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onClick}
      disabled={!onClick || isLoading}
    >
      {isLoading ? (
        <Spinner className="size-3" />
      ) : (
        <HugeiconsIcon icon={SparklesIcon} className="size-3 text-grove-400" aria-hidden />
      )}
      <FormattedMessage {...contentEditorEditorPanelMessages.generateAiSuggestion} />
    </Button>
  );
}

export function ContentEditorSideBySideAiSuggestion({
  intelligence,
  isLoading,
  error,
  onUseAiSuggestion,
  onGenerateAiRecommendation,
}: {
  intelligence: ContentEditorSegmentIntelligence;
  isLoading: boolean;
  error?: string;
  onUseAiSuggestion: () => void;
  onGenerateAiRecommendation?: () => void;
}) {
  const upgradeHref = useAiFeaturesUpgradeHref();
  const [hasRequested, setHasRequested] = useState(false);
  const suggestion = intelligence.aiSuggestion?.trim() ?? "";
  const isOpen = hasRequested || isLoading;

  if (isLoading && !hasRequested) {
    setHasRequested(true);
  }

  if (upgradeHref) {
    return (
      <UpgradePlanButton
        organizationSlug={upgradeHref.organizationSlug}
        variant="ghost"
        size="xs"
      />
    );
  }

  if (!isOpen) {
    if (!onGenerateAiRecommendation) {
      return null;
    }

    return (
      <GenerateAiSuggestionButton
        onClick={() => {
          setHasRequested(true);
          if (!suggestion) {
            onGenerateAiRecommendation();
          }
        }}
      />
    );
  }

  if (isLoading && !suggestion && !error) {
    return (
      <Row spacing="0.5u" alignY="center" aria-busy>
        <Spinner className="size-3" />
        <Text size="xsmall" tone="subtle">
          <FormattedMessage {...contentEditorEditorPanelMessages.generatingAiSuggestion} />
        </Text>
      </Row>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (!suggestion) {
    return (
      <GenerateAiSuggestionButton isLoading={isLoading} onClick={onGenerateAiRecommendation} />
    );
  }

  return (
    <Columns spacing="0.5u" alignY="start" aria-busy={isLoading}>
      <Column width="content">
        <HugeiconsIcon icon={SparklesIcon} className="size-3 text-grove-400" aria-hidden />
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
  );
}
