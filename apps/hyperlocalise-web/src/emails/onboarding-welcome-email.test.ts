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
import { render } from "@react-email/render";
import { describe, expect, it } from "vite-plus/test";

import { onboardingWelcomeEmailFixture } from "./onboarding-welcome-email.fixture";
import {
  OnboardingWelcomeEmail,
  displayFirstName,
  onboardingWelcomeEmailText,
  onboardingWelcomeGreeting,
} from "./onboarding-welcome-email";

describe("onboarding welcome email", () => {
  it("greets by first name when present", () => {
    expect(onboardingWelcomeGreeting("Dev")).toBe("Hello Dev, and welcome to Hyperlocalise.");
    expect(onboardingWelcomeGreeting("  Mina  Chen  ")).toBe(
      "Hello Mina Chen, and welcome to Hyperlocalise.",
    );
    expect(onboardingWelcomeGreeting(null)).toBe("Hello, and welcome to Hyperlocalise.");
    expect(displayFirstName("x".repeat(81))).toBeNull();
  });

  it("includes getting-started steps and MCP snippets in plain text", () => {
    const text = onboardingWelcomeEmailText(onboardingWelcomeEmailFixture);

    expect(text).toContain("Hello Dev, and welcome to Hyperlocalise.");
    expect(text).toContain("Create a project");
    expect(text).toContain("Add source content");
    expect(text).toContain("Connect Hyperlocalise's MCP");
    expect(text).toContain("Use the CLI in GitHub Actions");
    expect(text).toContain("- uses: hyperlocalise/hyperlocalise/install@v1");
    expect(text).toContain("hyperlocalise sync push");
    expect(text).toContain(onboardingWelcomeEmailFixture.claudeSnippet);
    expect(text).toContain(onboardingWelcomeEmailFixture.codexSnippet);
    expect(text).toContain(onboardingWelcomeEmailFixture.gettingStartedUrl);
    expect(text).toContain(onboardingWelcomeEmailFixture.cliDocsUrl);
    expect(text).toContain(onboardingWelcomeEmailFixture.mcpDocsUrl);
    expect(text).toContain(onboardingWelcomeEmailFixture.appUrl);
  });

  it("renders the greeting and MCP docs link in HTML", async () => {
    const html = await render(OnboardingWelcomeEmail(onboardingWelcomeEmailFixture));

    expect(html).toContain("Hello Dev, and welcome to Hyperlocalise.");
    expect(html).toContain("Create a project");
    expect(html).toContain("Use the CLI in GitHub Actions");
    expect(html).toContain("hyperlocalise/hyperlocalise/install@v1");
    expect(html).toContain("Connect Hyperlocalise");
    expect(html).toContain(onboardingWelcomeEmailFixture.cliDocsUrl);
    expect(html).toContain(onboardingWelcomeEmailFixture.mcpDocsUrl);
    expect(html).toContain(onboardingWelcomeEmailFixture.claudeSnippet);
    expect(html).toContain("Open Hyperlocalise");
  });
});
