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
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useOrgRouter } from "@/lib/navigation/use-org-router";

import {
  getInternalNavigationHrefFromClick,
  useLeaveAttemptGuard,
} from "./use-leave-attempt-guard";

const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

// Only the React build that Next bundles has this; the one the tests run on does not.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  addTransitionType: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/glossaries/glo_1",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

// Stands in for navigation from outside the page, such as a breadcrumb menu.
function ProjectMenuItem() {
  const router = useOrgRouter();
  return (
    <button type="button" onClick={() => router.push("/org/acme/projects/proj_2")}>
      Other project
    </button>
  );
}

function Page({
  active,
  onLeaveAttempt,
}: {
  active: boolean;
  onLeaveAttempt: (proceed: () => void) => void;
}) {
  const { leaveTo } = useLeaveAttemptGuard(active, onLeaveAttempt);
  return (
    <>
      <a href="/org/acme/inbox">Inbox</a>
      <button type="button" onClick={() => leaveTo("/org/acme/glossaries")}>
        Delete
      </button>
      <ProjectMenuItem />
    </>
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/org/acme/glossaries/glo_1");
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

describe("useLeaveAttemptGuard", () => {
  it("reports nothing and adds no history entry while it is off", async () => {
    const user = userEvent.setup();
    const pushState = vi.spyOn(window.history, "pushState");
    const onLeaveAttempt = vi.fn();
    render(<Page active={false} onLeaveAttempt={onLeaveAttempt} />);

    const notCancelled = fireEvent.click(screen.getByRole("link", { name: "Inbox" }));
    await user.click(screen.getByRole("button", { name: "Other project" }));
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(notCancelled).toBe(true);
    expect(onLeaveAttempt).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/org/acme/projects/proj_2", { scroll: undefined });
  });

  it("holds a link back and follows it only when the page proceeds", () => {
    const onLeaveAttempt = vi.fn<(proceed: () => void) => void>();
    render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    const notCancelled = fireEvent.click(screen.getByRole("link", { name: "Inbox" }));

    expect(notCancelled).toBe(false);
    expect(onLeaveAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    act(() => onLeaveAttempt.mock.calls[0][0]());

    // The page's extra history entry is replaced, so going back does not show the page twice.
    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/inbox", { scroll: undefined });
    // The leave that was agreed to is not reported a second time.
    expect(onLeaveAttempt).toHaveBeenCalledTimes(1);
  });

  it("holds navigation that does not come from a link back until the page proceeds", async () => {
    const user = userEvent.setup();
    const onLeaveAttempt = vi.fn<(proceed: () => void) => void>();
    render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    await user.click(screen.getByRole("button", { name: "Other project" }));

    expect(onLeaveAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    act(() => onLeaveAttempt.mock.calls[0][0]());

    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/projects/proj_2", { scroll: undefined });
  });

  it("reports the back button, and goes back past the page when the page proceeds", () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const onLeaveAttempt = vi.fn<(proceed: () => void) => void>();
    render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onLeaveAttempt).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();

    act(() => onLeaveAttempt.mock.calls[0][0]());

    // Past the extra entry and past this page.
    expect(go).toHaveBeenCalledWith(-2);
  });

  it("keeps reporting after the page declined to proceed", () => {
    const onLeaveAttempt = vi.fn();
    render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    fireEvent.click(screen.getByRole("link", { name: "Inbox" }));
    fireEvent.click(screen.getByRole("link", { name: "Inbox" }));

    expect(onLeaveAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("hands the address the page wrote while guarded to the entry underneath when its own entry goes", () => {
    const base = "/org/acme/glossaries/glo_1";
    // Stepping back lands on the entry from before the guard, which still has the old address.
    vi.spyOn(window.history, "back").mockImplementation(() => {
      window.history.replaceState(null, "", base);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const onLeaveAttempt = vi.fn();
    const view = render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    window.history.replaceState(null, "", `${base}?section=locales`);
    view.rerender(<Page active={false} onLeaveAttempt={onLeaveAttempt} />);

    expect(`${window.location.pathname}${window.location.search}`).toBe(`${base}?section=locales`);
    expect(onLeaveAttempt).not.toHaveBeenCalled();
  });

  it("puts its entry back with the address the page wrote when the back button is used", () => {
    const base = "/org/acme/glossaries/glo_1";
    const onLeaveAttempt = vi.fn();
    render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    // The page moved to another of its sections, which only the extra entry knows about. The
    // back button then lands on the entry underneath, with the extra one still ahead of it.
    const origin = window.location.origin;
    vi.stubGlobal("navigation", {
      currentEntry: { index: 3 },
      entries: () => [
        { url: `${origin}/org/acme/glossaries` },
        { url: `${origin}/org/acme/inbox` },
        { url: `${origin}/org/acme/glossaries` },
        { url: `${origin}${base}` },
        { url: `${origin}${base}?section=locales` },
      ],
    });
    const pushState = vi.spyOn(window.history, "pushState");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onLeaveAttempt).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?section=locales");
  });

  it("puts its entry back with the current address when the entry ahead is another page", () => {
    const origin = window.location.origin;
    const onLeaveAttempt = vi.fn();
    render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    vi.stubGlobal("navigation", {
      currentEntry: { index: 0 },
      entries: () => [
        { url: `${origin}/org/acme/glossaries/glo_1` },
        { url: `${origin}/org/acme/inbox` },
      ],
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(window.location.pathname).toBe("/org/acme/glossaries/glo_1");
  });

  it("does not report navigation the page does itself", async () => {
    const user = userEvent.setup();
    const onLeaveAttempt = vi.fn();
    render(<Page active onLeaveAttempt={onLeaveAttempt} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onLeaveAttempt).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith("/org/acme/glossaries", { scroll: undefined });
  });
});
