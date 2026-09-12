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
import type {
  HyperlabAudience,
  HyperlabExperiment,
  HyperlabFlag,
  HyperlabFlagConfig,
  HyperlabVariant,
} from "../_components/hyperlab-api";
import { HyperlabAudienceStore } from "./hyperlab-audience-store";
import { HyperlabExperimentStore } from "./hyperlab-experiment-store";
import { HyperlabFlagStore } from "./hyperlab-flag-store";
import { HyperlabUiStore } from "./hyperlab-ui-store";

export class HyperlabWorkspaceOrchestrator {
  readonly flag = new HyperlabFlagStore();
  readonly audience = new HyperlabAudienceStore();
  readonly experiment = new HyperlabExperimentStore();
  readonly ui = new HyperlabUiStore();

  ingestFlag(flag: HyperlabFlag, config: HyperlabFlagConfig) {
    this.flag.applyServer(flag, config);
  }

  ingestAudience(audience: HyperlabAudience) {
    this.audience.applyServer(audience);
  }

  ingestExperiment(experiment: HyperlabExperiment, variants: HyperlabVariant[]) {
    this.experiment.applyServer(experiment, variants);
    for (const variant of variants) {
      this.ui.applyVariantAudience(variant.id, variant.audienceId);
    }
  }

  clear() {
    this.flag.clear();
    this.audience.clear();
    this.experiment.clear();
    this.ui.clear();
  }
}

export function createHyperlabWorkspace() {
  return new HyperlabWorkspaceOrchestrator();
}
