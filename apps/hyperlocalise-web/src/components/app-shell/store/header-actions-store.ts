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
