"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { ArrowRight01Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { ContentOpsEditorPanel } from "@/components/marketing/content-ops/content-ops-editor-panel";
import { ContentOpsMockAppShell } from "@/components/marketing/content-ops/content-ops-mock-app-shell";
import {
  BLUSH_MESH_GRADIENT_SRC,
  DUSK_MESH_GRADIENT_SRC,
  LAVENDER_MESH_GRADIENT_SRC,
  MeshStage,
  ROSE_MESH_GRADIENT_SRC,
  SEAFOAM_MESH_GRADIENT_SRC,
  SectionMeshBackground,
} from "@/components/marketing/hero-frame-mesh-stage";
import { HomepageFaqSection } from "@/components/marketing/homepage-faq-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { footerColumns } from "@/components/marketing/marketing-page-content";
import { REQUEST_DEMO_URL } from "@/components/marketing/request-demo";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/app-i18n/locales";
import { rewriteAppLocalePath } from "@/lib/app-i18n/rewrite-app-locale-path";
import { useAppLocale } from "@/lib/app-i18n/use-app-locale";
import { cn } from "@/lib/primitives/cn";

import { multilingualContentStudioPageMessages as messages } from "./multilingual-content-studio-page.messages";

const formatIds = ["text", "slides", "images", "video"] as const;
type FormatId = (typeof formatIds)[number];

const formatLabelKeys = {
  text: "formatText",
  slides: "formatSlides",
  images: "formatImages",
  video: "formatVideo",
} as const;

const formatCopyKeys = {
  text: {
    title: "formatTextTitle",
    body: "formatTextBody",
    link: "formatTextLink",
  },
  slides: {
    title: "formatSlidesTitle",
    body: "formatSlidesBody",
    link: "formatSlidesLink",
  },
  images: {
    title: "formatImagesTitle",
    body: "formatImagesBody",
    link: "formatImagesLink",
  },
  video: {
    title: "formatVideoTitle",
    body: "formatVideoBody",
    link: "formatVideoLink",
  },
} as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-muted-foreground">{children}</p>;
}

