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
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createDefaultWorkspaceAutomationFormState,
  type WorkspaceAutomationFormState,
} from "@/lib/agents/workspace-automation-view-model";

import { TriggerSettings } from "./workspace-automation-trigger-settings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const CONNECTION_ID = "contentful_conn_001";

function Harness({
  connectionContentTypeIds,
  initialForm,
}: {
  connectionContentTypeIds: string[];
  initialForm: WorkspaceAutomationFormState;
}) {
  const [form, setForm] = useState(initialForm);

  return (
    <IntlProvider locale="en" messages={{}}>
      <TriggerSettings
        contentfulConnected
        contentfulConnections={[
          {
            id: CONNECTION_ID,
            displayName: "Marketing space",
            contentTypeIds: connectionContentTypeIds,
            enabled: true,
          },
        ]}
        errors={{}}
        form={form}
        githubConnected
        onChange={setForm}
        organizationSlug="acme"
        repositories={[]}
      />
    </IntlProvider>
  );
}

function contentfulForm(contentTypeIds: string[]): WorkspaceAutomationFormState {
  return {
    ...createDefaultWorkspaceAutomationFormState(),
    triggerMode: "contentful",
    contentfulConnectionId: CONNECTION_ID,
    contentfulContentTypeIds: contentTypeIds,
  };
}

describe("TriggerSettings Contentful content types", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows only the types the connection still sends and can adopt its list", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        connectionContentTypeIds={["article", "faq"]}
        initialForm={contentfulForm(["article", "landingPage"])}
      />,
    );

    expect(screen.getByText("article")).toBeInTheDocument();
    expect(screen.queryByText("landingPage")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use the connection's content types" }));

    expect(screen.getByText("faq")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use the connection's content types" }),
    ).not.toBeInTheDocument();
  });

  it("warns when none of the saved types is sent any more", () => {
    render(
      <Harness connectionContentTypeIds={["faq"]} initialForm={contentfulForm(["landingPage"])} />,
    );

    expect(screen.getByText(/so no run will start/)).toBeInTheDocument();
    expect(screen.queryByText("landingPage")).not.toBeInTheDocument();
  });

  it("stays quiet when the saved list matches the connection", () => {
    render(
      <Harness
        connectionContentTypeIds={["article", "landingPage"]}
        initialForm={contentfulForm(["landingPage", "article"])}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Use the connection's content types" }),
    ).not.toBeInTheDocument();
  });
});

describe("TriggerSettings hourly schedule", () => {
  it("hides the hour and timezone, which hourly runs ignore", () => {
    render(
      <Harness
        connectionContentTypeIds={[]}
        initialForm={{
          ...createDefaultWorkspaceAutomationFormState(),
          triggerMode: "scheduled",
          scheduledCadence: "hourly",
          scheduledTimezone: "Australia/Sydney",
        }}
      />,
    );

    expect(screen.queryByRole("combobox", { name: "Schedule hour" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule timezone" })).not.toBeInTheDocument();
  });
});
