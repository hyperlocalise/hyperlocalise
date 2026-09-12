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
import { useLayoutEffect } from "react";

import type {
  HyperlabAudience,
  HyperlabExperiment,
  HyperlabFlag,
  HyperlabFlagConfig,
  HyperlabVariant,
} from "../_components/hyperlab-api";
import { useHyperlabWorkspace } from "./hyperlab-workspace-context";

export function HyperlabFlagQueryBridge({
  flag,
  config,
}: {
  flag: HyperlabFlag | undefined;
  config: HyperlabFlagConfig | undefined;
}) {
  const store = useHyperlabWorkspace();

  useLayoutEffect(() => {
    if (!flag || !config) {
      return;
    }

    store.ingestFlag(flag, config);
  }, [config, flag, store]);

  return null;
}

export function HyperlabAudienceQueryBridge({
  audience,
}: {
  audience: HyperlabAudience | undefined;
}) {
  const store = useHyperlabWorkspace();

  useLayoutEffect(() => {
    if (!audience) {
      return;
    }

    store.ingestAudience(audience);
  }, [audience, store]);

  return null;
}

type ExperimentDetailSnapshot = {
  experiment: HyperlabExperiment;
  variants: HyperlabVariant[];
};

export function HyperlabExperimentQueryBridge({
  snapshot,
}: {
  snapshot: ExperimentDetailSnapshot | undefined;
}) {
  const store = useHyperlabWorkspace();

  useLayoutEffect(() => {
    if (!snapshot) {
      return;
    }

    store.ingestExperiment(snapshot.experiment, snapshot.variants);
  }, [snapshot, store]);

  return null;
}
