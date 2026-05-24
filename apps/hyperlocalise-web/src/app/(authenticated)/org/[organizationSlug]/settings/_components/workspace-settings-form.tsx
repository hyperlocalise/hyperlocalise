"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Edit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api-client-instance";

function isStaleOrganizationSlugBody(
  body: unknown,
): body is { error: "stale_organization_slug"; details: { redirectTo: string } } {
  return (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    body.error === "stale_organization_slug" &&
    "details" in body &&
    body.details !== null &&
    typeof body.details === "object" &&
    "redirectTo" in body.details &&
    typeof body.details.redirectTo === "string"
  );
}

function readWorkspaceErrorBody(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "message" in body) {
    const message = body.message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  if (body && typeof body === "object" && "error" in body) {
    const error = body.error;
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
  }

  return fallback;
}

export function WorkspaceSettingsForm({
  canUpdateWorkspace,
  organizationName,
  organizationSlug,
}: {
  canUpdateWorkspace: boolean;
  organizationName: string;
  organizationSlug: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(organizationName);
  const [slug, setSlug] = useState(organizationSlug);

  const updateWorkspace = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      const trimmedSlug = slug.trim().toLowerCase();
      const response = await apiClient.api.orgs[":organizationSlug"].workspace.$patch({
        param: { organizationSlug },
        json: {
          name: trimmedName,
          slug: trimmedSlug,
        },
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 403 && isStaleOrganizationSlugBody(body)) {
          router.replace(body.details.redirectTo);
          router.refresh();
          return null;
        }

        throw new Error(readWorkspaceErrorBody(body, "Failed to update workspace"));
      }

      return body as {
        workspace: { name: string; slug: string | null };
        redirectTo: string;
      };
    },
    onSuccess: (data) => {
      if (!data) {
        return;
      }

      toast.success("Workspace updated");
      const nextSlug = data.workspace.slug ?? organizationSlug;
      router.replace(data.redirectTo);
      router.refresh();
      setName(data.workspace.name);
      setSlug(nextSlug);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const hasChanges =
    name.trim() !== organizationName || slug.trim().toLowerCase() !== organizationSlug;

  return (
    <form
      className="grid gap-4 px-5 py-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (hasChanges) {
          updateWorkspace.mutate();
        }
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="workspace-name" className="text-xs font-medium text-foreground/48">
          Organization name
        </Label>
        <Input
          id="workspace-name"
          value={name}
          readOnly={!canUpdateWorkspace}
          onChange={(event) => setName(event.target.value)}
          className="h-10 rounded-lg border-foreground/10 bg-foreground/4 text-foreground"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="workspace-slug" className="text-xs font-medium text-foreground/48">
          Workspace slug
        </Label>
        <Input
          id="workspace-slug"
          value={slug}
          readOnly={!canUpdateWorkspace}
          onChange={(event) => setSlug(event.target.value)}
          className="h-10 rounded-lg border-foreground/10 bg-foreground/4 text-foreground"
        />
      </div>
      {canUpdateWorkspace ? (
        <Button type="submit" disabled={!hasChanges || updateWorkspace.isPending}>
          <HugeiconsIcon icon={Edit02Icon} strokeWidth={1.8} />
          Save
        </Button>
      ) : null}
    </form>
  );
}
