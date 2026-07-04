"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import {
  createEmptyTeamForm,
  suggestTeamSlug,
  teamFormHasErrors,
  validateTeamForm,
  type TeamFormErrors,
  type TeamFormValues,
} from "./team-form";

export function TeamDialog({
  open,
  mode,
  title,
  description,
  initialValues,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  title: string;
  description: string;
  initialValues?: TeamFormValues;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: TeamFormValues) => void;
}) {
  const [values, setValues] = useState<TeamFormValues>(initialValues ?? createEmptyTeamForm());
  const [errors, setErrors] = useState<TeamFormErrors>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const nameId = useId();
  const slugId = useId();

  useEffect(() => {
    if (open) {
      setValues(initialValues ?? createEmptyTeamForm());
      setErrors({});
      setSlugTouched(mode === "edit");
    }
  }, [initialValues, mode, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateTeamForm(values, mode);
    setErrors(nextErrors);

    if (teamFormHasErrors(nextErrors)) {
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
      <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor={nameId}>Name</FieldLabel>
            <Input
              id={nameId}
              value={values.name}
              onChange={(event) => {
                const name = event.target.value;
                setValues((current) => ({
                  name,
                  slug: mode === "create" && !slugTouched ? suggestTeamSlug(name) : current.slug,
                }));
              }}
              aria-invalid={Boolean(errors.name)}
              disabled={isSaving}
              placeholder="Localization"
              className="border-border bg-muted"
            />
            <FieldError errors={errors.name ? [{ message: errors.name }] : undefined} />
          </Field>

          <Field>
            <FieldLabel htmlFor={slugId}>Slug</FieldLabel>
            <Input
              id={slugId}
              value={values.slug}
              onChange={(event) => {
                setSlugTouched(true);
                setValues((current) => ({ ...current, slug: event.target.value }));
              }}
              aria-invalid={Boolean(errors.slug)}
              disabled={isSaving}
              placeholder="localization"
              className="border-border bg-muted"
            />
            <FieldDescription>
              Used in URLs and project scoping. Lowercase letters, numbers, and hyphens only.
            </FieldDescription>
            <FieldError errors={errors.slug ? [{ message: errors.slug }] : undefined} />
          </Field>

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
              {isSaving ? "Saving..." : mode === "create" ? "Create team" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
