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

import type { HyperlabExperiment, HyperlabVariant } from "../_components/hyperlab-api";
import { inspectWallTime, isoToWallTime } from "../_components/hyperlab-schedule";

type ExperimentDetailsDraft = {
  name: string;
  timezone: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

type ExperimentRolloutDraft = {
  audienceId: string;
  rolloutPercentage: number;
};

function detailsEqual(left: ExperimentDetailsDraft, right: ExperimentDetailsDraft) {
  return (
    left.name === right.name &&
    left.timezone === right.timezone &&
    left.startDate === right.startDate &&
    left.startTime === right.startTime &&
    left.endDate === right.endDate &&
    left.endTime === right.endTime
  );
}

function rolloutEqual(left: ExperimentRolloutDraft, right: ExperimentRolloutDraft) {
  return left.audienceId === right.audienceId && left.rolloutPercentage === right.rolloutPercentage;
}

function cloneVariantSplits(splits: Record<string, number>) {
  return { ...splits };
}

export class HyperlabExperimentStore {
  name = "";
  startDate = "";
  startTime = "09:00";
  endDate = "";
  endTime = "17:00";
  timezone = "UTC";
  audienceId = "";
  rolloutPercentage = 10000;
  variantSplits: Record<string, number> = {};
  savedVariantSplits: Record<string, number> = {};
  savedDetails: ExperimentDetailsDraft = {
    name: "",
    timezone: "UTC",
    startDate: "",
    startTime: "09:00",
    endDate: "",
    endTime: "17:00",
  };
  savedRollout: ExperimentRolloutDraft = {
    audienceId: "",
    rolloutPercentage: 10000,
  };
  serverVariants: HyperlabVariant[] = [];

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get detailsDraft(): ExperimentDetailsDraft {
    return {
      name: this.name,
      timezone: this.timezone,
      startDate: this.startDate,
      startTime: this.startTime,
      endDate: this.endDate,
      endTime: this.endTime,
    };
  }

  get rolloutDraft(): ExperimentRolloutDraft {
    return {
      audienceId: this.audienceId,
      rolloutPercentage: this.rolloutPercentage,
    };
  }

  get detailsDirty() {
    return !detailsEqual(this.detailsDraft, this.savedDetails);
  }

  get rolloutDirty() {
    return !rolloutEqual(this.rolloutDraft, this.savedRollout);
  }

  get splitDirty() {
    return this.serverVariants.some(
      (variant) => this.variantSplits[variant.id] !== variant.rolloutPercentage,
    );
  }

  get splitTotal() {
    return this.serverVariants.reduce(
      (sum, variant) => sum + (this.variantSplits[variant.id] ?? 0),
      0,
    );
  }

  get startWall() {
    return inspectWallTime(this.startDate, this.startTime, this.timezone);
  }

  get endWall() {
    return inspectWallTime(this.endDate, this.endTime, this.timezone);
  }

  get scheduleReady() {
    return Boolean(this.startWall.iso && this.endWall.iso);
  }

  setName(value: string) {
    this.name = value;
  }

  setStartDate(value: string) {
    this.startDate = value;
  }

  setStartTime(value: string) {
    this.startTime = value;
  }

  setEndDate(value: string) {
    this.endDate = value;
  }

  setEndTime(value: string) {
    this.endTime = value;
  }

  setTimezone(value: string) {
    this.timezone = value;
  }

  setAudienceId(value: string) {
    this.audienceId = value;
  }

  setRolloutPercentage(value: number) {
    this.rolloutPercentage = value;
  }

  setVariantSplit(variantId: string, value: number) {
    this.variantSplits = {
      ...this.variantSplits,
      [variantId]: value,
    };
  }

  applyServer(experiment: HyperlabExperiment, variants: HyperlabVariant[]) {
    const zone = experiment.timezone || "UTC";
    const start = isoToWallTime(experiment.startAt, zone);
    const end = isoToWallTime(experiment.endAt, zone);
    const nextDetails: ExperimentDetailsDraft = {
      name: experiment.name,
      timezone: zone,
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
    };
    const nextRollout: ExperimentRolloutDraft = {
      audienceId: experiment.audienceId ?? "",
      rolloutPercentage: experiment.rolloutPercentage,
    };
    const nextSplits = Object.fromEntries(
      variants.map((variant) => [variant.id, variant.rolloutPercentage]),
    );

    this.name = nextDetails.name;
    this.timezone = nextDetails.timezone;
    this.startDate = nextDetails.startDate;
    this.startTime = nextDetails.startTime;
    this.endDate = nextDetails.endDate;
    this.endTime = nextDetails.endTime;
    this.audienceId = nextRollout.audienceId;
    this.rolloutPercentage = nextRollout.rolloutPercentage;
    this.savedDetails = { ...nextDetails };
    this.savedRollout = { ...nextRollout };
    this.serverVariants = variants;
    this.variantSplits = cloneVariantSplits(nextSplits);
    this.savedVariantSplits = cloneVariantSplits(nextSplits);
  }

  markDetailsSaved() {
    this.savedDetails = { ...this.detailsDraft };
  }

  markRolloutSaved() {
    this.savedRollout = { ...this.rolloutDraft };
  }

  markSplitsSaved() {
    this.savedVariantSplits = cloneVariantSplits(this.variantSplits);
    this.serverVariants = this.serverVariants.map((variant) => ({
      ...variant,
      rolloutPercentage: this.variantSplits[variant.id] ?? variant.rolloutPercentage,
    }));
  }

  clear() {
    this.name = "";
    this.startDate = "";
    this.startTime = "09:00";
    this.endDate = "";
    this.endTime = "17:00";
    this.timezone = "UTC";
    this.audienceId = "";
    this.rolloutPercentage = 10000;
    this.variantSplits = {};
    this.savedVariantSplits = {};
    this.savedDetails = {
      name: "",
      timezone: "UTC",
      startDate: "",
      startTime: "09:00",
      endDate: "",
      endTime: "17:00",
    };
    this.savedRollout = {
      audienceId: "",
      rolloutPercentage: 10000,
    };
    this.serverVariants = [];
  }
}
