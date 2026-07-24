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
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Globe02Icon,
  InformationCircleIcon,
  LinkSquare02Icon,
  Mail01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useIntl } from "react-intl";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";

import { AuditReportView } from "./audit-report-view";
import type {
  AuditStatus,
  ConfirmAuditResponse,
  CreateAuditResponse,
  UnlockAuditResponse,
} from "./localisation-audit-types";
import { toAuditReportProjection } from "./localisation-audit-types";
import { localisationAuditMessages as messages } from "./localisation-audit.messages";

type FlowStage = "input" | "discovering" | "confirm" | "auditing" | "result";
type FailedAction = "create" | "confirm" | "unlock" | null;
type CompletedAuditView = {
  id: string;
  status: "completed" | "partial";
  publicSlug?: string;
  summary: ReturnType<typeof toAuditReportProjection>;
};

const AUDIT_POLL_INTERVAL_MS = 1_000;
const AUDIT_POLL_TIMEOUT_MS = 90_000;

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === "string" && body.message ? body.message : fallback;
  } catch {
    return fallback;
  }
}

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function pollAuditUntil(
  auditId: string,
  isTerminal: (status: AuditStatus) => boolean,
  fallbackError: string,
): Promise<ConfirmAuditResponse["audit"]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < AUDIT_POLL_TIMEOUT_MS) {
    const response = await fetch(`/api/localisation-audit/audits/${encodeURIComponent(auditId)}`);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, fallbackError));
    }
    const body = (await response.json()) as ConfirmAuditResponse;
    if (isTerminal(body.audit.status)) {
      return body.audit;
    }
    await sleep(AUDIT_POLL_INTERVAL_MS);
  }
  throw new Error(fallbackError);
}

