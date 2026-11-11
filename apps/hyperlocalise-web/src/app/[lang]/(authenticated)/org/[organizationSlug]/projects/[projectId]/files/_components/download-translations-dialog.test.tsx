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

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { toast } from "sonner";

import { DownloadTranslationsDialog } from "./download-translations-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

function renderDialog(ui: ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>,
  );
}

describe("DownloadTranslationsDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("downloads the selected source file for the chosen locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ greeting: "bonjour" }), {
        status: 200,
        headers: {
          "Content-Disposition": "attachment; filename*=UTF-8''marketing-home-fr-FR.json",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const createObjectUrlMock = vi.fn(() => "blob:translation");
    const revokeObjectUrlMock = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.isConnected).toBe(true);
    });

    renderDialog(
      <DownloadTranslationsDialog
        open
        onOpenChange={() => undefined}
        organizationSlug="acme"
        projectId="proj_1"
        sourcePaths={["marketing/home.json", "marketing/pricing.json"]}
        initialSourcePath="marketing/home.json"
        targetLocales={["fr-FR", "de-DE"]}
      />,
    );

    const scheduledTimeouts: Array<() => void> = [];
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: () => void,
    ) => {
      scheduledTimeouts.push(handler);
      return 0;
    }) as typeof setTimeout);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download" }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/orgs/acme/projects/proj_1/files/translations/download?sourcePath=marketing%2Fhome.json&locale=fr-FR",
    );
    expect(clickSpy).toHaveBeenCalled();
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(revokeObjectUrlMock).not.toHaveBeenCalled();

    for (const scheduledTimeout of scheduledTimeouts) {
      scheduledTimeout();
    }

    expect(revokeObjectUrlMock).toHaveBeenCalledWith("blob:translation");
  });

  it("names the files that came out as JSON instead of their own format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((href: string) =>
        Promise.resolve(
          new Response("{}", {
            status: 200,
            headers: href.includes("home.yml")
              ? {}
              : { "X-Hyperlocalise-Download-Fallback": "json" },
          }),
        ),
      ),
    );
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const sourcePaths = ["locales/messages.csv", "locales/home.yml", "locales/app.po"];

    renderDialog(
      <DownloadTranslationsDialog
        open
        onOpenChange={() => undefined}
        organizationSlug="acme"
        projectId="proj_1"
        sourcePaths={sourcePaths}
        initialSourcePath="locales/messages.csv"
        targetLocales={["fr-FR"]}
      />,
    );
    for (const sourcePath of sourcePaths.slice(1)) {
      fireEvent.click(screen.getByRole("checkbox", { name: sourcePath }));
    }

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Download" }));
      for (let i = 0; i < 9; i += 1) {
        await Promise.resolve();
      }
    });

    expect(toast.warning).toHaveBeenCalledWith(
      "locales/messages.csv and locales/app.po could not be written in their own format, so they were downloaded as JSON.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
