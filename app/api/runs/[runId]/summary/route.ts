/**
 * Get a summary of metrics for a validation run. Not for page-rendering 
 * in a browser.
 * 
 * GET /api/runs/:runId/summary
 * 
 * Returns the full ValidationRun object: aggregate metrics, per-class
 * metrics, and the confusion matrix. This is the data source for the
 * overview screen.
 * 
 */
import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/store";
import type { RunSummaryResponse } from "@/types/validation";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ runId: string }> }
  ) {
    const { runId } = await params;

    const run = getRun(runId);
    if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    
    const body: RunSummaryResponse = { run };
    return NextResponse.json(body);
}