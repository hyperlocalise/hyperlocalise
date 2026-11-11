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

import { GSC_DEFAULT_DATE_RANGE, type GscDateRange } from "@/lib/gsc/constants";
import type { GscInspection } from "@/lib/gsc/types";

export type DomainSearchConsoleTab = "queries" | "pages";

export class DomainSearchConsoleUiStore {
  dateRange: GscDateRange = GSC_DEFAULT_DATE_RANGE;
  tab: DomainSearchConsoleTab = "queries";
  inspectUrl = "";
  inspecting = false;
  inspection: GscInspection | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setDateRange(dateRange: GscDateRange) {
    this.dateRange = dateRange;
  }

  setTab(tab: DomainSearchConsoleTab) {
    this.tab = tab;
  }

  setInspectUrl(url: string) {
    this.inspectUrl = url;
  }

  beginInspect() {
    this.inspecting = true;
  }

  finishInspect(inspection: GscInspection) {
    this.inspecting = false;
    this.inspection = inspection;
  }

  failInspect() {
    this.inspecting = false;
  }
}
