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
import { cn } from "@/lib/primitives/cn";

const UNICORN_SRC = "/images/unicorn.svg";

/**
 * The unicorn that breathes while an agent turn or tool is running. Drawn at
 * 20px but laid out as 16px, so it stands in for a 16px icon without shifting
 * the text; the detailed drawing is unreadable any smaller.
 */
export function AgentPulse({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- decorative static SVG
    <img
      src={UNICORN_SRC}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("agent-pulse -m-0.5 size-5 shrink-0", className)}
    />
  );
}
