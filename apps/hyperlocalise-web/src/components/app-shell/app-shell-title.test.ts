import { describe, expect, it } from "vitest";

import { getAppShellTitle } from "./app-shell-title";

describe("getAppShellTitle", () => {
  it.each([
    ["/org/acme/dashboard", "Analytics"],
    ["/org/acme/inbox", "Inbox"],
    ["/org/acme/projects", "Projects"],
    ["/org/acme/jobs", "Jobs"],
    ["/org/acme/context", "Context"],
    ["/org/acme/glossaries", "Glossaries"],
    ["/org/acme/agent", "Agent"],
    ["/org/acme/translation-memories", "Translation Memories"],
    ["/org/acme/integrations", "Integrations"],
    ["/org/acme/settings", "Settings"],
    ["/org/acme/settings/account", "Account"],
    ["/org/acme/settings/billing", "Billing"],
    ["/org/acme/settings/notifications", "Notifications"],
  ])("returns the route title for %s", (pathname, title) => {
    expect(getAppShellTitle(pathname)).toBe(title);
  });

  it("falls back to dashboard for unknown or empty paths", () => {
    expect(getAppShellTitle(null)).toBe("Analytics");
    expect(getAppShellTitle("/org/acme/unknown")).toBe("Analytics");
  });
});
