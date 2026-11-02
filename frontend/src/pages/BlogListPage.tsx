import React from "react";
import { Link } from "react-router-dom";
import { BlogLayout } from "../components/blog/BlogLayout";
import { getPostsByLang } from "../../content/blog";
import { useTranslation as useI18nTranslation } from "react-i18next";
import { SEO } from "../components/seo/SEO";
import { BreadcrumbJsonLd } from "../components/seo/JsonLd";
import { SITE_URL } from "../components/seo/constants";

const CATEGORY_COLORS: Record<string, string> = {
  Product: "bg-[var(--color-accent-light)] text-accent-base",
  Business: "bg-[var(--color-success-light)] text-success-base",
  Technical:
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  // Ukrainian categories
  "\u041F\u0440\u043E\u0434\u0443\u043A\u0442":
    "bg-[var(--color-accent-light)] text-accent-base",
  "\u0411\u0456\u0437\u043D\u0435\u0441":
    "bg-[var(--color-success-light)] text-success-base",
  "\u0422\u0435\u0445\u043D\u0456\u0447\u043D\u0435":
    "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
};

export const BlogListPage: React.FC = () => {
  const { t, i18n } = useI18nTranslation();
  const interfaceLanguage = i18n.language?.split("-")[0] ?? "en";
  const lang = interfaceLanguage === "uk" ? "uk" : "en";
  // Posts only exist in English and Ukrainian; the header follows the posts.
  const tContent = i18n.getFixedT(lang);
  const hasNoPostsInInterfaceLanguage = interfaceLanguage === "ru";
  const posts = getPostsByLang(lang);

  return (
    <BlogLayout>
      <SEO
        title={tContent("blog.title")}
        description={tContent("blog.description")}
        path="/blog"
        lang={lang}
      />
      <BreadcrumbJsonLd
        items={[
          { name: tContent("blog.home"), url: `${SITE_URL}/` },
          { name: tContent("blog.title"), url: `${SITE_URL}/blog` },
        ]}
      />
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-content tracking-tight mb-3">
          {tContent("blog.title")}
        </h1>
        <p className="text-content-secondary text-lg">
          {tContent("blog.description")}
        </p>
        {hasNoPostsInInterfaceLanguage && (
          <p
            role="note"
            className="mt-4 text-sm text-content-secondary"
            data-testid="blog-language-note"
          >
            {t("blog.languageNote")}
          </p>
        )}
      </div>

      <div className="grid gap-6">
        {posts.map((post) => (
          <Link
            key={post.slug}
            to={`/blog/${post.slug}`}
            className="group block rounded-xl border border-[var(--color-border)] bg-elevated p-6 hover:border-[var(--color-border-hover)] transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[post.category] ?? "bg-surface-alt text-content-secondary"}`}
              >
                {post.category}
              </span>
              <time
                className="text-xs text-content-tertiary"
                dateTime={post.date}
              >
                {new Date(post.date).toLocaleDateString(
                  lang === "uk" ? "uk-UA" : "en-US",
                  {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  },
                )}
              </time>
            </div>
            <h2 className="text-lg font-semibold text-content group-hover:text-accent-base transition-colors mb-2 tracking-tight">
              {post.title}
            </h2>
            <p className="text-sm text-content-secondary leading-relaxed">
              {post.description}
            </p>
          </Link>
        ))}
      </div>
    </BlogLayout>
  );
};
