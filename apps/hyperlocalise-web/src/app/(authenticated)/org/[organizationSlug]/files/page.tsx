import { FilesPageContent } from "./_components/files-page-content";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;

  return <FilesPageContent organizationSlug={organizationSlug} />;
}
