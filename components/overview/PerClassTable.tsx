"use client";

import { useRouter } from "next/navigation";
import { galleryUrl } from "@/lib/filters";
import type { ClassMetrics } from "@/types/validation";

interface Props {
  metrics: ClassMetrics[];
  runId: string;
}

export function PerClassTable({ metrics, runId }: Props) {
  const router = useRouter();

  // Sorted by mAP50 ascending — worst class first
  const sorted = [...metrics].sort((a, b) => a.map50 - b.map50);

  return (
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
                      width: `${cls.map50 * 100}%`,
                      background:
                        cls.map50 < 0.5
                          ? "var(--fp)"
                          : cls.map50 < 0.7
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