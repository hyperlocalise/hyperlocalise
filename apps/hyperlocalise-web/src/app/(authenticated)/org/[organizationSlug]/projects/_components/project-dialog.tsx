"use client";

import { type FormEvent, useEffect, useState } from "react";
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

import {
  projectFormHasErrors,
  validateProjectForm,
  type ProjectFormErrors,
  type ProjectFormValues,
} from "./project-form";

export function ProjectDialog({
  open,
  title,
  description,
  initialValues,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  title: string;
  description: string;
  initialValues: ProjectFormValues;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProjectFormValues) => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(initialValues);
  const [errors, setErrors] = useState<ProjectFormErrors>({});

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setErrors({});
    }
  }, [initialValues, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateProjectForm(values);
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
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Name</span>
              <Input
                value={values.name}
                onChange={(event) => {
                  setValues((current) => ({ ...current, name: event.target.value }));
                }}
                aria-invalid={Boolean(errors.name)}
                disabled={isSaving}
                placeholder="Marketing site launch"
                className="border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
              />
              {errors.name ? <span className="text-xs text-flame-100">{errors.name}</span> : null}
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Description</span>
              <Textarea
                value={values.description}
                onChange={(event) => {
                  setValues((current) => ({ ...current, description: event.target.value }));
                }}
                aria-invalid={Boolean(errors.description)}
                disabled={isSaving}
                placeholder="Project scope, release, or ownership notes"
                className="min-h-24 border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
              />
              {errors.description ? (
                <span className="text-xs text-flame-100">{errors.description}</span>
              ) : null}
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Translation context</span>
              <Textarea
                value={values.translationContext}
                onChange={(event) => {
                  setValues((current) => ({
                    ...current,
                    translationContext: event.target.value,
                  }));
                }}
                aria-invalid={Boolean(errors.translationContext)}
                disabled={isSaving}
                placeholder="Tone, terminology, product rules, or locale guidance"
                className="min-h-28 border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
              />
              {errors.translationContext ? (
                <span className="text-xs text-flame-100">{errors.translationContext}</span>
              ) : null}
            </label>
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
