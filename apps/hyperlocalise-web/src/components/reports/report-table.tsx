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
import { createElement, type ComponentProps, type ReactNode } from "react";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/primitives/cn";

/** Dense, borderless list-style table: thin row dividers, muted headers, a hover tint. */
export function Table(props: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table {...props} className={cn("w-full text-sm", props.className)} />
    </div>
  );
}
export function TableHeader(props: ComponentProps<"thead">) {
  return <thead {...props} className={cn("border-b border-border/60", props.className)} />;
}
export function TableBody(props: ComponentProps<"tbody">) {
  return (
    <tbody
      {...props}
      className={cn("[&>tr:not([data-group])]:hover:bg-muted/40", props.className)}
    />
  );
}
export function TableRow(props: ComponentProps<"tr">) {
  return (
    <tr
      {...props}
      className={cn("border-b border-border/50 transition-colors last:border-0", props.className)}
    />
  );
}
export function TableHead(props: ComponentProps<"th">) {
  return (
    <th
      scope="col"
      {...props}
      className={cn(
        "h-8 px-3 text-left text-xs font-medium whitespace-nowrap text-muted-foreground",
        props.className,
      )}
    />
  );
}
export function TableCell(props: ComponentProps<"td">) {
  return <td {...props} className={cn("h-9 px-3 py-1.5", props.className)} />;
}

/**
 * A collapsible group header inside a table body: caret, label and a quiet count in the first
 * column, then the group's own figures (its totals) under the table's other columns.
 */
export function TableGroupRow({
  label,
  count,
  cells = [],
  collapsed,
  onToggle,
}: {
  label: ReactNode;
  count?: ReactNode;
  /** One per remaining column, right-aligned like the figures beneath them. */
  cells?: ReactNode[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <tr data-group="" className="border-b border-border/50 bg-muted/40 text-xs">
      <td className="h-8 px-3 py-0">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {createElement(collapsed ? CaretRightIcon : CaretDownIcon, {
            "aria-hidden": true,
            className: "size-3 shrink-0 text-muted-foreground",
          })}
          <span className="truncate">{label}</span>
          {count !== undefined ? (
            <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
          ) : null}
        </button>
      </td>
      {cells.map((cell, index) => (
        <td
          key={index}
          className="h-8 px-3 py-0 text-right whitespace-nowrap text-muted-foreground tabular-nums"
        >
          {cell}
        </td>
      ))}
    </tr>
  );
}
