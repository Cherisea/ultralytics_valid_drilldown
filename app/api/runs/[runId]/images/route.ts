/**
 * Returns a filtered, sorted, paginated list of images for a run.
 * This is the data source for the gallery screen.
 * 
 * GET /api/runs/:runId/images
 * 
 * Query parameters (all optional except sort/page/pageSize which have defaults):
 *   class      – filter to images containing this class (e.g. "bird")
 *   errorType  – filter by dominant error type ("false_positive" | "false_negative" |
 *                "localization" | "classification" | "duplicate")
 *   confMin    – minimum average prediction confidence, float in [0, 1]
 *   confMax    – maximum average prediction confidence, float in [0, 1]
 *   sort       – "worst" (default) | "best" | "most_errors"
 *   page       – 1-indexed page number (default: 1)
 *   pageSize   – items per page (default: 20, max: 60)
 * 
 * Example — the confusion-matrix cell click that drills from "GT=dog" to
 * "Pred=cat" becomes:
 *   GET /api/runs/run-abc/images?class=dog&errorType=classification&sort=worst
 *
*/
import { NextRequest, NextResponse } from "next/server";
import { getRun, queryImages } from "@/lib/store";
import type { ErrorType, SortOrder, ImageFilters, ImageListResponse } from "@/types/validation";

const VALID_ERROR_TYPES = new Set<ErrorType>([
    "false_positive",
    "false_negative",
    "localization",
    "classification",
    "duplicate",
]);

const VALID_SORT_ORDERS = new Set<SortOrder>([
    "worst",
    "best",
    "most_errors",
]);
   
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 60;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ runId: string }> }
  ) {
    const { runId } = await params;
   
    // Run must exist before we do any query work
    const run = getRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
   
    const sp = request.nextUrl.searchParams;
   
    // ── Parse and validate query params ──────────────────────────────────────
    const classFilter = sp.get("class") ?? undefined;
   
    // Validate errorType against the known union
    const rawErrorType = sp.get("errorType");
    if (rawErrorType !== null && !VALID_ERROR_TYPES.has(rawErrorType as ErrorType)) {
      return NextResponse.json(
        { error: `Invalid errorType: "${rawErrorType}"` },
        { status: 400 }
      );
    }
    const errorType = (rawErrorType as ErrorType | null) ?? undefined;
   
    // Validate confidence bounds
    const confMin = sp.has("confMin") ? parseFloat(sp.get("confMin")!) : undefined;
    const confMax = sp.has("confMax") ? parseFloat(sp.get("confMax")!) : undefined;
   
    if (confMin !== undefined && (isNaN(confMin) || confMin < 0 || confMin > 1)) {
      return NextResponse.json({ error: "confMin must be a float in [0, 1]" }, { status: 400 });
    }
    if (confMax !== undefined && (isNaN(confMax) || confMax < 0 || confMax > 1)) {
      return NextResponse.json({ error: "confMax must be a float in [0, 1]" }, { status: 400 });
    }
    if (confMin !== undefined && confMax !== undefined && confMin > confMax) {
      return NextResponse.json({ error: "confMin must be ≤ confMax" }, { status: 400 });
    }
   
    // Sort order
    const rawSort = sp.get("sort") ?? "worst";
    if (!VALID_SORT_ORDERS.has(rawSort as SortOrder)) {
      return NextResponse.json(
        { error: `Invalid sort: "${rawSort}". Use "worst", "best", or "most_errors"` },
        { status: 400 }
      );
    }
    const sort = rawSort as SortOrder;
   
    // Pagination (1-indexed)
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
    );
   
    const filters: ImageFilters = {
        ...(classFilter !== undefined && { class: classFilter }),
        ...(errorType   !== undefined && { errorType }),
        ...(confMin     !== undefined && { confMin }),
        ...(confMax     !== undefined && { confMax }),
        sort,
        page,
        pageSize,
    };
   
    const result: ImageListResponse = queryImages(runId, filters);
    return NextResponse.json(result);
}