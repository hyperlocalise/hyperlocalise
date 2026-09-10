"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Column } from "@/components/ui/layout/column";
import { Columns } from "@/components/ui/layout/columns";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import { hyperlabMessages as messages } from "./hyperlab.messages";
import {
  hyperlabClient,
  hyperlabQueryKeys,
  readHyperlabJson,
  type HyperlabAudience,
  type HyperlabClientKey,
  type HyperlabExperiment,
  type HyperlabFlag,
} from "./hyperlab-api";
import {
  addMonthsIsoDate,
  timezoneSelectItems,
  todayIsoDate,
  wallTimeToIso,
} from "./hyperlab-schedule";

function CreateDialogTrigger({ children }: { children: ReactNode }) {
  return (
    <DialogTrigger render={<Button type="button" />}>
      <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} data-icon="inline-start" />
      {children}
    </DialogTrigger>
  );
}

export function HyperlabCreateExperimentDialog({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const defaultZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"toggle" | "ab">("toggle");
  const [startDate, setStartDate] = useState(() => todayIsoDate(defaultZone));
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(() => addMonthsIsoDate(todayIsoDate(defaultZone), 3));
  const [endTime, setEndTime] = useState("17:00");
  const [zone, setZone] = useState(defaultZone);

  const timezoneItems = timezoneSelectItems(zone);
  const kindItems = [
    { value: "toggle", label: intl.formatMessage(messages.experimentKindToggle) },
    { value: "ab", label: intl.formatMessage(messages.experimentKindAb) },
  ];

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.experiments.$post({
        param: { organizationSlug },
        json: {
          name,
          kind,
          timezone: zone,
          startAt: wallTimeToIso(startDate, startTime, zone),
          endAt: wallTimeToIso(endDate, endTime, zone),
        },
      });
      const body = await readHyperlabJson<{ experiment: HyperlabExperiment }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      const variantResponse = await client.experiments[":experimentId"].variants.$post({
        param: { organizationSlug, experimentId: body.experiment.id },
        json: {
          key: "control",
          isControl: true,
          rolloutPercentage: kind === "toggle" ? 10000 : 5000,
        },
      });
      await readHyperlabJson(variantResponse, intl.formatMessage(messages.loadError));
      return body.experiment;
    },
    onSuccess: async (experiment) => {
      toast.success(intl.formatMessage(messages.createSuccess));
      setOpen(false);
      setName("");
      await queryClient.invalidateQueries({
        queryKey: hyperlabQueryKeys.experiments(organizationSlug),
      });
      router.push(`/org/${organizationSlug}/hyperlab/experiments/${experiment.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <CreateDialogTrigger>
        <FormattedMessage {...messages.createExperiment} />
      </CreateDialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.createExperimentTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.createExperimentDescription} />
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="hyperlab-new-experiment-name">
                <FormattedMessage {...messages.experimentNameLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-new-experiment-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={intl.formatMessage(messages.experimentNamePlaceholder)}
                required
              />
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...messages.experimentKindLabel} />
              </FieldLabel>
              <Select
                value={kind}
                items={kindItems}
                onValueChange={(next) => {
                  if (next === "toggle" || next === "ab") {
                    setKind(next);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {kindItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {kind === "toggle" ? (
                  <FormattedMessage {...messages.experimentKindToggleHint} />
                ) : (
                  <FormattedMessage {...messages.experimentKindAbHint} />
                )}
              </FieldDescription>
            </Field>
            <Columns spacing="1.5u" collapseBelow="small">
              <Column width="1/3">
                <Field>
                  <FieldLabel htmlFor="hyperlab-new-start-date">
                    <FormattedMessage {...messages.startDateLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-new-start-date"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                  />
                </Field>
              </Column>
              <Column width="1/3">
                <Field>
                  <FieldLabel htmlFor="hyperlab-new-start-time">
                    <FormattedMessage {...messages.startTimeLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-new-start-time"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    required
                  />
                </Field>
              </Column>
              <Column width="1/3">
                <Field>
                  <FieldLabel>
                    <FormattedMessage {...messages.timezoneLabel} />
                  </FieldLabel>
                  <Select
                    value={zone}
                    items={timezoneItems}
                    onValueChange={(next) => {
                      if (next) {
                        setZone(next);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {timezoneItems.map((item) => (
                          <SelectItem key={item.value} value={item.value} label={item.label}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </Column>
            </Columns>
            <Columns spacing="1.5u" collapseBelow="small">
              <Column width="1/3">
                <Field>
                  <FieldLabel htmlFor="hyperlab-new-end-date">
                    <FormattedMessage {...messages.endDateLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-new-end-date"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                  />
                </Field>
              </Column>
              <Column width="1/3">
                <Field>
                  <FieldLabel htmlFor="hyperlab-new-end-time">
                    <FormattedMessage {...messages.endTimeLabel} />
                  </FieldLabel>
                  <Input
                    id="hyperlab-new-end-time"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    required
                  />
                </Field>
              </Column>
            </Columns>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage
                {...(createMutation.isPending ? messages.creating : messages.createExperiment)}
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HyperlabCreateFlagDialog({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<"experiment" | "config">("experiment");
  const [description, setDescription] = useState("");
  const kindItems = [
    { value: "experiment", label: intl.formatMessage(messages.flagKindExperiment) },
    { value: "config", label: intl.formatMessage(messages.flagKindConfig) },
  ];

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.flags.$post({
        param: { organizationSlug },
        json: { key, kind, description: description || undefined },
      });
      const body = await readHyperlabJson<{ flag: HyperlabFlag }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.flag;
    },
    onSuccess: async (flag) => {
      toast.success(intl.formatMessage(messages.createSuccess));
      setOpen(false);
      setKey("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: hyperlabQueryKeys.flags(organizationSlug) });
      router.push(`/org/${organizationSlug}/hyperlab/flags/${flag.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <CreateDialogTrigger>
        <FormattedMessage {...messages.createFlag} />
      </CreateDialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.createFlagTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.createFlagDescription} />
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="hyperlab-new-flag-key">
                <FormattedMessage {...messages.flagKeyLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-new-flag-key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="japan-checkout-cta"
                required
              />
              <FieldDescription>
                <FormattedMessage {...messages.flagKeyHint} />
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>
                <FormattedMessage {...messages.flagKindLabel} />
              </FieldLabel>
              <Select
                value={kind}
                items={kindItems}
                onValueChange={(next) => {
                  if (next === "experiment" || next === "config") {
                    setKind(next);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {kindItems.map((item) => (
                      <SelectItem key={item.value} value={item.value} label={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                <FormattedMessage {...messages.flagKindHint} />
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="hyperlab-new-flag-note">
                <FormattedMessage {...messages.flagDescriptionLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-new-flag-note"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={!key.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage
                {...(createMutation.isPending ? messages.creating : messages.createFlag)}
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HyperlabCreateAudienceDialog({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const router = useRouter();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.audiences.$post({
        param: { organizationSlug },
        json: { name, description: description || undefined },
      });
      const body = await readHyperlabJson<{ audience: HyperlabAudience }>(
        response,
        intl.formatMessage(messages.loadError),
      );
      return body.audience;
    },
    onSuccess: async (audience) => {
      toast.success(intl.formatMessage(messages.createSuccess));
      setOpen(false);
      setName("");
      setDescription("");
      await queryClient.invalidateQueries({
        queryKey: hyperlabQueryKeys.audiences(organizationSlug),
      });
      router.push(`/org/${organizationSlug}/hyperlab/audiences/${audience.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <CreateDialogTrigger>
        <FormattedMessage {...messages.createAudience} />
      </CreateDialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.createAudienceTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.createAudienceDescription} />
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="hyperlab-new-audience-name">
                <FormattedMessage {...messages.audienceNameLabel} />
              </FieldLabel>
              <Input
                id="hyperlab-new-audience-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={intl.formatMessage(messages.audienceNamePlaceholder)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hyperlab-new-audience-note">
                <FormattedMessage {...messages.audienceDescriptionLabel} />
              </FieldLabel>
              <Textarea
                id="hyperlab-new-audience-note"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage
                {...(createMutation.isPending ? messages.creating : messages.createAudience)}
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HyperlabCreateKeyDialog({
  organizationSlug,
  onCreated,
}: {
  organizationSlug: string;
  onCreated: (secret: string) => void;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const client = hyperlabClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await client.keys.$post({
        param: { organizationSlug },
        json: { name },
      });
      return readHyperlabJson<{ key: HyperlabClientKey }>(
        response,
        intl.formatMessage(messages.loadError),
      );
    },
    onSuccess: async (body) => {
      toast.success(intl.formatMessage(messages.createSuccess));
      setOpen(false);
      setName("");
      onCreated(body.key.secret ?? "");
      await queryClient.invalidateQueries({ queryKey: hyperlabQueryKeys.keys(organizationSlug) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : intl.formatMessage(messages.loadError));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <CreateDialogTrigger>
        <FormattedMessage {...messages.createKey} />
      </CreateDialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.createKeyTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.createKeyDescription} />
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="hyperlab-new-key-name">
              <FormattedMessage {...messages.keyNameLabel} />
            </FieldLabel>
            <Input
              id="hyperlab-new-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={intl.formatMessage(messages.keyNamePlaceholder)}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Spinner data-icon="inline-start" /> : null}
              <FormattedMessage
                {...(createMutation.isPending ? messages.creating : messages.createKey)}
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
