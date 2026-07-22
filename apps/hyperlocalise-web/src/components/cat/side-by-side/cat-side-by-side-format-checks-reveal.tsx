"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useState } from "react";

import { CatEditorFormatChecksSection } from "@/components/cat/editor/cat-editor-format-checks-section";
import type { CatFormatCheck } from "@/components/cat/shared/types";
import { cn } from "@/lib/primitives/cn";

const REVEAL_DURATION_MS = 400;

function useAnimatedPresence(open: boolean, durationMs = REVEAL_DURATION_MS) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    const timeout = window.setTimeout(() => {
      setMounted(false);
    }, durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, open]);

  return { mounted, visible };
}

export function CatSideBySideFormatChecksReveal({
  open,
  formatChecks,
  isLoading,
}: {
  open: boolean;
  formatChecks: CatFormatCheck[];
  isLoading: boolean;
}) {
  const { mounted, visible } = useAnimatedPresence(open);

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity,margin] duration-400 ease-out motion-reduce:transition-none",
        visible ? "mt-2.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!visible}
      data-state={visible ? "open" : "closed"}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            "origin-top transition-transform duration-400 ease-out motion-reduce:transition-none",
            visible ? "translate-y-0" : "-translate-y-1.5",
          )}
        >
          <CatEditorFormatChecksSection
            formatChecks={formatChecks}
            isLoading={isLoading}
            showHeading={false}
          />
        </div>
      </div>
    </div>
  );
}
