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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FormattedMessage } from "react-intl";

import { integrationsDisconnectedMswHandlers } from "../../integrations/_components/integrations-msw-handlers";
import { DomainResearchEmpty } from "./domain-research-empty";
import { DomainSearchConsoleConnect } from "./domain-search-console-connect";
import { domainSearchConsoleViewMessages } from "./domain-search-console-view.messages";

function SearchConsoleConnectEmpty({
  canManageConnection = true,
}: {
  canManageConnection?: boolean;
}) {
  return (
    <div className="p-8">
      <DomainResearchEmpty
        title={<FormattedMessage {...domainSearchConsoleViewMessages.connectTitle} />}
        description={<FormattedMessage {...domainSearchConsoleViewMessages.connectDescription} />}
        action={
          <DomainSearchConsoleConnect
            organizationSlug="domains-preview"
            linkedDomainId="hyperlocalise-com"
            canManageConnection={canManageConnection}
          />
        }
      />
    </div>
  );
}

const meta = {
  title: "App/Domains/Search Console Empty",
  component: SearchConsoleConnectEmpty,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/en/org/domains-preview/domains/hyperlocalise-com/search-console",
      },
    },
    msw: { handlers: integrationsDisconnectedMswHandlers },
  },
  args: { canManageConnection: true },
} satisfies Meta<typeof SearchConsoleConnectEmpty>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disconnected: Story = {};
export const MemberCannotConnect: Story = { args: { canManageConnection: false } };
