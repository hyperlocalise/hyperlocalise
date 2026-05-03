import type { ProjectListRow } from "./project-list";

export type ProjectFormValues = {
  name: string;
  description: string;
  translationContext: string;
};

export type ProjectFormErrors = Partial<Record<keyof ProjectFormValues, string>>;

export function createEmptyProjectForm(): ProjectFormValues {
  return {
    name: "",
    description: "",
    translationContext: "",
  };
}

export function createProjectFormFromRow(project: ProjectListRow): ProjectFormValues {
  return {
    name: project.name,
    description: project.descriptionValue,
    translationContext: project.translationContextValue,
  };
}

export function validateProjectForm(values: ProjectFormValues): ProjectFormErrors {
  const errors: ProjectFormErrors = {};
  const name = values.name.trim();

  if (!name) {
    errors.name = "Project name is required.";
  } else if (name.length > 200) {
    errors.name = "Project name must be 200 characters or fewer.";
  }

  if (values.description.trim().length > 10_000) {
    errors.description = "Description must be 10,000 characters or fewer.";
  }

  if (values.translationContext.trim().length > 20_000) {
    errors.translationContext = "Translation context must be 20,000 characters or fewer.";
  }

  return errors;
}

export function projectFormHasErrors(errors: ProjectFormErrors) {
  return Object.keys(errors).length > 0;
}

export function toProjectPayload(values: ProjectFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    translationContext: values.translationContext.trim(),
  };
}
