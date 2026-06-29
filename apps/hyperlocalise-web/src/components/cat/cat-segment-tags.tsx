"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/primitives/cn";

const COMMENT_TAG_PATTERN = /^\d+ comments?$/;
const ISSUE_TAG_PATTERN = /^\d+ issues?$/;

export type CatSegmentTagKind = "type" | "comment" | "issue";

export function getSegmentTagKind(tag: string): CatSegmentTagKind {
  if (ISSUE_TAG_PATTERN.test(tag)) {
    return "issue";
  }

  if (COMMENT_TAG_PATTERN.test(tag)) {
    return "comment";
  }

  return "type";
}

function segmentTagClassName(kind: CatSegmentTagKind) {
  switch (kind) {
    case "issue":
      return "border-flame-200/40 text-flame-100";
    case "type":
      return "font-mono";
    default:
      return undefined;
  }
}

export function CatSegmentTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag, index) => {
        const kind = getSegmentTagKind(tag);

        return (
          <Badge
            key={`${tag}-${index}`}
            variant="outline"
            className={cn("max-w-full font-normal", segmentTagClassName(kind))}
          >
            <span className="truncate">{tag}</span>
          </Badge>
        );
      })}
    </div>
  );
}
