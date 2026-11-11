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
import { useState } from "react";
import { CheckIcon, CopyIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Row } from "@/components/ui/layout/row";
import { Rows } from "@/components/ui/layout/rows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import {
  JOB_CHANGE_EVENT_TYPES,
  type JobChangeEventType,
} from "@/lib/job-change-events/job-change-events-contract";
import type {
  WebhookDeliverySummary,
  WebhookEndpointSummary,
} from "@/lib/outbound-webhooks/webhook-endpoints";

import { SettingsPageBody, SettingsPageHeader } from "./settings-page-chrome";
import { webhooksPageContentMessages as messages } from "./webhooks-page-content.messages";

const endpointsQueryKey = (organizationSlug: string) => ["webhook-endpoints", organizationSlug];
const deliveriesQueryKey = (organizationSlug: string, endpointId: string) => [
  "webhook-endpoints",
  organizationSlug,
  endpointId,
  "deliveries",
];

const ALL_PROJECTS_VALUE = "all";

type WebhookProjectOption = { id: string; name: string };

function useWebhookProjects(organizationSlug: string) {
  return useQuery({
    queryKey: ["translation-projects", organizationSlug],
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        return [] as WebhookProjectOption[];
      }
      return ((await response.json()).projects ?? []) as WebhookProjectOption[];
    },
  });
}

const EVENT_LABELS: Record<JobChangeEventType, MessageDescriptor> = {
  "job.created": messages.eventCreated,
  "job.status_changed": messages.eventStatusChanged,
  "job.assignee_changed": messages.eventAssigneeChanged,
  "job.due_date_changed": messages.eventDueDateChanged,
  "job.details_changed": messages.eventDetailsChanged,
};

const DELIVERY_STATUS_LABELS: Record<WebhookDeliverySummary["status"], MessageDescriptor> = {
  succeeded: messages.deliverySucceeded,
  pending: messages.deliveryPending,
  failed: messages.deliveryFailed,
};

function endpointsApi() {
  return apiClient.api.orgs[":organizationSlug"]["webhook-endpoints"];
}

