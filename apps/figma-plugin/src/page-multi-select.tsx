import { Checkbox, IconChevronDown16, Muted, Text } from "@create-figma-plugin/ui";
import { useEffect, useRef, useState } from "preact/hooks";

import type { FigmaPageOption } from "./plugin-messages";

export function pagesMultiSelectLabel(selectedPageIds: string[], pages: FigmaPageOption[]) {
  if (selectedPageIds.length === 0) {
    return "";
  }
  const nameById = new Map(pages.map((page) => [page.pageId, page.pageName]));
  const names = selectedPageIds.map((pageId) => nameById.get(pageId) ?? pageId);
  if (names.length <= 2) {
    return names.join(", ");
  }
  return `${names.length} pages selected`;
}

type PageMultiSelectProps = {
  pages: FigmaPageOption[];
  selectedPageIds: string[];
  maxSelected?: number;
  disabled?: boolean;
  placeholder?: string;
  onChange: (pageIds: string[]) => void;
};

export function PageMultiSelect({
  pages,
  selectedPageIds,
  maxSelected,
  disabled = false,
  placeholder = "Select pages",
  onChange,
}: PageMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selectedPageIds);
  const label = pagesMultiSelectLabel(selectedPageIds, pages);
  const showPlaceholder = label.length === 0;

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node)) {
        return;
      }
      if (!root.contains(event.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className={`pageMultiSelect${disabled ? " pageMultiSelectDisabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="pageMultiSelectTrigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
      >
        <span
          className={`pageMultiSelectValue${showPlaceholder ? " pageMultiSelectPlaceholder" : ""}`}
        >
          {showPlaceholder ? (
            <Text>
              <Muted>{placeholder}</Muted>
            </Text>
          ) : (
            label
          )}
        </span>
        <span className="pageMultiSelectChevron">
          <IconChevronDown16 />
        </span>
      </button>
      {open && !disabled ? (
        <div className="pageMultiSelectMenu" role="listbox" aria-multiselectable="true">
          {pages.map((page) => (
            <div key={page.pageId} className="pageMultiSelectOption">
              <Checkbox
                value={selectedSet.has(page.pageId)}
                disabled={
                  Boolean(maxSelected) &&
                  !selectedSet.has(page.pageId) &&
                  selectedPageIds.length >= (maxSelected ?? 0)
                }
                onValueChange={(checked) => {
                  const next = new Set(selectedPageIds);
                  if (checked) {
                    if (maxSelected && next.size >= maxSelected) {
                      return;
                    }
                    next.add(page.pageId);
                  } else {
                    next.delete(page.pageId);
                  }
                  onChange([...next]);
                }}
              >
                {page.pageName}
              </Checkbox>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
