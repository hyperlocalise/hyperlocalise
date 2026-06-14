"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { TeamRole } from "@/api/routes/team/team.schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

import type { OrganizationMemberDirectoryEntry } from "./teams-api";
import { getTeamRoleDescription, getTeamRoleLabel } from "./teams-settings-view-model";

const teamRoles: TeamRole[] = ["member", "manager"];

export function AddTeamMemberDialog({
  open,
  assignableMembers,
  isSaving,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  assignableMembers: OrganizationMemberDirectoryEntry[];
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { workosUserId: string; role: TeamRole }) => void;
}) {
  const [workosUserId, setWorkosUserId] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const memberId = useId();

  useEffect(() => {
    if (open) {
      setWorkosUserId(assignableMembers[0]?.workosUserId ?? "");
      setRole("member");
    }
  }, [assignableMembers, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workosUserId) {
      return;
    }

    onSubmit({ workosUserId, role });
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
      <DialogContent className="border-foreground/10 bg-background text-foreground sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              Assign an existing workspace member to this team. People must already belong to the
              workspace before they can join a team.
            </DialogDescription>
          </DialogHeader>

          {assignableMembers.length === 0 ? (
            <p className="text-sm text-foreground/52">
              Everyone in this workspace is already on the team.
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={memberId}>Member</FieldLabel>
                <Select
                  value={workosUserId}
                  onValueChange={(value) => {
                    if (value) {
                      setWorkosUserId(value);
                    }
                  }}
                  disabled={isSaving}
                >
                  <SelectTrigger id={memberId} className="border-foreground/10 bg-foreground/4">
                    <SelectValue placeholder="Select a member" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableMembers.map((member) => (
                      <SelectItem key={member.workosUserId} value={member.workosUserId}>
                        {member.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel>Role</FieldLabel>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as TeamRole)}
                  disabled={isSaving}
                >
                  <SelectTrigger className="border-foreground/10 bg-foreground/4">
                    <SelectValue>{getTeamRoleLabel(role)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {teamRoles.map((teamRole) => (
                      <SelectItem key={teamRole} value={teamRole}>
                        {getTeamRoleLabel(teamRole)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{getTeamRoleDescription(role)}</FieldDescription>
              </Field>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || assignableMembers.length === 0}>
              {isSaving ? <Spinner /> : <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />}
              {isSaving ? "Adding..." : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
