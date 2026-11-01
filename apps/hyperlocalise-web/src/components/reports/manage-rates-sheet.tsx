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

import { TrashIcon } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useState } from "react";
import { useIntl } from "react-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiResponseErrorCode } from "@/lib/api-error";
import {
  RATE_BASES,
  REPORT_STEPS,
  type RateBasis,
  type ReportStep,
} from "@/lib/reporting/report-units";
import { MATCH_BUCKETS, type MatchBucket } from "@/lib/reporting/word-analysis";

import { manageRatesSheetMessages as messages } from "./manage-rates-sheet.messages";
import { bandLabel, formatRateAmount, stepLabel } from "./report-format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./report-table";
import { ReportLoadFailed } from "./report-section";
import { ReportSelect } from "./reports-filter-bar";
import { useRateCards, useSaveRateCard, type ReportSettings } from "./reports-queries";

type Line = {
  key: string;
  sourceLocale: string;
  targetLocale: string;
  step: ReportStep;
  basis: RateBasis;
  rate: string;
};

type Percentages = Partial<Record<MatchBucket, number>>;

/** Bands a rate card pays a share of; "not matched" is paid as new work. */
const PAID_BANDS = MATCH_BUCKETS.filter((bucket) => bucket !== "unavailable");
const USD = /^\d{1,12}(\.\d{1,8})?$/;
const NEW_CARD = "__new__";

const BASIS_MESSAGES = {
  word: messages.basis_word,
  character: messages.basis_character,
  character_with_spaces: messages.basis_character_with_spaces,
  hour: messages.basis_hour,
} satisfies Record<RateBasis, unknown>;

const samePercentages = (left: Percentages, right: Percentages) =>
  PAID_BANDS.every((bucket) => (left[bucket] ?? 100) === (right[bucket] ?? 100));

/**
 * The workspace's rate cards. Admins change a card's lines, the unit new lines are charged per
 * and the share each match band is paid; everyone else who sees money can read them.
 */
