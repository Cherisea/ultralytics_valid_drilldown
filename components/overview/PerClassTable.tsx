"use client";

import { useRouter } from "next/navigation";
import { galleryUrl } from "@/lib/filters";
import type { ClassMetrics } from "@/types/index";

interface Props {
  metrics: ClassMetrics[];
  runId: string;
  sortBy: string;
}

// Maps each table column label to the ClassMetrics field it represents.
// Used to highlight the active sort column in the header.
const COLUMN_FIELD: Record<string, string> = {
  "mAP50":    "map50",
  "mAP50-95": "map50_95",
  "P":        "precision",
  "R":        "recall",
  "F1":       "f1",
};

export function PerClassTable({ metrics, runId, sortBy }: Props) {
  const router = useRouter();

  // Sorted ascending by the selected field — worst class first
  const sorted = [...metrics].sort(
    (a, b) => 
      ((a as unknown as Record<string, number>)[sortBy] ?? a.map50) -
      ((b as unknown as Record<string, number>)[sortBy] ?? b.map50)
  );

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Class</th>
            {Object.entries(COLUMN_FIELD).map(([label, field]) => (
              <th
                key={field}
                style={
                  field === sortBy
                    ? {
                        color: "var(--t1)",
                        fontWeight: 700,
                      }
                    : undefined
                }
              >
                {label}
              </th>
            ))}
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
                router.push(galleryUrl(runId, { class: cls.className, sort: "worst" }))
              }
            >
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
                      width: `${((cls as unknown as Record<string, number>)[sortBy] ?? cls.map50) * 100}%`, 
                      background:
                        ((cls as unknown as Record<string, number>)[sortBy] ?? cls.map50) < 0.5              
                          ? "var(--fp)"
                          : ((cls as unknown as Record<string, number>)[sortBy] ?? cls.map50) < 0.7      
                          ? "var(--fn)"
                          : "var(--tp)",
                      borderRadius: 1,
                    }}
                  />
                </div>
              </td>
              <td className="mono">{cls.map50.toFixed(3)}</td>
              <td className="mono">{cls.map50_95.toFixed(3)}</td>
              <td className="mono">{cls.precision.toFixed(2)}</td>
              <td className="mono">{cls.recall.toFixed(2)}</td>
              <td className="mono">{cls.f1.toFixed(2)}</td>
              <td className="mono" style={{ color: "var(--tp)" }}>{cls.truePositives}</td>
              <td className="mono" style={{ color: "var(--fp)" }}>{cls.falsePositives}</td>
              <td className="mono" style={{ color: "var(--fn)" }}>{cls.falseNegatives}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}