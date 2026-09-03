import { sparklinePath, type GroupHistory } from '@/lib/history';
import { formatDollars } from '@/lib/pricing';

/**
 * The full-size price history chart for the detail view (ticket 5.3).
 *
 * Same series and same geometry as the sparkline in the table — one
 * implementation of the path, in history.ts — drawn larger and with its axes
 * labelled, because here there is room to say what the numbers are.
 *
 * Server-rendered inline SVG. No charting library: a 40KB dependency to draw
 * one polyline would cost more Total Blocking Time than the whole page
 * currently spends.
 */

const W = 720;
const H = 160;
const PAD = 18;

const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function PriceChart({ history }: { history: GroupHistory }) {
  const path = sparklinePath(history.series, W, H, PAD);
  if (!path) return null;

  const first = history.series[0];
  const last = history.series.at(-1);
  if (!first || !last) return null;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Price per terabyte over ${history.depthDays} days: high ${formatDollars(
          history.highPptCents / 100,
        )}, low ${formatDollars(history.lowPptCents / 100)}, currently ${formatDollars(
          last.pptCents / 100,
        )}`}
      >
        <line className="chart__axis" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
        <line className="chart__axis" x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} />
        <path className="chart__line" d={path} />
      </svg>

      <figcaption className="dispersion__legend tabular">
        <span>{DATE.format(new Date(first.at))}</span>
        <span>
          {history.depthDays} days observed · high{' '}
          {formatDollars(history.highPptCents / 100)}/TB · low{' '}
          {formatDollars(history.lowPptCents / 100)}/TB
        </span>
        <span>{DATE.format(new Date(last.at))}</span>
      </figcaption>
    </figure>
  );
}
