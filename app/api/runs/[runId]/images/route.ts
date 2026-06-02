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