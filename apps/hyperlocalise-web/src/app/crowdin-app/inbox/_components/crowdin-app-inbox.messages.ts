"use client";

import { defineMessages } from "react-intl";

export const crowdinAppInboxMessages = defineMessages({
  brandName: {
    defaultMessage: "Hyperlocalise",
    id: "wueVNaKGWk",
    description: "Brand name in the Crowdin App inbox header",
  },
  loading: {
    id: "si5HssHaNU",
    defaultMessage: "Loading Hyperlocalise…",
    description: "Loading state while Crowdin App inbox bootstraps",
  },

  unauthorizedTitle: {
    id: "/2wzw7IAoz",
    defaultMessage: "Unable to open Hyperlocalise",
    description: "Title when Crowdin JWT bootstrap fails",
  },
  unauthorizedBody: {
    id: "Rx1gsFSIpF",
    defaultMessage: "This Crowdin session could not be verified. Reopen the Hyperlocalise tab.",
    description: "Body when Crowdin JWT bootstrap fails",
  },
  orgNotLinkedTitle: {
    id: "C1WvaRKpWU",
    defaultMessage: "Connect Crowdin in Hyperlocalise",
    description: "Title when no Hyperlocalise org maps to this Crowdin org",
  },
  orgNotLinkedBody: {
    id: "oh6mSziyuU",
    defaultMessage:
      "Connect Crowdin for your Hyperlocalise workspace, then reopen this tab from Crowdin.",
    description: "Body when no Hyperlocalise org maps to this Crowdin org",
  },
  userNotLinkedTitle: {
    id: "xfunHs6ciZ",
    defaultMessage: "Link your Crowdin account",
    description: "Title when Crowdin user is not linked in Hyperlocalise",
  },
  userNotLinkedBody: {
    id: "bL4rc4u2xS",
    defaultMessage:
      "Link your Crowdin account under Integrations in Hyperlocalise, then reopen this tab.",
    description: "Body when Crowdin user is not linked in Hyperlocalise",
  },
  projectNotLinkedTitle: {
    id: "xTpbtPORei",
    defaultMessage: "Link this Crowdin project",
    description: "Title when Crowdin project is not linked in Hyperlocalise",
  },
  projectNotLinkedBody: {
    id: "+BzVn5MdKT",
    defaultMessage:
      "Connect this Crowdin project in Hyperlocalise so conversations can stay project-scoped.",
    description: "Body when Crowdin project is not linked in Hyperlocalise",
  },
  openIntegrations: {
    id: "uR3HXqLFuY",
    defaultMessage: "Open Hyperlocalise",
    description: "CTA to open Hyperlocalise outside Crowdin",
  },
  openInHyperlocalise: {
    id: "TUvTVcL3il",
    defaultMessage: "Open in Hyperlocalise",
    description: "Deep link to the same conversation in the main app",
  },
  newConversation: {
    id: "7rtL+2WjPy",
    defaultMessage: "New request",
    description: "Button to start a new project-scoped conversation in Crowdin App inbox",
  },
  projectLabel: {
    id: "wGu07dv5qW",
    defaultMessage: "Project: {projectName}",
    description: "Crowdin App inbox header showing the linked Hyperlocalise project",
  },
});
