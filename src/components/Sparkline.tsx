import Link from 'next/link';
import { sparklinePath, type GroupHistory } from '@/lib/history';
import { formatDollars } from '@/lib/pricing';

/**
 * The 90-day sparkline column (ticket 5.1).
 *
 * Server-rendered inline SVG: no charting library, no client JavaScript, and
 * present in the initial HTML like everything else on this page.
 *
 * It is deliberately unlabelled and deliberately small. A 72-pixel graphic can
 * answer one question honestly — which way has this moved, and roughly how far
 * relative to itself — so the percentage next to it carries the magnitude and
 * the detail view carries the rest.
 */

const W = 72;
const H = 20;

function percentChange(history: GroupHistory): number | null {
  const first = history.series[0];
  const last = history.series.at(-1);
  if (!first || !last || first.pptCents <= 0) return null;
  return ((last.pptCents - first.pptCents) / first.pptCents) * 100;
}

export function Sparkline({ history }: { history: GroupHistory }) {
  const path = sparklinePath(history.series, W, H);
  if (!path) return null;

  const last = history.series.at(-1);
  const values = history.series.map((p) => p.pptCents);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const span = vMax - vMin;

  // Where the current price sits, so the eye lands on "now" rather than on the
  // shape as a whole.
  const cx = W - 1;
  const cy =
    last === undefined || span === 0
      ? H / 2
      : 1 + (H - 2) - ((last.pptCents - vMin) / span) * (H - 2);

  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Price per terabyte over the last ${history.depthDays} days, from ${formatDollars(
        history.highPptCents / 100,
      )} at its highest to ${formatDollars(history.lowPptCents / 100)} at its lowest`}
    >
      <path className="spark__line" d={path} />
      <circle className="spark__now" cx={cx} cy={cy} r={1.75} />
    </svg>
  );
}

/**
 * The whole history cell: sparkline, percentage move, and the link through to
 * the detail view.
 *
 * When there is no history the cell still links — a drive first seen this
 * morning has nothing to draw, but its offers and specifications are worth a
 * page, and a dead cell in every row of a new table teaches people to ignore
 * the column.
 */
export function HistoryCell({
  history,
  href,
}: {
  history: GroupHistory | null;
  href: string;
}) {
  if (!history) {
    return (
      <Link
        className="spark-cell__none"
        href={href}
        title="No recorded price movement yet"
      >
        —
      </Link>
    );
  }

  const change = percentChange(history);
  const direction =
    change === null || Math.abs(change) < 0.5 ? '' : change < 0 ? 'down' : 'up';

  return (
    <Link
      className="spark-cell"
      href={href}
      title={`${history.depthDays} days observed · high ${formatDollars(
        history.highPptCents / 100,
      )}/TB · low ${formatDollars(history.lowPptCents / 100)}/TB`}
    >
      <Sparkline history={history} />
      {change !== null && (
        <span className={`spark-cell__delta${direction ? ` delta--${direction}` : ''}`}>
          {change > 0 ? '+' : ''}
          {change.toFixed(0)}%
        </span>
      )}
    </Link>
  );
}
