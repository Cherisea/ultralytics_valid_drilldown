/**
 * Groups images by the requested dimension for the pattern-discovery screen.
 * 
 * GET /api/runs/:runId/patterns
 * 
 * Query parameters:
 *   groupBy  – "class" | "errorType" | "confidence"  (default: "errorType")
 *
 * Response groups are sorted by image count descending (largest failure
 * cluster first) so the most impactful pattern is always at the top.
 *
 * Example responses by groupBy:
 *
 *   "class"      → [{ label: "bird", count: 8, avgScore: 0.31, … }, …]
 *   "errorType"  → [{ label: "false_negative", count: 28, … }, …]
 *   "confidence" → [{ label: "high (0.7–1.0)", count: 29, … }, …]
 *
 * Each group includes `representativeImageIds` — the three worst-scoring
 * images in the group — so the UI can render a preview strip without
 * a second request.
 * 
 */

import { NextRequest, NextResponse } from "next/server";
import { getRun, getPatterns } from "@/lib/store";
import type { PatternGroupBy, PatternsResponse } from "@/types/index";
 
const VALID_GROUP_BY = new Set<PatternGroupBy>([
  "class",
  "errorType",
  "confidence",
]);
 
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;
 
  const run = getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
 
  const rawGroupBy = request.nextUrl.searchParams.get("groupBy") ?? "errorType";
  if (!VALID_GROUP_BY.has(rawGroupBy as PatternGroupBy)) {
    return NextResponse.json(
      { error: `Invalid groupBy: "${rawGroupBy}". Use "class", "errorType", or "confidence"` },
      { status: 400 }
    );
  }
 
  const result: PatternsResponse = getPatterns(runId, rawGroupBy as PatternGroupBy);
  return NextResponse.json(result);
}