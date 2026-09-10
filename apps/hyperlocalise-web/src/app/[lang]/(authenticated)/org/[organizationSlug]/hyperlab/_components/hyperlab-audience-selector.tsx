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
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Row } from "@/components/ui/layout/row";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabAudience,
} from "./hyperlab-api";

export function HyperlabAudienceSelector({
  organizationSlug,
  value,
  onChange,
  disabled,
  hint,
}: {
  organizationSlug: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const intl = useIntl();
  const client = hyperlabClient();
  const audiencesQuery = useQuery({
    queryKey: hyperlabQueryKeys.audiences(organizationSlug),
    queryFn: async () => {
      const response = await client.audiences.$get({ param: { organizationSlug } });
      const body = await readHyperlabJson<{ audiences: HyperlabAudience[] }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.audiences;
    },
  });
  const audiences = audiencesQuery.data ?? [];
  const items = [
    { value: "none", label: intl.formatMessage(messages.audienceEveryone) },
    ...audiences.map((audience) => ({ value: audience.id, label: audience.name })),
  ];

  return (
    <Field>
      <FieldLabel>
        <FormattedMessage {...messages.audienceOptional} />
      </FieldLabel>
      <Row spacing="1u" alignY="center">
        <Select
          value={value || "none"}
          items={items}
          onValueChange={(next) => onChange(next === "none" || !next ? "" : next)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value} label={item.label}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {value ? (
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/org/${organizationSlug}/hyperlab/audiences/${value}`} />}
          >
            <FormattedMessage {...messages.editAudience} />
          </Button>
        ) : null}
      </Row>
      {hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}
