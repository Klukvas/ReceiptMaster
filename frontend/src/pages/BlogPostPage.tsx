import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft } from 'lucide-react';
import { BlogLayout } from '../components/blog/BlogLayout';
import { getPostBySlug } from '../../content/blog';

export const BlogPostPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPostBySlug(slug) : undefined;
  const isUk = post?.lang === 'uk';
  const dateLocale = isUk ? 'uk-UA' : 'en-US';

  useEffect(() => {
    if (post?.description) {
      const meta = document.querySelector('meta[name="description"]');
      const original = meta?.getAttribute('content') ?? '';
      meta?.setAttribute('content', post.description);
      return () => { meta?.setAttribute('content', original); };
    }
  }, [post?.description]);

  if (!post) {
    return (
      <BlogLayout title={isUk ? 'Не знайдено' : 'Not Found'}>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold text-content mb-4">
            {isUk ? 'Статтю не знайдено' : 'Article not found'}
          </h1>
          <Link
            to="/blog"
            className="text-accent-base hover:underline inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {isUk ? 'До блогу' : 'Back to blog'}
          </Link>
        </div>
      </BlogLayout>
    );
  }

  return (
    <BlogLayout title={post.title}>
      <article>
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Link
              to="/blog"
              className="text-sm text-content-tertiary hover:text-content transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {isUk ? 'Усі статті' : 'All articles'}
            </Link>
          </div>
          <time className="text-sm text-content-tertiary" dateTime={post.date}>
            {new Date(post.date).toLocaleDateString(dateLocale, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-accent-base prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none prose-code:bg-surface-alt prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
    </BlogLayout>
  );
};
