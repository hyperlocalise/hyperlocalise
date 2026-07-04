"use client";

import { useEffect } from "react";

import type { BreadcrumbAppend, BreadcrumbOverride } from "./breadcrumb-store";
import { useAppShellStore } from "./app-shell-store-context";

type BreadcrumbOverrideConfig = Omit<BreadcrumbOverride, "id"> & { id: string };
type BreadcrumbAppendConfig = Omit<BreadcrumbAppend, "id" | "label"> & {
  id: string;
  label?: string;
};

export function useAppShellBreadcrumbOverride(config: BreadcrumbOverrideConfig) {
  const store = useAppShellStore();
  const { id, index, matchSegment, label, href } = config;

  useEffect(() => {
    store.breadcrumb.registerOverride({ id, index, matchSegment, label, href });

    return () => {
      store.breadcrumb.unregisterOverride(id);
    };
  }, [store, id, index, matchSegment, label, href]);
}

export function useAppShellBreadcrumbAppend(config: BreadcrumbAppendConfig) {
  const store = useAppShellStore();
  const { id, label, href } = config;

  useEffect(() => {
    if (label === undefined) {
      return;
    }

    store.breadcrumb.registerAppend({ id, label, href });

    return () => {
      store.breadcrumb.unregisterAppend(id);
    };
  }, [store, id, label, href]);
}
