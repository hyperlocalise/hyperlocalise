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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/primitives/cn";

import { contentEditorIntelligencePanelMessages } from "@/components/content-editor/shared/content-editor.messages";

export function ContentEditorShowMoreFade({
  label,
  className,
  onClick,
}: {
  label: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 flex h-16 items-end justify-center bg-linear-to-t from-background via-background/85 to-background/0 pb-2 backdrop-blur-[1.5px]",
        className,
      )}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 rounded-full bg-background px-3 text-xs shadow-xs"
        aria-expanded={false}
        onClick={onClick}
      >
        {label}
        <CaretDownIcon className="size-3.5" />
      </Button>
    </div>
  );
}

export function ContentEditorShowLessButton({
  label,
  className,
  onClick,
}: {
  label: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <div className={cn("flex justify-center", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 rounded-full px-3 text-xs text-muted-foreground"
        aria-expanded
        onClick={onClick}
      >
        {label}
        <CaretDownIcon className="size-3.5 rotate-180" />
      </Button>
    </div>
  );
}

export function ContentEditorExpandableContent({ children }: { children: ReactNode }) {
  const clipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const clip = clipRef.current;
    const content = contentRef.current;
    if (!clip || !content || isExpanded) {
      return;
    }

    const measure = () => setIsOverflowing(content.offsetHeight > clip.clientHeight + 1);
    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    observer.observe(content);
    return () => observer.disconnect();
  }, [isExpanded]);

  const isCollapsed = isOverflowing && !isExpanded;

  return (
    <div>
      <div
        ref={clipRef}
        className={cn(
          "relative text-sm leading-relaxed",
          !isExpanded && "max-h-[5lh] overflow-hidden",
        )}
      >
        <div ref={contentRef}>{children}</div>
        {isCollapsed ? (
          <ContentEditorShowMoreFade
            label={<FormattedMessage {...contentEditorIntelligencePanelMessages.contextShowMore} />}
            className="pb-0.5"
            onClick={() => setIsExpanded(true)}
          />
        ) : null}
      </div>
      {isOverflowing && isExpanded ? (
        <ContentEditorShowLessButton
          label={<FormattedMessage {...contentEditorIntelligencePanelMessages.contextShowLess} />}
          className="pt-2"
          onClick={() => setIsExpanded(false)}
        />
      ) : null}
    </div>
  );
}
