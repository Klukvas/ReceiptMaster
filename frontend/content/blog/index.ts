// English
import gettingStarted from './getting-started.md?raw';
import pdfReceiptTemplates from './pdf-receipt-templates.md?raw';
import automateBusinessFinances from './automate-business-finances.md?raw';
import sha256ReceiptVerification from './sha256-receipt-verification.md?raw';
import orderManagementTips from './order-management-tips.md?raw';
import multiLanguageReceipts from './multi-language-receipts.md?raw';
import inventoryTrackingGuide from './inventory-tracking-guide.md?raw';
import revenueAnalytics from './revenue-analytics.md?raw';
import digitalInvoicingEu from './digital-invoicing-eu.md?raw';
import customerManagementCrm from './customer-management-crm.md?raw';

// Ukrainian
import gettingStartedUk from './getting-started-uk.md?raw';
import pdfReceiptTemplatesUk from './pdf-receipt-templates-uk.md?raw';
import automateBusinessFinancesUk from './automate-business-finances-uk.md?raw';
import sha256ReceiptVerificationUk from './sha256-receipt-verification-uk.md?raw';
import orderManagementTipsUk from './order-management-tips-uk.md?raw';
import multiLanguageReceiptsUk from './multi-language-receipts-uk.md?raw';
import inventoryTrackingGuideUk from './inventory-tracking-guide-uk.md?raw';
import revenueAnalyticsUk from './revenue-analytics-uk.md?raw';
import digitalInvoicingEuUk from './digital-invoicing-eu-uk.md?raw';
import customerManagementCrmUk from './customer-management-crm-uk.md?raw';

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  category: string;
  description: string;
  content: string;
  lang: string;
}

function parseFrontmatter(raw: string): BlogPost {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { slug: '', title: '', date: '', category: '', description: '', content: raw, lang: 'en' };

  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim().replace(/^["']|["']$/g, '');
    meta[key] = val;
  }

  const slug = meta.slug ?? '';

  return {
    slug,
    title: meta.title ?? '',
    date: meta.date ?? '',
    category: meta.category ?? '',
    description: meta.description ?? '',
    content: match[2].trim(),
    lang: slug.endsWith('-uk') ? 'uk' : 'en',
  };
}

const ALL_POSTS: string[] = [
  gettingStarted, pdfReceiptTemplates, automateBusinessFinances,
  sha256ReceiptVerification, orderManagementTips, multiLanguageReceipts,
  inventoryTrackingGuide, revenueAnalytics, digitalInvoicingEu, customerManagementCrm,
  gettingStartedUk, pdfReceiptTemplatesUk, automateBusinessFinancesUk,
  sha256ReceiptVerificationUk, orderManagementTipsUk, multiLanguageReceiptsUk,
  inventoryTrackingGuideUk, revenueAnalyticsUk, digitalInvoicingEuUk, customerManagementCrmUk,
];

export const blogPosts: BlogPost[] = ALL_POSTS
  .map(parseFrontmatter)
  .sort((a, b) => b.date.localeCompare(a.date));

export const getPostBySlug = (slug: string): BlogPost | undefined =>
  blogPosts.find((p) => p.slug === slug);

export const getPostsByLang = (lang: string): BlogPost[] =>
  blogPosts.filter((p) => p.lang === lang);