export function WebhooksSettingsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const api = endpointsApi();
  const param = { organizationSlug };

  const projectsQuery = useWebhookProjects(organizationSlug);
  const projectNameById = new Map(
    (projectsQuery.data ?? []).map((project) => [project.id, project.name]),
  );

  const endpointsQuery = useQuery({
    queryKey: endpointsQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await api.$get({ param });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.loadFailed));
      }
      return (await response.json()).webhookEndpoints as WebhookEndpointSummary[];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: endpointsQueryKey(organizationSlug) });

  const toggleEndpoint = useMutation({
    mutationFn: async (input: { endpointId: string; enabled: boolean }) => {
      const response = await api[":endpointId"].$patch({
        param: { ...param, endpointId: input.endpointId },
        json: { enabled: input.enabled },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.actionFailed));
      }
    },
    onSuccess: invalidate,
    onError: (error) => toast.error(error.message),
  });

  const sendTest = useMutation({
    mutationFn: async (endpointId: string) => {
      const response = await api[":endpointId"].test.$post({
        param: { ...param, endpointId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.actionFailed));
      }
      return { endpointId, delivery: (await response.json()).webhookDelivery };
    },
    onSuccess: async ({ endpointId, delivery }) => {
      if (delivery.status === "succeeded") {
        toast.success(intl.formatMessage(messages.testSucceeded));
      } else {
        toast.error(
          intl.formatMessage(messages.testFailed, {
            reason: delivery.lastError ?? String(delivery.lastResponseStatus ?? ""),
          }),
        );
      }
      await queryClient.invalidateQueries({
        queryKey: deliveriesQueryKey(organizationSlug, endpointId),
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const rotateSecret = useMutation({
    mutationFn: async (endpointId: string) => {
      const response = await api[":endpointId"]["rotate-secret"].$post({
        param: { ...param, endpointId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.actionFailed));
      }
      return (await response.json()).secret;
    },
    onSuccess: (secret) => setRevealedSecret(secret),
    onError: (error) => toast.error(error.message),
  });

  const deleteEndpoint = useMutation({
    mutationFn: async (endpointId: string) => {
      const response = await api[":endpointId"].$delete({ param: { ...param, endpointId } });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.actionFailed));
      }
    },
    onSuccess: async () => {
      setDeletingId(null);
      toast.success(intl.formatMessage(messages.deleted));
      await invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const endpoints = endpointsQuery.data ?? [];

  return (
    <SettingsPageBody width="wide">
      <Rows spacing="4u">
        <Row spacing="2u" align="spaceBetween" alignY="start">
          <div className="min-w-0 flex-1">
            <SettingsPageHeader title={intl.formatMessage(messages.pageTitle)} />
            <TypographyP className="mt-1 max-w-2xl" size="small" tone="subtle">
              <FormattedMessage {...messages.pageDescription} />
            </TypographyP>
          </div>
          <Button type="button" className="shrink-0" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            <FormattedMessage {...messages.addButton} />
          </Button>
        </Row>

        <section aria-label={intl.formatMessage(messages.sectionAriaLabel)}>
          {endpointsQuery.isLoading ? (
            <TypographyP size="small" tone="subtle">
              <FormattedMessage {...messages.loading} />
            </TypographyP>
          ) : endpointsQuery.isError ? (
            <TypographyP size="small" weight="medium" tone="critical">
              <FormattedMessage {...messages.loadFailed} />
            </TypographyP>
          ) : endpoints.length === 0 ? (
            <Rows spacing="1u">
              <TypographyP size="small" weight="medium" tone="content">
                <FormattedMessage {...messages.emptyTitle} />
              </TypographyP>
              <TypographyP size="small" tone="subtle">
                <FormattedMessage {...messages.emptyDescription} />
              </TypographyP>
            </Rows>
          ) : (
            <ul className="divide-y rounded-lg border">
              {endpoints.map((endpoint) => (
                <li key={endpoint.id} className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid min-w-0 gap-1">
                      <span className="truncate font-mono text-sm">{endpoint.url}</span>
                      {endpoint.description ? (
                        <TypographyP size="small" tone="subtle">
                          {endpoint.description}
                        </TypographyP>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <EndpointStatusBadge endpoint={endpoint} />
                        {endpoint.projectId ? (
                          <Badge variant="outline">
                            {projectNameById.get(endpoint.projectId) ?? endpoint.projectId}
                          </Badge>
                        ) : null}
                        {endpoint.eventTypes.length === 0 ? (
                          <Badge variant="outline">
                            <FormattedMessage {...messages.allEvents} />
                          </Badge>
                        ) : (
                          endpoint.eventTypes.map((eventType) => (
                            <Badge key={eventType} variant="outline">
                              <FormattedMessage {...EVENT_LABELS[eventType]} />
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!endpoint.enabled || sendTest.isPending}
                        onClick={() => sendTest.mutate(endpoint.id)}
                      >
                        <FormattedMessage {...messages.sendTest} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={toggleEndpoint.isPending}
                        onClick={() =>
                          toggleEndpoint.mutate({
                            endpointId: endpoint.id,
                            enabled: !endpoint.enabled,
                          })
                        }
                      >
                        <FormattedMessage
                          {...(endpoint.enabled ? messages.disable : messages.enable)}
                        />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={rotateSecret.isPending}
                        onClick={() => rotateSecret.mutate(endpoint.id)}
                      >
                        <FormattedMessage {...messages.rotateSecret} />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpandedId((current) => (current === endpoint.id ? null : endpoint.id))
                        }
                      >
                        <FormattedMessage
                          {...(expandedId === endpoint.id
                            ? messages.hideDeliveries
                            : messages.showDeliveries)}
                        />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeletingId(endpoint.id)}
                      >
                        <FormattedMessage {...messages.delete} />
                      </Button>
                    </div>
                  </div>
                  {expandedId === endpoint.id ? (
                    <EndpointDeliveries
                      organizationSlug={organizationSlug}
                      endpointId={endpoint.id}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </Rows>

      <CreateEndpointDialog
        open={isCreateOpen}
        organizationSlug={organizationSlug}
        projects={projectsQuery.data ?? []}
        onOpenChange={setIsCreateOpen}
        onCreated={async (secret) => {
          setIsCreateOpen(false);
          setRevealedSecret(secret);
          await invalidate();
        }}
      />

      <SecretDialog secret={revealedSecret} onClose={() => setRevealedSecret(null)} />

      <Dialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <FormattedMessage {...messages.deleteDialogTitle} />
            </DialogTitle>
            <DialogDescription>
              <FormattedMessage {...messages.deleteDialogDescription} />
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeletingId(null)}>
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteEndpoint.isPending}
              onClick={() => {
                if (deletingId) deleteEndpoint.mutate(deletingId);
              }}
            >
              <FormattedMessage {...messages.delete} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageBody>
  );
}

function EndpointStatusBadge({ endpoint }: { endpoint: WebhookEndpointSummary }) {
  if (endpoint.enabled) {
    return (
      <Badge variant="success">
        <FormattedMessage {...messages.statusEnabled} />
      </Badge>
    );
  }
  return (
    <Badge variant={endpoint.disabledReason === "too_many_failures" ? "destructive" : "secondary"}>
      <FormattedMessage
        {...(endpoint.disabledReason === "too_many_failures"
          ? messages.statusAutoDisabled
          : messages.statusDisabled)}
      />
    </Badge>
  );
}

function EndpointDeliveries({
  organizationSlug,
  endpointId,
}: {
  organizationSlug: string;
  endpointId: string;
}) {
  const intl = useIntl();
  const deliveriesQuery = useQuery({
    queryKey: deliveriesQueryKey(organizationSlug, endpointId),
    queryFn: async () => {
      const response = await endpointsApi()[":endpointId"].deliveries.$get({
        param: { organizationSlug, endpointId },
      });
      if (!response.ok) {
        throw new Error(intl.formatMessage(messages.actionFailed));
      }
      return (await response.json()).webhookDeliveries as WebhookDeliverySummary[];
    },
  });

  const deliveries = deliveriesQuery.data ?? [];
  if (deliveriesQuery.isLoading) {
    return null;
  }
  if (deliveries.length === 0) {
    return (
      <TypographyP size="small" tone="subtle">
        <FormattedMessage {...messages.noDeliveries} />
      </TypographyP>
    );
  }

  return (
    <ul className="grid gap-1 rounded-md bg-muted/40 p-2 text-xs">
      {deliveries.map((delivery) => (
        <li key={delivery.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono">{delivery.eventType}</span>
          <Badge
            variant={
              delivery.status === "succeeded"
                ? "success"
                : delivery.status === "pending"
                  ? "warning"
                  : "destructive"
            }
          >
            <FormattedMessage {...DELIVERY_STATUS_LABELS[delivery.status]} />
          </Badge>
          <span className="text-muted-foreground">
            <FormattedMessage
              {...messages.deliveryAttempts}
              values={{ count: delivery.attemptCount }}
            />
          </span>
          {delivery.lastResponseStatus || delivery.lastError ? (
            <span className="font-mono text-muted-foreground">
              {delivery.lastResponseStatus ?? delivery.lastError}
            </span>
          ) : null}
          <span className="text-muted-foreground">
            {intl.formatDate(delivery.createdAt, { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CreateEndpointDialog({
  open,
  organizationSlug,
  projects,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  organizationSlug: string;
  projects: WebhookProjectOption[];
  onOpenChange: (open: boolean) => void;
  onCreated: (secret: string) => Promise<void>;
}) {
  const intl = useIntl();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(ALL_PROJECTS_VALUE);
  const [eventTypes, setEventTypes] = useState<JobChangeEventType[]>([]);
  const projectItems = [
    { value: ALL_PROJECTS_VALUE, label: intl.formatMessage(messages.allProjects) },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];

  const reset = () => {
    setUrl("");
    setDescription("");
    setProjectId(ALL_PROJECTS_VALUE);
    setEventTypes([]);
  };

  const createEndpoint = useMutation({
    mutationFn: async () => {
      const response = await endpointsApi().$post({
        param: { organizationSlug },
        json: {
          url: url.trim(),
          description: description.trim() || null,
          eventTypes,
          projectId: projectId === ALL_PROJECTS_VALUE ? null : projectId,
        },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? intl.formatMessage(messages.actionFailed));
      }
      return (await response.json()).secret;
    },
    onSuccess: async (secret) => {
      reset();
      await onCreated(secret);
    },
    onError: (error) => toast.error(error.message),
  });

  function handleSubmit(event: React.SyntheticEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    createEndpoint.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.createDialogTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.createDialogDescription} />
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <Field className="gap-2">
            <FieldLabel htmlFor="webhook-url">
              <FormattedMessage {...messages.urlLabel} />
            </FieldLabel>
            <Input
              id="webhook-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/hyperlocalise/webhooks"
            />
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor="webhook-description">
              <FormattedMessage {...messages.descriptionLabel} />
            </FieldLabel>
            <Input
              id="webhook-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Field className="gap-2">
            <FieldLabel htmlFor="webhook-project">
              <FormattedMessage {...messages.projectLabel} />
            </FieldLabel>
            <Select
              value={projectId}
              onValueChange={(value) => {
                if (value) {
                  setProjectId(value);
                }
              }}
            >
              <SelectTrigger id="webhook-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} label={item.label}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-2">
            <Label>
              <FormattedMessage {...messages.eventsLabel} />
            </Label>
            {JOB_CHANGE_EVENT_TYPES.map((eventType) => (
              <div key={eventType} className="flex items-center gap-2">
                <Checkbox
                  id={`webhook-event-${eventType}`}
                  checked={eventTypes.includes(eventType)}
                  onCheckedChange={(checked) =>
                    setEventTypes((current) =>
                      checked === true
                        ? [...new Set([...current, eventType])]
                        : current.filter((entry) => entry !== eventType),
                    )
                  }
                />
                <Label htmlFor={`webhook-event-${eventType}`}>
                  <FormattedMessage {...EVENT_LABELS[eventType]} />
                </Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <FormattedMessage {...messages.cancel} />
            </Button>
            <Button type="submit" disabled={!url.trim() || createEndpoint.isPending}>
              <FormattedMessage
                {...(createEndpoint.isPending ? messages.creating : messages.create)}
              />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({ secret, onClose }: { secret: string | null; onClose: () => void }) {
  const intl = useIntl();
  const [copied, setCopied] = useState(false);

  function handleCopy(value: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast.error(intl.formatMessage(messages.copyFailed)));
  }

  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage {...messages.secretDialogTitle} />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage {...messages.secretDialogDescription} />
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="relative">
            <Input readOnly value={secret} className="pr-24 font-mono text-sm" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="absolute top-1/2 right-2 -translate-y-1/2"
              onClick={() => handleCopy(secret)}
            >
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              <FormattedMessage {...(copied ? messages.copied : messages.copy)} />
            </Button>
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            <FormattedMessage {...messages.done} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
