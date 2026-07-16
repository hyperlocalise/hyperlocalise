import type { ReactNode } from "react";
import { ViewTransition } from "react";

type OrganizationTemplateProps = {
  children: ReactNode;
};

export default function OrganizationTemplate({ children }: OrganizationTemplateProps) {
  // Outermost VT owns the snapshot for this segment. Nested page-level
  // <ViewTransition enter/exit> under here will not fire while this one animates —
  // remove or relocate this wrapper before adding page VTs.
  return (
    <ViewTransition enter="slide-up" default="none">
      {children}
    </ViewTransition>
  );
}
