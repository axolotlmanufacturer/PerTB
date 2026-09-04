import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';

/**
 * Required by @next/mdx in the App Router: every .mdx file renders through
 * this map.
 *
 * It exists to do two things. Internal links become <Link>, so a guide sending
 * someone to /hdd/nas does a client transition instead of a full load — and
 * still renders a real <a href>, so it works with JavaScript off. And headings
 * get ids, so a long guide can be linked to by section.
 *
 * Everything else stays a plain element and is styled by `.prose` in
 * globals.css. Article text is the one place on this site with generous
 * measure and leading; the density rule is about the table.
 */

function slugify(children: React.ReactNode): string {
  return String(children)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: ({ children }) => <h2 id={slugify(children)}>{children}</h2>,
    h3: ({ children }) => <h3 id={slugify(children)}>{children}</h3>,
    a: ({ href, children }) => {
      const target = href ?? '';
      if (target.startsWith('/')) return <Link href={target}>{children}</Link>;
      // An outbound link in editorial is not an affiliate link and must not
      // carry sponsored rel — that is a different claim about a different kind
      // of link. It does get noopener.
      return (
        <a href={target} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    ...components,
  };
}
