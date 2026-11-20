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
import { ArrowRightIcon, PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOCALISATION_AUDIT_DAILY_RUN_LIMIT } from "@/lib/localisation-audit/types";

import { getLocalisationAuditPageCopy } from "./localisation-audit-page-content";

const MAX_FOCUS_LOCALES = 2;

const DEFAULT_ID_PREFIX = "localisation-audit";

type LocalisationAuditFormProps = {
  locale: string;
  idPrefix?: string;
};

export function LocalisationAuditForm({
  locale,
  idPrefix = DEFAULT_ID_PREFIX,
}: LocalisationAuditFormProps) {
  const copy = getLocalisationAuditPageCopy(locale);
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [url, setUrl] = useState("");
  const [focusLocales, setFocusLocales] = useState("");
  const [showFocus, setShowFocus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const locales = focusLocales
        .split(/[,;\n]+/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, MAX_FOCUS_LOCALES);

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

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xl">
      <Label htmlFor={`${idPrefix}-url`} className="sr-only">
        {copy.urlLabel}
      </Label>
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/30 sm:flex-row">
        <Input
          id={`${idPrefix}-url`}
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          placeholder={copy.urlPlaceholder}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button type="submit" size="lg" disabled={pending} className="h-12 shrink-0 px-6">
          {pending ? copy.submitting : copy.submit}
          {pending ? null : <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {showFocus ? null : (
          <button
            type="button"
            onClick={() => setShowFocus(true)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <PlusIcon className="size-3.5" aria-hidden />
            {copy.focusToggle}
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          {copy.onePerDomain({ limit: LOCALISATION_AUDIT_DAILY_RUN_LIMIT })}
        </p>
      </div>

      <AnimatePresence initial={false}>
        {showFocus ? (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-4">
              <Label htmlFor={`${idPrefix}-focus`}>{copy.focusLabel}</Label>
              <Input
                id={`${idPrefix}-focus`}
                name="focusLocales"
                placeholder={copy.focusPlaceholder}
                value={focusLocales}
                aria-describedby={`${idPrefix}-focus-hint`}
                onChange={(event) => setFocusLocales(event.target.value)}
                className="h-11"
                autoFocus
              />
              <p id={`${idPrefix}-focus-hint`} className="text-sm text-muted-foreground">
                {copy.focusHint}
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
