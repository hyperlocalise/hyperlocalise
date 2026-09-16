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
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldGroup,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DOMAIN_RESEARCH_MARKETS,
  type DomainResearchDomain,
} from "@/lib/domains/research-prototype";

import { domainLinkDialogMessages as messages } from "./domain-link-dialog.messages";
import { domainResearchSharedMessages as sharedMessages } from "./domain-research-shared.messages";

const LANGUAGE_LABELS: Record<string, string> = {
  ar: "Arabic",
  bn: "Bengali",
  cs: "Czech",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fa: "Persian",
  fi: "Finnish",
  fil: "Filipino",
  fr: "French",
  he: "Hebrew",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  ms: "Malay",
  nb: "Norwegian",
  nl: "Dutch",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  vi: "Vietnamese",
  zh: "Chinese",
};

export type DomainLinkProjectOption = {
  id: string;
  name: string;
};

export type DomainLinkProjectSelection =
  | { mode: "create" }
  | { mode: "existing"; projectId: string }
  | { mode: "unassigned" };

export function DomainLinkDialog({
  open,
  onOpenChange,
  domain,
  existingDomains = [],
  projects = [],
  projectsLoading = false,
  onSave,
  onContinue,
  variant = "prototype",
}: {
  domain?: DomainResearchDomain;
  existingDomains?: DomainResearchDomain[];
  projects?: DomainLinkProjectOption[];
  projectsLoading?: boolean;
  onSave?: (domain: DomainResearchDomain) => void;
  /** Live claim flow: continue with hostname and selected markets. */
  onContinue?: (
    domainKey: string,
    marketIds: string[],
    projectSelection: DomainLinkProjectSelection,
  ) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "prototype" | "live";
}) {
  const intl = useIntl();
  const hostnameId = useId();
  const marketId = useId();
  const [hostname, setHostname] = useState("");
  const [localeIds, setLocaleIds] = useState<string[]>([]);
  const [step, setStep] = useState<"primary" | "additional">("primary");
  const [projectMode, setProjectMode] = useState<DomainLinkProjectSelection["mode"]>("create");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [localeError, setLocaleError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHostname(domain?.domainKey ?? "");
      setLocaleIds(domain?.locales.map((locale) => locale.id) ?? []);
      setStep(domain ? "additional" : "primary");
      setProjectMode("create");
      setSelectedProjectId("");
      setSearchQuery("");
      setLocaleError(null);
      setProjectError(null);
      setError(null);
    }
  }, [open, domain]);

  const primaryLocaleId = localeIds[0] ?? null;
  const filteredMarkets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return DOMAIN_RESEARCH_MARKETS;
    return DOMAIN_RESEARCH_MARKETS.filter((market) =>
      `${market.label} ${market.location} ${market.language}`.toLowerCase().includes(query),
    );
  }, [searchQuery]);
  const marketGroups = useMemo(() => {
    const groups = new Map<string, { label: string; markets: typeof filteredMarkets }>();
    for (const market of filteredMarkets) {
      const key = market.language;
      const group = groups.get(key) ?? {
        label: LANGUAGE_LABELS[market.language] ?? market.language.toUpperCase(),
        markets: [],
      };
      group.markets.push(market);
      groups.set(key, group);
    }
    return [...groups.values()].toSorted((a, b) => a.label.localeCompare(b.label));
  }, [filteredMarkets]);

  function selectPrimaryMarket(marketId: string) {
    setLocaleIds((current) => [marketId, ...current.filter((id) => id !== marketId)]);
    setLocaleError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextHostname = hostname.trim().toLowerCase();
    if (!nextHostname) {
      setError(intl.formatMessage(messages.hostnameRequired));
      return;
    }

    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(nextHostname)
    ) {
      setError(intl.formatMessage(messages.hostnameInvalid));
      return;
    }

    if (existingDomains.some((item) => item.id !== domain?.id && item.domainKey === nextHostname)) {
      setError(intl.formatMessage(messages.hostnameDuplicate));
      return;
    }

    if (step === "primary" && variant !== "live") {
      if (!primaryLocaleId) {
        setLocaleError(intl.formatMessage(messages.localesRequired));
        return;
      }
      setStep("additional");
      setSearchQuery("");
      return;
    }

    const locales = DOMAIN_RESEARCH_MARKETS.filter((locale) => localeIds.includes(locale.id));
    if (!locales.length && !(variant === "live" && !domain)) {
      setLocaleError(intl.formatMessage(messages.localesRequired));
      return;
    }
    if (variant === "live" && !domain) {
      if (projectMode === "existing" && !selectedProjectId) {
        setProjectError(intl.formatMessage(messages.projectRequired));
        return;
      }
      onContinue?.(
        nextHostname,
        locales.map((locale) => locale.id),
        projectMode === "existing"
          ? { mode: "existing", projectId: selectedProjectId }
          : { mode: projectMode },
      );
      onOpenChange(false);
      return;
    }
    onSave?.(
      domain
        ? { ...domain, locales }
        : {
            id: `preview-${crypto.randomUUID()}`,
            domainKey: nextHostname,
            sourceUrl: `https://${nextHostname}`,
            locales,
            status: "pending_verification",
            keywordCount: 0,
            keywordCountLabel: "—",
            traffic: 0,
            trafficLabel: "—",
            score: null,
            trackedCount: 0,
            aiMentions: 0,
          },
    );
    toast.success(intl.formatMessage(domain ? messages.saved : messages.success));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,760px)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
        <form className="grid gap-6 md:grid-cols-2" onSubmit={handleSubmit}>
          <DialogHeader className="md:col-span-2">
            <DialogTitle>
              <FormattedMessage {...(domain ? messages.editTitle : messages.title)} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage
                {...(domain
                  ? messages.editDescription
                  : variant === "live"
                    ? messages.liveDescription
                    : messages.description)}
              />
            </DialogDescription>
          </DialogHeader>

          <div className="grid content-start gap-4">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={hostnameId}>
                <FormattedMessage {...messages.hostnameLabel} />
              </FieldLabel>
              <Input
                readOnly={Boolean(domain)}
                id={hostnameId}
                value={hostname}
                onChange={(event) => {
                  setHostname(event.target.value);
                  setError(null);
                }}
                placeholder={intl.formatMessage(messages.hostnamePlaceholder)}
                aria-invalid={Boolean(error)}
                autoComplete="off"
              />
              <FieldError errors={error ? [{ message: error }] : undefined} />
            </Field>
          </div>

          {variant === "prototype" || (variant === "live" && !domain) ? (
            <div className="grid content-start gap-4 md:col-start-2 md:row-start-2">
              {variant === "live" && !domain ? (
                <FieldSet
                  className="grid gap-3"
                  aria-describedby={projectError ? `${marketId}-project-error` : undefined}
                >
                  <FieldLegend variant="label">
                    <FormattedMessage {...messages.projectLabel} />
                  </FieldLegend>
                  <p className="text-sm text-muted-foreground">
                    <FormattedMessage {...messages.projectDescription} />
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={projectMode === "create" ? "default" : "outline"}
                      onClick={() => {
                        setProjectMode("create");
                        setProjectError(null);
                      }}
                    >
                      <FormattedMessage {...messages.createProject} />
                    </Button>
                    <Button
                      type="button"
                      variant={projectMode === "existing" ? "default" : "outline"}
                      disabled={projectsLoading || projects.length === 0}
                      onClick={() => {
                        setProjectMode("existing");
                        setProjectError(null);
                      }}
                    >
                      <FormattedMessage {...messages.existingProject} />
                    </Button>
                    <Button
                      type="button"
                      variant={projectMode === "unassigned" ? "default" : "outline"}
                      onClick={() => {
                        setProjectMode("unassigned");
                        setProjectError(null);
                      }}
                    >
                      <FormattedMessage {...messages.unassignedProject} />
                    </Button>
                  </div>
                  {projectMode === "existing" ? (
                    <Field data-invalid={Boolean(projectError)}>
                      <FieldLabel htmlFor={`${marketId}-project`}>
                        <FormattedMessage {...messages.projectLabel} />
                      </FieldLabel>
                      <select
                        id={`${marketId}-project`}
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        value={selectedProjectId}
                        onChange={(event) => {
                          setSelectedProjectId(event.currentTarget.value);
                          setProjectError(null);
                        }}
                      >
                        <option value="">
                          {intl.formatMessage(messages.projectSelectPlaceholder)}
                        </option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <FieldError
                        id={`${marketId}-project-error`}
                        errors={projectError ? [{ message: projectError }] : undefined}
                      />
                    </Field>
                  ) : null}
                  {projectsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      <FormattedMessage {...messages.projectsLoading} />
                    </p>
                  ) : null}
                </FieldSet>
              ) : null}
              {variant === "prototype" ? (
                <FieldSet
                  className="grid gap-3"
                  aria-describedby={localeError ? `${marketId}-error` : undefined}
                >
                  <FieldLegend variant="label">
                    <FormattedMessage
                      {...(step === "primary"
                        ? messages.primaryMarketLabel
                        : messages.additionalMarketLabel)}
                    />
                  </FieldLegend>
                  <p className="text-sm text-muted-foreground">
                    <FormattedMessage
                      {...(step === "primary"
                        ? messages.primaryMarketDescription
                        : messages.additionalMarketDescription)}
                    />
                  </p>
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={intl.formatMessage(messages.marketSearchPlaceholder)}
                    aria-label={intl.formatMessage(messages.marketSearchLabel)}
                    autoComplete="off"
                  />
                  <FieldGroup className="max-h-64 gap-3 overflow-y-auto pe-1">
                    {step === "primary"
                      ? marketGroups.map((group) => (
                          <div key={group.label} className="grid gap-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {group.label}
                            </p>
                            {group.markets.map((locale) => (
                              <Button
                                key={locale.id}
                                type="button"
                                variant={primaryLocaleId === locale.id ? "default" : "outline"}
                                className="justify-start"
                                aria-pressed={primaryLocaleId === locale.id}
                                onClick={() => selectPrimaryMarket(locale.id)}
                              >
                                {locale.label}
                              </Button>
                            ))}
                          </div>
                        ))
                      : marketGroups.map((group) => (
                          <div key={group.label} className="grid gap-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {group.label}
                            </p>
                            {group.markets.map((locale) => (
                              <Field
                                key={locale.id}
                                orientation="horizontal"
                                data-invalid={Boolean(localeError)}
                              >
                                <Checkbox
                                  id={`${marketId}-${locale.id}`}
                                  checked={localeIds.includes(locale.id)}
                                  aria-invalid={Boolean(localeError)}
                                  onCheckedChange={(checked) => {
                                    setLocaleIds((current) =>
                                      checked
                                        ? [...current, locale.id]
                                        : current.filter((id) => id !== locale.id),
                                    );
                                    setLocaleError(null);
                                  }}
                                />
                                <FieldLabel htmlFor={`${marketId}-${locale.id}`}>
                                  {locale.label}
                                </FieldLabel>
                              </Field>
                            ))}
                          </div>
                        ))}
                  </FieldGroup>
                  <FieldError
                    id={`${marketId}-error`}
                    errors={localeError ? [{ message: localeError }] : undefined}
                  />
                </FieldSet>
              ) : null}
              {localeIds.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  <FormattedMessage
                    {...messages.selectedMarkets}
                    values={{ count: localeIds.length }}
                  />
                </p>
              ) : null}
              {variant === "prototype" ? (
                <p className="text-sm text-muted-foreground">
                  <FormattedMessage {...messages.prototypeNotice} />
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="md:col-span-2">
            {step === "additional" && !domain ? (
              <Button type="button" variant="ghost" onClick={() => setStep("primary")}>
                <FormattedMessage {...messages.back} />
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <FormattedMessage {...sharedMessages.cancel} />
            </Button>
            <Button type="submit">
              <FormattedMessage
                {...(domain
                  ? messages.save
                  : variant === "live"
                    ? messages.submit
                    : step === "primary"
                      ? messages.chooseAdditionalMarkets
                      : localeIds.length
                        ? messages.submit
                        : messages.noMarketsContinue)}
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
