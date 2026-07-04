// @vitest-environment happy-dom

import { isValidElement, type ReactNode } from "react";
import { render, waitFor } from "@testing-library/react";
import { Chat01Icon } from "@hugeicons/core-free-icons";
import { describe, expect, it, vi } from "vite-plus/test";

import type { NavigationGroup } from "@/components/app-shell/navigation-config";

import { AppShellStoreProvider, useAppShellStore } from "./app-shell-store-context";
import type { AppShellStore } from "./app-shell-store";
import {
  useAppShellBreadcrumbAppend,
  useAppShellBreadcrumbOverride,
} from "./use-app-shell-breadcrumb";
import { useAppShellHeaderAction } from "./use-app-shell-header-action";
import { useAppShellNavigationCustom } from "./use-app-shell-navigation";
import { useAppShellSidebar } from "./use-app-shell-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/org/acme/projects/proj_1/jobs",
}));

const defaultGroups = [
  {
    items: [
      {
        label: "Inbox",
        href: "/org/acme/inbox",
        icon: Chat01Icon,
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];

const customGroups = [
  {
    label: "Project",
    items: [
      {
        label: "Strings",
        href: "/org/acme/projects/proj_1/jobs/job_1/strings",
        icon: Chat01Icon,
      },
    ],
  },
] as const satisfies readonly NavigationGroup[];

function AppShellHookTestProvider({
  children,
  onStore,
}: {
  children: ReactNode;
  onStore: (store: AppShellStore) => void;
}) {
  return (
    <AppShellStoreProvider defaultNavigationGroups={defaultGroups}>
      <StoreCapture onStore={onStore} />
      {children}
    </AppShellStoreProvider>
  );
}

function StoreCapture({ onStore }: { onStore: (store: AppShellStore) => void }) {
  const store = useAppShellStore();
  onStore(store);
  return null;
}

function textFromReactNode(node: ReactNode) {
  return isValidElement<{ children?: ReactNode }>(node) ? node.props.children : null;
}

describe("app shell page hooks", () => {
  it("registers header actions and keeps the render callback fresh", async () => {
    const storeRef: { current: AppShellStore | null } = { current: null };

    function HeaderActionDemo({ label }: { label: string }) {
      useAppShellHeaderAction({
        id: "save",
        order: 10,
        render: () => <span>{label}</span>,
      });
      return null;
    }

    const view = render(
      <AppShellHookTestProvider onStore={(nextStore) => (storeRef.current = nextStore)}>
        <HeaderActionDemo label="Save" />
      </AppShellHookTestProvider>,
    );

    await waitFor(() =>
      expect(storeRef.current?.headerActions.orderedSlots.map((slot) => slot.id)).toEqual(["save"]),
    );
    expect(textFromReactNode(storeRef.current!.headerActions.orderedSlots[0]!.render())).toBe(
      "Save",
    );

    view.rerender(
      <AppShellHookTestProvider onStore={(nextStore) => (storeRef.current = nextStore)}>
        <HeaderActionDemo label="Saving..." />
      </AppShellHookTestProvider>,
    );

    expect(storeRef.current?.headerActions.orderedSlots).toHaveLength(1);
    expect(textFromReactNode(storeRef.current!.headerActions.orderedSlots[0]!.render())).toBe(
      "Saving...",
    );

    view.unmount();
    await waitFor(() => expect(storeRef.current?.headerActions.orderedSlots).toEqual([]));
  });

  it("registers breadcrumb overrides and appends with cleanup", async () => {
    const storeRef: { current: AppShellStore | null } = { current: null };
    const baseBreadcrumbs = [
      { label: "Projects", href: "/org/acme/projects" },
      { label: "proj_1", href: "/org/acme/projects/proj_1" },
    ];

    function BreadcrumbDemo() {
      useAppShellBreadcrumbOverride({
        id: "project-name",
        matchSegment: "proj_1",
        label: "Checkout",
      });
      useAppShellBreadcrumbAppend({
        id: "job-name",
        label: "Translate homepage",
      });
      return null;
    }

    const view = render(
      <AppShellHookTestProvider onStore={(nextStore) => (storeRef.current = nextStore)}>
        <BreadcrumbDemo />
      </AppShellHookTestProvider>,
    );

    await waitFor(() =>
      expect(storeRef.current?.breadcrumb.applyOverrides(baseBreadcrumbs)).toEqual([
        { label: "Projects", href: "/org/acme/projects" },
        { label: "Checkout", href: "/org/acme/projects/proj_1" },
        { label: "Translate homepage", href: undefined },
      ]),
    );

    view.unmount();
    await waitFor(() =>
      expect(storeRef.current?.breadcrumb.applyOverrides(baseBreadcrumbs)).toEqual(baseBreadcrumbs),
    );
  });

  it("skips breadcrumb appends until a label is available", async () => {
    const storeRef: { current: AppShellStore | null } = { current: null };
    const baseBreadcrumbs = [{ label: "Jobs", href: "/org/acme/projects/proj_1/jobs" }];

    function BreadcrumbAppendDemo({ label }: { label?: string }) {
      useAppShellBreadcrumbAppend({
        id: "job-name",
        label,
      });
      return null;
    }

    const view = render(
      <AppShellHookTestProvider onStore={(nextStore) => (storeRef.current = nextStore)}>
        <BreadcrumbAppendDemo />
      </AppShellHookTestProvider>,
    );

    await waitFor(() =>
      expect(storeRef.current?.breadcrumb.applyOverrides(baseBreadcrumbs)).toEqual(baseBreadcrumbs),
    );

    view.rerender(
      <AppShellHookTestProvider onStore={(nextStore) => (storeRef.current = nextStore)}>
        <BreadcrumbAppendDemo label="Translate homepage" />
      </AppShellHookTestProvider>,
    );

    await waitFor(() =>
      expect(storeRef.current?.breadcrumb.applyOverrides(baseBreadcrumbs)).toEqual([
        { label: "Jobs", href: "/org/acme/projects/proj_1/jobs" },
        { label: "Translate homepage", href: undefined },
      ]),
    );
  });

  it("registers custom navigation and restores route mode on cleanup", async () => {
    const storeRef: { current: AppShellStore | null } = { current: null };

    function NavigationDemo() {
      useAppShellNavigationCustom({
        groups: customGroups,
        projectContext: {
          organizationSlug: "acme",
          projectId: "proj_1",
          projectName: "Checkout",
        },
      });
      return null;
    }

    const view = render(
      <AppShellHookTestProvider onStore={(nextStore) => (storeRef.current = nextStore)}>
        <NavigationDemo />
      </AppShellHookTestProvider>,
    );

    await waitFor(() => expect(storeRef.current?.navigation.mode).toBe("custom"));
    expect(storeRef.current?.navigation.activeGroups).toEqual(customGroups);

    view.unmount();
    await waitFor(() => expect(storeRef.current?.navigation.mode).toBe("route"));
  });

  it("applies sidebar preferences and clears them on cleanup", async () => {
    const storeRef: { current: AppShellStore | null } = { current: null };

    function SidebarDemo() {
      useAppShellSidebar({ forceCollapsed: true, preferredOpen: false });
      return null;
    }

    const view = render(
      <AppShellHookTestProvider onStore={(nextStore) => (storeRef.current = nextStore)}>
        <SidebarDemo />
      </AppShellHookTestProvider>,
    );

    await waitFor(() => {
      expect(storeRef.current?.sidebar.forceCollapsed).toBe(true);
      expect(storeRef.current?.sidebar.preferredOpen).toBe(false);
    });

    view.unmount();

    await waitFor(() => {
      expect(storeRef.current?.sidebar.forceCollapsed).toBe(false);
      expect(storeRef.current?.sidebar.preferredOpen).toBeNull();
    });
  });
});
