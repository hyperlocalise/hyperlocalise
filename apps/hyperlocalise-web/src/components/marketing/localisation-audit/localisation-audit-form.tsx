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
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/primitives/cn";

import { getLocalisationAuditPageCopy } from "./localisation-audit-page-content";

const MESH_INPUT_CLASS =
  "h-11 border-white/25 bg-white/15 text-white placeholder:text-white/55 focus-visible:border-white/60 focus-visible:ring-white/30";

type LocalisationAuditFormProps = {
  locale: string;
  tone?: "default" | "mesh";
};

export function LocalisationAuditForm({ locale, tone = "default" }: LocalisationAuditFormProps) {
  const copy = getLocalisationAuditPageCopy(locale);
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [focusLocales, setFocusLocales] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const locales = focusLocales
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 2);

      const response = await fetch("/api/localisation-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          focusLocales: locales.length > 0 ? locales : undefined,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        audit?: { domainSlug?: string };
        outcome?: string;
        reused?: boolean;
        message?: string;
        error?: string;
      } | null;

      if (!response.ok || !body?.audit?.domainSlug) {
        setError(body?.message ?? copy.startError);
        return;
      }

      router.push(`/${locale}/localisation-audit/${body.audit.domainSlug}`);
    } catch {
      setError(copy.startError);
    } finally {
      setPending(false);
    }
  }

  const onMesh = tone === "mesh";

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <div className="space-y-2">
        <Label htmlFor="localisation-audit-url" className={onMesh ? "text-white" : undefined}>
          {copy.urlLabel}
        </Label>
        <Input
          id="localisation-audit-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          placeholder={copy.urlPlaceholder}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className={onMesh ? MESH_INPUT_CLASS : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="localisation-audit-focus" className={onMesh ? "text-white" : undefined}>
          {copy.focusLabel}
        </Label>
        <Input
          id="localisation-audit-focus"
          name="focusLocales"
          placeholder={copy.focusPlaceholder}
          value={focusLocales}
          onChange={(event) => setFocusLocales(event.target.value)}
          className={onMesh ? MESH_INPUT_CLASS : undefined}
        />
        <p className={cn("text-sm", onMesh ? "text-white/70" : "text-muted-foreground")}>
          {copy.focusHint}
        </p>
      </div>
      {error ? (
        <p className={cn("text-sm", onMesh ? "text-red-200" : "text-destructive")}>{error}</p>
      ) : null}
      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className={
            onMesh ? "bg-white text-neutral-950 hover:bg-white/90 disabled:bg-white/70" : undefined
          }
        >
          {pending ? copy.submitting : copy.submit}
        </Button>
        <p className={cn("text-sm", onMesh ? "text-white/70" : "text-muted-foreground")}>
          {copy.onePerDomain}
        </p>
      </div>
    </form>
  );
}
