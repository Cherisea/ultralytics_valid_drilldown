import { getRun, getPatterns } from "@/lib/store";
import { notFound } from "next/navigation";
import { errorColor } from "@/lib/colors";
import { galleryUrl } from "@/lib/filters";
import Link from "next/link";
import type { PatternGroupBy } from "@/types/validation";

const GROUP_BY_OPTIONS: Array<{ value: PatternGroupBy; label: string; desc: string }> = [
  { value: "errorType",  label: "By error type",   desc: "Group images by their most common failure mode" },
  { value: "class",      label: "By class",         desc: "Group images by the object classes they contain" },
  { value: "confidence", label: "By confidence",    desc: "Group images by average prediction confidence" },
];

export default async function PatternsPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { runId } = await params;
  const sp        = await searchParams;

  const run = getRun(runId);
  if (!run) notFound();

  const rawGroupBy = sp.groupBy;
  const groupBy: PatternGroupBy =
    rawGroupBy === "class" || rawGroupBy === "confidence"
      ? rawGroupBy
      : "errorType";

  const { groups } = getPatterns(runId, groupBy);

  // Total errors for the breakdown bar
  function breakdownTotal(eb: Record<string, number>) {
    return Object.values(eb).reduce((s, n) => s + n, 0);
  }

  return (
    <main className="page" style={{ paddingTop: "1.5rem" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href={`/runs/${runId}`}>Overview</Link>
        <span className="breadcrumb-sep">/</span>
        <span style={{ color: "var(--t1)" }}>Patterns</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--t1)",
            }}
          >
            Failure patterns
          </h2>
          <p style={{ fontSize: "0.72rem", color: "var(--t3)", marginTop: "0.2rem" }}>
            Clusters of similar failures — click any card to drill into those images
          </p>
        </div>
      </div>

      {/* GroupBy tabs */}
      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          marginBottom: "1.5rem",
          padding: "0.25rem",
          background: "var(--s1)",
          border: "1px solid var(--b1)",
          borderRadius: "var(--r)",
          width: "fit-content",
        }}
      >
        {GROUP_BY_OPTIONS.map(({ value, label }) => (
          <Link
            key={value}
            href={`/runs/${runId}/patterns?groupBy=${value}`}
            className={`btn${groupBy === value ? " active" : ""}`}
            style={{ border: "none", background: groupBy === value ? "var(--s3)" : "transparent" }}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: "0.72rem",
          color: "var(--t3)",
          marginBottom: "1.25rem",
        }}
      >
        {GROUP_BY_OPTIONS.find((o) => o.value === groupBy)?.desc}
      </p>

      {/* Pattern cards */}
      <div className="pattern-grid">
        {groups.map((group) => {
          const eTotal = breakdownTotal(
            group.errorBreakdown as Record<string, number>,
          );

          // Gallery URL for this group
          const href = galleryUrl(runId, { ...group.galleryParams, sort: "worst" });

          return (
            <Link key={group.label} href={href} className="card pattern-card">
              {/* Header */}
              <div className="pattern-card-header">
                <div>
                  <div className="pattern-card-label">{group.label}</div>
                  <div
                    className="pattern-card-count"
                    style={{ marginTop: "0.15rem" }}
                  >
                    {group.count} image{group.count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "1.1rem",
                      fontWeight: 600,
                      color:
                        group.avgScore < 0.5
                          ? "var(--fp)"
                          : group.avgScore < 0.7
                          ? "var(--fn)"
                          : "var(--tp)",
                    }}
                  >
                    {group.avgScore.toFixed(2)}
                  </div>
                  <div
                    style={{
                      fontSize: "0.6rem",
                      color: "var(--t3)",
                      letterSpacing: "0.06em",
                      fontWeight: 700,
                    }}
                  >
                    AVG F1
                  </div>
                </div>
              </div>

              {/* Error breakdown bar */}
              {eTotal > 0 && (
                <div className="error-breakdown">
                  {Object.entries(group.errorBreakdown).map(([et, count]) => (
                    <div
                      key={et}
                      style={{
                        flex: count as number,
                        background: errorColor(et),
                      }}
                      title={`${et}: ${count}`}
                    />
                  ))}
                </div>
              )}

              {/* Representative thumbnails */}
              {group.representativeImageIds.length > 0 && (
                <div className="pattern-thumbs">
                  {group.representativeImageIds.map((imgId) => {
                    // Build a placeholder thumbnail URL (picsum with seed from ID)
                    // In production this would be a real thumbnail URL from the image record
                    const seed = imgId.slice(0, 8);
                    return (
                      <img
                        key={imgId}
                        src={`https://picsum.photos/seed/coco${seed}/144/108`}
                        alt=""
                        className="pattern-thumb"
                      />
                    );
                  })}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </main>
  );
}
