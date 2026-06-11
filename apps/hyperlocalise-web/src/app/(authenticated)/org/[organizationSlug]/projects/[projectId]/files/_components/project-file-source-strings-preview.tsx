"use client";

import type { ProjectSourceStringsPreview } from "@/api/routes/project/project.schema";
import { TypographyP } from "@/components/ui/typography";

export function ProjectFileSourceStringsPreview({
  sourceStrings,
}: {
  organizationSlug: string;
  projectId: string;
  sourcePath: string;
  sourceStrings: ProjectSourceStringsPreview;
  canFindInRepo: boolean;
}) {
  if (sourceStrings.entries.length === 0) {
    return null;
  }

  return <SourceStringsTable preview={sourceStrings} />;
}

function SourceStringsTable({ preview }: { preview: ProjectSourceStringsPreview }) {
  return (
    <div className="space-y-3">
      <TypographyP className="text-xs text-foreground/52">
        {preview.entries.length} string{preview.entries.length === 1 ? "" : "s"}
        {preview.truncated ? " (preview truncated)" : ""}
      </TypographyP>

      {preview.note ? (
        <TypographyP className="text-xs text-foreground/42">{preview.note}</TypographyP>
      ) : null}

      <div className="overflow-hidden rounded-md border border-foreground/8 bg-background">
        <div className="max-h-[min(24rem,50vh)] overflow-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-foreground/8 bg-background/95 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 font-medium text-foreground/52">Key</th>
                <th className="px-3 py-2 font-medium text-foreground/52">Text</th>
                <th className="px-3 py-2 font-medium text-foreground/52">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/8">
              {preview.entries.map((entry) => (
                <tr key={entry.id ?? entry.key} className="align-top">
                  <td className="px-3 py-2 font-mono text-foreground/82">{entry.key}</td>
                  <td className="max-w-[14rem] px-3 py-2 whitespace-pre-wrap text-foreground/78">
                    {entry.text}
                  </td>
                  <td className="max-w-[12rem] px-3 py-2 whitespace-pre-wrap text-foreground/52">
                    {entry.context?.trim() ? entry.context : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
