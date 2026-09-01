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
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { IntlProvider } from "react-intl";

import { Button } from "@/components/ui/button";

const useAiFeaturesAccessMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/billing/use-ai-features-access", () => ({
  useAiFeaturesAccess: useAiFeaturesAccessMock,
}));

import { AiFeatureAction } from "./ai-feature-action";

describe("AiFeatureAction", () => {
  it("renders the AI action when the feature is allowed", () => {
    useAiFeaturesAccessMock.mockReturnValue({ status: "allowed" });

    render(
      <IntlProvider locale="en" messages={{}}>
        <AiFeatureAction organizationSlug="acme">
          <Button type="button">Translate with agent</Button>
        </AiFeatureAction>
      </IntlProvider>,
    );

    expect(screen.getByRole("button", { name: "Translate with agent" })).toBeInTheDocument();
  });

  it("renders an upgrade plan link when the feature is denied", () => {
    useAiFeaturesAccessMock.mockReturnValue({ status: "denied" });

    render(
      <IntlProvider locale="en" messages={{}}>
        <AiFeatureAction organizationSlug="acme">
          <Button type="button">Translate with agent</Button>
        </AiFeatureAction>
      </IntlProvider>,
    );

    expect(screen.queryByRole("button", { name: "Translate with agent" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade plan" })).toHaveAttribute(
      "href",
      "/org/acme/settings/billing#available-plans",
    );
  });

  it("renders nothing while access is loading", () => {
    useAiFeaturesAccessMock.mockReturnValue({ status: "loading" });

    const { container } = render(
      <IntlProvider locale="en" messages={{}}>
        <AiFeatureAction organizationSlug="acme">
          <Button type="button">Translate with agent</Button>
        </AiFeatureAction>
      </IntlProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
