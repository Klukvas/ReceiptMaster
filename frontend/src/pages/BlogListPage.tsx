import React from "react";
import { Link } from "react-router-dom";
import { BlogLayout } from "../components/blog/BlogLayout";
import { getPostsByLang } from "../../content/blog";
import { useTranslation } from "../hooks/useTranslation";
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
  const { currentLanguage } = useTranslation();
  const lang = currentLanguage === "uk" ? "uk" : "en";
  const posts = getPostsByLang(lang);

  return (
    <BlogLayout>
      <SEO
        title={lang === "uk" ? "\u0411\u043B\u043E\u0433" : "Blog"}
        description={
          lang === "uk"
            ? "\u0413\u0430\u0439\u0434\u0438, \u043F\u043E\u0440\u0430\u0434\u0438 \u0442\u0430 \u0456\u043D\u0441\u0430\u0439\u0442\u0438 \u0434\u043B\u044F \u0441\u0443\u0447\u0430\u0441\u043D\u0438\u0445 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0456\u0432."
            : "Guides, tips, and insights for modern merchants."
        }
        path="/blog"
        lang={lang}
        alternates={[
          { hreflang: "x-default", href: `${SITE_URL}/blog` },
          { hreflang: "en", href: `${SITE_URL}/blog` },
          { hreflang: "uk", href: `${SITE_URL}/blog` },
        ]}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: `${SITE_URL}/` },
          { name: "Blog", url: `${SITE_URL}/blog` },
        ]}
      />
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-content tracking-tight mb-3">
          {lang === "uk" ? "\u0411\u043B\u043E\u0433" : "Blog"}
        </h1>
        <p className="text-content-secondary text-lg">
          {lang === "uk"
            ? "\u0413\u0430\u0439\u0434\u0438, \u043F\u043E\u0440\u0430\u0434\u0438 \u0442\u0430 \u0456\u043D\u0441\u0430\u0439\u0442\u0438 \u0434\u043B\u044F \u0441\u0443\u0447\u0430\u0441\u043D\u0438\u0445 \u043F\u0440\u043E\u0434\u0430\u0432\u0446\u0456\u0432."
            : "Guides, tips, and insights for modern merchants."}
        </p>
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