function LoadingStage({
  title,
  description,
  value,
  auditRunning,
}: {
  title: string;
  description: string;
  value: number;
  auditRunning: boolean;
}) {
  const intl = useIntl();

  return (
    <Card aria-live="polite" aria-busy="true">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription className="max-w-2xl text-base leading-7 text-pretty">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-7">
        <Progress value={value}>
          <ProgressLabel>{intl.formatMessage(messages.progressLabel)}</ProgressLabel>
          <ProgressValue />
        </Progress>
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          <li className="flex items-center gap-2 text-foreground">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={1.8}
              className="size-4 text-primary"
              aria-hidden="true"
            />
            {intl.formatMessage(messages.progressDiscover)}
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            {auditRunning
              ? intl.formatMessage(messages.progressTechnical)
              : intl.formatMessage(messages.discoveryTitle)}
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            {intl.formatMessage(messages.progressLanguage)}
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}

function FormError({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const intl = useIntl();

  return (
    <Alert variant="destructive">
      <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={1.8} aria-hidden="true" />
      <AlertTitle>{message}</AlertTitle>
      <AlertDescription>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
          disabled={retrying}
        >
          {intl.formatMessage(messages.retry)}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function LocalisationAuditFlow() {
  const intl = useIntl();
  const [stage, setStage] = useState<FlowStage>("input");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [createdAudit, setCreatedAudit] = useState<CreateAuditResponse["audit"] | null>(null);
  const [completedAudit, setCompletedAudit] = useState<CompletedAuditView | null>(null);
  const [targetLocale, setTargetLocale] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failedAction, setFailedAction] = useState<FailedAction>(null);
  const [reportAccessUrl, setReportAccessUrl] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const fallbackError = intl.formatMessage(messages.requestFailed);
  const isPending = stage === "discovering" || stage === "auditing";

  async function createAudit(url: string) {
    setError(null);
    setFailedAction(null);
    setSubmittedUrl(url);
    setStage("discovering");

    try {
      const response = await fetch("/api/localisation-audit/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, fallbackError));
      }

      const body = (await response.json()) as CreateAuditResponse;
      const prepared =
        body.audit.status === "awaiting_confirmation" || body.audit.status === "failed"
          ? body.audit
          : await pollAuditUntil(
              body.audit.id,
              (status) => status === "awaiting_confirmation" || status === "failed",
              fallbackError,
            );
      if (prepared.status === "failed") {
        throw new Error(fallbackError);
      }
      setCreatedAudit({
        id: prepared.id,
        status: prepared.status,
        detectedLocale: prepared.detectedLocale ?? null,
        alternatives: prepared.alternatives ?? [],
      });
      setTargetLocale(prepared.detectedLocale ?? prepared.alternatives?.[0]?.locale ?? "");
      setStage("confirm");
    } catch (requestError) {
      setStage("input");
      setFailedAction("create");
      setError(requestError instanceof Error ? requestError.message : fallbackError);
    }
  }

  async function confirmAudit(locale: string, market: string) {
    if (!createdAudit) {
      return;
    }

    setError(null);
    setFailedAction(null);
    setStage("auditing");

    try {
      const response = await fetch(
        `/api/localisation-audit/audits/${encodeURIComponent(createdAudit.id)}/confirm`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetLocale: locale,
            targetMarket: market,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, fallbackError));
      }

      const body = (await response.json()) as ConfirmAuditResponse;
      const completed =
        body.audit.status === "completed" ||
        body.audit.status === "partial" ||
        body.audit.status === "failed"
          ? body.audit
          : await pollAuditUntil(
              createdAudit.id,
              (status) => status === "completed" || status === "partial" || status === "failed",
              fallbackError,
            );
      if (
        (completed.status !== "completed" && completed.status !== "partial") ||
        !completed.summary
      ) {
        throw new Error(fallbackError);
      }
      setCompletedAudit({
        id: completed.id,
        status: completed.status,
        publicSlug: completed.publicSlug,
        summary: toAuditReportProjection(completed.summary),
      });
      setStage("result");
    } catch (requestError) {
      setStage("confirm");
      setFailedAction("confirm");
      setError(requestError instanceof Error ? requestError.message : fallbackError);
    }
  }

  async function unlockReport(workEmail: string, name: string) {
    if (!completedAudit) {
      return;
    }

    setError(null);
    setFailedAction(null);
    setIsUnlocking(true);

    try {
      const response = await fetch(
        `/api/localisation-audit/audits/${encodeURIComponent(completedAudit.id)}/unlock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: workEmail,
            ...(name ? { name } : {}),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, fallbackError));
      }

      const body = (await response.json()) as UnlockAuditResponse;
      setReportAccessUrl(body.report.accessUrl);
    } catch (requestError) {
      setFailedAction("unlock");
      setError(requestError instanceof Error ? requestError.message : fallbackError);
    } finally {
      setIsUnlocking(false);
    }
  }

  function retryFailedAction() {
    if (failedAction === "create") {
      void createAudit(submittedUrl);
      return;
    }
    if (failedAction === "confirm") {
      void confirmAudit(targetLocale, targetMarket);
    }
  }

  if (stage === "result" && completedAudit) {
    return (
      <AuditReportView report={completedAudit.summary} mode="preview" showFooter>
        <Card className="mx-auto max-w-3xl bg-muted/20">
          <CardHeader>
            <CardTitle className="text-2xl">
              {reportAccessUrl
                ? intl.formatMessage(messages.unlockedTitle)
                : intl.formatMessage(messages.unlockTitle)}
            </CardTitle>
            <CardDescription className="text-base leading-7 text-pretty">
              {intl.formatMessage(messages.unlockDescription)}
            </CardDescription>
          </CardHeader>
          {reportAccessUrl ? (
            <CardFooter>
              <Button nativeButton={false} render={<a href={reportAccessUrl} />}>
                {intl.formatMessage(messages.openReport)}
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} data-icon="inline-end" />
              </Button>
            </CardFooter>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                void unlockReport(
                  getFormString(formData, "workEmail"),
                  getFormString(formData, "name").trim(),
                );
              }}
            >
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="audit-work-email">
                      {intl.formatMessage(messages.workEmailLabel)}
                    </FieldLabel>
                    <Input
                      id="audit-work-email"
                      name="workEmail"
                      type="email"
                      autoComplete="email"
                      required
                      aria-invalid={failedAction === "unlock" || undefined}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="audit-name">
                      {intl.formatMessage(messages.nameLabel)}
                    </FieldLabel>
                    <Input id="audit-name" name="name" autoComplete="name" />
                  </Field>
                  {error && failedAction === "unlock" ? <FieldError>{error}</FieldError> : null}
                  {isUnlocking ? (
                    <Progress value={90} aria-label={intl.formatMessage(messages.preparingReport)}>
                      <ProgressLabel>{intl.formatMessage(messages.preparingReport)}</ProgressLabel>
                      <ProgressValue className="sr-only" />
                    </Progress>
                  ) : null}
                </FieldGroup>
              </CardContent>
              <CardFooter className="border-t">
                <Button type="submit" size="lg" disabled={isUnlocking}>
                  <HugeiconsIcon icon={Mail01Icon} strokeWidth={1.8} data-icon="inline-start" />
                  {intl.formatMessage(messages.unlockButton)}
                </Button>
              </CardFooter>
            </form>
          )}
        </Card>
      </AuditReportView>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl">
        <section className="grid gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(380px,0.7fr)] lg:px-10 lg:pb-24 lg:pt-20">
          <div className="flex max-w-3xl flex-col gap-6">
            <Badge variant="outline">{intl.formatMessage(messages.eyebrow)}</Badge>
            <div className="flex flex-col gap-5">
              <h1 className="font-heading text-4xl font-semibold leading-tight text-balance sm:text-5xl lg:text-6xl">
                {intl.formatMessage(messages.title)}
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-pretty text-muted-foreground">
                {intl.formatMessage(messages.lead)}
              </p>
            </div>
            <div className="grid max-w-2xl gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Globe02Icon}
                  strokeWidth={1.8}
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                {intl.formatMessage(messages.technicalReadinessShort)}
              </div>
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Search01Icon}
                  strokeWidth={1.8}
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                {intl.formatMessage(messages.languageQualityShort)}
              </div>
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={LinkSquare02Icon}
                  strokeWidth={1.8}
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                {intl.formatMessage(messages.marketFitShort)}
              </div>
            </div>
          </div>

          <div className="self-start">
            {stage === "input" ? (
              <Card>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    void createAudit(getFormString(formData, "url"));
                  }}
                >
                  <CardHeader>
                    <CardTitle>{intl.formatMessage(messages.urlLabel)}</CardTitle>
                    <CardDescription className="text-pretty">
                      {intl.formatMessage(messages.urlDescription)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field>
                        <FieldLabel className="sr-only" htmlFor="audit-url">
                          {intl.formatMessage(messages.urlLabel)}
                        </FieldLabel>
                        <InputGroup className="h-12">
                          <InputGroupInput
                            id="audit-url"
                            name="url"
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            placeholder={intl.formatMessage(messages.urlPlaceholder)}
                            defaultValue={submittedUrl}
                            required
                            aria-invalid={failedAction === "create" || undefined}
                          />
                          <InputGroupAddon align="inline-start">
                            <HugeiconsIcon
                              icon={Globe02Icon}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          </InputGroupAddon>
                        </InputGroup>
                        {error && failedAction === "create" ? (
                          <FieldError>{error}</FieldError>
                        ) : null}
                      </Field>
                    </FieldGroup>
                  </CardContent>
                  <CardFooter className="border-t">
                    <Button type="submit" size="lg" className="w-full">
                      {intl.formatMessage(messages.startAudit)}
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        strokeWidth={2}
                        data-icon="inline-end"
                      />
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            ) : null}

            {stage === "discovering" ? (
              <LoadingStage
                title={intl.formatMessage(messages.discoveryTitle)}
                description={intl.formatMessage(messages.discoveryDescription)}
                value={34}
                auditRunning={false}
              />
            ) : null}

            {stage === "auditing" ? (
              <LoadingStage
                title={intl.formatMessage(messages.auditProgressTitle)}
                description={intl.formatMessage(messages.auditProgressDescription)}
                value={72}
                auditRunning
              />
            ) : null}

            {stage === "confirm" && createdAudit ? (
              <Card>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void confirmAudit(targetLocale.trim(), targetMarket.trim());
                  }}
                >
                  <CardHeader>
                    <Badge variant="secondary">{intl.formatMessage(messages.confirmEyebrow)}</Badge>
                    <CardTitle className="text-2xl">
                      {intl.formatMessage(messages.confirmTitle)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-7 grid gap-4 rounded-lg border border-border bg-muted/20 p-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          {intl.formatMessage(messages.detectedLocale)}
                        </p>
                        <p className="mt-1 font-medium">
                          {createdAudit.detectedLocale ?? intl.formatMessage(messages.notDetected)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          {intl.formatMessage(messages.alternatives)}
                        </p>
                        {createdAudit.alternatives.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {createdAudit.alternatives.map((alternative) => (
                              <Button
                                key={`${alternative.locale}-${alternative.url}`}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setTargetLocale(alternative.locale)}
                              >
                                {alternative.locale}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-sm text-pretty text-muted-foreground">
                            {intl.formatMessage(messages.noAlternatives)}
                          </p>
                        )}
                      </div>
                    </div>

                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="target-locale">
                          {intl.formatMessage(messages.targetLocaleLabel)}
                        </FieldLabel>
                        <Input
                          id="target-locale"
                          value={targetLocale}
                          onChange={(event) => setTargetLocale(event.currentTarget.value)}
                          required
                        />
                        <FieldDescription>
                          {intl.formatMessage(messages.targetLocaleDescription)}
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="target-market">
                          {intl.formatMessage(messages.targetMarketLabel)}
                        </FieldLabel>
                        <Input
                          id="target-market"
                          value={targetMarket}
                          onChange={(event) =>
                            setTargetMarket(event.currentTarget.value.toUpperCase())
                          }
                          placeholder={intl.formatMessage(messages.targetMarketPlaceholder)}
                          autoCapitalize="characters"
                          maxLength={2}
                          pattern="[A-Za-z]{2}"
                          required
                        />
                        <FieldDescription>
                          {intl.formatMessage(messages.targetMarketDescription)}
                        </FieldDescription>
                      </Field>
                      {error && failedAction === "confirm" ? (
                        <FormError
                          message={error}
                          onRetry={retryFailedAction}
                          retrying={isPending}
                        />
                      ) : null}
                    </FieldGroup>
                  </CardContent>
                  <CardFooter className="flex-col gap-2 border-t sm:flex-row">
                    <Button type="submit" size="lg" className="w-full sm:w-auto">
                      {intl.formatMessage(messages.runAudit)}
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="ghost"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        setError(null);
                        setFailedAction(null);
                        setStage("input");
                      }}
                    >
                      {intl.formatMessage(messages.changeUrl)}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            ) : null}
          </div>
        </section>

        <section className="border-t border-border">
          <div className="px-5 pt-16 sm:px-8 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </div>
    </div>
  );
}
