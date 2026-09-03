import { formatDollars } from '@/lib/pricing';
import { dispersionPositions, type TableView } from '@/lib/table';

/**
 * Every live listing as a tick on a LOG-scale $/TB axis, with the current
 * selection highlighted and the floor marked.
 *
 * Log, not linear. On a linear axis every hard drive lands in the leftmost 5%
 * and the remaining width is spent separating three overpriced Gen 5 SSDs —
 * the shape of the market becomes invisible, which is the one thing this strip
 * exists to show.
 *
 * Server-rendered inline SVG: no library, no client JavaScript, present in the
 * initial HTML.
 */
export function DispersionStrip({ view }: { view: TableView }) {
  const ticks = dispersionPositions(view.dispersion);
  if (ticks.length === 0) return null;

  const values = view.dispersion.map((d) => d.pptCents).filter((v) => v > 0);
  const min = Math.min(...values);
  const max = Math.max(...values);

  const width = 1000;
  const height = 44;
  const padding = 2;
  const usable = width - padding * 2;

  const floorX =
    view.floorPptCents === null
      ? null
      : padding +
        usable *
          (Math.log10(max) === Math.log10(min)
            ? 0.5
            : (Math.log10(Math.max(view.floorPptCents, min)) - Math.log10(min)) /
              (Math.log10(max) - Math.log10(min)));

  return (
    <figure style={{ margin: '0 0 1rem' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
        role="img"
        aria-label={`Price per terabyte distribution across ${ticks.length} listings, from ${formatDollars(min / 100)} to ${formatDollars(max / 100)} per terabyte, on a logarithmic scale`}
      >
        {/* Unmatched first, so the selection draws on top of it. */}
        {ticks
          .filter((t) => !t.matched)
          .map((t, i) => (
            <line
              key={`u${i}`}
              x1={padding + t.x * usable}
              x2={padding + t.x * usable}
              y1={8}
              y2={26}
              stroke="var(--border)"
              strokeWidth={1}
            />
          ))}
        {ticks
          .filter((t) => t.matched)
          .map((t, i) => (
            <line
              key={`m${i}`}
              x1={padding + t.x * usable}
              x2={padding + t.x * usable}
              y1={4}
              y2={30}
              stroke="var(--accent)"
              strokeWidth={1}
              opacity={0.75}
            />
          ))}

        {floorX !== null && (
          <line
            x1={floorX}
            x2={floorX}
            y1={0}
            y2={34}
            stroke="var(--floor)"
            strokeWidth={2}
          />
        )}
      </svg>

      <figcaption
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--fg-muted)',
          fontSize: '11px',
        }}
        className="tabular"
      >
        <span>{formatDollars(min / 100)}/TB</span>
        <span>
          log scale · {view.matchedOffers.toLocaleString('en-US')} of{' '}
          {view.totalOffers.toLocaleString('en-US')} listings
          {view.floorPptCents !== null && (
            <> · floor {formatDollars(view.floorPptCents / 100)}/TB</>
          )}
        </span>
        <span>{formatDollars(max / 100)}/TB</span>
      </figcaption>
    </figure>
  );
}
