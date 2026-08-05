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
import type { ReactNode } from "react";

const storybookUser = {
  id: "user_storybook",
  email: "storybook@example.com",
  firstName: "Story",
  lastName: "Book",
  profilePictureUrl: null,
};

const storybookAuth = {
  user: storybookUser,
  sessionId: "session_storybook",
  organizationId: "org_storybook",
  role: undefined,
  roles: undefined,
  permissions: undefined,
  entitlements: undefined,
  featureFlags: undefined,
  impersonator: undefined,
  loading: false,
  getAuth: async () => {},
  refreshAuth: async () => {},
  signOut: async () => {},
  switchToOrganization: async () => ({ error: "unsupported_in_storybook" }),
};

export function AuthKitProvider({ children }: { children: ReactNode }) {
  return children;
}

export function Impersonation() {
  return null;
}

export function useAuth() {
  return storybookAuth;
}

export function useAccessToken() {
  return {
    accessToken: "storybook-access-token",
    loading: false,
    error: null,
    refresh: async () => "storybook-access-token",
  };
}

export function useTokenClaims() {
  return {
    claims: null,
    loading: false,
    error: null,
    refresh: async () => null,
  };
}

export function useRecentAuth() {
  return {
    isRecentAuth: true,
    loading: false,
  };
}
