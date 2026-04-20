import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { chapters, footerColumns } from "@/components/marketing/marketing-page-content";
import {
  ChapterSection,
  ChangelogSection,
  FinalCtaSection,
  HeroSection,
  LogoStripSection,
  PrinciplesSection,
} from "@/components/marketing";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <main className="mx-auto max-w-7xl">
        <section className=" px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10">
          <HeroSection />
        </section>

        <div className="border-y border-white/8">
          <section className="px-5 py-6 sm:px-8 lg:px-10">
            <LogoStripSection />
          </section>
        </div>

        <section className="px-5 py-16 sm:px-8 lg:px-10">
          <PrinciplesSection />
        </section>

        <section id="workflow">
          {chapters.map((chapter) => (
            <section key={chapter.id} className="border-t border-white/8">
              <div className="px-5 py-20 sm:px-8 lg:px-10">
                <ChapterSection chapter={chapter} />
              </div>
            </section>
          ))}
        </section>

        <section className="border-t border-white/8">
          <div className="px-5 py-20 sm:px-8 lg:px-10">
            <ChangelogSection />
          </div>
        </section>

        <section className="border-t border-white/8">
          <div className="px-5 py-24 sm:px-8 lg:px-10">
            <FinalCtaSection />
          </div>
        </section>

        <section className="border-t border-white/8">
          <div className="px-5 py-16 sm:px-8 lg:px-10">
            <MarketingFooter columns={footerColumns} />
          </div>
        </section>
      </main>
    </div>
  );
}
