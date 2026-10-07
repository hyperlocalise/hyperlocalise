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
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  getInternalNavigationHrefFromClick,
  useUnsavedChangesLeaveGuard,
} from "./unsaved-changes-leave-guard";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/lib/navigation/use-org-router", () => ({
  useOrgRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

function Page({ hasUnsavedChanges }: { hasUnsavedChanges: boolean }) {
  const { leaveGuardDialog, leaveTo } = useUnsavedChangesLeaveGuard(hasUnsavedChanges);
  return (
    <>
      <a href="/org/acme/inbox">Inbox</a>
      <a href="/org/acme/integrations" target="_blank" rel="noreferrer">
        Integrations
      </a>
      <button type="button" onClick={() => leaveTo("/org/acme/automations/auto_1")}>
        Create
      </button>
      {leaveGuardDialog}
    </>
  );
}

function renderPage(hasUnsavedChanges: boolean) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <Page hasUnsavedChanges={hasUnsavedChanges} />
    </IntlProvider>,
  );
}

function rerenderPage(view: ReturnType<typeof renderPage>, hasUnsavedChanges: boolean) {
  view.rerender(
    <IntlProvider locale="en" messages={{}}>
      <Page hasUnsavedChanges={hasUnsavedChanges} />
    </IntlProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/org/acme/automations/new");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("getInternalNavigationHrefFromClick", () => {
  const current = "https://app.example.com/org/acme/projects/p1/issue-sheet/i1";

  it("returns null for non-link targets", () => {
    expect(getInternalNavigationHrefFromClick(document.createElement("div"), current)).toBeNull();
  });

  it("returns null for same-page href", () => {
    const anchor = document.createElement("a");
    anchor.href = "/org/acme/projects/p1/issue-sheet/i1";
    document.body.appendChild(anchor);

    expect(getInternalNavigationHrefFromClick(anchor, current)).toBeNull();

    anchor.remove();
  });

  it("returns internal path for in-app navigation", () => {
    const anchor = document.createElement("a");
    anchor.href = "/org/acme/issues";
    document.body.appendChild(anchor);

    expect(getInternalNavigationHrefFromClick(anchor, current)).toBe("/org/acme/issues");

    anchor.remove();
  });

  it("returns null for external origins", () => {
    const anchor = document.createElement("a");
    anchor.href = "https://other.example.com/page";
    document.body.appendChild(anchor);

    expect(getInternalNavigationHrefFromClick(anchor, current)).toBeNull();

    anchor.remove();
  });
});

describe("useUnsavedChangesLeaveGuard", () => {
  it("lets a link through when nothing is unsaved", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    renderPage(false);

    const notCancelled = fireEvent.click(screen.getByRole("link", { name: "Inbox" }));

    expect(notCancelled).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("asks before following a link, and leaves when told to", async () => {
    const user = userEvent.setup();
    renderPage(true);

    const notCancelled = fireEvent.click(screen.getByRole("link", { name: "Inbox" }));

    expect(notCancelled).toBe(false);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText("Leave without saving?")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Leave without saving" }));

    // The page's extra history entry is replaced, so going back does not show the page twice.
    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/inbox");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("stays on the page when the person keeps editing", async () => {
    const user = userEvent.setup();
    renderPage(true);

    fireEvent.click(screen.getByRole("link", { name: "Inbox" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not ask about a link that opens in a new tab", () => {
    renderPage(true);

    const notCancelled = fireEvent.click(screen.getByRole("link", { name: "Integrations" }));

    expect(notCancelled).toBe(true);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("asks when the back button is used, and puts its history entry back on staying", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    renderPage(true);
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(pushState).toHaveBeenCalledTimes(2);
    expect(back).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await user.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("warns on reload or close only while something is unsaved", () => {
    const view = renderPage(true);

    const dirtyEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    vi.spyOn(window.history, "back").mockImplementation(() => {});
    rerenderPage(view, false);

    const cleanEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });

  it("removes its history entry once the changes are saved", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = renderPage(true);

    rerenderPage(view, false);

    expect(back).toHaveBeenCalledTimes(1);
  });

  it("does not ask when the page itself moves on after saving", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/automations/auto_1");
  });
});
