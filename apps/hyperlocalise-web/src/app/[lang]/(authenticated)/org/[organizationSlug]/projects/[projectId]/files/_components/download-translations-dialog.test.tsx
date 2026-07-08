// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DownloadTranslationsDialog } from "./download-translations-dialog";

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
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.isConnected).toBe(true);
      });

    render(
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
});