const PUBLISHED_PAGE_COPY = {
  en: {
    languageName: "English",
    category: "Daylight journal",
    title: "See the world in a different light.",
    introduction:
      "Every light has a story. Explore the places, people, and everyday moments that connect us across the world.",
    heading: "A new perspective on familiar places",
    body: "From above, borders fade and cities become constellations. Back on the ground, it is the neighbourhood cafés, late-night conversations, and local traditions that bring each place to life.",
    meta: "8 September 2026 · 4 min read",
    imageAlt: "City lights across Earth at night, photographed from space",
  },
  "fr-FR": {
    languageName: "Français",
    category: "Le journal Daylight",
    title: "Voyez le monde sous un autre jour.",
    introduction:
      "Chaque lumière raconte une histoire. Découvrez les lieux, les personnes et les instants du quotidien qui nous relient à travers le monde.",
    heading: "Un regard neuf sur des lieux familiers",
    body: "Vues du ciel, les frontières s’effacent et les villes deviennent des constellations. Au sol, ce sont les cafés de quartier, les conversations nocturnes et les traditions locales qui donnent vie à chaque lieu.",
    meta: "8 septembre 2026 · 4 min de lecture",
    imageAlt: "Les lumières des villes sur Terre la nuit, photographiées depuis l’espace",
  },
  "de-DE": {
    languageName: "Deutsch",
    category: "Das Daylight Journal",
    title: "Die Welt in einem neuen Licht sehen.",
    introduction:
      "Jedes Licht erzählt eine Geschichte. Entdecken Sie die Orte, Menschen und alltäglichen Momente, die uns weltweit verbinden.",
    heading: "Ein neuer Blick auf vertraute Orte",
    body: "Von oben verschwinden Grenzen und Städte werden zu Sternbildern. Am Boden sind es die Cafés im Viertel, die Gespräche bis spät in die Nacht und die lokalen Traditionen, die jedem Ort Leben verleihen.",
    meta: "8. September 2026 · 4 Min. Lesezeit",
    imageAlt: "Nächtliche Lichter der Städte auf der Erde, aus dem Weltraum fotografiert",
  },
  ja: {
    languageName: "日本語",
    category: "Daylight ジャーナル",
    title: "いつもと違う光で、世界を見つめる。",
    introduction:
      "一つひとつの光に、物語があります。世界中の私たちをつなぐ場所や人々、日常のひとときを訪ねてみましょう。",
    heading: "見慣れた場所に、新しい発見を",
    body: "空から眺めると、国境は見えなくなり、街は星座のように輝きます。地上に降りれば、近所のカフェや夜更けの会話、地域の伝統が、その場所ならではの表情をつくっています。",
    meta: "2026年9月8日 · 読了まで約4分",
    imageAlt: "宇宙から撮影した、夜の地球に輝く街の明かり",
  },
  "zh-CN": {
    languageName: "简体中文",
    category: "Daylight 日志",
    title: "换个角度，看见不一样的世界。",
    introduction:
      "每一束光都有一个故事。探索世界各地的人与风景，发现日常生活中将我们紧密相连的瞬间。",
    heading: "在熟悉的地方，发现新的风景",
    body: "从高空俯瞰，边界渐渐隐去，城市宛如璀璨的星座。回到地面，街角的咖啡馆、深夜的交谈和当地的传统，让每个地方都有了独特的生命力。",
    meta: "2026年9月8日 · 阅读约需4分钟",
    imageAlt: "从太空拍摄的地球夜景，城市灯火闪耀",
  },
  "vi-VN": {
    languageName: "Tiếng Việt",
    category: "Nhật ký Daylight",
    title: "Nhìn thế giới dưới một ánh sáng khác.",
    introduction:
      "Mỗi ánh đèn đều có một câu chuyện. Khám phá những vùng đất, con người và khoảnh khắc đời thường kết nối chúng ta trên khắp thế giới.",
    heading: "Một góc nhìn mới về những nơi quen thuộc",
    body: "Nhìn từ trên cao, những đường biên mờ đi và các thành phố hóa thành những chòm sao. Trở lại mặt đất, chính những quán cà phê trong khu phố, những cuộc trò chuyện đêm muộn và truyền thống địa phương đã thổi hồn vào mỗi vùng đất.",
    meta: "8 tháng 9, 2026 · 4 phút đọc",
    imageAlt: "Ánh đèn thành phố trên Trái Đất về đêm, được chụp từ không gian",
  },
} as const satisfies Record<AppLocale | "ja", unknown>;

const PUBLISHED_PAGE_LOCALES = Object.keys(PUBLISHED_PAGE_COPY) as Array<
  keyof typeof PUBLISHED_PAGE_COPY
>;

