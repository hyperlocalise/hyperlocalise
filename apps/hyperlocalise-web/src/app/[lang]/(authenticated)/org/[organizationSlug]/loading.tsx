import { ViewTransition } from "react";

import { OrganizationRouteLoading } from "./_components/organization-route-loading";

export default function OrganizationLoading() {
  return (
    <ViewTransition exit="slide-down">
      <OrganizationRouteLoading />
    </ViewTransition>
  );
}
