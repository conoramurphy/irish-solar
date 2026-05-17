/**
 * Per-route SEO metadata used by `usePageMeta()` to write document.title,
 * meta[name=description], link[rel=canonical] and og:* tags at runtime.
 *
 * Why this exists: index.html ships a single static head for every route, so
 * a SPA crawl shows /dairy and /hotels declaring themselves canonical to /.
 * That kills organic ranking for the segment pages and dilutes paid-traffic
 * attribution. Per-route copy comes from the WattProfit audit, May 2026.
 */

export const CANONICAL_ORIGIN = 'https://wattprofit.ie';

export interface PageMeta {
  /** Browser tab title and og:title default. Aim for 50 to 60 characters. */
  title: string;
  /** Meta description and og:description default. Aim for 150 to 160 characters. */
  description: string;
  /** Path segment used for the canonical URL and og:url, e.g. `/dairy`. Include leading slash. */
  path: string;
  /** Optional override for og:title (e.g. social-share text without the brand suffix). */
  ogTitle?: string;
  /** Optional override for og:description. */
  ogDescription?: string;
}

export const HOME_META: PageMeta = {
  title: 'Independent Solar ROI Modelling for Irish Businesses | WattProfit',
  description: 'Independent solar and battery ROI modelling. Half-hourly meter data, SEAI grants, exact payback year. 24-hour turnaround. No installer bias.',
  path: '/',
};

export const DAIRY_META: PageMeta = {
  title: 'Solar ROI for Irish Dairy Farms | TAMS 3 Modelling | WattProfit',
  description: 'Independent solar payback modelling for Irish dairy farms. Plate coolers, bulk tanks, TAMS 3 grants priced in. Exact payback year in 24 hours.',
  path: '/dairy',
};

export const HOTEL_META: PageMeta = {
  title: 'Solar ROI for Irish Hotels | ACA + SEAI Modelling | WattProfit',
  description: 'Independent solar payback modelling for Irish hotels. Occupancy-weighted load, ACA tax relief, SEAI grants. Exact payback year in 24 hours.',
  path: '/hotels',
};
