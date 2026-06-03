"use client";

import { useRouter } from "next/navigation";
import { galleryUrl } from "@/lib/filters";

interface Props {
  matrix: number[][];
  classNames: string[];
  runId: string;
}

export function ConfusionMatrix({ matrix, classNames, runId }: Props) {
  const router = useRouter();

  // Separate scales for diagonal (TP) and off-diagonal (errors)
  const diagMax = Math.max(
    ...matrix.map((row, i) => row[i] ?? 0),
    1,
  );
  const offMax = Math.max(
    ...matrix.flatMap((row, i) => row.filter((_, j) => j !== i)),
    1,
  );

  function cellStyle(
    i: number,
    j: number,
    v: number,
  ): React.CSSProperties {
    if (v === 0) return { color: "var(--t3)" };

    if (i === j) {
      const intensity = Math.sqrt(v / diagMax);
      return {
        background: `rgba(34, 197, 94, ${intensity * 0.65})`,
        color: intensity > 0.4 ? "#FFFFFF" : "var(--t2)",
      };
    }

    const intensity = Math.sqrt(v / offMax);
    return {
      background: `rgba(239, 68, 68, ${intensity * 0.75})`,
      color: intensity > 0.35 ? "#FFFFFF" : "var(--t2)",
    };
  }

  function handleClick(i: number, j: number) {
    const cls = classNames[i];

    if (i === j) {
        router.push(
            galleryUrl(runId, {
              ...(cls !== undefined && { class: cls }),
              sort: "worst",
            }),
          );
    } else {
      router.push(
        galleryUrl(runId, {
          ...(cls !== undefined && { class: cls }),
          errorType: "classification",
          sort: "worst",
        }),
      );
    }
  }

  return (
    <div className="matrix-wrap">
      <table className="matrix-table">
        <thead>
          <tr>
            {/* empty corner */}
            <td style={{ width: 80 }} />
            {classNames.map((name) => (
              <th key={name} className="matrix-head-cell">
                <div className="matrix-head-text">{name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="matrix-row-label">{classNames[i]}</td>
              {row.map((v, j) => (
                <td
                  key={j}
                  className="matrix-cell"
                  style={cellStyle(i, j, v)}
                  onClick={() => handleClick(i, j)}
                  title={`GT: ${classNames[i]} → Pred: ${classNames[j]}  (${v})`}
                >
                  {v > 0 ? v : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          marginTop: "0.6rem",
          fontSize: "0.65rem",
          color: "var(--t3)",
        }}
      >
        Row = ground truth class · Col = predicted class · Click a cell to drill
        into those images
      </p>
    </div>
  );
}
