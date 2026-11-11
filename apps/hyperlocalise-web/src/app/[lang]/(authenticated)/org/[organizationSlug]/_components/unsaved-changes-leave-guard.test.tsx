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

import { useOrgRouter } from "@/lib/navigation/use-org-router";

import { useUnsavedChangesLeaveGuard } from "./unsaved-changes-leave-guard";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/automations/new",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

// Stands in for navigation from outside the page, such as a breadcrumb menu.
function ProjectMenuItem() {
  const router = useOrgRouter();
  return (
    <button type="button" onClick={() => router.push("/org/acme/projects/proj_2/automations")}>
      Other project
    </button>
  );
}

// Stands in for the page moving to another of its own tabs through the address.
function HistoryTabItem() {
  const router = useOrgRouter();
  return (
    <button type="button" onClick={() => router.push("/org/acme/automations/new?tab=history")}>
      Run history
    </button>
  );
}

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
      <ProjectMenuItem />
      <HistoryTabItem />
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
    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/inbox", { scroll: undefined });
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

  it("asks before navigation that does not come from a link, and leaves when told to", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole("button", { name: "Other project" }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Leave without saving" }));

    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/projects/proj_2/automations", {
      scroll: undefined,
    });
  });

  it("lets navigation that does not come from a link through when nothing is unsaved", async () => {
    const user = userEvent.setup();
    renderPage(false);

    await user.click(screen.getByRole("button", { name: "Other project" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/org/acme/projects/proj_2/automations", {
      scroll: undefined,
    });
  });

  it("does not ask about navigation that stays on the same page, and still asks afterwards", async () => {
    const user = userEvent.setup();
    // The address has the locale in front; the links and pushes of the app do not.
    window.history.replaceState(null, "", "/en/org/acme/automations/new");
    renderPage(true);

    await user.click(screen.getByRole("button", { name: "Run history" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Replaced, so the extra history entry stays the newest one.
    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/automations/new?tab=history", {
      scroll: undefined,
    });
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "Inbox" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("asks when the back button is used, and stays on the page until answered", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    renderPage(true);
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    // The history entry is back before the person answers, so a second back press lands here too.
    expect(pushState).toHaveBeenCalledTimes(2);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(pushState).toHaveBeenCalledTimes(3);
    expect(go).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(pushState).toHaveBeenCalledTimes(3);
    expect(go).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await user.click(screen.getByRole("button", { name: "Leave without saving" }));
    // Past the extra entry and past this page.
    expect(go).toHaveBeenCalledWith(-2);
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

  it("does not ask when the changes come back before its history entry is gone", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const view = renderPage(true);
    expect(pushState).toHaveBeenCalledTimes(1);

    // The browser steps back a moment after it is asked to, so the changes can return first.
    rerenderPage(view, false);
    expect(back).toHaveBeenCalledTimes(1);
    rerenderPage(view, true);
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(pushState).toHaveBeenCalledTimes(2);
  });

  it("does not ask when the page itself moves on after saving", async () => {
    const user = userEvent.setup();
    renderPage(true);

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/automations/auto_1", {
      scroll: undefined,
    });
  });
});
