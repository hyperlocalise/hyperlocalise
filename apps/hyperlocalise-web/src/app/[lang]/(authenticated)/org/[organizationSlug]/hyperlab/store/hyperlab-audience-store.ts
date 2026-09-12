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
import { makeAutoObservable } from "mobx";

import type { HyperlabAudience } from "../_components/hyperlab-api";
import {
  criterionToRuleGroup,
  emptyRuleGroup,
  type HyperlabRuleGroup,
} from "../_components/hyperlab-criterion";

type SavedAudienceDraft = {
  name: string;
  description: string;
  group: HyperlabRuleGroup;
};

function cloneRuleGroup(group: HyperlabRuleGroup): HyperlabRuleGroup {
  return JSON.parse(JSON.stringify(group)) as HyperlabRuleGroup;
}

function audienceDraftEqual(left: SavedAudienceDraft, right: SavedAudienceDraft) {
  return (
    left.name === right.name &&
    left.description === right.description &&
    JSON.stringify(left.group) === JSON.stringify(right.group)
  );
}

export class HyperlabAudienceStore {
  name = "";
  description = "";
  group: HyperlabRuleGroup = emptyRuleGroup();
  saved: SavedAudienceDraft = {
    name: "",
    description: "",
    group: emptyRuleGroup(),
  };

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isDirty() {
    return !audienceDraftEqual(this.currentDraft, this.saved);
  }

  get currentDraft(): SavedAudienceDraft {
    return {
      name: this.name,
      description: this.description,
      group: this.group,
    };
  }

  setName(value: string) {
    this.name = value;
  }

  setDescription(value: string) {
    this.description = value;
  }

  setGroup(value: HyperlabRuleGroup) {
    this.group = value;
  }

  applyServer(audience: HyperlabAudience) {
    const nextGroup = criterionToRuleGroup(audience.criterion);
    const nextDraft: SavedAudienceDraft = {
      name: audience.name,
      description: audience.description ?? "",
      group: nextGroup,
    };

    if (
      audienceDraftEqual(this.currentDraft, nextDraft) &&
      audienceDraftEqual(this.saved, nextDraft)
    ) {
      return;
    }

    this.name = nextDraft.name;
    this.description = nextDraft.description;
    this.group = cloneRuleGroup(nextDraft.group);
    this.saved = {
      name: nextDraft.name,
      description: nextDraft.description,
      group: cloneRuleGroup(nextDraft.group),
    };
  }

  markSaved() {
    this.saved = {
      name: this.name,
      description: this.description,
      group: cloneRuleGroup(this.group),
    };
  }

  clear() {
    this.name = "";
    this.description = "";
    this.group = emptyRuleGroup();
    this.saved = {
      name: "",
      description: "",
      group: emptyRuleGroup(),
    };
  }
}
