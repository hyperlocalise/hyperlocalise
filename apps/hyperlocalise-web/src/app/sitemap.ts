import { MetadataRoute } from "next";

import { useCaseSlugs } from "@/components/marketing/use-case";

export default function sitemap(): MetadataRoute.Sitemap {
  const useCaseEntries: MetadataRoute.Sitemap = useCaseSlugs.map((slug) => ({
    url: `https://www.hyperlocalise.com/use-cases/${slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [
    {
      url: "https://www.hyperlocalise.com",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://www.hyperlocalise.com/terms",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://www.hyperlocalise.com/privacy",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://www.hyperlocalise.com/install",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...useCaseEntries,
  ];
}
