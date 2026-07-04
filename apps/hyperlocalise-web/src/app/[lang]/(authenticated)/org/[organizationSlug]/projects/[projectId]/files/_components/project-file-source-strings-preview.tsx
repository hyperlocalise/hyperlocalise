"use client";

import type { ProjectSourceStringsPreview } from "@/api/routes/project/project.schema";
import { TypographyP } from "@/components/ui/typography";

export function ProjectFileSourceStringsPreview({
  sourceStrings,
}: {
  sourceStrings: ProjectSourceStringsPreview;
}) {
  if (sourceStrings.entries.length === 0) {
    return null;
  }

  return <SourceStringsTable preview={sourceStrings} />;
}

function SourceStringsTable({ preview }: { preview: ProjectSourceStringsPreview }) {
  return (
    <div className="space-y-3">
      <TypographyP className="text-xs text-muted-foreground">
        {preview.entries.length} string{preview.entries.length === 1 ? "" : "s"}
        {preview.truncated ? " (preview truncated)" : ""}
      </TypographyP>

      {preview.note ? (
        <TypographyP className="text-xs text-muted-foreground">{preview.note}</TypographyP>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="max-h-[min(24rem,50vh)] overflow-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">Key</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Text</th>
                <th className="px-3 py-2 font-medium text-muted-foreground">Context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {preview.entries.map((entry) => (
                <tr key={entry.id ?? entry.key} className="align-top">
                  <td className="px-3 py-2 font-mono text-foreground">{entry.key}</td>
                  <td className="max-w-[14rem] px-3 py-2 whitespace-pre-wrap text-subtle-foreground">
                    {entry.text}
                  </td>
                  <td className="max-w-[12rem] px-3 py-2 whitespace-pre-wrap text-muted-foreground">
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
