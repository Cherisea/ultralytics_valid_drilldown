/**
 * Overview page mapped to api/runs/[runId]/summary endpoint.
 */

import { getRun } from "@/lib/store";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ConfusionMatrix } from "@/components/overview/ConfusionMatrix";
import { galleryUrl } from "@/lib/filters";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const run = getRun(runId);
  if (!run) notFound();

  const { aggregateMetrics: agg, perClassMetrics, classNames, confusionMatrix } = run;

  // Sort classes by mAP50 ascending (worst first) for the table
  const sorted = [...perClassMetrics].sort((a, b) => a.map50 - b.map50);

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
              fontSize: "1.35rem",
              fontWeight: 800,
              letterSpacing: "-0.02em",
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
          <table className="table">
            <thead>
              <tr>
                <th>Class</th>
                <th>mAP50</th>
                <th>mAP50-95</th>
                <th>P</th>
                <th>R</th>
                <th>F1</th>
                <th>TP</th>
                <th>FP</th>
                <th>FN</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((cls) => {
                const support = cls.truePositives + cls.falseNegatives;
                return (
                  <tr
                    key={cls.classId}
                    className="clickable"
                    onClick={() =>
                      (window.location.href = galleryUrl(runId, {
                        class: cls.className,
                        sort: "worst",
                      }))
                    }
                  >
                    <td>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "var(--t1)" }}>
                          {cls.className}
                        </span>
                        <span
                          style={{
                            fontSize: "0.6rem",
                            color: "var(--t3)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          n={support}
                        </span>
                      </div>
                      {/* Mini mAP50 bar */}
                      <div
                        style={{
                          marginTop: "0.2rem",
                          height: 2,
                          width: "100%",
                          background: "var(--s3)",
                          borderRadius: 1,
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${cls.map50 * 100}%`,
                            background:
                              cls.map50 < 0.5
                                ? "var(--fp)"
                                : cls.map50 < 0.7
                                ? "var(--fn)"
                                : "var(--tp)",
                            borderRadius: 1,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    </td>
                    <td className="mono">{cls.map50.toFixed(3)}</td>
                    <td className="mono">{cls.map50_95.toFixed(3)}</td>
                    <td className="mono">{cls.precision.toFixed(2)}</td>
                    <td className="mono">{cls.recall.toFixed(2)}</td>
                    <td className="mono">{cls.f1.toFixed(2)}</td>
                    <td
                      className="mono"
                      style={{ color: "var(--tp)" }}
                    >
                      {cls.truePositives}
                    </td>
                    <td
                      className="mono"
                      style={{ color: "var(--fp)" }}
                    >
                      {cls.falsePositives}
                    </td>
                    <td
                      className="mono"
                      style={{ color: "var(--fn)" }}
                    >
                      {cls.falseNegatives}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
