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

import type { HyperlabFlag, HyperlabFlagConfig } from "../_components/hyperlab-api";

export class HyperlabFlagStore {
  description = "";
  configText = "{}";
  savedDescription = "";
  savedConfigText = "{}";
  flagKind: HyperlabFlag["kind"] | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isDirty() {
    return this.description !== this.savedDescription || this.configText !== this.savedConfigText;
  }

  setDescription(value: string) {
    this.description = value;
  }

  setConfigText(value: string) {
    this.configText = value;
  }

  applyServer(flag: HyperlabFlag, config: HyperlabFlagConfig) {
    const nextDescription = flag.description ?? "";
    const nextConfigText =
      flag.kind === "config" && config.value !== null && config.value !== undefined
        ? JSON.stringify(config.value, null, 2)
        : "{}";

    if (
      this.description === nextDescription &&
      this.configText === nextConfigText &&
      this.savedDescription === nextDescription &&
      this.savedConfigText === nextConfigText &&
      this.flagKind === flag.kind
    ) {
      return;
    }

    this.description = nextDescription;
    this.configText = nextConfigText;
    this.savedDescription = nextDescription;
    this.savedConfigText = nextConfigText;
    this.flagKind = flag.kind;
  }

  markSaved() {
    this.savedDescription = this.description;
    this.savedConfigText = this.configText;
  }

  clear() {
    this.description = "";
    this.configText = "{}";
    this.savedDescription = "";
    this.savedConfigText = "{}";
    this.flagKind = null;
  }
}
