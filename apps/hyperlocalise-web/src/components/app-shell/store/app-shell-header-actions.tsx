"use client";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";

import { useAppShellStore } from "./app-shell-store-context";

export const AppShellHeaderActions = observer(function AppShellHeaderActions() {
  const store = useAppShellStore();

  return (
    <>
      {store.headerActions.orderedSlots.map((slot) => (
        <Fragment key={slot.id}>{slot.render()}</Fragment>
      ))}
    </>
  );
});
