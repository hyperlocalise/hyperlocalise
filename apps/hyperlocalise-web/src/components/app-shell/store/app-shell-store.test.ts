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

  it("replaces header actions with the same id", () => {
    const store = createAppShellStore(sampleGroups);

    store.headerActions.register({
      id: "save",
      order: 20,
      visible: true,
      render: () => "Save",
    });
    store.headerActions.register({
      id: "save",
      order: 10,
      visible: true,
      render: () => "Save changes",
    });

    expect(store.headerActions.orderedSlots).toHaveLength(1);
    expect(store.headerActions.orderedSlots[0]?.order).toBe(10);
    expect(store.headerActions.orderedSlots[0]?.render()).toBe("Save changes");
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

  it("replaces breadcrumb entries with the same id", () => {
    const store = createAppShellStore(sampleGroups);
    const base = [{ label: "Jobs", href: "/org/acme/projects/proj_1/jobs" }];

    store.breadcrumb.registerAppend({ id: "job", label: "Old title" });
    store.breadcrumb.registerAppend({ id: "job", label: "New title" });
    store.breadcrumb.registerOverride({
      id: "jobs-label",
      matchSegment: "Jobs",
      label: "Tasks",
    });
    store.breadcrumb.registerOverride({
      id: "jobs-label",
      matchSegment: "Jobs",
      label: "Jobs",
    });

    expect(store.breadcrumb.applyOverrides(base)).toEqual([
      { label: "Jobs", href: "/org/acme/projects/proj_1/jobs" },
      { label: "New title", href: undefined },
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

  it("replaces custom navigation state", () => {
    const store = createAppShellStore(sampleGroups);
    const firstGroups = [
      {
        label: "First",
        items: [{ label: "One", href: "/one", icon: Chat01Icon }],
      },
    ] as const;
    const nextGroups = [
      {
        label: "Next",
        items: [{ label: "Two", href: "/two", icon: Chat01Icon }],
      },
    ] as const;

    store.navigation.setCustomNavigation(firstGroups, {
      organizationSlug: "acme",
      projectId: "proj_1",
    });
    store.navigation.setCustomNavigation(nextGroups, {
      organizationSlug: "acme",
      projectId: "proj_2",
      projectName: "Checkout v2",
    });

    expect(store.navigation.activeGroups).toEqual(nextGroups);
    expect(store.navigation.activeProjectContext).toEqual({
      organizationSlug: "acme",
      projectId: "proj_2",
      projectName: "Checkout v2",
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

  it("keeps sidebar preference until an api binds", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.setPreferredOpen(false);
    store.sidebar.bindSidebarApi(api);

    expect(api.setOpen).toHaveBeenCalledWith(false);
  });
});

describe("HeaderActionsStore", () => {
  it("unregisters a single slot without affecting the others", () => {
    const store = createAppShellStore(sampleGroups);

    store.headerActions.register({ id: "a", order: 10, visible: true, render: () => "A" });
    store.headerActions.register({ id: "b", order: 20, visible: true, render: () => "B" });
    store.headerActions.unregister("a");

    expect(store.headerActions.orderedSlots.map((slot) => slot.id)).toEqual(["b"]);
  });

  it("keeps stable ordering for slots that share an order", () => {
    const store = createAppShellStore(sampleGroups);

    store.headerActions.register({ id: "first", order: 5, visible: true, render: () => "1" });
    store.headerActions.register({ id: "second", order: 5, visible: true, render: () => "2" });

    expect(store.headerActions.orderedSlots.map((slot) => slot.id)).toEqual(["first", "second"]);
  });

  it("hides a slot when it is re-registered as not visible", () => {
    const store = createAppShellStore(sampleGroups);

    store.headerActions.register({ id: "save", order: 0, visible: true, render: () => "Save" });
    expect(store.headerActions.orderedSlots).toHaveLength(1);

    store.headerActions.register({ id: "save", order: 0, visible: false, render: () => "Save" });
    expect(store.headerActions.orderedSlots).toEqual([]);
  });
});

describe("BreadcrumbStore", () => {
  it("overrides a crumb by index and preserves the original href", () => {
    const store = createAppShellStore(sampleGroups);
    const base = [
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1", href: "/org/acme/projects/proj_1" },
    ];

    store.breadcrumb.registerOverride({ id: "first", index: 0, label: "Workspace" });

    expect(store.breadcrumb.applyOverrides(base)).toEqual([
      { label: "Workspace", href: "/org/acme/projects" },
      { label: "proj_1", href: "/org/acme/projects/proj_1" },
    ]);
  });

  it("applies a custom href from an override", () => {
    const store = createAppShellStore(sampleGroups);
    const base = [{ label: "proj_1", href: "/org/acme/projects/proj_1" }];

    store.breadcrumb.registerOverride({
      id: "project-name",
      matchSegment: "proj_1",
      label: "Checkout",
      href: "/org/acme/projects/proj_1/overview",
    });

    expect(store.breadcrumb.applyOverrides(base)).toEqual([
      { label: "Checkout", href: "/org/acme/projects/proj_1/overview" },
    ]);
  });

  it("removes overrides and appends when unregistered", () => {
    const store = createAppShellStore(sampleGroups);
    const base = [{ label: "proj_1", href: "/org/acme/projects/proj_1" }];

    store.breadcrumb.registerOverride({ id: "name", matchSegment: "proj_1", label: "Checkout" });
    store.breadcrumb.registerAppend({ id: "detail", label: "Detail" });
    store.breadcrumb.unregisterOverride("name");
    store.breadcrumb.unregisterAppend("detail");

    expect(store.breadcrumb.applyOverrides(base)).toEqual(base);
  });

  it("returns the base crumbs when no overrides or appends are registered", () => {
    const store = createAppShellStore(sampleGroups);
    const base = [{ label: "Inbox" }];

    expect(store.breadcrumb.applyOverrides(base)).toEqual(base);
  });
});

describe("NavigationStore", () => {
  it("exposes the default groups in route mode", () => {
    const store = createAppShellStore(sampleGroups);

    expect(store.navigation.mode).toBe("route");
    expect(store.navigation.defaultNavigationGroups).toEqual(sampleGroups);
    expect(store.navigation.activeGroups).toEqual(sampleGroups);
    expect(store.navigation.activeProjectContext).toBeNull();
  });

  it("returns default groups after clearing custom mode", () => {
    const store = createAppShellStore(sampleGroups);
    const customGroups = [
      { label: "Custom", items: [{ label: "Wizard", href: "/w", icon: Chat01Icon }] },
    ] as const;

    store.navigation.setCustomNavigation(customGroups, {
      organizationSlug: "acme",
      projectId: "proj_1",
    });
    store.navigation.clearCustomMode();

    expect(store.navigation.mode).toBe("route");
    expect(store.navigation.activeGroups).toEqual(sampleGroups);
    expect(store.navigation.activeProjectContext).toBeNull();
  });

  it("enters custom mode without a project context", () => {
    const store = createAppShellStore(sampleGroups);
    const customGroups = [
      { label: "Custom", items: [{ label: "Wizard", href: "/w", icon: Chat01Icon }] },
    ] as const;

    store.navigation.setCustomNavigation(customGroups);

    expect(store.navigation.mode).toBe("custom");
    expect(store.navigation.activeGroups).toEqual(customGroups);
    expect(store.navigation.activeProjectContext).toBeNull();
  });
});

describe("SidebarStore", () => {
  it("reports default state before an api binds", () => {
    const store = createAppShellStore(sampleGroups);

    expect(store.sidebar.isBound).toBe(false);
    expect(store.sidebar.isOpen).toBe(true);
    expect(store.sidebar.isMobile).toBe(false);
    expect(store.sidebar.state).toBe("expanded");
  });

  it("reflects the bound api state through getters", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi({ open: false, isMobile: true, state: "collapsed" });

    store.sidebar.bindSidebarApi(api);

    expect(store.sidebar.isBound).toBe(true);
    expect(store.sidebar.isOpen).toBe(false);
    expect(store.sidebar.isMobile).toBe(true);
    expect(store.sidebar.state).toBe("collapsed");
  });

  it("stores the open preference locally while unbound", () => {
    const store = createAppShellStore(sampleGroups);

    store.sidebar.setOpen(false);

    expect(store.sidebar.preferredOpen).toBe(false);
  });

  it("routes open changes to the desktop api", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.bindSidebarApi(api);
    store.sidebar.setOpen(false);

    expect(api.setOpen).toHaveBeenCalledWith(false);
    expect(api.setOpenMobile).not.toHaveBeenCalled();
  });

  it("routes open changes to the mobile api", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi({ isMobile: true });

    store.sidebar.bindSidebarApi(api);
    store.sidebar.setOpen(true);

    expect(api.setOpenMobile).toHaveBeenCalledWith(true);
    expect(api.setOpen).not.toHaveBeenCalled();
  });

  it("collapses and expands through the api", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.bindSidebarApi(api);
    store.sidebar.collapse();
    store.sidebar.expand();

    expect(api.setOpen).toHaveBeenNthCalledWith(1, false);
    expect(api.setOpen).toHaveBeenNthCalledWith(2, true);
  });

  it("toggles the bound api", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.bindSidebarApi(api);
    store.sidebar.toggle();

    expect(api.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("does nothing on toggle while unbound", () => {
    const store = createAppShellStore(sampleGroups);

    expect(() => store.sidebar.toggle()).not.toThrow();
  });

  it("does not sync a neutral preference when binding", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.bindSidebarApi(api);

    expect(api.setOpen).not.toHaveBeenCalled();
    expect(api.setOpenMobile).not.toHaveBeenCalled();
  });

  it("stops syncing preferences after the api unbinds", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.bindSidebarApi(api);
    store.sidebar.unbindSidebarApi();
    store.sidebar.setPreferredOpen(false);

    expect(store.sidebar.isBound).toBe(false);
    expect(api.setOpen).not.toHaveBeenCalled();
  });

  it("forces a collapse on mobile through setOpenMobile", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi({ isMobile: true });

    store.sidebar.bindSidebarApi(api);
    store.sidebar.setForceCollapsed(true);

    expect(api.setOpenMobile).toHaveBeenCalledWith(false);
  });

  it("prefers the forced collapse over an open preference", () => {
    const store = createAppShellStore(sampleGroups);
    const api = createSidebarApi();

    store.sidebar.setPreferredOpen(true);
    store.sidebar.setForceCollapsed(true);
    store.sidebar.bindSidebarApi(api);

    expect(api.setOpen).toHaveBeenLastCalledWith(false);
  });
});
