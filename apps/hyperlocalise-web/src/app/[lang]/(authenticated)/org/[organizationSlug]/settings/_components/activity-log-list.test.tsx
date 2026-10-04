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

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { ActivityLogList, type ActivityLogItem } from "./activity-log-list";

function renderWithIntl(ui: ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>,
  );
}

function apiKeyActivity(): ActivityLogItem {
  return {
    actor: {
      credentialId: "key-1",
      credentialName: "CLI deploy",
      displayName: "Ada Lovelace",
      keyPrefix: "hl_abc12",
      kind: "api_key",
      userId: "user-1",
    },
    createdAt: "2026-09-04T09:00:00.000Z",
    eventType: "file_uploaded",
    id: "activity-1",
    payload: {
      fileName: "en.json",
      projectId: "project-1",
      sourcePath: "locales/en.json",
    },
    target: {
      displayName: "en.json",
      href: "/org/acme/projects/project-1/files",
      id: "project-1:locales/en.json",
      kind: "file",
    },
  };
}

describe("ActivityLogList", () => {
  it("shows the user, API key, and expandable audit details", async () => {
    const onActorFilter = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <ActivityLogList
        activityLogs={[apiKeyActivity()]}
        now={new Date("2026-09-04T10:00:00.000Z").getTime()}
        onActorFilter={onActorFilter}
        organizationSlug="acme"
      />,
    );

    expect(screen.getByText(/uploaded a file/)).toBeInTheDocument();
    expect(screen.getByText(/via CLI deploy \(hl_abc12\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open members" })).toHaveAttribute(
      "href",
      "/org/acme/settings/members",
    );
    expect(screen.getByRole("link", { name: "Open API keys" })).toHaveAttribute(
      "href",
      "/org/acme/settings/api-keys",
    );

    await user.click(screen.getByRole("button", { name: "Show activity by Ada Lovelace" }));
    expect(onActorFilter).toHaveBeenCalledWith("user:user-1");

    await user.click(screen.getByRole("button", { name: "Show activity from CLI deploy" }));
    expect(onActorFilter).toHaveBeenCalledWith("api_key:key-1");

    await user.click(screen.getByText("Show details"));
    expect(screen.getByText("key-1")).toBeInTheDocument();
    expect(screen.getByText("user-1")).toBeInTheDocument();
    expect(screen.getByText("file_uploaded")).toBeInTheDocument();
    expect(screen.getByText("locales/en.json")).toBeInTheDocument();
  });
});
