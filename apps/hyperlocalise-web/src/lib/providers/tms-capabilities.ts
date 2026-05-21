import { z } from "zod";

export const knownTmsProviderIds = ["smartling", "phrase", "crowdin", "lokalise"] as const;

export const tmsProviderIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z][a-z0-9_-]*$/);

export const knownTmsProviderIdSchema = z.enum(knownTmsProviderIds);

export type KnownTmsProviderId = (typeof knownTmsProviderIds)[number];
export type TmsProviderId = KnownTmsProviderId | (string & {});

export const tmsProviderCapabilityActions = [
  "projects.read",
  "projects.write",
  "locales.read",
  "locales.write",
  "files.upload",
  "files.download",
  "keys.read",
  "keys.write",
  "jobs.create",
  "jobs.read",
  "tasks.create",
  "tasks.read",
  "comments.read",
  "comments.write",
  "status_transitions.read",
  "status_transitions.write",
  "translation_memory.import",
  "translation_memory.export",
  "glossary.import",
  "glossary.export",
  "qa.run",
  "webhooks.receive",
  "webhooks.configure",
  "write_back.source",
  "write_back.translation",
] as const;

export type TmsProviderCapabilityAction = (typeof tmsProviderCapabilityActions)[number];
export type TmsProviderCapabilityUiState = "enabled" | "disabled" | "hidden";

export type TmsProviderCapability = {
  supported: boolean;
  label: string;
  description?: string;
  ui: {
    state: TmsProviderCapabilityUiState;
    disabledReason?: string;
  };
};

export type TmsProviderCapabilityInput =
  | boolean
  | {
      supported?: boolean;
      label?: string;
      description?: string;
      ui?: {
        state?: TmsProviderCapabilityUiState;
        disabledReason?: string;
      };
    };

export type TmsProviderCapabilityRegistryEntry = {
  id: TmsProviderId;
  label: string;
  capabilities: Record<TmsProviderCapabilityAction, TmsProviderCapability>;
};

export type TmsProviderCapabilityRegistryInput = {
  id: TmsProviderId;
  label: string;
  capabilities: Partial<Record<TmsProviderCapabilityAction, TmsProviderCapabilityInput>>;
};

const actionLabels = {
  "projects.read": "Read projects",
  "projects.write": "Manage projects",
  "locales.read": "Read locales",
  "locales.write": "Manage locales",
  "files.upload": "Upload files",
  "files.download": "Download files",
  "keys.read": "Read keys",
  "keys.write": "Manage keys",
  "jobs.create": "Create jobs",
  "jobs.read": "Read jobs",
  "tasks.create": "Create tasks",
  "tasks.read": "Read tasks",
  "comments.read": "Read comments",
  "comments.write": "Write comments",
  "status_transitions.read": "Read status transitions",
  "status_transitions.write": "Apply status transitions",
  "translation_memory.import": "Import translation memory",
  "translation_memory.export": "Export translation memory",
  "glossary.import": "Import glossary terms",
  "glossary.export": "Export glossary terms",
  "qa.run": "Run QA checks",
  "webhooks.receive": "Receive webhooks",
  "webhooks.configure": "Configure webhooks",
  "write_back.source": "Write source content back",
  "write_back.translation": "Write translations back",
} as const satisfies Record<TmsProviderCapabilityAction, string>;

const unsupportedReason = "This provider connector does not support this action yet.";

function normalizeCapability(
  action: TmsProviderCapabilityAction,
  capability: TmsProviderCapabilityInput | undefined,
): TmsProviderCapability {
  if (capability === true) {
    return {
      supported: true,
      label: actionLabels[action],
      ui: { state: "enabled" },
    };
  }

  if (capability === false || capability === undefined) {
    return {
      supported: false,
      label: actionLabels[action],
      ui: { state: "hidden", disabledReason: unsupportedReason },
    };
  }

  const supported = capability.supported ?? true;
  const uiState = capability.ui?.state ?? (supported ? "enabled" : "disabled");
  const resolvedDisabledReason =
    capability.ui?.disabledReason ?? (!supported ? unsupportedReason : undefined);

  return {
    supported,
    label: capability.label ?? actionLabels[action],
    ...(capability.description ? { description: capability.description } : {}),
    ui: {
      state: uiState,
      ...(resolvedDisabledReason ? { disabledReason: resolvedDisabledReason } : {}),
    },
  };
}

