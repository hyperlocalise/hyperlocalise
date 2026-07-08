// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { DownloadTranslationsDialog } from "./download-translations-dialog";

describe("DownloadTranslationsDialog", () => {
  it("downloads the selected source file for the chosen locale", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ greeting: "bonjour" }), {
        status: 200,
        headers: {
          "Content-Disposition": "attachment; filename*=UTF-8''marketing-home-fr-FR.json",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

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

    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/orgs/acme/projects/proj_1/files/translations/download?sourcePath=marketing%2Fhome.json&locale=fr-FR",
      );
    });
    expect(clickSpy).toHaveBeenCalled();
  });
});
