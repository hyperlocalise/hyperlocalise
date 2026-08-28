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
import { useId, useMemo, useState } from "react";
import { Add01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import {
  emptyGlossaryTermMetadataDraft,
  GlossaryTermMetadataFields,
  glossaryTermMetadataToPayload,
  type GlossaryTermMetadataDraft,
} from "@/components/glossary/glossary-term-property-pickers";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";
import type { GlossaryPartOfSpeech } from "@/lib/glossary/glossary";
import { cn } from "@/lib/primitives/cn";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

import { catIntelligencePanelMessages } from "@/components/cat/shared/cat.messages";

import {
  formatCatSharedWithTeamGlossaryName,
  type CatTeamGlossaryOption,
} from "./cat-team-glossary";

const CREATE_TEAM_GLOSSARY_VALUE = "__create__";

const preferredGlossaryTermMetadataDraft: GlossaryTermMetadataDraft = {
  ...emptyGlossaryTermMetadataDraft,
  status: "preferred",
};

export type { CatTeamGlossaryOption };

export function CatAddToGlossary({
  organizationSlug,
  projectId,
  teamId,
  teamName,
  sourceLocale,
  targetLocale,
  sourceTerm,
  targetTerm,
  teamGlossaries,
  canContribute,
  showTitle = true,
  onAdded,
  onTeamGlossaryCreated,
}: {
  organizationSlug?: string;
  projectId?: string;
  teamId: string;
  teamName: string;
  sourceLocale: string;
  targetLocale: string;
  sourceTerm: string;
  targetTerm: string;
  teamGlossaries: CatTeamGlossaryOption[];
  canContribute: boolean;
  showTitle?: boolean;
  onAdded?: () => void;
  onTeamGlossaryCreated?: (glossary: CatTeamGlossaryOption) => void;
}) {
  const intl = useIntl();
  const primaryTermId = useId();
  const definitionId = useId();
  const targetTermId = useId();
  const newGlossaryNameId = useId();
  const canCreate = Boolean(
    canContribute && organizationSlug && projectId && sourceLocale && teamId,
  );
  const scopedTeamGlossaries = useMemo(
    () => teamGlossaries.filter((glossary) => glossary.teamId === teamId),
    [teamGlossaries, teamId],
  );
  const defaultGlossaryName = useMemo(
    () => formatCatSharedWithTeamGlossaryName(intl, teamName),
    [intl, teamName],
  );
  const [createdGlossaries, setCreatedGlossaries] = useState<CatTeamGlossaryOption[]>([]);
  const glossaries = useMemo(() => {
    const seen = new Set(scopedTeamGlossaries.map((glossary) => glossary.id));
    return [
      ...scopedTeamGlossaries,
      ...createdGlossaries.filter(
        (glossary) => !seen.has(glossary.id) && glossary.teamId === teamId,
      ),
    ];
  }, [createdGlossaries, scopedTeamGlossaries, teamId]);
  const [selectedGlossaryId, setSelectedGlossaryId] = useState(glossaries[0]?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newGlossaryName, setNewGlossaryName] = useState(defaultGlossaryName);
  const [primaryTerm, setPrimaryTerm] = useState(sourceTerm);
  const [definition, setDefinition] = useState("");
  const [translatable, setTranslatable] = useState(true);
  const [targetDraft, setTargetDraft] = useState(targetTerm);
  const [sourceMetadata, setSourceMetadata] = useState<GlossaryTermMetadataDraft>(
    () => preferredGlossaryTermMetadataDraft,
  );
  const [targetMetadata, setTargetMetadata] = useState<GlossaryTermMetadataDraft>(
    () => preferredGlossaryTermMetadataDraft,
  );

  const selectedGlossary =
    glossaries.find((glossary) => glossary.id === selectedGlossaryId) ?? glossaries[0];
  const canSubmit = Boolean(
    canContribute && organizationSlug && selectedGlossary && primaryTerm.trim(),
  );

  const createGlossary = useMutation({
    mutationFn: async () => {
      if (!organizationSlug || !projectId) {
        throw new Error(intl.formatMessage(catIntelligencePanelMessages.addToGlossaryCreateFailed));
      }
      const name = newGlossaryName.trim();
      if (!name) {
        throw new Error(intl.formatMessage(catIntelligencePanelMessages.addToGlossaryCreateFailed));
      }
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries.$post({
        param: { organizationSlug },
        json: {
          name,
          sourceLocale,
          controlLevel: "team",
          teamId,
          projectIds: [projectId],
        },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(catIntelligencePanelMessages.addToGlossaryCreateFailed),
          ),
        );
      }
      return response.json();
    },
    onSuccess: (body) => {
      const created: CatTeamGlossaryOption = {
        id: body.glossary.id,
        name: body.glossary.name,
        teamId,
      };
      setCreatedGlossaries((current) =>
        current.some((glossary) => glossary.id === created.id) ? current : [...current, created],
      );
      setSelectedGlossaryId(created.id);
      setIsCreateDialogOpen(false);
      onTeamGlossaryCreated?.(created);
      toast.success(intl.formatMessage(catIntelligencePanelMessages.addToGlossaryCreateSuccess));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const addConcept = useMutation({
    mutationFn: async () => {
      if (!organizationSlug || !selectedGlossary) {
        throw new Error(intl.formatMessage(catIntelligencePanelMessages.addToGlossaryUnavailable));
      }
      const source = primaryTerm.trim();
      const target = translatable ? targetDraft.trim() : "";
      const sourcePayload = glossaryTermMetadataToPayload(sourceMetadata);
      const targetPayload = glossaryTermMetadataToPayload(targetMetadata);
      const buildTerm = (
        locale: string,
        term: string,
        payload: ReturnType<typeof glossaryTermMetadataToPayload>,
      ) => {
        const { partOfSpeech, ...metadata } = payload;

        return {
          locale,
          term,
          caseSensitive: false as const,
          forbidden: false as const,
          ...metadata,
          ...(partOfSpeech ? { partOfSpeech: partOfSpeech as GlossaryPartOfSpeech } : {}),
        };
      };
      const terms = [
        buildTerm(sourceLocale, source, sourcePayload),
        ...(target ? [buildTerm(targetLocale, target, targetPayload)] : []),
      ];
      const trimmedDefinition = definition.trim();
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].concepts.$post({
        param: { organizationSlug, glossaryId: selectedGlossary.id },
        json: {
          primaryTerm: source,
          definition: trimmedDefinition || undefined,
          translatable,
          terms,
        },
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(
            response,
            intl.formatMessage(catIntelligencePanelMessages.addToGlossaryFailed),
          ),
        );
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success(intl.formatMessage(catIntelligencePanelMessages.addToGlossarySuccess));
      onAdded?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (!canContribute) {
    return null;
  }

  const isBusy = addConcept.isPending || createGlossary.isPending;
  const glossaryName =
    selectedGlossary?.name ??
    intl.formatMessage(catIntelligencePanelMessages.addToGlossaryPickerPlaceholder);
  const sharedWithTeamNote = formatCatSharedWithTeamGlossaryName(intl, teamName);

  const openCreateDialog = () => {
    setPickerOpen(false);
    setNewGlossaryName(defaultGlossaryName);
    setIsCreateDialogOpen(true);
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      {showTitle ? (
        <h3 className="text-sm font-medium text-foreground">
          <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryTitle} />
        </h3>
      ) : null}
      <div className={cn("grid gap-3", showTitle && "mt-3")}>
        <p className="text-sm text-muted-foreground">{sharedWithTeamNote}</p>
        <Field className="min-w-0 gap-1.5">
          <FieldLabel htmlFor={primaryTermId}>
            <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryPrimaryLabel} />
          </FieldLabel>
          <Input
            id={primaryTermId}
            value={primaryTerm}
            onChange={(event) => setPrimaryTerm(event.target.value)}
            disabled={isBusy}
          />
          <GlossaryTermMetadataFields
            value={sourceMetadata}
            onChange={setSourceMetadata}
            disabled={isBusy}
          />
        </Field>
        {translatable ? (
          <Field className="min-w-0 gap-1.5">
            <FieldLabel htmlFor={targetTermId}>
              <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryTargetLabel} />
            </FieldLabel>
            <Input
              id={targetTermId}
              value={targetDraft}
              onChange={(event) => setTargetDraft(event.target.value)}
              disabled={isBusy}
            />
            <GlossaryTermMetadataFields
              value={targetMetadata}
              onChange={setTargetMetadata}
              disabled={isBusy}
            />
          </Field>
        ) : null}
        <Field className="gap-1.5">
          <FieldLabel htmlFor={definitionId}>
            <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryDefinitionLabel} />
          </FieldLabel>
          <Textarea
            id={definitionId}
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
            disabled={isBusy}
            rows={2}
            className="min-h-12"
          />
        </Field>
        <label className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={translatable}
            onCheckedChange={(checked) => setTranslatable(checked === true)}
            disabled={isBusy}
          />
          <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryTranslatableLabel} />
        </label>
        <div className="flex items-center justify-between gap-3">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={isBusy}
                  role="combobox"
                  aria-expanded={pickerOpen}
                  aria-haspopup="listbox"
                  aria-label={intl.formatMessage(
                    catIntelligencePanelMessages.addToGlossaryPickerLabel,
                  )}
                  className={cn(
                    badgeVariants({ variant: "outline" }),
                    "h-5 max-w-[min(100%,12rem)] cursor-pointer gap-1 px-2 py-0.5 text-xs font-medium",
                  )}
                />
              }
            >
              <span className="min-w-0 truncate">{glossaryName}</span>
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3" />
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              className="w-max min-w-[12rem] max-w-[min(22rem,calc(100vw-2rem))] gap-0 p-0"
            >
              <Command>
                <CommandInput
                  placeholder={intl.formatMessage(
                    catIntelligencePanelMessages.addToGlossaryPickerSearchPlaceholder,
                  )}
                />
                <CommandList
                  label={intl.formatMessage(catIntelligencePanelMessages.addToGlossaryPickerLabel)}
                >
                  <CommandEmpty>
                    {intl.formatMessage(catIntelligencePanelMessages.addToGlossaryPickerEmpty)}
                  </CommandEmpty>
                  {glossaries.length > 0 ? (
                    <CommandGroup>
                      {glossaries.map((glossary) => (
                        <CommandItem
                          key={glossary.id}
                          value={`${glossary.id} ${glossary.name}`}
                          data-checked={selectedGlossary?.id === glossary.id || undefined}
                          onSelect={() => {
                            setSelectedGlossaryId(glossary.id);
                            setPickerOpen(false);
                          }}
                        >
                          {glossary.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null}
                  {canCreate ? (
                    <>
                      {glossaries.length > 0 ? <CommandSeparator /> : null}
                      <CommandGroup>
                        <CommandItem
                          value={`${CREATE_TEAM_GLOSSARY_VALUE} ${intl.formatMessage(
                            catIntelligencePanelMessages.addToGlossaryCreateOption,
                          )}`}
                          onSelect={openCreateDialog}
                        >
                          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
                          <FormattedMessage
                            {...catIntelligencePanelMessages.addToGlossaryCreateOption}
                          />
                        </CommandItem>
                      </CommandGroup>
                    </>
                  ) : null}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit || isBusy}
            onClick={() => addConcept.mutate()}
          >
            <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryAction} />
          </Button>
        </div>
      </div>
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryCreateDialogTitle} />
            </DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field className="gap-1.5">
              <FieldLabel htmlFor={newGlossaryNameId}>
                <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryCreateNameLabel} />
              </FieldLabel>
              <Input
                id={newGlossaryNameId}
                value={newGlossaryName}
                onChange={(event) => setNewGlossaryName(event.target.value)}
                disabled={createGlossary.isPending}
                placeholder={defaultGlossaryName}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={createGlossary.isPending}
              onClick={() => setIsCreateDialogOpen(false)}
            >
              <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryCreateCancel} />
            </Button>
            <Button
              type="button"
              disabled={createGlossary.isPending || !newGlossaryName.trim() || !canCreate}
              onClick={() => createGlossary.mutate()}
            >
              <FormattedMessage {...catIntelligencePanelMessages.addToGlossaryCreateAction} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
