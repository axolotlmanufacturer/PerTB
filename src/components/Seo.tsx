import Link from 'next/link';
import { formatCapacity, formatDollars } from '@/lib/pricing';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import type { TableView } from '@/lib/table';

/**
 * Structured data: ItemList and BreadcrumbList ONLY.
 *
 * No Product markup, deliberately. Google penalises Product structured data on
 * pages that do not sell the item — we are a comparison table linking out to
 * marketplaces, not a merchant, and claiming otherwise risks a manual action
 * against the whole domain (CLAUDE.md §2).
 */

export interface Crumb {
  name: string;
  path: string;
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Server-rendered constant; no user input reaches it.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function BreadcrumbJsonLd({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: crumb.name,
          item: new URL(crumb.path, SITE_URL).toString(),
        })),
      }}
    />
  );
}

/**
 * The table as an ItemList. Capped: a list of several hundred entries bloats
 * the document for no additional rich-result benefit.
 */
export function ItemListJsonLd({
  view,
  name,
  limit = 20,
}: {
  view: TableView;
  name: string;
  limit?: number;
}) {
  const items = view.groups.slice(0, limit);
  if (items.length === 0) return null;

  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name,
        numberOfItems: view.groups.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: items.map((group, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          // A plain name, not a Product node.
          name: `${group.cheapest.brand} ${group.cheapest.model} ${formatCapacity(
            group.cheapest.capacityBytes,
          )} — ${formatDollars(group.cheapestPptCents / 100)}/TB`,
        })),
      }}
    />
  );
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      {crumbs.map((crumb, i) => (
        <span key={crumb.path}>
          {i > 0 && (
            <span aria-hidden="true" className="crumbs__sep">
              /
            </span>
          )}
          {i === crumbs.length - 1 ? (
            <span aria-current="page">{crumb.name}</span>
          ) : (
            <Link href={crumb.path}>{crumb.name}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export const SITE_TITLE = SITE_NAME;
