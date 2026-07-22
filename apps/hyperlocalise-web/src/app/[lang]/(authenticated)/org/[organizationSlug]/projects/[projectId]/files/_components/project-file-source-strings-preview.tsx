"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { FormattedMessage, useIntl } from "react-intl";

import type { ProjectSourceStringsPreview } from "@/api/routes/project/project.schema";
import { TypographyP } from "@/components/ui/typography";

import { projectFileSourceStringsPreviewMessages as messages } from "./project-file-source-strings-preview.messages";

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
  const intl = useIntl();

  return (
    <div className="space-y-3">
      <TypographyP className="text-xs text-muted-foreground">
        <FormattedMessage
          {...(preview.truncated ? messages.stringCountTruncated : messages.stringCount)}
          values={{ count: preview.entries.length }}
        />
      </TypographyP>

      {preview.note ? (
        <TypographyP className="text-xs text-muted-foreground">{preview.note}</TypographyP>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <div className="max-h-[min(24rem,50vh)] overflow-auto">
          <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  <FormattedMessage {...messages.keyColumn} />
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  <FormattedMessage {...messages.textColumn} />
                </th>
                <th className="px-3 py-2 font-medium text-muted-foreground">
                  <FormattedMessage {...messages.contextColumn} />
                </th>
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
                    {entry.context?.trim()
                      ? entry.context
                      : intl.formatMessage(messages.emptyContext)}
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
