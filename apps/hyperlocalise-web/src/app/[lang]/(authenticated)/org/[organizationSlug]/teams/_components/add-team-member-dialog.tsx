"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

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

import { addTeamMemberDialogMessages } from "./add-team-member-dialog.messages";
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
  const intl = useIntl();
  const [workosUserId, setWorkosUserId] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const memberId = useId();
  const selectedMemberEmail = assignableMembers.find(
    (member) => member.workosUserId === workosUserId,
  )?.email;

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
      <DialogContent className="border-border bg-background text-foreground sm:max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...addTeamMemberDialogMessages.title} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...addTeamMemberDialogMessages.description} />
            </DialogDescription>
          </DialogHeader>

          {assignableMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <FormattedMessage {...addTeamMemberDialogMessages.everyoneAlreadyOnTeam} />
            </p>
          ) : (
            <>
              <Field>
                <FieldLabel htmlFor={memberId}>
                  <FormattedMessage {...addTeamMemberDialogMessages.memberLabel} />
                </FieldLabel>
                <Select
                  value={workosUserId}
                  onValueChange={(value) => {
                    if (value) {
                      setWorkosUserId(value);
                    }
                  }}
                  disabled={isSaving}
                >
                  <SelectTrigger id={memberId} className="border-border bg-muted">
                    <SelectValue
                      placeholder={intl.formatMessage(
                        addTeamMemberDialogMessages.selectMemberPlaceholder,
                      )}
                    >
                      {selectedMemberEmail}
                    </SelectValue>
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
                <FieldLabel>
                  <FormattedMessage {...addTeamMemberDialogMessages.roleLabel} />
                </FieldLabel>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as TeamRole)}
                  disabled={isSaving}
                >
                  <SelectTrigger className="border-border bg-muted">
                    <SelectValue>{getTeamRoleLabel(role, intl)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {teamRoles.map((teamRole) => (
                      <SelectItem key={teamRole} value={teamRole}>
                        {getTeamRoleLabel(teamRole, intl)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{getTeamRoleDescription(role, intl)}</FieldDescription>
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
              <FormattedMessage {...addTeamMemberDialogMessages.cancel} />
            </Button>
            <Button type="submit" disabled={isSaving || assignableMembers.length === 0}>
              {isSaving ? <Spinner /> : <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />}
              {isSaving ? (
                <FormattedMessage {...addTeamMemberDialogMessages.adding} />
              ) : (
                <FormattedMessage {...addTeamMemberDialogMessages.addMember} />
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
