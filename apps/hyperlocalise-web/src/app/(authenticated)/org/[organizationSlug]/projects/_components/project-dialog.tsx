"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { SaveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { cn } from "@/lib/primitives/cn";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nameId = useId();
  const nameCountId = useId();
  const descriptionId = useId();
  const descriptionCountId = useId();

  useEffect(() => {
    if (open) {
      setValues(initialValues);
      setErrors({});
      setSettingsOpen(Boolean(initialValues.description.trim()));
    }
  }, [initialValues, open]);

  const showLocaleFields = projectFormRequiresLocales(mode, projectSource);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateProjectForm(values, { requireLocales: showLocaleFields });
    setErrors(nextErrors);

    if (nextErrors.description) {
      setSettingsOpen(true);
    }

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
      <DialogContent className="flex max-h-[min(85dvh,40rem)] flex-col gap-0 overflow-hidden rounded-xl border border-foreground/10 bg-background p-0 text-foreground sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 gap-2 border-b border-foreground/8 px-6 pt-6 pe-12 pb-4">
            <DialogTitle className="text-foreground">{title}</DialogTitle>
            <DialogDescription className="text-foreground/52">{description}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-4">
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

            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-full justify-between px-3 text-sm font-medium text-foreground/58 hover:bg-foreground/6 hover:text-foreground"
                  >
                    Settings
                    <ChevronDownIcon
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        settingsOpen && "rotate-180",
                      )}
                      strokeWidth={2}
                    />
                  </Button>
                }
              />
              <CollapsibleContent className="pt-2">
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
                    className="min-h-20 border-foreground/10 bg-foreground/6 text-foreground placeholder:text-foreground/32"
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
              </CollapsibleContent>
            </Collapsible>
          </div>
          <DialogFooter className="shrink-0 border-t border-foreground/8 px-6 pt-4 pb-6">
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
