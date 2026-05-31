import { describe, expect, it } from "vite-plus/test";

import { getAppShellTitle } from "./app-shell-title";

describe("getAppShellTitle", () => {
  it.each([
    ["/org/acme/command-center", "Command Center"],
    ["/org/acme/dashboard", "Command Center"],
    ["/org/acme/inbox", "Inbox"],
    ["/org/acme/new-request", "New Request"],
    ["/org/acme/chat", "New Request"],
    ["/org/acme/projects", "Projects"],
    ["/org/acme/projects/proj_1", "Overview"],
    ["/org/acme/projects/proj_1/files", "Files"],
    ["/org/acme/projects/proj_1/jobs", "Jobs"],
    ["/org/acme/projects/proj_1/agent-runs", "Agent Runs"],
    ["/org/acme/my-work", "My Work"],
    ["/org/acme/my-jobs", "My Work"],
    ["/org/acme/knowledge", "Knowledge"],
    ["/org/acme/glossaries", "Terminology"],
    ["/org/acme/translation-memories", "Translation Memories"],
    ["/org/acme/integrations", "Integrations"],
    ["/org/acme/settings", "Settings"],
    ["/org/acme/settings/members", "Team"],
    ["/org/acme/settings/account", "Account"],
    ["/org/acme/settings/billing", "Billing"],
    ["/org/acme/settings/notifications", "Notifications"],
  ])("returns the route title for %s", (pathname, title) => {
    expect(getAppShellTitle(pathname)).toBe(title);
  });

  it("falls back to command center for unknown or empty paths", () => {
    expect(getAppShellTitle(null)).toBe("Command Center");
    expect(getAppShellTitle("/org/acme/unknown")).toBe("Command Center");
  });
});
