/**
 * Detailed image-level view mapped to /api/runs/[runId]/images[imageId] endpoint.
 * 
 */

import { getImageDetail, getRun } from "@/lib/store";
import { notFound } from "next/navigation";
import { ErrorBadge } from "@/components/ui/Badge";
import { errorColor, errorLabel, scoreColor } from "@/lib/colors";
import Link from "next/link";
import { BoxOverlay } from "@/components/detail/BoxOverlay";

export default async function ImageDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; imageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { runId, imageId } = await params;
  const sp = await searchParams;

  const run   = getRun(runId);
  const image = getImageDetail(imageId);
  if (!run || !image) notFound();

  // "from" param preserves gallery filters in the Back link
  const rawFrom = sp.from;
  const fromQS  = typeof rawFrom === "string" ? rawFrom : "";
  const backHref = fromQS
    ? `/runs/${runId}/images?${fromQS}`
    : `/runs/${runId}/images`;

  const scoreClr = scoreColor(image.score);
  const scorePct = Math.round(image.score * 100);

  // Adjacent image IDs aren't available without re-querying; omit prev/next for now
  return (
    <main className="page" style={{ paddingTop: "1.5rem" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href={`/runs/${runId}`}>Overview</Link>
        <span className="breadcrumb-sep">/</span>
        <Link href={backHref}>Gallery</Link>
        <span className="breadcrumb-sep">/</span>
        <span
          style={{
            color: "var(--t1)",
            fontFamily: "var(--font-mono)",
            fontSize: "0.72rem",
          }}
        >
          {image.filename}
        </span>
      </div>

      <div className="detail-grid">
        {/* Left column: image + overlay */}
        <div>
          <BoxOverlay image={image} />
        </div>

        {/* Right column: sidebar */}
        <div className="detail-sidebar" style={{ marginTop: "2.5rem"}}>
          {/* Image summary */}
          <div className="card sidebar-section">
            <div className="sidebar-label">Image</div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.72rem",
                color: "var(--t2)",
                marginBottom: "0.75rem",
              }}
            >
              {image.filename}
              <br />
              <span style={{ color: "var(--t3)" }}>
                {image.width} × {image.height} px
              </span>
            </div>

            {/* Score */}
            <div className="sidebar-label">Score (F1)</div>
            <div className="score-bar-wrap" style={{ marginBottom: "0.75rem" }}>
              <div className="score-bar-track" style={{ height: 5 }}>
                <div
                  className="score-bar-fill"
                  style={{ width: `${scorePct}%`, background: scoreClr }}
                />
              </div>
              <span className="score-val" style={{ color: scoreClr }}>
                {image.score.toFixed(3)}
              </span>
            </div>

            {/* TP / FP / FN */}
            <div className="sidebar-label">Counts</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.5rem",
                textAlign: "center",
              }}
            >
              {[
                { label: "TP", value: image.truePositives,  color: "var(--tp)" },
                { label: "FP", value: image.falsePositives, color: "var(--fp)" },
                { label: "FN", value: image.falseNegatives, color: "var(--fn)" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    background: "var(--s2)",
                    borderRadius: "var(--r)",
                    padding: "0.4rem 0",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "1.1rem",
                      fontWeight: 600,
                      color,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: "var(--t3)",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Dominant error */}
            {image.dominantErrorType && (
              <div style={{ marginTop: "0.75rem" }}>
                <div className="sidebar-label">Dominant error</div>
                <ErrorBadge errorType={image.dominantErrorType} />
              </div>
            )}

            {/* Classes */}
            {image.classesPresent.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <div className="sidebar-label">Classes present</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                  {image.classesPresent.map((cls) => (
                    <Link
                      key={cls}
                      href={`/runs/${runId}/images?class=${encodeURIComponent(cls)}&sort=worst`}
                      style={{
                        fontSize: "0.65rem",
                        padding: "0.1rem 0.4rem",
                        borderRadius: "3px",
                        background: "var(--s3)",
                        color: "var(--t2)",
                        fontWeight: 600,
                        transition: "color 0.1s",
                      }}
                    >
                      {cls}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Predictions list */}
          <div className="card sidebar-section">
            <div className="sidebar-label">
              Predictions ({image.predictions.length})
            </div>
            <div className="box-list">
              {image.predictions.map((p) => (
                <div key={p.id} className="box-item">
                  <span
                    className="box-item-dot"
                    style={{ background: errorColor(p.errorType) }}
                  />
                  <span className="box-item-name">{p.className}</span>
                  <span className="box-item-meta">
                    {Math.round(p.confidence * 100)}%
                  </span>
                  <ErrorBadge errorType={p.errorType} size="sm" />
                </div>
              ))}
              {image.predictions.length === 0 && (
                <span style={{ fontSize: "0.72rem", color: "var(--t3)" }}>
                  No predictions
                </span>
              )}
            </div>
          </div>

          {/* Ground truth list */}
          <div className="card sidebar-section">
            <div className="sidebar-label">
              Ground truth ({image.groundTruths.length})
            </div>
            <div className="box-list">
              {image.groundTruths.map((g) => (
                <div key={g.id} className="box-item">
                  <span
                    className="box-item-dot"
                    style={{
                      background: "transparent",
                      border: `2px solid ${g.matched ? "var(--tp)" : "var(--fp)"}`,
                    }}
                  />
                  <span className="box-item-name">{g.className}</span>
                  <span className="box-item-meta">
                    {g.matched ? "matched" : "unmatched"}
                  </span>
                  {g.errorType && (
                    <ErrorBadge errorType={g.errorType} size="sm" />
                  )}
                </div>
              ))}
              {image.groundTruths.length === 0 && (
                <span style={{ fontSize: "0.72rem", color: "var(--t3)" }}>
                  No ground truth
                </span>
              )}
            </div>
          </div>

          {/* Explore similar failures */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            {image.dominantErrorType && (
              <Link
                href={`/runs/${runId}/images?errorType=${image.dominantErrorType}&sort=worst`}
                className="btn"
                style={{ justifyContent: "center" }}
              >
                More {errorLabel(image.dominantErrorType)} failures →
              </Link>
            )}
            {image.classesPresent[0] && (
              <Link
                href={`/runs/${runId}/images?class=${encodeURIComponent(image.classesPresent[0])}&sort=worst`}
                className="btn"
                style={{ justifyContent: "center" }}
              >
                More {image.classesPresent[0]} images →
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
