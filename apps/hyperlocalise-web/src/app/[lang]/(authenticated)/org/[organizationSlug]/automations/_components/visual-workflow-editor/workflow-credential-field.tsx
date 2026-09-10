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
"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useIntl } from "react-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { readApiResponseError } from "@/lib/api-error";
export function WorkflowCredentialField({
  organizationSlug,
  value,
  onChange,
}: {
  organizationSlug: string;
  value?: string;
  onChange: (id: string) => void;
}) {
  const intl = useIntl();
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const path = `/api/orgs/${encodeURIComponent(organizationSlug)}/visual-workflows/credentials`;
  const query = useQuery({
    queryKey: ["workflow-credentials", organizationSlug],
    queryFn: async () => {
      const response = await fetch(path, { credentials: "include" });
      if (!response.ok) throw await readApiResponseError(response, "Unable to load credentials");
      return ((await response.json()) as { credentials: { id: string; name: string }[] })
        .credentials;
    },
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, value: secret }),
      });
      if (!response.ok) throw await readApiResponseError(response, "Unable to save credential");
      return ((await response.json()) as { credential: { id: string } }).credential;
    },
    onSuccess: (credential) => {
      setSecret("");
      setName("");
      void query.refetch();
      onChange(credential.id);
    },
  });
  return (
    <Field>
      <FieldLabel>
        {intl.formatMessage({
          defaultMessage: "Credential",
          id: "H6Hrexhc1c",
          description: "Workflow credential picker label",
        })}
      </FieldLabel>
      <Select
        value={value ?? ""}
        onValueChange={(id) => {
          if (id) onChange(id);
        }}
      >
        <SelectTrigger
          aria-label={intl.formatMessage({
            defaultMessage: "Credential",
            id: "H6Hrexhc1c",
            description: "Workflow credential picker label",
          })}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {query.data?.map((credential) => (
              <SelectItem key={credential.id} value={credential.id}>
                {credential.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <details>
        <summary>
          {intl.formatMessage({
            defaultMessage: "Add credential",
            id: "dwW5gxEHPk",
            description: "Open new workflow credential form",
          })}
        </summary>
        <div className="flex flex-col gap-2 py-2">
          <Input
            aria-label={intl.formatMessage({
              defaultMessage: "Credential name",
              id: "0yR+TXg23A",
              description: "Workflow credential name input",
            })}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            type="password"
            autoComplete="new-password"
            aria-label={intl.formatMessage({
              defaultMessage: "Secret value",
              id: "cFooypWUsT",
              description: "Workflow credential secret input",
            })}
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending || !name.trim() || !secret}
            onClick={() => mutation.mutate()}
          >
            {intl.formatMessage({
              defaultMessage: "Save credential",
              id: "6fx4WFqVom",
              description: "Save encrypted workflow credential",
            })}
          </Button>
        </div>
      </details>
      {query.error || mutation.error ? (
        <FieldDescription role="alert">
          {intl.formatMessage({
            defaultMessage: "Could not load or save credentials. Try again.",
            id: "K/Rmat/d9W",
            description: "Workflow credential error",
          })}
        </FieldDescription>
      ) : null}
    </Field>
  );
}
