"use client";

import { useState } from "react";
import {
  Add01Icon,
  Copy01Icon,
  Delete01Icon,
  Key01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api-client-instance";

import { PageHeader } from "../../_components/workspace-resource-shared";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

const apiKeysQueryKey = (organizationSlug: string) => ["api-keys", organizationSlug];

function formatDate(date: string | null) {
  if (!date) return "Never";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ApiKeySettingsPageContent({ organizationSlug }: { organizationSlug: string }) {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  const apiKeysQuery = useQuery({
    queryKey: apiKeysQueryKey(organizationSlug),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load API keys");
      }
      const body = await response.json();
      return (body.apiKeys ?? []) as ApiKey[];
    },
  });

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"].$post({
        param: { organizationSlug },
        json: { name },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (body && typeof body === "object" && "error" in body) {
          throw new Error(String(body.error));
        }
        throw new Error("Failed to create API key");
      }
      return response.json() as Promise<{
        apiKey: { id: string; name: string; key: string; keyPrefix: string };
      }>;
    },
    onSuccess: async (data) => {
      setCreatedKey(data.apiKey.key);
      setNewKeyName("");
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(organizationSlug) });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (apiKeyId: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["api-keys"][
        ":apiKeyId"
      ].$delete({
        param: { organizationSlug, apiKeyId },
      });
      if (!response.ok) {
        throw new Error("Failed to revoke API key");
      }
    },
    onSuccess: async () => {
      setRevokingKeyId(null);
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryKey(organizationSlug) });
      toast.success("API key revoked");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function handleCreateSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    createKey.mutate(newKeyName.trim());
  }

  function handleCopyKey(key: string) {
    navigator.clipboard
      .writeText(key)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        toast.error("Failed to copy to clipboard");
      });
  }

  function handleCloseCreateDialog() {
    setIsCreateOpen(false);
    setCreatedKey(null);
    setCopied(false);
    setNewKeyName("");
  }

  const apiKeys = apiKeysQuery.data ?? [];
  const activeKeys = apiKeys.filter((k) => !k.revokedAt);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <PageHeader
          icon={Key01Icon}
          label="Workspace settings"
          title="API Keys"
          description="Create and manage API keys for programmatic access to translation jobs and workspace resources."
        />
        <Button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="w-full md:w-fit"
          disabled={createKey.isPending}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} />
          Create API key
        </Button>
      </div>

      <Card className="rounded-lg border border-white/8 bg-[#0b0b0b] py-0 text-white ring-0">
        <CardHeader className="px-5 py-5">
          <CardTitle className="text-lg font-medium text-white">Active keys</CardTitle>
          <CardDescription className="text-white/52">
            Keys with access to the workspace API. Keep them secure and rotate them regularly.
          </CardDescription>
        </CardHeader>
        <Separator className="bg-white/8" />
        <CardContent className="px-5 py-0">
          {apiKeysQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-white/48">Loading API keys...</div>
          ) : activeKeys.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/48">
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <div className="divide-y divide-white/8">
              {activeKeys.map((key) => (
                <div key={key.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{key.name}</p>
                      <span className="rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-xs text-white/52">
                        {key.keyPrefix}••••••••
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/42">
                      <span>Permissions: {key.permissions.join(", ")}</span>
                      <span>Created {formatDate(key.createdAt)}</span>
                      <span>Last used {formatDate(key.lastUsedAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-white/10 bg-transparent text-white/72 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/25"
                    onClick={() => setRevokingKeyId(key.id)}
                    disabled={revokeKey.isPending}
                  >
                    <HugeiconsIcon icon={Delete01Icon} strokeWidth={1.8} className="size-4" />
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Key Dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseCreateDialog();
          else setIsCreateOpen(true);
        }}
      >
        <DialogContent className="border-white/8 bg-[#0b0b0b] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium text-white">
              {createdKey ? "API key created" : "Create API key"}
            </DialogTitle>
            <DialogDescription className="text-white/52">
              {createdKey
                ? "Copy this key now. You will not be able to see it again."
                : "Give your key a name so you can identify it later."}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="grid gap-4">
              <div className="relative">
                <Input
                  readOnly
                  value={createdKey}
                  className="h-11 rounded-lg border-white/10 bg-white/4 pr-24 font-mono text-sm text-white"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute right-2 top-1/2 -translate-y-1/2 border-white/10 bg-white/8 text-white/72 hover:bg-white/12"
                  onClick={() => handleCopyKey(createdKey)}
                >
                  {copied ? (
                    <>
                      <HugeiconsIcon icon={Tick02Icon} strokeWidth={1.8} className="size-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <HugeiconsIcon icon={Copy01Icon} strokeWidth={1.8} className="size-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="key-name" className="text-sm text-white/72">
                  Key name
                </Label>
                <Input
                  id="key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Production CI"
                  className="h-10 rounded-lg border-white/10 bg-white/4 text-white"
                />
              </div>
            </form>
          )}

          <DialogFooter>
            {createdKey ? (
              <Button type="button" onClick={handleCloseCreateDialog} className="w-full md:w-fit">
                Done
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseCreateDialog}
                  className="w-full border-white/10 bg-transparent text-white/72 hover:bg-white/8 md:w-fit"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={!newKeyName.trim() || createKey.isPending}
                  className="w-full md:w-fit"
                >
                  {createKey.isPending ? "Creating..." : "Create key"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        open={revokingKeyId !== null}
        onOpenChange={(open) => !open && setRevokingKeyId(null)}
      >
        <DialogContent className="border-white/8 bg-[#0b0b0b] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium text-white">Revoke API key</DialogTitle>
            <DialogDescription className="text-white/52">
              This key will immediately lose access to the workspace API. Any integrations using it
              will stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokingKeyId(null)}
              className="w-full border-white/10 bg-transparent text-white/72 hover:bg-white/8 md:w-fit"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (revokingKeyId) revokeKey.mutate(revokingKeyId);
              }}
              disabled={revokeKey.isPending}
              className="w-full md:w-fit"
            >
              {revokeKey.isPending ? "Revoking..." : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
