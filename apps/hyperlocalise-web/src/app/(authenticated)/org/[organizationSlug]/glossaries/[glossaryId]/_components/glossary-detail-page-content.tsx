"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft01Icon, BookOpenTextIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type {
  GlossaryProjectRecord,
  GlossaryRecord,
  GlossaryTermRecord,
} from "@/api/routes/glossary/glossary.schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyH1, TypographyP } from "@/components/ui/typography";
import { readApiError } from "@/lib/api-error";
import { apiClient } from "@/lib/api-client-instance";

type TermForm = {
  sourceTerm: string;
  targetTerm: string;
  description: string;
  partOfSpeech: string;
};

const emptyTermForm: TermForm = {
  sourceTerm: "",
  targetTerm: "",
  description: "",
  partOfSpeech: "",
};

export function GlossaryDetailPageContent({
  organizationSlug,
  glossaryId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  canManageGlossaries: boolean;
}) {
  const queryClient = useQueryClient();
  const [termForm, setTermForm] = useState<TermForm>(emptyTermForm);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const glossaryQuery = useQuery({
    queryKey: ["glossary", organizationSlug, glossaryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[":glossaryId"].$get(
        {
          param: { organizationSlug, glossaryId },
        },
      );
      if (!response.ok) throw new Error(await readApiError(response, "Unable to load glossary"));
      const body = await response.json();
      return body.glossary as GlossaryRecord;
    },
  });

  const termsQuery = useQuery({
    queryKey: ["glossary-terms", organizationSlug, glossaryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].terms.$get({ param: { organizationSlug, glossaryId } });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to load terms"));
      const body = await response.json();
      return body.glossaryTerms as GlossaryTermRecord[];
    },
  });

  const attachedProjectsQuery = useQuery({
    queryKey: ["glossary-projects", organizationSlug, glossaryId],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects.$get({ param: { organizationSlug, glossaryId } });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to load projects"));
      const body = await response.json();
      return body.projects as GlossaryProjectRecord[];
    },
  });

  const projectsQuery = useQuery({
    queryKey: ["translation-projects", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (response.status !== 200)
        throw new Error(await readApiError(response, "Unable to load projects"));
      const body = await response.json();
      return body.projects;
    },
  });

  const invalidateTerms = () =>
    queryClient.invalidateQueries({ queryKey: ["glossary-terms", organizationSlug, glossaryId] });
  const invalidateProjects = () =>
    queryClient.invalidateQueries({
      queryKey: ["glossary-projects", organizationSlug, glossaryId],
    });

  const saveTerm = useMutation({
    mutationFn: async (values: TermForm) => {
      const payload = {
        sourceTerm: values.sourceTerm.trim(),
        targetTerm: values.targetTerm.trim(),
        description: values.description.trim(),
        partOfSpeech: values.partOfSpeech.trim(),
        caseSensitive: false,
        forbidden: false,
      };
      const response = editingTermId
        ? await apiClient.api.orgs[":organizationSlug"].glossaries[":glossaryId"].terms[
            ":termId"
          ].$patch({
            param: { organizationSlug, glossaryId, termId: editingTermId },
            json: payload,
          })
        : await apiClient.api.orgs[":organizationSlug"].glossaries[":glossaryId"].terms.$post({
            param: { organizationSlug, glossaryId },
            json: payload,
          });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to save term"));
      return response.json();
    },
    onSuccess: async () => {
      await invalidateTerms();
      setTermForm(emptyTermForm);
      setEditingTermId(null);
      toast.success(editingTermId ? "Term updated" : "Term added");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteTerm = useMutation({
    mutationFn: async (termId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].terms[":termId"].$delete({ param: { organizationSlug, glossaryId, termId } });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to delete term"));
    },
    onSuccess: async () => {
      await invalidateTerms();
      toast.success("Term deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const importTerms = useMutation({
    mutationFn: async (file: File) => {
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".tbx") ? "tbx" : "csv";
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].terms["import"].$post({
        param: { organizationSlug, glossaryId },
        json: { format, content },
      });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to import terms"));
      return response.json();
    },
    onSuccess: async (body) => {
      await invalidateTerms();
      toast.success(`Imported ${body.imported ?? 0} terms`);
    },
    onError: (error) => toast.error(error.message),
  });

  const attachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects.$post({
        param: { organizationSlug, glossaryId },
        json: { projectId, priority: 0 },
      });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to assign project"));
      return response.json();
    },
    onSuccess: async () => {
      await invalidateProjects();
      setSelectedProjectId("");
      toast.success("Project assigned");
    },
    onError: (error) => toast.error(error.message),
  });

  const detachProject = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"].glossaries[
        ":glossaryId"
      ].projects[":projectId"].$delete({ param: { organizationSlug, glossaryId, projectId } });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to remove project"));
    },
    onSuccess: async () => {
      await invalidateProjects();
      toast.success("Project removed");
    },
    onError: (error) => toast.error(error.message),
  });

  const glossary = glossaryQuery.data;
  const isNative = glossary?.source === "native";
  const canEdit = canManageGlossaries && isNative;
  const attachedProjectIds = useMemo(
    () => new Set((attachedProjectsQuery.data ?? []).map((project) => project.projectId)),
    [attachedProjectsQuery.data],
  );
  const availableProjects = (projectsQuery.data ?? []).filter(
    (project) => !attachedProjectIds.has(project.id),
  );

  if (glossaryQuery.isLoading) {
    return (
      <TypographyP className="py-8 text-sm text-foreground/52">Loading glossary...</TypographyP>
    );
  }
  if (!glossary) {
    return (
      <TypographyP className="py-8 text-sm text-foreground/52">Glossary not found.</TypographyP>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Link
        href={`/org/${organizationSlug}/glossaries`}
        className="inline-flex w-fit items-center gap-2 text-sm text-foreground/58 hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" strokeWidth={1.8} />
        Glossaries
      </Link>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={BookOpenTextIcon}
            className="size-5 text-foreground/48"
            strokeWidth={1.8}
          />
          <Badge variant="outline">{glossary.source === "native" ? "Workspace" : "Provider"}</Badge>
          <Badge variant="outline">
            {glossary.sourceLocale} → {glossary.targetLocale}
          </Badge>
        </div>
        <TypographyH1 className="font-sans text-2xl font-medium">{glossary.name}</TypographyH1>
        <TypographyP className="max-w-2xl text-sm leading-6 text-foreground/58">
          {glossary.description || "Manage terms and assign this glossary to projects."}
        </TypographyP>
      </section>

      <section className="grid gap-4 rounded-lg border border-foreground/8 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <TypographyP className="text-sm font-medium text-foreground">Terms</TypographyP>
            <TypographyP className="text-xs text-foreground/52">
              Add terms manually or import CSV/TBX files.
            </TypographyP>
          </div>
          {canEdit ? (
            <Input
              type="file"
              accept=".csv,.tbx,text/csv"
              className="max-w-xs"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) importTerms.mutate(file);
                event.currentTarget.value = "";
              }}
            />
          ) : null}
        </div>

        {canEdit ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field className="gap-1.5">
              <FieldLabel>Source term</FieldLabel>
              <Input
                value={termForm.sourceTerm}
                onChange={(event) =>
                  setTermForm((current) => ({ ...current, sourceTerm: event.target.value }))
                }
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>Target term</FieldLabel>
              <Input
                value={termForm.targetTerm}
                onChange={(event) =>
                  setTermForm((current) => ({ ...current, targetTerm: event.target.value }))
                }
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>Part of speech</FieldLabel>
              <Input
                value={termForm.partOfSpeech}
                onChange={(event) =>
                  setTermForm((current) => ({ ...current, partOfSpeech: event.target.value }))
                }
              />
            </Field>
            <Field className="gap-1.5">
              <FieldLabel>Description</FieldLabel>
              <Input
                value={termForm.description}
                onChange={(event) =>
                  setTermForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
            <div className="flex gap-2 md:col-span-2">
              <Button
                type="button"
                disabled={
                  !termForm.sourceTerm.trim() || !termForm.targetTerm.trim() || saveTerm.isPending
                }
                onClick={() => saveTerm.mutate(termForm)}
              >
                {editingTermId ? "Update term" : "Add term"}
              </Button>
              {editingTermId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingTermId(null);
                    setTermForm(emptyTermForm);
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-foreground/8">
          {(termsQuery.data ?? []).map((term) => (
            <div
              key={term.id}
              className="grid gap-2 border-b border-foreground/8 px-4 py-3 last:border-b-0 md:grid-cols-[1fr_1fr_auto] md:items-center"
            >
              <div>
                <TypographyP className="text-sm font-medium">{term.sourceTerm}</TypographyP>
                <TypographyP className="text-xs text-foreground/48">
                  {term.description || term.partOfSpeech}
                </TypographyP>
              </div>
              <TypographyP className="text-sm text-foreground/72">{term.targetTerm}</TypographyP>
              {canEdit ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingTermId(term.id);
                      setTermForm({
                        sourceTerm: term.sourceTerm,
                        targetTerm: term.targetTerm,
                        description: term.description,
                        partOfSpeech: term.partOfSpeech ?? "",
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteTerm.mutate(term.id)}
                  >
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {termsQuery.isSuccess && (termsQuery.data ?? []).length === 0 ? (
            <TypographyP className="px-4 py-6 text-sm text-foreground/52">
              No terms yet.
            </TypographyP>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-foreground/8 p-4">
        <div>
          <TypographyP className="text-sm font-medium text-foreground">
            Assigned projects
          </TypographyP>
          <TypographyP className="text-xs text-foreground/52">
            This glossary is used only by the projects listed here.
          </TypographyP>
        </div>
        {canEdit ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={selectedProjectId}
              onValueChange={(value) => setSelectedProjectId(value ?? "")}
            >
              <SelectTrigger className="sm:max-w-sm">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={!selectedProjectId || attachProject.isPending}
              onClick={() => attachProject.mutate(selectedProjectId)}
            >
              Assign to project
            </Button>
          </div>
        ) : null}
        <div className="grid gap-2">
          {(attachedProjectsQuery.data ?? []).map((project) => (
            <div
              key={project.projectId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/8 px-3 py-2"
            >
              <Link
                href={`/org/${organizationSlug}/projects/${project.projectId}`}
                className="text-sm font-medium text-foreground hover:underline"
              >
                {project.projectName}
              </Link>
              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => detachProject.mutate(project.projectId)}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          {attachedProjectsQuery.isSuccess && (attachedProjectsQuery.data ?? []).length === 0 ? (
            <TypographyP className="text-sm text-foreground/52">
              No projects assigned yet.
            </TypographyP>
          ) : null}
        </div>
      </section>
    </main>
  );
}
