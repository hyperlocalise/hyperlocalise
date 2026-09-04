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
import { makeAutoObservable } from "mobx";
import type { ReactNode } from "react";

import type { AppShellBreadcrumb } from "@/components/app-shell/app-shell-title";

export type BreadcrumbOverride = {
  id: string;
  index?: number;
  matchSegment?: string;
  label: string;
  href?: string;
  isLoading?: boolean;
  render?: () => ReactNode;
};

export type BreadcrumbAppend = {
  id: string;
  label: string;
  href?: string;
  title?: string;
  isLoading?: boolean;
  render?: () => ReactNode;
};

export class BreadcrumbStore {
  private overrides = new Map<string, BreadcrumbOverride>();
  private appends = new Map<string, BreadcrumbAppend>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  registerOverride(override: BreadcrumbOverride) {
    this.overrides.set(override.id, override);
  }

  unregisterOverride(id: string) {
    this.overrides.delete(id);
  }

  registerAppend(append: BreadcrumbAppend) {
    this.appends.set(append.id, append);
  }

  unregisterAppend(id: string) {
    this.appends.delete(id);
  }

  clearOverrides() {
    this.overrides.clear();
    this.appends.clear();
  }

  applyOverrides(base: readonly AppShellBreadcrumb[]): AppShellBreadcrumb[] {
    const overridden = base.map((crumb, index) => {
      for (const override of this.overrides.values()) {
        if (override.index === index) {
          return {
            label: override.label,
            href: override.href ?? crumb.href,
            isLoading: override.isLoading,
            render: override.render ?? crumb.render,
          };
        }

        if (override.matchSegment) {
          const matchesHref = crumb.href?.includes(override.matchSegment) ?? false;
          const matchesLabel = crumb.label === override.matchSegment;
          if (matchesHref || matchesLabel) {
            return {
              label: override.label,
              href: override.href ?? crumb.href,
              isLoading: override.isLoading,
              render: override.render ?? crumb.render,
            };
          }
        }
      }

      return crumb;
    });

    const appended = [...this.appends.values()].map((append) => ({
      label: append.label,
      href: append.href,
      title: append.title,
      isLoading: append.isLoading,
      render: append.render,
    }));

    return [...overridden, ...appended];
  }
}
