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

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const { authMock, navigationMock, identifyMock, groupMock, resetMock } = vi.hoisted(() => ({
  authMock: {
    user: { id: "user_workos_1" } as { id: string } | null,
  },
  navigationMock: {
    organizationSlug: "acme" as string | undefined,
  },
  identifyMock: vi.fn(),
  groupMock: vi.fn(),
  resetMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => authMock,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ organizationSlug: navigationMock.organizationSlug }),
}));

vi.mock("posthog-js", () => ({
  default: {
    __loaded: true,
    identify: identifyMock,
    group: groupMock,
    reset: resetMock,
  },
}));

import { PostHogIdentity } from "./posthog-identity";

afterEach(() => {
  authMock.user = { id: "user_workos_1" };
  navigationMock.organizationSlug = "acme";
  identifyMock.mockClear();
  groupMock.mockClear();
  resetMock.mockClear();
});

describe("PostHogIdentity", () => {
  it("identifies the WorkOS user and groups by organization slug", () => {
    render(<PostHogIdentity />);

    expect(identifyMock).toHaveBeenCalledWith("user_workos_1");
    expect(groupMock).toHaveBeenCalledWith("organization", "acme");
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("does not group when the route has no organization slug", () => {
    navigationMock.organizationSlug = undefined;

    render(<PostHogIdentity />);

    expect(identifyMock).toHaveBeenCalledWith("user_workos_1");
    expect(groupMock).not.toHaveBeenCalled();
  });

  it("resets after the WorkOS session ends", () => {
    const { rerender } = render(<PostHogIdentity />);

    expect(identifyMock).toHaveBeenCalledOnce();

    authMock.user = null;
    rerender(<PostHogIdentity />);

    expect(resetMock).toHaveBeenCalledOnce();
  });
});
