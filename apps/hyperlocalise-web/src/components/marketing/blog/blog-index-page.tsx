import type { Post } from "@/lib/blog/blog-post";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { BlogPostCard } from "@/components/marketing/blog/blog-post-card";
import { blogMessages } from "@/components/marketing/blog/blog.messages";
import { TypographyH1, TypographyMuted } from "@/components/ui/typography";
import { getIntlShape } from "@/lib/app-i18n/intl";

type BlogIndexPageProps = {
  posts: Post[];
  lang: string;
};

export function BlogIndexPage({ posts, lang }: BlogIndexPageProps) {
  const intl = getIntlShape(lang);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-7xl">
        <section className="px-5 pb-10 pt-12 text-center sm:px-8 lg:px-10 lg:pt-16">
          <TypographyH1 className="text-4xl tracking-tight sm:text-5xl">
            {intl.formatMessage(blogMessages.indexTitle)}
          </TypographyH1>
          <TypographyMuted className="mx-auto mt-4 max-w-2xl text-base sm:text-lg">
            {intl.formatMessage(blogMessages.indexTagline)}
          </TypographyMuted>
        </section>

        <section className="px-5 pb-20 sm:px-8 lg:px-10">
          {posts.length > 0 ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {posts.map((post) => (
                <BlogPostCard key={post.slug} lang={lang} post={post} />
              ))}
            </div>
          ) : (
            <TypographyMuted className="text-center text-base">
              {intl.formatMessage(blogMessages.indexEmptyState)}
            </TypographyMuted>
          )}
        </section>

        <section className="border-t border-border/70 px-5 py-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </main>
    </div>
  );
}
