/**
 *
 * All data-access and business logic for the validation prototype.
 * No Next.js, no HTTP — just plain functions over the fixture data.
 *
 * Transition to production: swap the load() function to query MongoDB
 * (or call the Ultralytics eval pipeline) and every route handler, and
 * therefore the entire frontend, continues to work unchanged.
 *
 * Uses `fs` to read fixtures once on first request. Subsequent calls hit 
 * the in-memory cache.
 */

import path from "path";
import fs from "fs";
import type {
    ValidationRun, ImageListItem,
    ImageResult, ImageFilters,
    SortOrder, PatternGroup,
    ErrorType,
} from "@/types/validation";


/**
 * Internal index entry: an additional field to standard API contract for
 * filtering and sorting purposes. The extra field is stripped before 
 * leaving the store script.
 */
type IndexEntry = ImageListItem & { _avgConf: number };

// ---------------------------------------------------------------------------
// Module-level singletons — loaded once, reused across requests
// ---------------------------------------------------------------------------
let _run: ValidationRun | null = null;
let _entries: IndexEntry[] = [];         // all images as flat array
let _entryById: Map<string, IndexEntry>; // imageId → index entry
let _detailById: Map<string, ImageResult>; // imageId → full image result

// ---------------------------------------------------------------------------
// Data fixture loading
// ---------------------------------------------------------------------------
function fixturesDir(): string {
    return path.join(process.cwd(), "data");
}
   
function load(): void {
    if (_run !== null) return; // already loaded
   
    const dir = fixturesDir();
   
    _run = JSON.parse(
      fs.readFileSync(path.join(dir, "run_001.json"), "utf-8")
    ) as ValidationRun;
   
    // Load full images once. We derive both the detail map and the index from
    // this single source so they are always in sync with each other.
    const images = JSON.parse(
      fs.readFileSync(path.join(dir, "images.json"), "utf-8")
    ) as ImageResult[];
   
    _detailById = new Map(images.map((img) => [img.id, img]));
   
    _entries = images.map((img): IndexEntry => {
      // Average prediction confidence for this image.
      const confs = img.predictions.map((p) => p.confidence);
      const avgConf =
        confs.length > 0
          ? confs.reduce((a, b) => a + b, 0) / confs.length
          : 0;
   
      // Strip predictions and groundTruths — this is the ImageListItem shape
      const { predictions, groundTruths, ...listFields } = img;
      return { ...listFields, _avgConf: avgConf };
    });
   
    _entryById = new Map(_entries.map((e) => [e.id, e]));
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------
/** Remove the internal _avgConf field before returning to a caller. */
function toListItem({ _avgConf, ...rest }: IndexEntry): ImageListItem {
    return rest;
}

function applyFilters(entries: IndexEntry[], filters: ImageFilters): IndexEntry[] {
    return entries.filter((item) => {
      // Class filter: at least one GT object in the image belongs to this class.
      if (filters.class !== undefined) {
        if (!item.classesPresent.includes(filters.class)) return false;
      }
   
      // Error-type filter: the image's most common failure mode must match.
      // Note: this uses dominantErrorType (the plurality error on the image).
      // A future version could filter on *presence* of any matching error,
      // which would require loading the full predictions array.
      if (filters.errorType !== undefined) {
        if (item.dominantErrorType !== filters.errorType) return false;
      }
   
      // Confidence filters operate on the image's average prediction confidence.
      if (filters.confMin !== undefined && item._avgConf < filters.confMin) {
        return false;
      }
      if (filters.confMax !== undefined && item._avgConf > filters.confMax) {
        return false;
      }
   
      return true;
    });
}

function applySort(entries: IndexEntry[], sort: SortOrder): IndexEntry[] {
    const sorted = [...entries]; // never mutate the cached array
    switch (sort) {
      case "worst":
        // Ascending score: worst-performing images first.
        return sorted.sort((a, b) => a.score - b.score);
      case "best":
        // Descending score: best-performing images first.
        return sorted.sort((a, b) => b.score - a.score);
      case "most_errors":
        // Total unmatched count (FP + FN) descending.
        // This surfaces images with the most absolute failures regardless of
        // their score, which is useful when the dataset is unbalanced.
        return sorted.sort(
          (a, b) =>
            b.falsePositives + b.falseNegatives - (a.falsePositives + a.falseNegatives)
        );
    }
}

// ---------------------------------------------------------------------------
// Pattern-group helpers
// ---------------------------------------------------------------------------
/**
 * Build a PatternGroup from a label and the set of images belonging to it.
 * Representative images are the 3 worst-scoring in the group — the examples
 * most worth investigating first.
 */
function buildGroup(label: string, items: IndexEntry[]): PatternGroup {
    if (items.length === 0) {
      return {
        label,
        count: 0,
        avgScore: 0,
        errorBreakdown: {},
        representativeImageIds: [],
      };
    }
   
    // Round to three decimal places to avoid floating point arithmetic noise
    const avg = items.reduce((sum, i) => sum + i.score, 0) / items.length;
    const avgScore = parseFloat(avg.toFixed(3));
   
    // Count dominant error types within this group (null = no dominant error)
    const errorBreakdown: Partial<Record<ErrorType, number>> = {};
    for (const item of items) {
      if (item.dominantErrorType !== null) {
        errorBreakdown[item.dominantErrorType] =
          (errorBreakdown[item.dominantErrorType] ?? 0) + 1;
      }
    }
   
    // Three worst-scoring images as entry points into the group
    const representativeImageIds = [...items]
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((i) => i.id);
   
    return { label, count: items.length, avgScore, errorBreakdown, representativeImageIds };
}

function groupByClass(entries: IndexEntry[]): PatternGroup[] {
    // An image belongs to every group whose class appears in classesPresent.
    // Returns an array of PatternGroup  objects, one per class, sorted by the number
    // of images containing that group.
    const buckets = new Map<string, IndexEntry[]>();
    for (const entry of entries) {
      for (const cls of entry.classesPresent) {
        if (!buckets.has(cls)) buckets.set(cls, []);
        buckets.get(cls)!.push(entry);
      }
    }

    return [...buckets.entries()]
      .map(([label, items]) => buildGroup(label, items))
      .sort((a, b) => b.count - a.count);
}

/**
 * Returns the ValidationRun for the given runId, or null if not found.
 * The prototype has one fixture run; production would query MongoDB by ID.
 */
export function getRun(runId: string): ValidationRun | null {
    load();
    if (_run!.id !== runId) return null;
    return _run;
  }