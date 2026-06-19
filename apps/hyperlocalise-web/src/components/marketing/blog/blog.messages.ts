import { defineMessages } from "react-intl";

export const blogMessages = defineMessages({
  indexTitle: {
    defaultMessage: "Blog",
    id: "BNfqWKjFzB",
    description: "Title for the marketing blog index page",
  },
  indexTagline: {
    defaultMessage: "Building in the open — localisation, AI agents, and lessons from the road.",
    id: "o0BB3/QSVT",
    description: "Tagline under the blog index page title",
  },
  indexEmptyState: {
    defaultMessage: "No posts yet. Check back soon.",
    id: "joOR4TGsxW",
    description: "Empty state on the blog index when there are no published posts",
  },
  relatedPostsTitle: {
    defaultMessage: "Related posts",
    id: "jhwzOupLZL",
    description: "Heading for related blog posts on a blog post page",
  },
  coverImageAlt: {
    defaultMessage: "Cover image for {title}",
    id: "xaqBXxdnZN",
    description: "Alt text for a blog post cover image",
  },
});

export type BlogMessageKey = keyof typeof blogMessages;