export function normalizeTmsProviderCapabilityRegistryEntry(
  input: TmsProviderCapabilityRegistryInput,
): TmsProviderCapabilityRegistryEntry {
  return {
    id: tmsProviderIdSchema.parse(input.id),
    label: input.label,
    capabilities: Object.fromEntries(
      tmsProviderCapabilityActions.map((action) => [
        action,
        normalizeCapability(action, input.capabilities[action]),
      ]),
    ) as Record<TmsProviderCapabilityAction, TmsProviderCapability>,
  };
}

const commonFileSyncCapabilities = {
  "projects.read": true,
  "locales.read": true,
  "files.upload": true,
  "files.download": true,
  "keys.read": true,
  "keys.write": true,
  "jobs.create": true,
  "jobs.read": true,
  "tasks.read": true,
  "comments.read": true,
  "comments.write": true,
  "status_transitions.read": true,
  "status_transitions.write": true,
  "glossary.import": true,
  "glossary.export": true,
  "webhooks.receive": true,
  "webhooks.configure": true,
  "write_back.translation": true,
} as const satisfies Partial<Record<TmsProviderCapabilityAction, TmsProviderCapabilityInput>>;

export const tmsProviderCapabilityRegistry = Object.fromEntries(
  [
    normalizeTmsProviderCapabilityRegistryEntry({
      id: "smartling",
      label: "Smartling",
      capabilities: {
        ...commonFileSyncCapabilities,
        "translation_memory.import": true,
        "translation_memory.export": true,
        "qa.run": true,
        "write_back.source": true,
      },
    }),
    normalizeTmsProviderCapabilityRegistryEntry({
      id: "phrase",
      label: "Phrase",
      capabilities: {
        ...commonFileSyncCapabilities,
        "translation_memory.import": true,
        "translation_memory.export": true,
        "tasks.create": true,
        "qa.run": {
          supported: false,
          ui: {
            state: "disabled",
            disabledReason: "Phrase QA is not wired into this connector yet.",
          },
        },
      },
    }),
    normalizeTmsProviderCapabilityRegistryEntry({
      id: "crowdin",
      label: "Crowdin",
      capabilities: {
        ...commonFileSyncCapabilities,
        "projects.write": true,
        "locales.write": true,
        "translation_memory.import": true,
        "translation_memory.export": true,
        "qa.run": true,
        "write_back.source": true,
      },
    }),
    normalizeTmsProviderCapabilityRegistryEntry({
      id: "lokalise",
      label: "Lokalise",
      capabilities: {
        ...commonFileSyncCapabilities,
        "locales.write": true,
        "tasks.create": true,
        "qa.run": true,
        "translation_memory.import": {
          supported: false,
          ui: {
            state: "disabled",
            disabledReason:
              "Lokalise translation memory support is not wired into this connector yet.",
          },
        },
        "translation_memory.export": {
          supported: false,
          ui: {
            state: "disabled",
            disabledReason:
              "Lokalise translation memory support is not wired into this connector yet.",
          },
        },
      },
    }),
  ].map((provider) => [provider.id, provider]),
) as Record<KnownTmsProviderId, TmsProviderCapabilityRegistryEntry>;

function createEmptyTmsProviderCapability(
  providerId: TmsProviderId,
  label = providerId,
): TmsProviderCapabilityRegistryEntry {
  return {
    id: providerId,
    label,
    capabilities: Object.fromEntries(
      tmsProviderCapabilityActions.map((action) => [
        action,
        normalizeCapability(action, undefined),
      ]),
    ) as Record<TmsProviderCapabilityAction, TmsProviderCapability>,
  };
}

export function getTmsProviderCapability(providerId: string) {
  const parsedProviderId = tmsProviderIdSchema.safeParse(providerId);

  if (!parsedProviderId.success) {
    return createEmptyTmsProviderCapability(providerId);
  }

  const normalizedProviderId = parsedProviderId.data;

  return (
    tmsProviderCapabilityRegistry[normalizedProviderId as KnownTmsProviderId] ??
    createEmptyTmsProviderCapability(normalizedProviderId)
  );
}

export function getTmsProviderActionCapability(
  providerId: string,
  action: TmsProviderCapabilityAction,
) {
  return getTmsProviderCapability(providerId).capabilities[action];
}

export function providerSupportsTmsAction(providerId: string, action: TmsProviderCapabilityAction) {
  return getTmsProviderActionCapability(providerId, action).supported;
}
