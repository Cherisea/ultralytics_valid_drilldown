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