function WebPublishingSection() {
  const locale = useAppLocale();
  const [language, setLanguage] = useState<keyof typeof PUBLISHED_PAGE_COPY>(locale);
  const orderedLocales = [locale, ...PUBLISHED_PAGE_LOCALES.filter((value) => value !== locale)];
  const article = PUBLISHED_PAGE_COPY[language];

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 sm:gap-12">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>
            <FormattedMessage {...messages.publishEyebrow} />
          </Eyebrow>
          <h2 className="mt-5 text-balance font-heading text-4xl leading-tight sm:text-5xl">
            <FormattedMessage {...messages.publishHeadline} />
          </h2>
          <p className="mt-6 text-pretty text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.publishBody} />
          </p>
        </div>
        <figure className="relative isolate min-w-0 overflow-hidden rounded-xl p-4 sm:p-8 lg:p-12">
          <SectionMeshBackground src={SEAFOAM_MESH_GRADIENT_SRC} className="opacity-80" />
          <figcaption className="relative mb-3 text-center text-xs text-foreground">
            <FormattedMessage {...messages.publishedPreviewCaption} />
          </figcaption>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/50 px-5 py-4 text-xs">
              <span className="min-w-0 break-all text-muted-foreground">
                daylight.example.com/{language}/journal/a-different-light
              </span>
              <span className="inline-flex items-center gap-2 font-medium text-primary">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                <FormattedMessage {...messages.publishedStatus} />
              </span>
            </div>
            <div className="p-5 sm:p-8 lg:px-12">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
                <span className="font-heading text-xl">Daylight</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FormattedMessage {...messages.languageLabel} />
                  <select
                    value={language}
                    onChange={(event) => {
                      const value = PUBLISHED_PAGE_LOCALES.find(
                        (value) => value === event.target.value,
                      );
                      if (value) {
                        setLanguage(value);
                      }
                    }}
                    className="min-h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {orderedLocales.map((value) => (
                      <option key={value} value={value}>
                        {PUBLISHED_PAGE_COPY[value].languageName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <article
                lang={language}
                className="mx-auto max-w-3xl py-8 sm:py-12"
                aria-live="polite"
              >
                <p className="text-xs font-medium text-primary">{article.category}</p>
                <h3 className="mt-4 max-w-2xl text-balance font-heading text-3xl leading-tight sm:text-5xl">
                  {article.title}
                </h3>
                <p className="mt-5 text-pretty text-sm leading-7 text-muted-foreground">
                  {article.introduction}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Alex Morgan</span>
                  <span>{article.meta}</span>
                </div>
                <figure className="mt-6">
                  <Image
                    src="/images/nasa-Q1p7bh3SHj8-unsplash.jpg"
                    alt={article.imageAlt}
                    width={4256}
                    height={2832}
                    sizes="(min-width: 1024px) 768px, (min-width: 640px) 80vw, 90vw"
                    className="aspect-[2/1] w-full rounded-lg object-cover"
                  />
                  <figcaption className="mt-2 text-xs text-muted-foreground">
                    NASA / Unsplash
                  </figcaption>
                </figure>
                <h4 className="mt-8 text-base font-medium">{article.heading}</h4>
                <p className="mt-3 text-pretty text-sm leading-7 text-muted-foreground">
                  {article.body}
                </p>
              </article>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

function FloatingWelcome({
  greeting,
  code,
  phrase,
  colorClassName,
  greetingClassName,
  positionClassName,
  hiddenOnMobile = false,
}: {
  greeting: string;
  code: string;
  phrase: string;
  colorClassName: string;
  greetingClassName: string;
  positionClassName: string;
  hiddenOnMobile?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute flex flex-col gap-2.5 text-left",
        colorClassName,
        positionClassName,
        hiddenOnMobile && "hidden sm:flex",
      )}
    >
      <p className={`font-heading ${greetingClassName}`}>{greeting}</p>
      <p className="text-[11px] leading-relaxed opacity-80">
        <span className="font-medium tracking-wide">{code}</span>
        <span className="mx-1.5 opacity-50">·</span>
        {phrase}
      </p>
    </div>
  );
}

const floatingWelcomes = [
  {
    greeting: "Xin chào.",
    code: "Vi",
    phrase: "Rất vui gặp bạn",
    colorClassName: "text-[#744966]",
    greetingClassName: "text-3xl",
    positionClassName: "left-[6%] top-16 -rotate-6",
  },
  {
    greeting: "สวัสดี.",
    code: "Th",
    phrase: "ยินดีที่ได้รู้จัก",
    colorClassName: "text-[#8b6914]",
    greetingClassName: "text-3xl",
    positionClassName: "left-[5%] top-[42%] rotate-6",
    hiddenOnMobile: true,
  },
  {
    greeting: "Bonjour.",
    code: "Fr",
    phrase: "Enchanté",
    colorClassName: "text-[#6b7244]",
    greetingClassName: "text-3xl",
    positionClassName: "left-[8%] bottom-24 rotate-3",
    hiddenOnMobile: true,
  },
  {
    greeting: "Hallo.",
    code: "De",
    phrase: "Schön, dich zu sehen",
    colorClassName: "text-[#4a6678]",
    greetingClassName: "text-2xl",
    positionClassName: "right-[11%] top-16 -rotate-12",
    hiddenOnMobile: true,
  },
  {
    greeting: "你好。",
    code: "Zh",
    phrase: "欢迎回来",
    colorClassName: "text-[#365383]",
    greetingClassName: "text-4xl",
    positionClassName: "right-[6%] top-[38%] rotate-6",
  },
  {
    greeting: "Hola.",
    code: "Es",
    phrase: "¿Qué tal?",
    colorClassName: "text-[#9a4d67]",
    greetingClassName: "text-3xl",
    positionClassName: "right-[5%] bottom-20 -rotate-6",
    hiddenOnMobile: true,
  },
] as const;

