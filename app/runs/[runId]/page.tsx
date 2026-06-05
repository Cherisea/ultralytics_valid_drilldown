/**
 * Overview page returned to api/runs/[runId]/summary endpoint. This is the actual HTML
 * page rendered in a browser.
*/

import { getRun } from "@/lib/store";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ConfusionMatrix } from "@/components/overview/ConfusionMatrix";
import { PerClassTable } from "@/components/overview/PerClassTable";

const VALID_SORT_FIELDS = ["map50", "map50_95", "precision", "recall", "f1"] as const;
type SortField = (typeof VALID_SORT_FIELDS)[number];

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { runId } = await params;
  const sp = await searchParams;

  const run = getRun(runId);
  if (!run) notFound();

  const { aggregateMetrics: agg, perClassMetrics, classNames, confusionMatrix } = run;

  // Parse and validate sortBy — defaults to map50                       // ← new
  const rawSort = typeof sp.sortBy === "string" ? sp.sortBy : "map50";
  const sortBy: SortField = (VALID_SORT_FIELDS as readonly string[]).includes(rawSort)
    ? (rawSort as SortField)
    : "map50";

  const METRICS: Array<{ field: SortField; value: number; label: string; sub: string }> = [
    { field: "map50",     value: agg.map50,     label: "mAP50",    sub: "IoU = 0.50" },
    { field: "map50_95",  value: agg.map50_95,  label: "mAP50-95", sub: "IoU = 0.50:0.95" },
    { field: "precision", value: agg.precision, label: "Precision", sub: "TP / (TP + FP)" },
    { field: "recall",    value: agg.recall,    label: "Recall",    sub: "TP / (TP + FN)" },
    { field: "f1",        value: agg.f1,        label: "F1",        sub: "Harmonic mean" },
  ];

  return (
    <main className="page" style={{ paddingTop: "2rem" }}>
      {/* Run info header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              letterSpacing: "0",
              color: "var(--t1)",
            }}
          >
            {run.modelName}
          </h1>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--t3)",
              marginTop: "0.2rem",
              fontFamily: "var(--font-mono)",
            }}
          >
            {run.datasetName} · {run.split} split · {run.imageCount} images ·{" "}
            {new Date(run.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <Link
          href={`/runs/${runId}/images`}
          className="btn"
          style={{ padding: "0.45rem 1rem" }}
        >
          Explore images →
        </Link>
      </div>

      {/* Aggregate metric cards — each is a link that sorts the per-class table */}
      <div className="grid-5 mb-3">
        {METRICS.map(({ field, value, label, sub }) => {
          const isActive = sortBy === field;
          return (
            <Link
              key={field}
              href={`/runs/${runId}?sortBy=${field}`}
              className="card metric-card"
              title={`Sort per-class table by ${label}`}   // ← tooltip on hover
              style={{
                display: "block",
                textDecoration: "none",
                cursor: "pointer",
                borderBottom: `2px solid ${isActive ? "var(--t1)" : "var(--b1)"}`,  // ← active indicator
              }}
            >
              <div className="metric-label">{label}</div>
              <div className="metric-value">{value.toFixed(3)}</div>
              <div className="metric-sub">{sub}</div>
            </Link>
          );
        })}
      </div>

      {/* Confusion matrix + Per-class table */}
      <div className="grid-2">
        {/* Confusion matrix */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div className="section-title">Confusion matrix</div>
          <ConfusionMatrix
            matrix={confusionMatrix}
            classNames={classNames}
            runId={runId}
          />
        </div>

        {/* Per-class metrics table */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "1.25rem 1.25rem 0.75rem" }}>
            <div className="section-title">Per-class performance</div>
            <p
              style={{
                fontSize: "0.68rem",
                color: "var(--t3)",
                marginTop: "-0.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Sorted by {METRICS.find(m => m.field === sortBy)?.label ?? "mAP50"} · worst first · click a metric card to change sort · click a row to explore those images
            </p>
          </div>
          <PerClassTable metrics={perClassMetrics} runId={runId} sortBy={sortBy} />
        </div>
      </div>

      {/* Patterns callout */}
      <div
        className="card"
        style={{
          marginTop: "1.5rem",
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "0.85rem",
              color: "var(--t1)",
            }}
          >
            Discover failure patterns
          </div>
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--t3)",
              marginTop: "0.2rem",
            }}
          >
            Group images by class, error type, or confidence to find
            clusters of similar failures
          </div>
        </div>
        <Link
          href={`/runs/${runId}/patterns`}
          className="btn"
          style={{ padding: "0.45rem 1rem", flexShrink: 0 }}
        >
          View patterns →
        </Link>
      </div>
    </main>
  );
}
