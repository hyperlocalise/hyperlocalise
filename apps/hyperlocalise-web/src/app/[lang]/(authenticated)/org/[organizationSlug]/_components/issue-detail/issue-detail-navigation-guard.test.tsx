// @vitest-environment happy-dom

import { useRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  getInternalNavigationHrefFromClick,
  IssueDetailNavigationGuard,
} from "./issue-detail-navigation-guard";
import type { IssueDetailPanelHandle } from "./issue-detail-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function createDirtyPanel(): IssueDetailPanelHandle {
  return {
    isDirty: () => true,
    savePending: vi.fn(async () => {}),
    beginCloseConfirm: vi.fn(),
    endCloseConfirm: vi.fn(),
    discardPending: vi.fn(),
  };
}

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

function GuardHarness({ isDirty }: { isDirty: boolean }) {
  const panelRef = useRef<IssueDetailPanelHandle | null>(null);
  if (panelRef.current === null) {
    panelRef.current = createDirtyPanel();
  }
  return <IssueDetailNavigationGuard panelRef={panelRef} isDirty={isDirty} />;
}

describe("IssueDetailNavigationGuard", () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pushStateSpy = vi.spyOn(window.history, "pushState");
    backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});
    window.history.replaceState(null, "", "/org/acme/issue");
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
  });

  function renderGuard() {
    render(
      <IntlProvider locale="en" messages={{}}>
        <GuardHarness isDirty />
      </IntlProvider>,
    );
  }

  it("does not push another history entry on popstate while dirty", async () => {
    renderGuard();

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    pushStateSpy.mockClear();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(pushStateSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
    });
  });

  it("continues back navigation once when leaving after popstate", async () => {
    renderGuard();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it("reinstalls history guard when keeping editing after popstate", async () => {
    renderGuard();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Keep editing" })).toBeTruthy();
    });
    pushStateSpy.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith(
      { issueDetailDraftGuard: true },
      "",
      expect.stringContaining("/org/acme/issue"),
    );
  });
});
