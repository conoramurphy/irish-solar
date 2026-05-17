import { useEffect } from 'react';
import { CANONICAL_ORIGIN, type PageMeta } from '../data/routeMeta';

/**
 * Writes document.title, meta[name=description], link[rel=canonical], and a
 * compact set of og:* tags whenever the supplied PageMeta changes. Safe in
 * SSR/test environments because the body is gated on `typeof document`.
 *
 * Designed for client-rendered SPA routes where index.html only ships one
 * static head. Googlebot runs JS and will see these updates; view-source will
 * still show the static fallback, which is fine.
 */
export function usePageMeta(meta: PageMeta): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.title = meta.title;

    const fullUrl = CANONICAL_ORIGIN + meta.path;

    setMeta('description', meta.description, 'name');
    setMeta('og:title', meta.ogTitle ?? meta.title, 'property');
    setMeta('og:description', meta.ogDescription ?? meta.description, 'property');
    setMeta('og:url', fullUrl, 'property');
    setMeta('og:type', 'website', 'property');
    setMeta('og:locale', 'en_IE', 'property');
    setLink('canonical', fullUrl);
  }, [meta.title, meta.description, meta.path, meta.ogTitle, meta.ogDescription]);
}

function setMeta(key: string, value: string, attr: 'name' | 'property'): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}
