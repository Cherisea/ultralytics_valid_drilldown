"use client";

import { useState } from "react";
import { errorColor, errorLabel } from "@/lib/colors";
import type { Detection, GroundTruth, ImageResult } from "@/types/validation";

interface Props {
  image: ImageResult;
}

type Layer = "both" | "predictions" | "groundTruths";

export function BoxOverlay({ image }: Props) {
  const [layer, setLayer]           = useState<Layer>("both");
  const [hoveredPredId, setHovPred] = useState<string | null>(null);
  const [hoveredGtId, setHovGt]     = useState<string | null>(null);

  const { width: W, height: H } = image;

  // Normalised [cx, cy, w, h] → SVG pixel [x, y, w, h] (top-left origin)
  function toRect(b: { x: number; y: number; w: number; h: number }) {
    return {
      x: (b.x - b.w / 2) * W,
      y: (b.y - b.h / 2) * H,
      w: b.w * W,
      h: b.h * H,
    };
  }

  // Whether a prediction is "related" to the current hover
  function predRelated(p: Detection): boolean {
    if (!hoveredPredId && !hoveredGtId) return true;
    if (hoveredPredId === p.id) return true;
    // This prediction is linked to the hovered GT
    if (hoveredGtId && p.groundTruthId === hoveredGtId) return true;
    return false;
  }

  // Whether a GT is "related" to the current hover
  function gtRelated(g: GroundTruth): boolean {
    if (!hoveredPredId && !hoveredGtId) return true;
    if (hoveredGtId === g.id) return true;
    // The hovered prediction points back to this GT
    if (hoveredPredId) {
      const pred = image.predictions.find((p) => p.id === hoveredPredId);
      if (pred?.groundTruthId === g.id) return true;
    }
    return false;
  }

  const showPreds = layer === "both" || layer === "predictions";
  const showGTs   = layer === "both" || layer === "groundTruths";

  // Label position: place above box unless too close to top edge, then below
  function labelY(boxY: number, boxH: number): number {
    return boxY > 18 ? boxY - 18 : boxY + boxH + 2;
  }

  return (
    <div>
      {/* Layer toggle */}
      <div className="toggle-bar">
        {(["both", "predictions", "groundTruths"] as Layer[]).map((l) => (
          <button
            key={l}
            className={`btn${layer === l ? " active" : ""}`}
            onClick={() => setLayer(l)}
          >
            {l === "both"         ? "Both layers"     :
             l === "predictions"  ? "Predictions"     :
                                    "Ground truth"}
          </button>
        ))}
      </div>

      {/* Image + SVG overlay */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${W} / ${H}`,
          background: "var(--s2)",
          borderRadius: "var(--r)",
          overflow: "hidden",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.imageUrl}
          alt={image.filename}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
          }}
        />

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
        >
          {/* Ground truth boxes — dashed white outlines */}
          {showGTs &&
            image.groundTruths.map((g) => {
              const { x, y, w, h } = toRect(g.bbox);
              const related = gtRelated(g);
              const color = "#FFFFFF";
              return (
                <g
                  key={g.id}
                  opacity={related ? 1 : 0.15}
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHovGt(g.id)}
                  onMouseLeave={() => setHovGt(null)}
                >
                  <rect
                    x={x} y={y} width={w} height={h}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    fill="rgba(255,255,255,0.04)"
                  />
                  {/* GT label */}
                  <rect
                    x={x}
                    y={labelY(y, h)}
                    width={g.className.length * 6.5 + 6}
                    height={15}
                    fill="rgba(0,0,0,0.72)"
                    rx={2}
                  />
                  <text
                    x={x + 3}
                    y={labelY(y, h) + 10.5}
                    fill="#FFFFFF"
                    fontSize={10}
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={500}
                  >
                    {g.className}
                  </text>
                </g>
              );
            })}

          {/* Prediction boxes — solid colored borders */}
          {showPreds &&
            image.predictions.map((p) => {
              const { x, y, w, h } = toRect(p.bbox);
              const related = predRelated(p);
              const color   = errorColor(p.errorType);
              const label   = `${p.className} ${Math.round(p.confidence * 100)}%`;
              const labelW  = label.length * 6 + 8;
              return (
                <g
                  key={p.id}
                  opacity={related ? 1 : 0.12}
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHovPred(p.id)}
                  onMouseLeave={() => setHovPred(null)}
                >
                  <rect
                    x={x} y={y} width={w} height={h}
                    stroke={color}
                    strokeWidth={2.5}
                    fill={`${color}18`}
                  />
                  {/* Confidence + class label */}
                  <rect
                    x={x}
                    y={labelY(y, h)}
                    width={labelW}
                    height={15}
                    fill={`${color}DD`}
                    rx={2}
                  />
                  <text
                    x={x + 4}
                    y={labelY(y, h) + 10.5}
                    fill="#000"
                    fontSize={9.5}
                    fontFamily="'JetBrains Mono', monospace"
                    fontWeight={600}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          marginTop: "0.65rem",
          fontSize: "0.65rem",
          color: "var(--t3)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ display: "inline-block", width: 16, height: 2, borderTop: "2px dashed #FFFFFF" }} />
          Ground truth
        </span>
        {(["false_positive","false_negative","localization","classification","duplicate"] as const).map(
          (et) => (
            <span key={et} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  border: `2px solid ${errorColor(et)}`,
                  borderRadius: 2,
                }}
              />
              {errorLabel(et)}
            </span>
          ),
        )}
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span
            style={{
              display: "inline-block",
              width: 12,
              height: 12,
              border: `2px solid ${errorColor(null)}`,
              borderRadius: 2,
            }}
          />
          Correct
        </span>
      </div>
    </div>
  );
}