function CampaignArtwork() {
  return (
    <div className="relative min-h-56 overflow-hidden bg-[#172541] p-5 text-white sm:min-h-64">
      <div className="absolute -right-12 -top-12 size-44 rounded-full bg-[#d77da2]" />
      <div className="absolute -bottom-12 right-0 h-36 w-72 rounded-[50%] bg-[#2458b4]" />
      <p className="relative text-[10px] tracking-[0.14em] text-[#ebc36a]">
        DAYLIGHT / SUMMER STORIES
      </p>
      <p className="relative mt-8 font-heading text-3xl leading-tight sm:text-4xl">
        A little further.
        <br />A little closer.
      </p>
    </div>
  );
}

function StudioPreview() {
  return (
    <div id="studio" className="mx-auto max-w-6xl">
      <MeshStage
        className="w-full"
        contentClassName="px-3 pt-3 pb-0 sm:px-8 sm:pt-8 lg:px-10 lg:pt-10"
        meshSrc={SEAFOAM_MESH_GRADIENT_SRC}
        priority
      >
        <ContentOpsMockAppShell
          activeTab="editor"
          size="viewport"
          className="rounded-t-xl rounded-b-none border-0 shadow-2xl shadow-[#172541]/20"
        >
          <ContentOpsEditorPanel pauseAutoplay />
        </ContentOpsMockAppShell>
      </MeshStage>
    </div>
  );
}

