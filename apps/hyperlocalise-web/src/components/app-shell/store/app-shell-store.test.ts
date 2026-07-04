import { describe, expect, it, vi } from "vite-plus/test";

import { Chat01Icon } from "@hugeicons/core-free-icons";

import { createAppShellStore } from "./app-shell-store";
import type { SidebarApi } from "./sidebar-store";

const sampleGroups = [
  {
    items: [
      {
        label: "Inbox",
        href: "/org/acme/inbox",
        icon: Chat01Icon,
      },
    ],
  },
] as const;

function createSidebarApi(overrides: Partial<SidebarApi> = {}): SidebarApi {
  return {
    open: true,
    openMobile: false,
    isMobile: false,
    state: "expanded",
    setOpen: vi.fn(),
    setOpenMobile: vi.fn(),
    toggleSidebar: vi.fn(),
    ...overrides,
  };
}

describe("AppShellStore", () => {
  it("registers header actions in order and filters hidden slots", () => {
    const store = createAppShellStore(sampleGroups);

    store.headerActions.register({
      id: "b",
      order: 20,
      visible: true,
      render: () => "B",
    });
    store.headerActions.register({
      id: "a",
      order: 10,
      visible: true,
      render: () => "A",
    });
    store.headerActions.register({
      id: "hidden",
      order: 0,
      visible: false,
      render: () => "Hidden",
    });

    expect(store.headerActions.orderedSlots.map((slot) => slot.id)).toEqual(["a", "b"]);
  });

  it("applies breadcrumb overrides and appends", () => {
    const store = createAppShellStore(sampleGroups);
    const base = [
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1", href: "/org/acme/projects/proj_1" },
      { label: "Jobs" },
    ];

    store.breadcrumb.registerOverride({
      id: "project-name",
      matchSegment: "proj_1",
      label: "Checkout",
    });
    store.breadcrumb.registerAppend({
      id: "job-title",
      label: "Translate to Vietnamese",
    });

    expect(store.breadcrumb.applyOverrides(base)).toEqual([
      { label: "Projects", href: "/org/acme/projects" },
      { label: "Checkout", href: "/org/acme/projects/proj_1" },
      { label: "Jobs" },
      { label: "Translate to Vietnamese", href: undefined },
    ]);
  });

  it("switches navigation into custom mode", () => {
    const store = createAppShellStore(sampleGroups);
    const customGroups = [
      {
        label: "Custom",
        items: [
          {
            label: "Wizard",
            href: "/org/acme/wizard",
            icon: Chat01Icon,
          },
        ],
      },
    ] as const;

    store.navigation.setCustomNavigation(customGroups, {
      organizationSlug: "acme",
      projectId: "proj_1",
      projectName: "Checkout",
    });

    expect(store.navigation.mode).toBe("custom");
    expect(store.navigation.activeGroups).toEqual(customGroups);
    expect(store.navigation.activeProjectContext).toEqual({
      organizationSlug: "acme",
      projectId: "proj_1",
      projectName: "Checkout",
    });
  });

  it("resets page-scoped shell state", () => {
    const store = createAppShellStore(sampleGroups);

    store.headerActions.register({
      id: "save",
      order: 0,
      visible: true,
      render: () => "Save",
    });
    store.breadcrumb.registerAppend({ id: "extra", label: "Detail" });
    store.navigation.setCustomNavigation(sampleGroups);
    store.sidebar.setForceCollapsed(true);
    store.sidebar.setPreferredOpen(false);

    store.resetPageScope();

    expect(store.headerActions.orderedSlots).toEqual([]);
    expect(store.breadcrumb.applyOverrides([{ label: "Inbox" }])).toEqual([{ label: "Inbox" }]);
    expect(store.navigation.mode).toBe("route");
    expect(store.sidebar.forceCollapsed).toBe(false);
    expect(store.sidebar.preferredOpen).toBeNull();
  });

  it("bridges sidebar api and collapses when forced", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.bindSidebarApi(api);
    store.sidebar.setForceCollapsed(true);

    expect(api.setOpen).toHaveBeenCalledWith(false);
  });

  it("uses preferred open state on mobile via setOpenMobile", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi({ isMobile: true });

    store.sidebar.bindSidebarApi(api);
    store.sidebar.setPreferredOpen(true);

    expect(api.setOpenMobile).toHaveBeenCalledWith(true);
  });
});