export function ManageRatesSheet({
  organizationSlug,
  settings,
  cardName,
  onCardChange,
  onClose,
}: {
  organizationSlug: string;
  settings: ReportSettings;
  cardName: string | null;
  onCardChange: (name: string) => void;
  onClose: () => void;
}) {
  const intl = useIntl();
  const cards = useRateCards(organizationSlug);
  const save = useSaveRateCard(organizationSlug);
  // Known before the cards load, so the panel never shows the wrong title while loading.
  const canManage = settings.canManage;
  const [chosen, setChosen] = useState<string | null>(cardName);
  /** A card not saved yet: started blank, or a copy of the lines shown. */
  const [draft, setDraft] = useState<"blank" | "copy" | null>(null);
  const [name, setName] = useState("");
  const [defaultBasis, setDefaultBasis] = useState<RateBasis>("word");
  const [percentages, setPercentages] = useState<Percentages>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [differing, setDiffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const list = cards.data?.rateCards ?? [];
  const selected = list.find((card) => card.name === chosen) ?? list[0] ?? null;
  const creating = draft !== null || (cards.isSuccess && list.length === 0);

  const locales = useMemo(() => {
    const sources = new Set(settings.projects.map((project) => project.sourceLocale ?? "en"));
    const targets = new Set(settings.projects.flatMap((project) => project.targetLocales ?? []));
    for (const line of lines) {
      sources.add(line.sourceLocale);
      targets.add(line.targetLocale);
    }
    return { sources: [...sources].sort(), targets: [...targets].sort() };
  }, [settings.projects, lines]);

  // Load the chosen card into the form, unless a new card is being drafted.
  useEffect(() => {
    if (draft || !selected) return;
    setName(selected.name);
    setDefaultBasis(selected.defaultBasis);
    // Hourly lines are paid by the hour, so their band shares do not matter.
    const priced = selected.lines.filter((line) => line.basis !== "hour");
    const first = priced[0]?.percentages ?? {};
    setPercentages(first);
    setDiffering(priced.some((line) => !samePercentages(line.percentages, first)));
    setLines(
      selected.lines.map((line) => ({
        key: line.id,
        sourceLocale: line.sourceLocale,
        targetLocale: line.targetLocale,
        step: line.step,
        basis: line.basis,
        rate: String(Number(line.rate)),
      })),
    );
    setError(null);
  }, [draft, selected]);

  function startCard(kind: "blank" | "copy") {
    setDraft(kind);
    setName("");
    setError(null);
    if (kind === "blank") {
      setDefaultBasis("word");
      setPercentages({});
      setLines([]);
      setDiffering(false);
    }
  }

  function update(key: string, change: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...change } : line)),
    );
  }

  async function submit() {
    setError(null);
    const cardTitle = name.trim();
    if (!cardTitle) return setError(intl.formatMessage(messages.nameRequired));
    if (lines.some((line) => !USD.test(line.rate.trim())))
      return setError(intl.formatMessage(messages.rateInvalid));
    try {
      const saved = await save.mutateAsync({
        name: cardTitle,
        defaultBasis,
        create: creating,
        lines: lines.map((line) => ({
          sourceLocale: line.sourceLocale,
          targetLocale: line.targetLocale,
          step: line.step,
          basis: line.basis,
          rate: line.rate.trim(),
          percentages,
        })),
      });
      toast.success(intl.formatMessage(messages.saved));
      setDraft(null);
      setChosen(saved.name);
      onCardChange(saved.name);
    } catch (failure) {
      setError(
        isApiResponseErrorCode(failure, "rate_card_exists")
          ? intl.formatMessage(messages.nameTaken)
          : isApiResponseErrorCode(failure, "duplicate_rate_line")
            ? intl.formatMessage(messages.duplicateLine)
            : failure instanceof Error
              ? failure.message
              : String(failure),
      );
    }
  }

  return (
    <Sheet open onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-4xl"
      >
        <SheetHeader>
          <SheetTitle>
            {intl.formatMessage(canManage ? messages.manageTitle : messages.viewTitle)}
          </SheetTitle>
          <SheetDescription>
            {intl.formatMessage(canManage ? messages.manageSubtitle : messages.viewSubtitle)}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 px-6 pb-6 [&>*]:min-w-0">
          {cards.isPending ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : !cards.data ? (
            <ReportLoadFailed error={cards.error} retry={cards.refetch} />
          ) : list.length === 0 && !canManage ? (
            <p className="text-sm text-muted-foreground">{intl.formatMessage(messages.noCards)}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                {list.length ? (
                  <ReportSelect
                    label={intl.formatMessage(messages.rateCard)}
                    value={draft ? NEW_CARD : (selected?.name ?? "")}
                    options={[
                      ...list.map((card) => ({ value: card.name, label: card.name })),
                      ...(canManage
                        ? [{ value: NEW_CARD, label: intl.formatMessage(messages.newCard) }]
                        : []),
                    ]}
                    onChange={(value) => {
                      if (value === NEW_CARD) return startCard("blank");
                      setDraft(null);
                      setChosen(value);
                      onCardChange(value);
                    }}
                  />
                ) : null}
                {canManage && creating ? (
                  <Field className="w-full sm:w-56">
                    <FieldLabel htmlFor={nameId}>
                      {intl.formatMessage(messages.cardName)}
                    </FieldLabel>
                    <Input
                      id={nameId}
                      value={name}
                      maxLength={100}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </Field>
                ) : null}
                {canManage ? (
                  <ReportSelect
                    label={intl.formatMessage(messages.defaultBasis)}
                    value={defaultBasis}
                    options={RATE_BASES.map((basis) => ({
                      value: basis,
                      label: intl.formatMessage(BASIS_MESSAGES[basis]),
                    }))}
                    onChange={(value) => setDefaultBasis(value as RateBasis)}
                  />
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{intl.formatMessage(messages.paidAt)}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {PAID_BANDS.map((bucket) => (
                        <TableHead key={bucket} className="text-right">
                          {bandLabel(intl, bucket)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      {PAID_BANDS.map((bucket) => (
                        <TableCell key={bucket} className="text-right tabular-nums">
                          {canManage ? (
                            <Input
                              aria-label={intl.formatMessage(messages.percentLabel, {
                                band: bandLabel(intl, bucket),
                              })}
                              type="number"
                              min={0}
                              max={100}
                              className="ml-auto w-16 text-right"
                              value={percentages[bucket] ?? 100}
                              onChange={(event) => {
                                const value = Math.min(
                                  100,
                                  Math.max(0, Math.round(Number(event.target.value) || 0)),
                                );
                                setPercentages((current) => ({ ...current, [bucket]: value }));
                              }}
                            />
                          ) : (
                            intl.formatNumber((percentages[bucket] ?? 100) / 100, {
                              style: "percent",
                            })
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
                {differing ? (
                  <Alert>
                    <AlertDescription>
                      {intl.formatMessage(
                        canManage
                          ? messages.differingPercentages
                          : messages.differingPercentagesReadOnly,
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">{intl.formatMessage(messages.rates)}</p>
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {intl.formatMessage(messages.noLines)}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{intl.formatMessage(messages.sourceColumn)}</TableHead>
                        <TableHead>{intl.formatMessage(messages.targetColumn)}</TableHead>
                        <TableHead>{intl.formatMessage(messages.stepColumn)}</TableHead>
                        <TableHead>{intl.formatMessage(messages.basisColumn)}</TableHead>
                        <TableHead className="text-right">
                          {intl.formatMessage(messages.rateColumn)}
                        </TableHead>
                        {canManage ? <TableHead /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) =>
                        canManage ? (
                          <EditableLine
                            key={line.key}
                            line={line}
                            locales={locales}
                            onChange={(change) => update(line.key, change)}
                            onRemove={() =>
                              setLines((current) =>
                                current.filter((entry) => entry.key !== line.key),
                              )
                            }
                          />
                        ) : (
                          <TableRow key={line.key}>
                            <TableCell>{line.sourceLocale}</TableCell>
                            <TableCell>{line.targetLocale}</TableCell>
                            <TableCell>{stepLabel(intl, line.step)}</TableCell>
                            <TableCell>{intl.formatMessage(BASIS_MESSAGES[line.basis])}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatRateAmount(intl, line.rate)}
                            </TableCell>
                          </TableRow>
                        ),
                      )}
                    </TableBody>
                  </Table>
                )}
                {canManage ? (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setLines((current) => [
                          ...current,
                          {
                            key: crypto.randomUUID(),
                            sourceLocale: locales.sources[0] ?? "en",
                            targetLocale: locales.targets[0] ?? "",
                            step: "translation",
                            basis: defaultBasis,
                            rate: "",
                          },
                        ])
                      }
                    >
                      {intl.formatMessage(messages.addLine)}
                    </Button>
                  </div>
                ) : null}
              </div>
              {error ? <FieldError data-slot="field-error">{error}</FieldError> : null}
            </>
          )}
        </div>
        <SheetFooter className="flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          {canManage && !creating && cards.data ? (
            <Button variant="outline" disabled={save.isPending} onClick={() => startCard("copy")}>
              {intl.formatMessage(messages.saveAsNew)}
            </Button>
          ) : null}
          {canManage && cards.data ? (
            <Button disabled={save.isPending} onClick={() => void submit()}>
              {intl.formatMessage(save.isPending ? messages.saving : messages.save)}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function EditableLine({
  line,
  locales,
  onChange,
  onRemove,
}: {
  line: Line;
  locales: { sources: string[]; targets: string[] };
  onChange: (change: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const intl = useIntl();
  const narrow = "w-full min-w-28";
  return (
    <TableRow>
      <TableCell>
        <ReportSelect
          className={narrow}
          hideLabel
          label={intl.formatMessage(messages.sourceColumn)}
          value={line.sourceLocale}
          options={locales.sources.map((locale) => ({ value: locale, label: locale }))}
          onChange={(sourceLocale) => onChange({ sourceLocale })}
        />
      </TableCell>
      <TableCell>
        <ReportSelect
          className={narrow}
          hideLabel
          label={intl.formatMessage(messages.targetColumn)}
          value={line.targetLocale}
          options={locales.targets.map((locale) => ({ value: locale, label: locale }))}
          onChange={(targetLocale) => onChange({ targetLocale })}
        />
      </TableCell>
      <TableCell>
        <ReportSelect
          className={narrow}
          hideLabel
          label={intl.formatMessage(messages.stepColumn)}
          value={line.step}
          options={REPORT_STEPS.map((step) => ({ value: step, label: stepLabel(intl, step) }))}
          onChange={(step) => onChange({ step: step as ReportStep })}
        />
      </TableCell>
      <TableCell>
        <ReportSelect
          className="w-full min-w-40"
          hideLabel
          label={intl.formatMessage(messages.basisColumn)}
          value={line.basis}
          options={RATE_BASES.map((basis) => ({
            value: basis,
            label: intl.formatMessage(BASIS_MESSAGES[basis]),
          }))}
          onChange={(basis) => onChange({ basis: basis as RateBasis })}
        />
      </TableCell>
      <TableCell className="text-right">
        <Input
          aria-label={intl.formatMessage(messages.rateColumn)}
          inputMode="decimal"
          className="ml-auto w-24 text-right"
          value={line.rate}
          onChange={(event) => onChange({ rate: event.target.value })}
        />
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={intl.formatMessage(messages.removeLine, {
            source: line.sourceLocale,
            target: line.targetLocale,
            step: stepLabel(intl, line.step),
          })}
          onClick={onRemove}
        >
          <TrashIcon />
        </Button>
      </TableCell>
    </TableRow>
  );
}
