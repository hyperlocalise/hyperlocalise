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
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { BrazeConnectionPanel } from "./braze-connection-panel";
import { integrationsOrganizationSlug } from "./integrations.fixture";

function createBrazeConnectionMswHandlers(input?: {
  connected?: boolean;
  restEndpoint?: string | null;
  apiKeyLast4?: string | null;
}) {
  const connected = input?.connected ?? false;
  const restEndpoint = input?.restEndpoint ?? (connected ? "iad-03" : null);
  return [
    http.get("/api/orgs/:organizationSlug/pipes/:provider", ({ params }) =>
      HttpResponse.json({
        pipe: {
          provider: params.provider,
          connected: params.provider === "braze" ? connected : false,
          needsReauthorization: false,
          apiKeyLast4: params.provider === "braze" ? (input?.apiKeyLast4 ?? null) : null,
        },
      }),
    ),
    http.get("/api/orgs/:organizationSlug/braze", () =>
      HttpResponse.json({
        braze: restEndpoint ? { restEndpoint } : null,
      }),
    ),
    http.put("/api/orgs/:organizationSlug/braze", async ({ request }) => {
      const body = (await request.json()) as { restEndpoint?: string };
      return HttpResponse.json({ braze: { restEndpoint: body.restEndpoint ?? "iad-03" } });
    }),
  ];
}

const meta = {
  title: "App/Integrations/Braze",
  component: BrazeConnectionPanel,
  args: {
    organizationSlug: integrationsOrganizationSlug,
    disabled: false,
    isLast: true,
  },
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof BrazeConnectionPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disconnected: Story = {
  parameters: {
    msw: {
      handlers: createBrazeConnectionMswHandlers(),
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect" }));
    await expect(
      canvas.getByText("Paste a Braze REST API key and choose the REST cluster for that instance."),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "REST cluster" }));
    const search = await canvas.findByLabelText("Search or paste a REST endpoint");
    await userEvent.type(search, "https://rest.fra-01.braze.eu/");
    await expect(
      canvas.getByRole("option", { name: "EU-01 · https://rest.fra-01.braze.eu" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("option", { name: "US-01 · https://rest.iad-01.braze.com" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("option", { name: "EU-01 · https://rest.fra-01.braze.eu" }));
    await expect(canvas.getByRole("button", { name: "REST cluster" })).toHaveTextContent(
      "EU-01 · https://rest.fra-01.braze.eu",
    );
  },
};

export const Connected: Story = {
  parameters: {
    msw: {
      handlers: createBrazeConnectionMswHandlers({
        connected: true,
        restEndpoint: "iad-03",
        apiKeyLast4: "wxyz",
      }),
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Manage" }));
    await expect(canvas.getByText("Token ending in wxyz")).toBeVisible();
    await waitFor(() => {
      expect(canvas.getByRole("button", { name: "REST cluster" })).toHaveTextContent(
        "US-03 · https://rest.iad-03.braze.com",
      );
    });
  },
};

export const NoMatchingCluster: Story = {
  parameters: {
    msw: {
      handlers: createBrazeConnectionMswHandlers(),
    },
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect" }));
    await userEvent.click(canvas.getByRole("button", { name: "REST cluster" }));
    await userEvent.type(
      await canvas.findByLabelText("Search or paste a REST endpoint"),
      "https://dashboard.braze.com",
    );
    await expect(canvas.getByText("No REST cluster matches.")).toBeVisible();
  },
};
