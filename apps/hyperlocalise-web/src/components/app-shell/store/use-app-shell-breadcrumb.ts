"use client";

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
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import type { BreadcrumbAppend, BreadcrumbOverride } from "./breadcrumb-store";
import { useAppShellStore } from "./app-shell-store-context";

type BreadcrumbOverrideConfig = Omit<BreadcrumbOverride, "id"> & { id: string };
type BreadcrumbAppendConfig = Omit<BreadcrumbAppend, "id" | "label"> & {
  id: string;
  label?: string;
  isLoading?: boolean;
  render?: () => ReactNode;
};

export function useAppShellBreadcrumbOverride(config: BreadcrumbOverrideConfig) {
  const store = useAppShellStore();
  const renderRef = useRef(config.render);
  renderRef.current = config.render;
  const { id, index, matchSegment, label, href, isLoading } = config;
  const hasRender = Boolean(config.render);

  useEffect(() => {
    store.breadcrumb.registerOverride({
      id,
      index,
      matchSegment,
      label,
      href,
      isLoading,
      render: hasRender ? () => renderRef.current?.() : undefined,
    });

    return () => {
      store.breadcrumb.unregisterOverride(id);
    };
  }, [store, id, index, matchSegment, label, href, isLoading, hasRender]);
}

export function useAppShellBreadcrumbAppend(config: BreadcrumbAppendConfig) {
  const store = useAppShellStore();
  const renderRef = useRef(config.render);
  renderRef.current = config.render;
  const { id, label, href, title, isLoading } = config;
  const hasRender = Boolean(config.render);

  useEffect(() => {
    if (label === undefined && !isLoading && !hasRender) {
      return;
    }

    store.breadcrumb.registerAppend({
      id,
      label: label ?? "",
      href,
      title,
      isLoading,
      render: hasRender ? () => renderRef.current?.() : undefined,
    });

    return () => {
      store.breadcrumb.unregisterAppend(id);
    };
  }, [store, id, label, href, title, isLoading, hasRender]);
}
