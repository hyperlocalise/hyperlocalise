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
export const CAT_GLOSSARY_GUIDANCE_OPEN_EVENT = "cat-glossary-guidance:open";

export const EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS = {
  preferredCount: 0,
  notRecommendedCount: 0,
} as const;

export type CatGlossaryGuidanceStatus = {
  preferredCount: number;
  notRecommendedCount: number;
};

type CatGlossaryGuidanceListener = () => void;

let glossaryGuidanceStatus: CatGlossaryGuidanceStatus = EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS;
const glossaryGuidanceListeners = new Set<CatGlossaryGuidanceListener>();

export function requestCatGlossaryGuidance() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CAT_GLOSSARY_GUIDANCE_OPEN_EVENT));
}

export function setCatGlossaryGuidanceStatus(status: CatGlossaryGuidanceStatus) {
  if (
    glossaryGuidanceStatus.preferredCount === status.preferredCount &&
    glossaryGuidanceStatus.notRecommendedCount === status.notRecommendedCount
  ) {
    return;
  }

  glossaryGuidanceStatus = status;
  glossaryGuidanceListeners.forEach((listener) => listener());
}

export function subscribeCatGlossaryGuidance(listener: CatGlossaryGuidanceListener) {
  glossaryGuidanceListeners.add(listener);
  return () => glossaryGuidanceListeners.delete(listener);
}

export function getCatGlossaryGuidanceStatus() {
  return glossaryGuidanceStatus;
}

export function getCatGlossaryGuidanceServerSnapshot() {
  return EMPTY_CAT_GLOSSARY_GUIDANCE_STATUS;
}
