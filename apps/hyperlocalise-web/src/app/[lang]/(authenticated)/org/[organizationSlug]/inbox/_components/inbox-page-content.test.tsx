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
// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AppShellStoreProvider } from "@/components/app-shell/store/app-shell-store-context";
import { TooltipProvider } from "@/components/ui/tooltip";

import type { InboxApi } from "./inbox-api";
import { InboxPageContent } from "./inbox-page-content";
import type { InboxNotificationsApi } from "./inbox-notifications-api";
import { conversationsFixture, currentUserFixture, messagesFixture } from "./inbox.fixture";

const firstConversation = conversationsFixture[0]!;
const secondConversation = conversationsFixture[1]!;

const navigation = vi.hoisted(() => ({
  conversationId: "11111111-1111-4111-8111-111111111111",
  notificationId: undefined as string | undefined,
  pathname: "/org/acme/inbox/11111111-1111-4111-8111-111111111111",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({
    conversationId: navigation.conversationId,
    notificationId: navigation.notificationId,
    organizationSlug: "acme",
  }),
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
}));

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: () => ({ status: "allowed" }),
}));

vi.mock("./reply-composer", () => ({
  ReplyComposer: () => null,
}));

function createInboxApi(listMessages: InboxApi["listMessages"]): InboxApi {
  return {
    createConversation: vi.fn(),
    listChatRepositories: async () => [],
    listConversations: async () => conversationsFixture,
    listLinkedJobs: async () => [],
    listMessages,
    sendMessage: vi.fn(),
  };
}

const notificationsApi: InboxNotificationsApi = {
  getById: vi.fn(),
  list: async () => ({ notifications: [], total: 0 }),
  markAllRead: vi.fn(),
  markRead: vi.fn(),
  unreadCount: async () => 0,
};

function renderInbox(inboxApi: InboxApi) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <AppShellStoreProvider defaultNavigationGroups={[]}>
          <TooltipProvider>
            <InboxPageContent
              currentUser={currentUserFixture}
              inboxApi={inboxApi}
              notificationsApi={notificationsApi}
              organizationSlug="acme"
            />
          </TooltipProvider>
        </AppShellStoreProvider>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe("InboxPageContent item switching", () => {
  afterEach(() => {
    navigation.conversationId = firstConversation.id;
    navigation.notificationId = undefined;
    navigation.pathname = `/org/acme/inbox/${firstConversation.id}`;
    navigation.push.mockReset();
  });

  it("shows the next conversation and a skeleton before the route params update", async () => {
    const user = userEvent.setup();
    let resolveSecondMessages: ((messages: typeof messagesFixture) => void) | undefined;
    const listMessages = vi.fn(async (_organizationSlug: string, conversationId: string) => {
      if (conversationId === firstConversation.id) {
        return messagesFixture;
      }
      return await new Promise<typeof messagesFixture>((resolve) => {
        resolveSecondMessages = resolve;
      });
    });

    renderInbox(createInboxApi(listMessages));

    const firstMessagePreviews = await screen.findAllByText(
      "Can you localize the hero section for French and German?",
    );
    expect(firstMessagePreviews.length).toBeGreaterThan(1);

    await user.click(screen.getByRole("button", { name: /Email: Q3 release notes/ }));

    expect(navigation.push).toHaveBeenCalledWith(`/org/acme/inbox/${secondConversation.id}`);
    expect(navigation.conversationId).toBe(firstConversation.id);
    expect(screen.getAllByText("Email: Q3 release notes").length).toBeGreaterThan(1);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Can you localize the hero section for French and German?"),
    ).toHaveLength(1);

    resolveSecondMessages?.([]);
  });
});
