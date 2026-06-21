import { Suspense } from "react";

import { ReviewQueuePageContent } from "./_components/review-queue-page-content";

export default async function ReviewQueuePage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return (
    <Suspense fallback={null}>
      <ReviewQueuePageContent organizationSlug={organizationSlug} />
    </Suspense>
  );
}
