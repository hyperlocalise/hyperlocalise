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

export type WfComponentInstanceMeta = {
  componentId: string;
  instanceId: string | null;
  propIds: string[];
};

const WF_COMPONENT_PATTERN = /<wf-component\b[^>]*>/gi;

export function listWfComponentInstances(html: string): WfComponentInstanceMeta[] {
  const instances: WfComponentInstanceMeta[] = [];
  const matches = html.matchAll(WF_COMPONENT_PATTERN);
  for (const match of matches) {
    const tag = match[0] ?? "";
    const componentId = readAttribute(tag, "component-id") ?? "";
    const instanceId = readAttribute(tag, "data-w-id");
    const propIds = [...tag.matchAll(/\bprop-([a-f0-9]+)=/gi)].map((prop) => prop[1] ?? "");
    if (componentId) {
      instances.push({ componentId, instanceId, propIds });
    }
  }
  return instances;
}

function sortedPropIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function propIdsMatch(left: string[], right: string[]): boolean {
  const sortedLeft = sortedPropIds(left);
  const sortedRight = sortedPropIds(right);
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((id, index) => id === sortedRight[index])
  );
}
function readAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`${name}="([^"]*)"`, "i");
  const match = tag.match(pattern);
  return match?.[1] ?? null;
}

export function wfComponentIntegrityMatches(sourceHtml: string, translatedHtml: string): boolean {
  const source = listWfComponentInstances(sourceHtml).toSorted((a, b) =>
    `${a.componentId}:${a.instanceId}`.localeCompare(`${b.componentId}:${b.instanceId}`),
  );
  const translated = listWfComponentInstances(translatedHtml).toSorted((a, b) =>
    `${a.componentId}:${a.instanceId}`.localeCompare(`${b.componentId}:${b.instanceId}`),
  );
  if (source.length !== translated.length) {
    return false;
  }
  for (let index = 0; index < source.length; index += 1) {
    const left = source[index];
    const right = translated[index];
    if (!left || !right) {
      return false;
    }
    if (left.componentId !== right.componentId) {
      return false;
    }
    if ((left.instanceId ?? "") !== (right.instanceId ?? "")) {
      return false;
    }
    // `prop-<id>` attributes address component properties. A translation that
    // swaps or drops one would write to the wrong property (or fail), so the
    // property set must match exactly.
    if (!propIdsMatch(left.propIds, right.propIds)) {
      return false;
    }
  }
  return true;
}

export function validateSecondaryLocaleComponentWrite(input: {
  sourceHtml: string;
  patchHtml: string;
}): { ok: true } | { ok: false; code: "wf_component_write_rejected"; message: string } {
  const sourceInstances = listWfComponentInstances(input.sourceHtml);
  const patchInstances = listWfComponentInstances(input.patchHtml);

  for (const patch of patchInstances) {
    if (!patch.instanceId) {
      return {
        ok: false,
        code: "wf_component_write_rejected",
        message: "Secondary locale writes cannot create new wf-component instances.",
      };
    }
    const sourceMatch = sourceInstances.find(
      (entry) =>
        entry.componentId === patch.componentId &&
        entry.instanceId === patch.instanceId &&
        propIdsMatch(entry.propIds, patch.propIds),
    );
    if (!sourceMatch) {
      return {
        ok: false,
        code: "wf_component_write_rejected",
        message: "Unknown wf-component instance in translated Rich Text.",
      };
    }
  }

  if (!wfComponentIntegrityMatches(input.sourceHtml, input.patchHtml)) {
    return {
      ok: false,
      code: "wf_component_write_rejected",
      message: "wf-component markup changed during translation.",
    };
  }

  return { ok: true };
}
