import Link from "next/link";
import { ErrorBadge } from "@/components/ui/Badge";
import { scoreColor } from "@/lib/colors";
import type { ImageListItem } from "@/types/validation";

interface Props {
  item: ImageListItem;
  runId: string;
  /** Preserves gallery URL filters in the "back" breadcrumb on the detail page */
  fromSearch?: string;
}

export function ImageCard({ item, runId, fromSearch }: Props) {
  const color  = scoreColor(item.score);
  const pct    = Math.round(item.score * 100);
  const href   = `/runs/${runId}/images/${item.id}${fromSearch ? `?from=${encodeURIComponent(fromSearch)}` : ""}`;

  return (
    <Link href={href} className="image-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageUrl}
        alt={item.filename}
        className="image-card-thumb"
        loading="lazy"
      />
      <div className="image-card-body">
        <div className="image-card-name">{item.filename}</div>

        {/* Score bar */}
        <div className="score-bar-wrap">
          <div className="score-bar-track">
            <div
              className="score-bar-fill"
              style={{ width: `${pct}%`, background: color }}
            />
          </div>
          <span className="score-val" style={{ color }}>
            {item.score.toFixed(2)}
          </span>
        </div>

        {/* Error badge */}
        <div style={{ marginTop: "0.4rem" }}>
          <ErrorBadge errorType={item.dominantErrorType} size="sm" />
        </div>

        {/* TP / FP / FN counts */}
        <div className="image-card-counts">
          <span className="count-tp">TP {item.truePositives}</span>
          <span className="count-fp">FP {item.falsePositives}</span>
          <span className="count-fn">FN {item.falseNegatives}</span>
        </div>

        {/* Class tags */}
        {item.classesPresent.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.25rem",
              marginTop: "0.45rem",
            }}
          >
            {item.classesPresent.slice(0, 3).map((cls) => (
              <span
                key={cls}
                style={{
                  fontSize: "0.6rem",
                  padding: "0.05rem 0.3rem",
                  borderRadius: "3px",
                  background: "var(--s3)",
                  color: "var(--t3)",
                  fontWeight: 600,
                }}
              >
                {cls}
              </span>
            ))}
            {item.classesPresent.length > 3 && (
              <span
                style={{
                  fontSize: "0.6rem",
                  color: "var(--t3)",
                  padding: "0.05rem 0.2rem",
                }}
              >
                +{item.classesPresent.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
