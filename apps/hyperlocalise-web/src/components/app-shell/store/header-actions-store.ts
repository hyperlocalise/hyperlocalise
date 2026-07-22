/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { makeAutoObservable } from "mobx";
import type { ReactNode } from "react";

export type HeaderActionSlot = {
  id: string;
  order: number;
  visible: boolean;
  render: () => ReactNode;
};

export class HeaderActionsStore {
  private slots = new Map<string, HeaderActionSlot>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  register(slot: HeaderActionSlot) {
    this.slots.set(slot.id, slot);
  }

  unregister(id: string) {
    this.slots.delete(id);
  }

  clearAll() {
    this.slots.clear();
  }

  get orderedSlots(): HeaderActionSlot[] {
    return [...this.slots.values()]
      .filter((slot) => slot.visible)
      .sort((left, right) => left.order - right.order);
  }
}
