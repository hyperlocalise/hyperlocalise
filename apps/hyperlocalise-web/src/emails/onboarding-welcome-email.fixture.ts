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
import type { OnboardingWelcomeEmailProps } from "./onboarding-welcome-email";

export const onboardingWelcomeEmailFixture: OnboardingWelcomeEmailProps = {
  firstName: "Dev",
  appUrl: "https://app.hyperlocalise.com",
  gettingStartedUrl: "https://hyperlocalise.dev/platform/getting-started",
  mcpDocsUrl: "https://hyperlocalise.dev/platform/mcp",
  cliDocsUrl: "https://hyperlocalise.dev/cli/workflows/ci-automation",
  mcpUrl: "https://hyperlocalise.com/mcp",
  brandLogoUrl: "/images/logo.png",
  claudeSnippet: "claude mcp add -t http hyperlocalise https://hyperlocalise.com/mcp",
  codexSnippet: "codex mcp add hyperlocalise --url https://hyperlocalise.com/mcp",
};
