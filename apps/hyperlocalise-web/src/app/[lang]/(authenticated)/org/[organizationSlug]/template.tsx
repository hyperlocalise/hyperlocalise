import type { ReactNode } from "react";
import { ViewTransition } from "react";

type OrganizationTemplateProps = {
  children: ReactNode;
};

export default function OrganizationTemplate({ children }: OrganizationTemplateProps) {
  return (
    <ViewTransition enter="slide-up" default="none">
      {children}
    </ViewTransition>
  );
}
