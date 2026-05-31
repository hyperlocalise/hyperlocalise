"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

import { ProjectSourceLocalePicker, ProjectTargetLocalesPicker } from "./project-locale-picker";
import {
  projectFormHasErrors,
  projectFormRequiresLocales,
  validateProjectForm,
  type ProjectFormErrors,
  type ProjectFormValues,
} from "./project-form";
import type { ProjectListRow } from "./project-list";

export function ProjectDialog({
  open,
  title,
  description,
  mode,
  projectSource = "native",
  initialValues,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  mode: "create" | "edit";
  projectSource?: ProjectListRow["source"];
  initialValues: ProjectFormValues;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProjectFormValues) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(initialValues);
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const nameId = useId();
  const nameCountId = useId();
  const descriptionId = useId();
  const descriptionCountId = useId();
  const contextId = useId();
  const contextCountId = useId();

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setErrors({});
    }
  }, [initialValues, open]);

  const showLocaleFields = projectFormRequiresLocales(mode, projectSource);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateProjectForm(values, { requireLocales: showLocaleFields });
    setErrors(nextErrors);

    if (projectFormHasErrors(nextErrors)) {
      return;
    }

    onSubmit(values);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSaving) {
          return;
        }

        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="rounded-xl border border-foreground/10 bg-background text-foreground sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle className="text-foreground">{title}</DialogTitle>
            <DialogDescription className="text-foreground/52">{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field className="gap-1.5">
              <FieldLabel htmlFor={nameId}>Name</FieldLabel>
              <Input
                id={nameId}
                value={values.name}
                onChange={(event) => {
                  setValues((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={nameCountId}
                disabled={isSaving}
                placeholder="Marketing site launch"
                className="border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
              />
              <div className="flex items-center justify-between gap-2">
                <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
                <span
                  id={nameCountId}
                  className="ml-auto tabular-nums text-[10px] font-medium text-foreground/32"
                >
                  {values.name.length} / 200
                </span>
              </div>
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
              <Textarea
                id={descriptionId}
                value={values.description}
                onChange={(event) => {
                  setValues((current) => ({ ...current, description: event.target.value }));
                }}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={descriptionCountId}
                disabled={isSaving}
                placeholder="Project scope, release, or ownership notes"
                className="min-h-24 border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
              />
              <div className="flex items-center justify-between gap-2">
                <FieldError
                  errors={errors.description ? [{ message: errors.description }] : undefined}
                />
                <span
                  id={descriptionCountId}
                  className="ml-auto tabular-nums text-[10px] font-medium text-foreground/32"
                >
                  {values.description.length.toLocaleString()} / 10,000
                </span>
              </div>
            </Field>

            {showLocaleFields ? (
              <>
                <ProjectSourceLocalePicker
                  value={values.sourceLocale}
                  onChange={(sourceLocale) => {
                    setValues((current) => ({ ...current, sourceLocale }));
                  }}
                  disabled={isSaving}
                  error={errors.sourceLocale}
                />
                <ProjectTargetLocalesPicker
                  value={values.targetLocales}
                  sourceLocale={values.sourceLocale}
                  onChange={(targetLocales) => {
                    setValues((current) => ({ ...current, targetLocales }));
                  }}
                  disabled={isSaving}
                  error={errors.targetLocales}
                />
              </>
            ) : null}

            <Field className="gap-1.5">
              <FieldLabel htmlFor={contextId}>Translation context</FieldLabel>
              <Textarea
                id={contextId}
                value={values.translationContext}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    translationContext: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(errors.translationContext)}
                aria-describedby={contextCountId}
                disabled={isSaving}
                placeholder="Tone, terminology, product rules, or locale guidance"
                className="min-h-28 border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
              />
              <div className="flex items-center justify-between gap-2">
                <FieldError
                  errors={
                    errors.translationContext ? [{ message: errors.translationContext }] : undefined
                  }
                />
                <span
                  id={contextCountId}
                  className="ml-auto tabular-nums text-[10px] font-medium text-foreground/32"
                >
                  {values.translationContext.length.toLocaleString()} / 20,000
                </span>
              </div>
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Spinner /> : <HugeiconsIcon icon={SaveIcon} strokeWidth={1.8} />}
              {isSaving ? "Saving..." : "Save project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