function FormatPreview({ format }: { format: FormatId }) {
  if (format === "video") {
    return (
      <div className="grid min-h-80 flex-1 bg-[#dfe7f2] p-4 lg:grid-cols-[1.15fr_.85fr] lg:p-6">
        <div className="overflow-hidden rounded-md">
          <CampaignArtwork />
          <div className="flex items-center gap-3 bg-white p-3 text-xs text-[#43556c]">
            <HugeiconsIcon icon={PlayIcon} className="size-4 text-[#172541]" />
            <span>00:08 / 00:30</span>
            <div className="h-1 flex-1 bg-[#cae7ff]">
              <div className="h-1 w-2/5 bg-[#006bff]" />
            </div>
            <span className="text-[#006bff]">CC · FR</span>
          </div>
        </div>
        <div className="flex flex-col gap-4 rounded-md bg-white p-5 text-[#0b121b]">
          <div className="flex justify-between text-xs">
            <b>
              <FormattedMessage {...messages.previewSubtitles} />
            </b>
            <span className="text-[#006bff]">
              <FormattedMessage
                {...messages.previewSelectedCount}
                values={{ selected: "02", total: "08" }}
              />
            </span>
          </div>
          <div>
            <p className="font-mono text-[11px] text-[#5f7188]">00:06.400 → 00:11.200</p>
            <p className="mt-2 text-[10px] tracking-wider text-[#5f7188]">
              <FormattedMessage {...messages.previewEnglishSource} />
            </p>
            <p className="mt-1 text-sm">A little further. A little closer to you.</p>
          </div>
          <div className="rounded-sm border border-[#94ccff] bg-[#f0f7ff] p-3">
            <p className="text-[10px] tracking-wider text-[#002359]">
              <FormattedMessage {...messages.previewFrenchTranslation} />
            </p>
            <p className="mt-2 text-sm">Un peu plus loin. Un peu plus près.</p>
          </div>
          <div className="mt-auto flex justify-between text-xs">
            <span className="text-green-700">
              ✓ <FormattedMessage {...messages.previewTimingPreserved} />
            </span>
            <span className="text-[#006bff]">
              <FormattedMessage {...messages.previewExportSubtitles} /> ↗
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (format === "images") {
    return (
      <div className="grid min-h-80 flex-1 gap-5 bg-[#ebcbd8] p-5 sm:grid-cols-[16rem_1fr]">
        <div className="relative min-h-64 overflow-hidden bg-[#efc667] p-5 text-[#172541]">
          <div className="absolute -right-10 -top-10 size-36 rounded-full bg-[#d77da2]" />
          <p className="relative text-[10px] tracking-wider">DAYLIGHT / SUMMER STORIES</p>
          <p className="relative mt-12 font-heading text-3xl">
            Đi xa hơn.
            <br />
            Gần nhau hơn.
          </p>
          <div className="absolute inset-x-0 bottom-0 h-24 rounded-[50%_50%_0_0] bg-[#2458b4]" />
        </div>
        <div className="rounded-md bg-white p-5 text-[#0b121b]">
          <div className="flex justify-between text-xs">
            <b>
              <FormattedMessage {...messages.previewTextLayers} />
            </b>
            <span className="text-[#006bff]">
              <FormattedMessage {...messages.previewHeadlineSelected} values={{ index: "02" }} />
            </span>
          </div>
          <p className="mt-6 text-[10px] tracking-wider text-[#5f7188]">
            <FormattedMessage {...messages.previewSourceEnglish} />
          </p>
          <p className="mt-1 text-sm">A little further. A little closer to you.</p>
          <div className="mt-5 rounded-sm border border-[#94ccff] bg-[#f0f7ff] p-3">
            <p className="text-[10px] tracking-wider text-[#002359]">
              <FormattedMessage {...messages.previewVietnameseAdapted} />
            </p>
            <p className="mt-2">Đi xa hơn. Gần nhau hơn.</p>
          </div>
        </div>
      </div>
    );
  }

  if (format === "slides") {
    return (
      <div className="grid min-h-80 flex-1 bg-[#ddd9ec] p-5 sm:grid-cols-[5rem_1fr]">
        <div className="hidden flex-col gap-3 pr-4 sm:flex">
          {["01 / Bonjour", "02 / Explorer", "03 / Ensemble"].map((slide, index) => (
            <div
              key={slide}
              className={
                index === 0
                  ? "border border-[#006bff] bg-[#172541] p-2 text-[10px] text-white"
                  : "bg-white/50 p-2 text-[10px] text-[#172541]"
              }
            >
              {slide}
            </div>
          ))}
        </div>
        <div className="relative min-h-64 overflow-hidden bg-[#172541] p-6 text-white">
          <p className="text-[10px] tracking-wider text-[#ebc36a]">DAYLIGHT / ÉTÉ 2026</p>
          <p className="mt-12 max-w-sm border border-[#94ccff] p-3 font-heading text-3xl">
            Un peu plus loin.
            <br />
            Un peu plus près.
          </p>
          <div className="absolute right-12 top-14 size-28 rounded-full border-[22px] border-[#d77da2] bg-[#ebc36a]" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate grid min-h-80 flex-1 gap-5 overflow-hidden p-5 sm:grid-cols-2">
      <SectionMeshBackground src={BLUSH_MESH_GRADIENT_SRC} className="opacity-80" />
      <article className="relative rounded-t-md bg-white p-6 text-[#0b121b]">
        <p className="text-[10px] tracking-wider text-[#5f7188]">
          <FormattedMessage {...messages.previewEnglishSource} />
        </p>
        <h3 className="mt-5 font-heading text-3xl">
          A guide to
          <br />
          slowing down.
        </h3>
        <p className="mt-5 text-sm leading-6 text-[#5f7188]">
          Make room for the moments that matter. Start with a little less, and discover a little
          more.
        </p>
      </article>
      <article className="relative rounded-t-md border border-[#94ccff] bg-white p-6 text-[#0b121b]">
        <p className="text-[10px] tracking-wider text-[#006bff]">
          <FormattedMessage {...messages.previewFrenchTranslation} />
        </p>
        <h3 className="mt-5 font-heading text-3xl">
          L’art de
          <br />
          ralentir.
        </h3>
        <p className="mt-5 text-sm leading-6 text-[#5f7188]">
          Faites place aux instants qui comptent. Commencez avec un peu moins, découvrez un peu
          plus.
        </p>
      </article>
    </div>
  );
}

function ContentFormats() {
  const intl = useIntl();
  const [format, setFormat] = useState<FormatId>("text");
  const copy = formatCopyKeys[format];

  return (
    <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <Eyebrow>
              <FormattedMessage {...messages.formatsEyebrow} />
            </Eyebrow>
            <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
              <FormattedMessage {...messages.formatsHeadline} />
            </h2>
          </div>
          <p className="max-w-md text-lg leading-8 text-muted-foreground">
            <FormattedMessage {...messages.formatsBody} />
          </p>
        </div>
        <div
          className="mt-10 flex gap-7 overflow-x-auto"
          role="tablist"
          aria-label={intl.formatMessage(messages.formatsAriaLabel)}
        >
          {formatIds.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={format === item}
              onClick={() => setFormat(item)}
              className={
                format === item
                  ? "shrink-0 border-b-2 border-primary pb-3 text-sm text-primary"
                  : "shrink-0 pb-3 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              <FormattedMessage {...messages[formatLabelKeys[item]]} />
            </button>
          ))}
        </div>
        <div className="mt-6 overflow-hidden rounded-xl bg-muted lg:flex">
          <div className="flex w-full shrink-0 flex-col justify-center gap-5 bg-background/55 p-8 lg:w-[34%] lg:p-12">
            <h3 className="whitespace-pre-line text-2xl leading-8 font-semibold tracking-tight">
              <FormattedMessage {...messages[copy.title]} />
            </h3>
            <p className="text-base leading-7 text-muted-foreground">
              <FormattedMessage {...messages[copy.body]} />
            </p>
            <p className="pt-2 text-sm text-primary">
              <FormattedMessage {...messages[copy.link]} /> ↗
            </p>
          </div>
          <FormatPreview format={format} />
        </div>
      </div>
    </section>
  );
}

const faqMessageKeys = [
  ["faqCreateQuestion", "faqCreateAnswer"],
  ["faqEditorQuestion", "faqEditorAnswer"],
  ["faqTmQuestion", "faqTmAnswer"],
  ["faqContextQuestion", "faqContextAnswer"],
  ["faqAiQuestion", "faqAiAnswer"],
  ["faqStatusQuestion", "faqStatusAnswer"],
  ["faqBrandQuestion", "faqBrandAnswer"],
  ["faqFitQuestion", "faqFitAnswer"],
] as const;

const reviewRows = [
  {
    code: "FR",
    language: "languageFrench",
    reviewer: "Alex",
    status: "statusApproved",
    tone: "bg-green-100 text-green-800",
  },
  {
    code: "DE",
    language: "languageGerman",
    reviewer: "Jamie",
    status: "statusInReview",
    tone: "bg-blue-100 text-blue-800",
  },
  {
    code: "JA",
    language: "languageJapanese",
    reviewer: "Minh",
    status: "statusNeedsReview",
    tone: "bg-amber-100 text-amber-800",
  },
] as const;

const contextRows = [
  ["brandVoice", "brandVoiceValue"],
  ["terminology", "terminologyValue"],
  ["marketContext", "marketContextValue"],
] as const;

export function MultilingualContentStudioPage() {
  const locale = useAppLocale();
  const intl = useIntl();
  const faqItems = faqMessageKeys.map(([question, answer]) => ({
    question: intl.formatMessage(messages[question]),
    answer: intl.formatMessage(messages[answer]),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div>
        <section className="relative bg-background px-5 py-20 text-center text-foreground sm:px-8 sm:py-24 lg:px-10">
          {floatingWelcomes.map((welcome) => (
            <FloatingWelcome key={welcome.code} {...welcome} />
          ))}
          <div className="relative mx-auto flex max-w-3xl flex-col items-center">
            <Eyebrow>
              <FormattedMessage {...messages.heroEyebrow} />
            </Eyebrow>
            <h1 className="mt-6 whitespace-pre-line font-heading text-[clamp(3rem,7vw,5.5rem)] leading-[0.98] tracking-[-0.045em]">
              <FormattedMessage {...messages.heroHeadline} />
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#344564] sm:text-xl">
              <FormattedMessage {...messages.heroSubcopy} />
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                nativeButton={false}
                render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
              >
                <FormattedMessage {...messages.requestDemo} />{" "}
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<a href="#studio" />}
              >
                <FormattedMessage {...messages.exploreStudio} /> ↓
              </Button>
            </div>
          </div>
        </section>

        <section className="px-3 pb-0 sm:px-6 lg:px-8">
          <StudioPreview />
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-4 border-b border-border py-7 text-sm text-muted-foreground sm:flex-row">
            <span>
              <FormattedMessage {...messages.fromDraftToReview} />
            </span>
            <span className="flex flex-wrap gap-x-7 gap-y-2">
              <span>
                <FormattedMessage {...messages.stepCreate} />
              </span>
              <span>
                <FormattedMessage {...messages.stepAdapt} />
              </span>
              <span>
                <FormattedMessage {...messages.stepReview} />
              </span>
              <span>
                <FormattedMessage {...messages.stepReady} />
              </span>
            </span>
          </div>
        </section>

        <ContentFormats />

        <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div className="max-w-xl">
              <Eyebrow>
                <FormattedMessage {...messages.contextEyebrow} />
              </Eyebrow>
              <h2 className="mt-5 whitespace-pre-line font-heading text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
                <FormattedMessage {...messages.contextHeadline} />
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                <FormattedMessage {...messages.contextBody} />
              </p>
              <Link
                href={rewriteAppLocalePath("/product/guidelines", locale)}
                className="mt-5 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.exploreGuidelines} /> ↗
              </Link>
            </div>
            <div className="relative isolate overflow-hidden rounded-xl p-4 sm:p-5">
              <SectionMeshBackground src={LAVENDER_MESH_GRADIENT_SRC} className="opacity-80" />
              <div className="relative rounded-xl border border-border bg-card p-6 text-card-foreground sm:p-8">
                <div className="flex justify-between gap-3 border-b border-border pb-6 text-sm">
                  <b>
                    <FormattedMessage {...messages.campaignContext} />
                  </b>
                  <span className="text-primary">
                    <FormattedMessage {...messages.appliedToDraft} /> ✓
                  </span>
                </div>
                {contextRows.map(([label, value]) => (
                  <div key={label} className="grid gap-2 pt-5 text-sm sm:grid-cols-[8rem_1fr]">
                    <span className="text-muted-foreground">
                      <FormattedMessage {...messages[label]} />
                    </span>
                    <span>
                      <FormattedMessage {...messages[value]} />
                    </span>
                  </div>
                ))}
                <div className="mt-6 flex gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
                  <span>EN</span>
                  <span>→</span>
                  <span className="text-primary">FR</span>
                  <span>DE</span>
                  <span>JA</span>
                  <span className="ms-auto hidden sm:block">
                    <FormattedMessage {...messages.sharedContext} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div className="relative isolate overflow-hidden rounded-xl p-4 sm:p-5">
              <SectionMeshBackground src={ROSE_MESH_GRADIENT_SRC} className="opacity-75" />
              <div className="relative overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex justify-between bg-muted/60 p-5 text-sm">
                  <b>
                    <FormattedMessage {...messages.summerCampaign} />
                  </b>
                  <span className="text-muted-foreground">
                    <FormattedMessage {...messages.languageReview} />
                  </span>
                </div>
                {reviewRows.map((row) => (
                  <div
                    key={row.code}
                    className="grid grid-cols-[2rem_1fr_auto] items-center gap-4 border-t border-border p-5 text-sm sm:grid-cols-[2rem_1fr_7rem_8rem_auto]"
                  >
                    <span className="text-xs text-muted-foreground">{row.code}</span>
                    <b>
                      <FormattedMessage {...messages[row.language]} />
                    </b>
                    <span className="hidden text-muted-foreground sm:block">{row.reviewer}</span>
                    <span className={`rounded-full px-3 py-1 text-xs ${row.tone}`}>
                      <FormattedMessage {...messages[row.status]} />
                    </span>
                    <span>↗</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Eyebrow>
                <FormattedMessage {...messages.reviewEyebrow} />
              </Eyebrow>
              <h2 className="mt-5 font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
                <FormattedMessage {...messages.reviewHeadline} />
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                <FormattedMessage {...messages.reviewBody} />
              </p>
              <p className="mt-5 text-sm leading-7 text-muted-foreground">
                <FormattedMessage {...messages.reviewCompare} />
                <br />
                <FormattedMessage {...messages.reviewLoop} />
              </p>
            </div>
          </div>
        </section>

        <WebPublishingSection key={locale} />

        <section className="mx-auto max-w-7xl border-y border-border px-5 py-10 sm:px-8 lg:px-10">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-medium tracking-tight">
                <FormattedMessage {...messages.connectedHeadline} />
              </h2>
              <p className="mt-2 text-base text-muted-foreground">
                <FormattedMessage {...messages.connectedBody} />
              </p>
            </div>
            <div className="flex flex-wrap gap-6">
              <Link
                href={rewriteAppLocalePath("/product/agents-automation", locale)}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.automationWorkflow} /> ↗
              </Link>
              <Link
                href={rewriteAppLocalePath("/product/guidelines", locale)}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                <FormattedMessage {...messages.guidelines} /> ↗
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
          <HomepageFaqSection
            items={faqItems}
            heading={
              <span className="whitespace-pre-line">
                <FormattedMessage {...messages.faqHeading} />
              </span>
            }
            subheading={<FormattedMessage {...messages.faqSubheading} />}
          />
        </div>

        <section className="px-5 pb-20 sm:px-8 lg:px-10">
          <MeshStage
            className="mx-auto max-w-7xl"
            contentClassName="p-0"
            meshSrc={DUSK_MESH_GRADIENT_SRC}
            mixSrc={ROSE_MESH_GRADIENT_SRC}
          >
            <div className="flex flex-col justify-between gap-10 bg-[#172541]/45 p-8 text-[#f8f0f5] sm:p-12 lg:flex-row lg:items-center lg:p-16">
              <div>
                <h2 className="whitespace-pre-line font-heading text-4xl leading-tight tracking-tight sm:text-5xl">
                  <FormattedMessage {...messages.ctaHeadline} />
                </h2>
                <p className="mt-5 text-lg text-[#e5edf9]">
                  <FormattedMessage {...messages.ctaBody} />
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 lg:items-center">
                <Button
                  size="lg"
                  className="bg-[#ebc36a] text-[#172541] hover:bg-[#f2db9b]"
                  nativeButton={false}
                  render={<a href={REQUEST_DEMO_URL} target="_blank" rel="noopener noreferrer" />}
                >
                  <FormattedMessage {...messages.requestDemo} />{" "}
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                </Button>
                <span className="text-xs text-[#e5edf9]">
                  <FormattedMessage {...messages.ctaNote} />
                </span>
              </div>
            </div>
          </MeshStage>
        </section>

        <section className="border-t border-border px-5 pt-16 sm:px-8 lg:px-10">
          <MarketingFooter columns={footerColumns} />
        </section>
      </div>
    </div>
  );
}
