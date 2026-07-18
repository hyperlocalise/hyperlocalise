"use client";

import { defineMessages } from "react-intl";

export const packageInfoMessages = defineMessages({
  dependencies: {
    id: "ZktP8OmKzB",
    defaultMessage: "Dependencies",
    description: "Section label for package dependencies list",
  },
  changeTypeMajor: {
    id: "q1SUe75H6g",
    defaultMessage: "Major",
    description: "Package version change badge for a major update",
  },
  changeTypeMinor: {
    id: "PomrlG5RDY",
    defaultMessage: "Minor",
    description: "Package version change badge for a minor update",
  },
  changeTypePatch: {
    id: "KXkRSMd8ip",
    defaultMessage: "Patch",
    description: "Package version change badge for a patch update",
  },
  changeTypeAdded: {
    id: "sw288YpOpz",
    defaultMessage: "Added",
    description: "Package version change badge when a dependency was added",
  },
  changeTypeRemoved: {
    id: "SakouEb4Hw",
    defaultMessage: "Removed",
    description: "Package version change badge when a dependency was removed",
  },
});
