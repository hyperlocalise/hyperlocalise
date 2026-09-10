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
import {
  plainTextFromDocument,
  plainTextsFromSlide,
  rowsFromWorkbook,
  type ContentEditorOfficeSnapshot,
} from "@/components/content-editor/file-view/content-editor-office-convert";
import { cn } from "@/lib/primitives/cn";

export function ContentEditorOfficeFilePreview({
  snapshot,
  className,
}: {
  snapshot: ContentEditorOfficeSnapshot;
  className?: string;
}) {
  switch (snapshot.kind) {
    case "docx": {
      const paragraphs = plainTextFromDocument(snapshot.data)
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      return (
        <div className={cn("space-y-3 p-4 text-sm leading-relaxed", className)}>
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      );
    }
    case "xlsx": {
      const rows = rowsFromWorkbook(snapshot.data);
      if (rows.length === 0) {
        return (
          <div className={cn("p-4 text-sm text-muted-foreground", className)}>
            Empty spreadsheet
          </div>
        );
      }
      return (
        <div className={cn("overflow-auto p-4", className)}>
          <table className="min-w-full border-collapse text-sm">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-border/60">
                  {row.map((cell, columnIndex) => (
                    <td key={columnIndex} className="px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "pptx": {
      const slides = plainTextsFromSlide(snapshot.data).filter(Boolean);
      return (
        <div className={cn("space-y-3 p-4", className)}>
          {slides.map((slideText, index) => (
            <article
              key={`${index}-${slideText.slice(0, 24)}`}
              className="rounded-md border border-border/60 bg-card p-4"
            >
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Slide {index + 1}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{slideText}</p>
            </article>
          ))}
        </div>
      );
    }
  }
}
