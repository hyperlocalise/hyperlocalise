// @vitest-environment happy-dom

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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { MemberRecord } from "@/lib/go-svc/go-svc-client.types";

import { AutomationOwnerField } from "./automation-owner-field";

const ADA_USER_ID = "11111111-1111-4111-8111-111111111111";
const GRACE_USER_ID = "22222222-2222-4222-8222-222222222222";
const DEVELOPER_USER_ID = "33333333-3333-4333-8333-333333333333";
const AUTOMATION_ID = "44444444-4444-4444-8444-444444444444";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const apiMocks = vi.hoisted(() => ({
  listMembers: vi.fn(),
  patchAutomation: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      member: {
        list: apiMocks.listMembers,
      },
    },
    loading: false,
  }),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          automations: {
            ":automationId": {
              $patch: (...args: unknown[]) => apiMocks.patchAutomation(...args),
            },
          },
        },
      },
    },
  },
}));

function member(overrides: Partial<MemberRecord> & Pick<MemberRecord, "userId" | "displayName">) {
  return {
    workosUserId: `user_${overrides.userId}`,
    email: `${overrides.displayName.toLowerCase().replaceAll(" ", ".")}@example.com`,
    firstName: overrides.displayName.split(" ")[0] ?? null,
    lastName: overrides.displayName.split(" ").slice(1).join(" ") || null,
    avatarUrl: null,
    role: "admin",
    isCurrentUser: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    ...overrides,
  } satisfies MemberRecord;
}

function renderOwnerField(
  props: Partial<{
    authorUserId: string | null;
    authorName: string | null;
    disabled: boolean;
  }> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <IntlProvider locale="en" messages={{}}>
      <QueryClientProvider client={queryClient}>
        <AutomationOwnerField
          organizationSlug="acme"
          automationId={AUTOMATION_ID}
          authorUserId={props.authorUserId === undefined ? ADA_USER_ID : props.authorUserId}
          authorName={props.authorName === undefined ? "Ada Lovelace" : props.authorName}
          disabled={props.disabled}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

describe("AutomationOwnerField", () => {
  beforeEach(() => {
    apiMocks.listMembers.mockResolvedValue({
      members: [
        member({
          userId: ADA_USER_ID,
          displayName: "Ada Lovelace",
          role: "admin",
          isCurrentUser: true,
        }),
        member({
          userId: GRACE_USER_ID,
          displayName: "Grace Hopper",
          role: "localization_manager",
        }),
        member({
          userId: DEVELOPER_USER_ID,
          displayName: "Alan Turing",
          role: "developer",
        }),
        member({
          userId: "55555555-5555-4555-8555-555555555555",
          displayName: "Invited Admin",
          role: "admin",
          status: "invited",
        }),
      ],
    });
    apiMocks.patchAutomation.mockResolvedValue({
      status: 200,
      json: async () => ({
        automation: {
          id: AUTOMATION_ID,
          authorUserId: GRACE_USER_ID,
          authorName: "Grace Hopper",
        },
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reassigns the owner to another workspace operator", async () => {
    const user = userEvent.setup();
    renderOwnerField();

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Owner" }));

    expect(await screen.findByRole("option", { name: /Grace Hopper/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Alan Turing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Invited Admin/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Grace Hopper/ }));

    await waitFor(() => {
      expect(apiMocks.patchAutomation).toHaveBeenCalledWith({
        param: { organizationSlug: "acme", automationId: AUTOMATION_ID },
        json: { authorUserId: GRACE_USER_ID },
      });
    });
    expect(toastMocks.success).toHaveBeenCalledWith("Owner updated");
  });

  it("falls back to the saved owner name when the member list has not loaded them", async () => {
    renderOwnerField({ authorUserId: null, authorName: null });

    expect(await screen.findByText("Unknown owner")).toBeInTheDocument();
  });
});
