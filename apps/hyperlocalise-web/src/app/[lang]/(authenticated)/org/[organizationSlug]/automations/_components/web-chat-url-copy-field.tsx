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
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { workspaceAutomationFormMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.messages";
import {
  Snippet,
  SnippetAddon,
  SnippetCopyButton,
  SnippetInput,
} from "@/components/ai-elements/snippet";
import {
  buildWorkspaceAutomationWebChatHref,
  buildWorkspaceAutomationWebChatUrl,
} from "@/lib/agents/workspace-automation-web-chat";

export function WebChatUrlCopyField({
  automationId,
  organizationSlug,
}: {
  automationId: string;
  organizationSlug: string;
}) {
  const intl = useIntl();
  const href = buildWorkspaceAutomationWebChatHref({
    organizationSlug,
    automationId,
    locale: intl.locale,
  });
  const [url, setUrl] = useState(href);

  useEffect(() => {
    setUrl(
      buildWorkspaceAutomationWebChatUrl({
        organizationSlug,
        automationId,
        locale: intl.locale,
        origin: window.location.origin,
      }),
    );
  }, [automationId, intl.locale, organizationSlug]);

  return (
    <Snippet code={url}>
      <SnippetInput
        aria-label={intl.formatMessage(workspaceAutomationFormMessages.chatUrl)}
        onFocus={(event) => event.currentTarget.select()}
      />
      <SnippetAddon align="inline-end">
        <SnippetCopyButton
          aria-label={intl.formatMessage(workspaceAutomationFormMessages.copyChatUrl)}
        />
      </SnippetAddon>
    </Snippet>
  );
}
