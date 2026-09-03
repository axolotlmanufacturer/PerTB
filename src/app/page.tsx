import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';

/**
 * Phase 0 placeholder.
 *
 * This is a Server Component and it stays one. From Phase 3 this file reads
 * `searchParams`, queries Postgres directly, and emits fully-populated
 * `<table>` markup in the initial HTML — Googlebot's first paint must not be
 * an empty table (brief §6). Do not convert this to a client component and do
 * not fetch the table from the browser.
 */
export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: '68rem',
        margin: '0 auto',
        padding: '2rem 1.25rem 4rem',
      }}
    >
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          paddingBottom: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>{SITE_NAME}</h1>
        <p style={{ margin: 0, color: 'var(--fg-muted)' }}>{SITE_TAGLINE}</p>
      </header>

      <section>
        <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem' }}>
          Phase 0 — repository and guardrails
        </h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--fg-muted)', maxWidth: '52ch' }}>
          Scaffold only. No data sources, no schema and no table yet. The comparison table
          arrives in Phase 3, reading <code>searchParams</code> and server-rendering
          complete markup.
        </p>

        <table
          style={{
            borderCollapse: 'collapse',
            width: '100%',
            maxWidth: '44rem',
            fontSize: '13px',
          }}
        >
          <caption
            style={{
              captionSide: 'top',
              textAlign: 'left',
              color: 'var(--fg-muted)',
              paddingBottom: '0.4rem',
            }}
          >
            Build status
          </caption>
          <thead>
            <tr>
              <th style={th}>Phase</th>
              <th style={th}>Scope</th>
              <th style={th}>State</th>
            </tr>
          </thead>
          <tbody>
            {PHASES.map((phase) => (
              <tr key={phase.id}>
                <td style={{ ...td, whiteSpace: 'nowrap' }} className="tabular">
                  {phase.id}
                </td>
                <td style={td}>{phase.scope}</td>
                <td style={{ ...td, color: 'var(--fg-muted)' }}>{phase.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  padding: '0.35rem 0.75rem 0.35rem 0',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  borderBottom: '1px solid var(--border)',
  padding: '0.35rem 0.75rem 0.35rem 0',
  verticalAlign: 'top',
};

const PHASES = [
  { id: '0', scope: 'Repository and guardrails', state: 'this build' },
  {
    id: '1',
    scope: 'Domain core — taxonomy, normalisation, pricing, schema',
    state: 'next',
  },
  { id: '2', scope: 'Ingest — adapters, affiliate links, sweep', state: 'planned' },
  { id: '3', scope: 'The table — facets, collapse, dispersion', state: 'planned' },
  { id: '4', scope: 'SEO surface — curated landing routes', state: 'planned' },
  { id: '5', scope: 'Price history and shucking', state: 'planned' },
  { id: '6', scope: 'Deal alerts', state: 'planned' },
  { id: '7', scope: 'Editorial, admin and compliance', state: 'planned' },
] as const;
