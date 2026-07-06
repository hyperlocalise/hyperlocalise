import { z } from "zod";

import { getTmsProvider } from "@/lib/providers/adapters/tms-provider-registry";
import {
  isTmsProviderFeatureSupported,
  tmsProviderFeatureLabels,
} from "@/lib/providers/contracts/tms-provider";

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

function getUiStateFromFeature(
  supported: boolean,
  feature: { state: string; disabledReason?: string },
): TmsProviderCapabilityUiState {
  if (feature.state === "unsupported") {
    return feature.disabledReason ? "disabled" : "hidden";
  }

  if (feature.disabledReason) {
    return "disabled";
  }

  return supported ? "enabled" : "hidden";
}

function createProviderCapabilityRegistryEntry(
  providerId: KnownTmsProviderId,
): TmsProviderCapabilityRegistryEntry {
  const provider = getTmsProvider(providerId);

  return {
    id: provider.kind,
    label: provider.label,
    capabilities: Object.fromEntries(
      tmsProviderCapabilityActions.map((action) => {
        const feature = provider.features[action];
        const supported = isTmsProviderFeatureSupported(feature);
        const disabledReason =
          !supported || feature.disabledReason
            ? (feature.disabledReason ?? unsupportedReason)
            : undefined;

        return [
          action,
          {
            supported,
            label: feature.label ?? tmsProviderFeatureLabels[action],
            ...(feature.note ? { description: feature.note } : {}),
            ui: {
              state: getUiStateFromFeature(supported, feature),
              ...(disabledReason ? { disabledReason } : {}),
            },
          } satisfies TmsProviderCapability,
        ];
      }),
    ) as Record<TmsProviderCapabilityAction, TmsProviderCapability>,
  };
}

export const tmsProviderCapabilityRegistry = new Proxy(
  {} as Record<KnownTmsProviderId, TmsProviderCapabilityRegistryEntry>,
  {
    get(_target, property) {
      if (
        typeof property !== "string" ||
        !knownTmsProviderIds.includes(property as KnownTmsProviderId)
      ) {
        return undefined;
      }

      return createProviderCapabilityRegistryEntry(property as KnownTmsProviderId);
    },
    getOwnPropertyDescriptor(_target, property) {
      if (
        typeof property !== "string" ||
        !knownTmsProviderIds.includes(property as KnownTmsProviderId)
      ) {
        return undefined;
      }

      return {
        configurable: true,
        enumerable: true,
      };
    },
    ownKeys() {
      return [...knownTmsProviderIds];
    },
  },
);

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
