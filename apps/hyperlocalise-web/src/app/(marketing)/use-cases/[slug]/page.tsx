import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UseCasePage, useCasePagesBySlug, useCaseSlugs } from "@/components/marketing/use-case";

type UseCaseRouteParams = {
    slug: string;
};

type UseCaseRouteProps = {
    params: Promise<UseCaseRouteParams>;
};

export function generateStaticParams() {
    return useCaseSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: UseCaseRouteProps): Promise<Metadata> {
    const { slug } = await params;
    const content = useCasePagesBySlug[slug];

    if (!content) {
        return {};
    }

    return {
        title: content.metadata.title,
        description: content.metadata.description,
        keywords: content.metadata.keywords,
        openGraph: {
            title: content.metadata.title,
            description: content.metadata.description,
            type: "website",
            images: [
                {
                    url: "https://www.hyperlocalise.com/images/logo.png",
                    width: 512,
                    height: 512,
                    alt: "Hyperlocalise",
                },
            ],
        },
    };
}

export default async function UseCaseRoutePage({ params }: UseCaseRouteProps) {
    const { slug } = await params;
    const content = useCasePagesBySlug[slug];

    if (!content) {
        notFound();
    }

    return <UseCasePage content={content} />;
}
