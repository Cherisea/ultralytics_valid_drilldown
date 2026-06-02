/**
 * Overview page returned to api/runs/[runId]/summary endpoint. This is the actual HTML
 * page rendered in a browser.
*/

import { getRun } from "@/lib/store";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ConfusionMatrix } from "@/components/overview/ConfusionMatrix";
import { PerClassTable } from "@/components/overview/PerClassTable";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) notFound();

  const { aggregateMetrics: agg, perClassMetrics, classNames, confusionMatrix } = run;

  const METRICS = [
    { key: "mAP50",     value: agg.map50,     label: "mAP50",     sub: "IoU = 0.50" },
    { key: "mAP50_95",  value: agg.map50_95,  label: "mAP50-95",  sub: "IoU = 0.50:0.95" },
    { key: "precision", value: agg.precision, label: "Precision",  sub: "TP / (TP + FP)" },
    { key: "recall",    value: agg.recall,    label: "Recall",     sub: "TP / (TP + FN)" },
    { key: "f1",        value: agg.f1,        label: "F1",         sub: "Harmonic mean" },
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

      {/* Aggregate metric cards */}
      <div className="grid-5 mb-3">
        {METRICS.map(({ key, value, label, sub }) => (
          <div key={key} className="card metric-card">
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value.toFixed(3)}</div>
            <div className="metric-sub">{sub}</div>
          </div>
        ))}
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
              Sorted by mAP50 · worst first · click a row to explore those images
            </p>
          </div>
          <PerClassTable metrics={perClassMetrics} runId={runId} />
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
