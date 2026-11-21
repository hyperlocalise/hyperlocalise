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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ImportTranslationsDialog } from "./import-translations-dialog";

const fetchMock = vi.fn();

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function dialogTree(queryClient: QueryClient, { branch }: { branch?: string } = {}) {
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <ImportTranslationsDialog
          open
          onOpenChange={() => undefined}
          organizationSlug="acme"
          projectId="project_1"
          sourcePath="locales/en.json"
          targetLocales={["fr"]}
          branch={branch}
        />
      </IntlProvider>
    </QueryClientProvider>
  );
}

async function chooseTranslationFile() {
  const input = document.querySelector('input[type="file"]');
  expect(input).toBeInstanceOf(HTMLInputElement);
  await userEvent.upload(
    input as HTMLInputElement,
    new File(['{"greeting":"Salut"}'], "fr.json", { type: "application/json" }),
  );
}

describe("ImportTranslationsDialog", () => {
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("sends the selected version branch so imports bind that file", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ import: { status: "queued" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(dialogTree(createQueryClient(), { branch: "feature-checkout" }));
    await chooseTranslationFile();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("sourcePath")).toBe("locales/en.json");
    expect(form.get("locale")).toBe("fr");
    expect(form.get("branch")).toBe("feature-checkout");
  });

  it("omits branch when the files page is on the default line", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ import: { status: "queued" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(dialogTree(createQueryClient()));
    await chooseTranslationFile();
    await userEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("branch")).toBeNull();
  });
});
