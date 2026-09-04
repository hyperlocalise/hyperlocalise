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
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";
import { siClaude, siCursor } from "simple-icons";

import {
  Snippet,
  SnippetAddon,
  SnippetCopyButton,
  SnippetInput,
  SnippetText,
} from "@/components/ai-elements/snippet";
import { Card, CardContent } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";

import { SimpleBrandIcon } from "../../integrations/_components/simple-brand-icon";
import {
  buildHyperlocaliseMcpUrl,
  buildMcpAgentSnippet,
  mcpAgentClientIds,
  mcpAgentSnippetUsesShellPrompt,
  mcpClientSetupGuideUrls,
  type McpAgentClient,
} from "./overview-connect-agent";
import { overviewConnectAgentCardMessages as messages } from "./overview-connect-agent-card.messages";

const subscribeNoop = () => () => undefined;

function useBrowserOrigin() {
  return useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
}

function CodexBrandIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-3.5", className)}
      fill="currentColor"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

const CLIENT_TABS: readonly {
  id: McpAgentClient;
  label: typeof messages.clientClaude;
  icon: ReactNode;
}[] = [
  {
    id: "claude",
    label: messages.clientClaude,
    icon: <SimpleBrandIcon className="size-3.5" colored icon={siClaude} />,
  },
  {
    id: "codex",
    label: messages.clientCodex,
    icon: <CodexBrandIcon />,
  },
  {
    id: "cursor",
    label: messages.clientCursor,
    icon: <SimpleBrandIcon className="size-3.5" colored icon={siCursor} />,
  },
];

function isMcpAgentClient(value: string): value is McpAgentClient {
  return mcpAgentClientIds.includes(value as McpAgentClient);
}

function ClientNextStep({ client }: { client: McpAgentClient }) {
  switch (client) {
    case "claude":
      return (
        <FormattedMessage
          {...messages.claudeNextStep}
          values={{
            command: <Kbd>/mcp</Kbd>,
          }}
        />
      );
    case "codex":
      return (
        <FormattedMessage
          {...messages.codexNextStep}
          values={{
            command: <Kbd>codex mcp login hyperlocalise</Kbd>,
          }}
        />
      );
    case "cursor":
      return <FormattedMessage {...messages.cursorNextStep} />;
    default: {
      const _exhaustive: never = client;
      return _exhaustive;
    }
  }
}

export function OverviewConnectAgentCard({
  mcpUrl: mcpUrlProp,
  className,
}: {
  mcpUrl?: string;
  className?: string;
}) {
  const intl = useIntl();
  const origin = useBrowserOrigin();
  const mcpUrl = mcpUrlProp ?? (origin ? buildHyperlocaliseMcpUrl(origin) : "");
  const [client, setClient] = useState<McpAgentClient>("claude");
  const snippet = mcpUrl ? buildMcpAgentSnippet(client, mcpUrl) : "";
  const clientLabel = intl.formatMessage(
    CLIENT_TABS.find((tab) => tab.id === client)?.label ?? messages.clientClaude,
  );

  return (
    <Card className={cn("rounded-2xl border border-border bg-card py-0 ring-0", className)}>
      <CardContent className="flex flex-col gap-4 px-6 py-6">
        <Tabs
          onValueChange={(value) => {
            if (isMcpAgentClient(value)) {
              setClient(value);
            }
          }}
          value={client}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-heading text-xl font-medium text-balance text-foreground">
              <FormattedMessage {...messages.title} />
            </h2>
            <TabsList className="h-8 self-start rounded-full p-0.5 sm:self-auto">
              {CLIENT_TABS.map((tab) => (
                <TabsTrigger
                  className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
                  key={tab.id}
                  value={tab.id}
                >
                  {tab.icon}
                  <FormattedMessage {...tab.label} />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TypographyP wrapStyle="pretty" size="small" tone="subtle">
            <FormattedMessage {...messages.description} />
          </TypographyP>
          <a
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            href={mcpClientSetupGuideUrls[client]}
            rel="noreferrer"
            target="_blank"
          >
            <FormattedMessage {...messages.setupGuide} />
            <HugeiconsIcon className="size-3.5" icon={LinkSquare02Icon} strokeWidth={1.8} />
          </a>
        </div>

        <Snippet className={cn(client === "cursor" && "h-auto items-start")} code={snippet}>
          {mcpAgentSnippetUsesShellPrompt(client) ? <SnippetText>$</SnippetText> : null}
          {client === "cursor" ? (
            <pre
              aria-label={intl.formatMessage(messages.snippetLabel, {
                client: clientLabel,
              })}
              className="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-sm text-foreground"
            >
              {snippet}
            </pre>
          ) : (
            <SnippetInput
              aria-label={intl.formatMessage(messages.snippetLabel, {
                client: clientLabel,
              })}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
          <SnippetAddon align="inline-end">
            <SnippetCopyButton />
          </SnippetAddon>
        </Snippet>

        <TypographyP wrapStyle="pretty" size="small" tone="subtle">
          <ClientNextStep client={client} />
        </TypographyP>
      </CardContent>
    </Card>
  );
}
