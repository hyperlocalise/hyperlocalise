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
import {
  hyperlocaliseImageModelId,
  hyperlocaliseTtsModelId,
  hyperlocaliseTranscribeModelId,
  hyperlocaliseVideoModelId,
} from "@/lib/providers/managed-model-ids";

/** Hyperlocalise Agent capability slots (Phase 2 will persist per-capability models). */
export const workspaceDefaultAgentCapabilityIds = ["ask", "translation", "coding"] as const;

export const includedAgentCapabilityIds = ["tts", "transcribe", "image", "video"] as const;

export const agentCapabilityIds = [
  ...workspaceDefaultAgentCapabilityIds,
  ...includedAgentCapabilityIds,
] as const;

export type AgentCapabilityId = (typeof agentCapabilityIds)[number];
export type IncludedAgentCapabilityId = (typeof includedAgentCapabilityIds)[number];
export type AgentCapabilityModelSource = "workspace-default" | "included";

const includedModelByCapabilityId = {
  tts: hyperlocaliseTtsModelId,
  transcribe: hyperlocaliseTranscribeModelId,
  image: hyperlocaliseImageModelId,
  video: hyperlocaliseVideoModelId,
} as const satisfies Record<IncludedAgentCapabilityId, string>;

export function isIncludedAgentCapabilityId(
  capabilityId: AgentCapabilityId,
): capabilityId is IncludedAgentCapabilityId {
  return capabilityId in includedModelByCapabilityId;
}

export function getAgentCapabilityModelSource(
  capabilityId: AgentCapabilityId,
): AgentCapabilityModelSource {
  return isIncludedAgentCapabilityId(capabilityId) ? "included" : "workspace-default";
}

export function getIncludedAgentCapabilityModel(capabilityId: IncludedAgentCapabilityId): string {
  return includedModelByCapabilityId[capabilityId];
}
