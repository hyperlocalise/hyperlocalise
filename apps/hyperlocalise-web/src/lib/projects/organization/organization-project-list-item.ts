import type { Project } from "@/lib/database/types";

export type OrganizationProjectListItem = Project & {
  openJobCount: number;
};
