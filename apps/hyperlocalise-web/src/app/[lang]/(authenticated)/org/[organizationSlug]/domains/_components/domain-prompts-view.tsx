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
import { useId, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { TypographyP } from "@/components/ui/typography";
import { useDomainResearchCatalog } from "./domain-research-context";

import { DomainResearchEmpty } from "./domain-research-empty";
import { formatBrandEngine } from "./domain-research-format";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";
import { domainPromptsViewMessages as messages } from "./domain-prompts-view.messages";

export function DomainPromptsView({ linkedDomainId }: { linkedDomainId: string }) {
  const intl = useIntl();
  const promptId = useId();
  const catalog = useDomainResearchCatalog(linkedDomainId);
  const [prompt, setPrompt] = useState(catalog?.prompt ?? "");

  if (!catalog) {
    return null;
  }

  if (catalog.promptResults.length === 0) {
    return (
      <DomainResearchEmpty
        title={<FormattedMessage {...messages.emptyTitle} />}
        description={<FormattedMessage {...messages.emptyDescription} />}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          toast.success(intl.formatMessage(messages.ran));
        }}
      >
        <Field>
          <FieldLabel htmlFor={promptId}>
            <FormattedMessage {...messages.promptLabel} />
          </FieldLabel>
          <Textarea
            id={promptId}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-20"
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="sm">
            <FormattedMessage {...messages.run} />
          </Button>
        </div>
      </form>

      <section className="grid gap-3 md:grid-cols-2">
        {catalog.promptResults.map((result) => (
          <Card
            key={result.engine}
            className="rounded-lg border border-border bg-muted py-0 ring-0"
          >
            <CardHeader className="px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">
                  {formatBrandEngine(intl, result.engine)}
                </CardTitle>
                <Badge variant={result.mentioned ? "success" : "outline"}>
                  <FormattedMessage
                    {...(result.mentioned ? sharedMessages.mentioned : sharedMessages.notMentioned)}
                  />
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <TypographyP size="small" tone="subtle">
                {result.excerpt}
              </TypographyP>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
