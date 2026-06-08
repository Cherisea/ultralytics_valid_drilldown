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
    ErrorType, ImageListResponse,
    PatternGroupBy, PatternsResponse
} from "@/types/index";


/**
 * Internal index entry: an additional field to standard API contract for
 * filtering and sorting purposes. The extra field is stripped before 
 * leaving the store script.
 */
type IndexEntry = ImageListItem & { 
  _avgConf: number;
  _errorTypes: Set<string>;    // All error types present: both GT and predictions
  _classErrorTypes: Map<string, Set<string>>;   // GT className -> error types from GT class
  _predClassErrorTypes: Map<string, Set<string>>;   // Predicted class -> error types
};

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
  
let _loadedAt: number | null = null;
function load(): void {
  if (_run !== null) {
    // In dev: warn if fixture files have been modified since we loaded them.
    // A new generator run won't take effect until the server is restarted.
    if (process.env.NODE_ENV === "development" && _loadedAt !== null) {
      const dir = fixturesDir();
      const mtime = fs.statSync(path.join(dir, "images.json")).mtimeMs;
      if (mtime > _loadedAt) {
        console.warn(
          "\n⚠️  data/fixtures/images.json has changed since the server started.\n" +
          "   Restart `npm run dev` to load the new fixtures.\n"
        );
      }
    }
    return;
    }
   
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

      const errorTypes = new Set<string>();
      for (const p of img.predictions) {
        if (p.errorType) errorTypes.add(p.errorType);
      }
      for (const g of img.groundTruths) {
        if (g.errorType) errorTypes.add(g.errorType);
      }

      const classErrorTypes = new Map<string, Set<string>>();
      for (const g of img.groundTruths) {
        if (g.errorType) {
          if (!classErrorTypes.has(g.className)) classErrorTypes.set(g.className, new Set());
          classErrorTypes.get(g.className)?.add(g.errorType);
        }
      }

      const predClassErrorTypes = new Map<string, Set<string>>();
      for (const p of img.predictions) {
        if (p.errorType) {
          if (!predClassErrorTypes.has(p.errorType)) 
            predClassErrorTypes.set(p.className, new Set());
          predClassErrorTypes.get(p.className)?.add(p.errorType);
        }
      }

      // Strip predictions and groundTruths — this is the ImageListItem shape
      const { predictions, groundTruths, ...listFields } = img;
      return { ...listFields, _avgConf: avgConf, _errorTypes:errorTypes, 
              _classErrorTypes: classErrorTypes, _predClassErrorTypes: predClassErrorTypes };
    });
   
    _entryById = new Map(_entries.map((e) => [e.id, e]));
}


// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------
/** Remove the internal _avgConf field before returning to a caller. */
function toListItem({ _avgConf, _errorTypes, _classErrorTypes, _predClassErrorTypes, ...rest }: IndexEntry): ImageListItem {
    return rest;
}

function applyFilters(entries: IndexEntry[], filters: ImageFilters): IndexEntry[] {
    return entries.filter((item) => {
      // When class + errorType arrive together (confusion matrix), they must
      // co-occur on the same GT object — not just anywhere on the image.
      // When either arrives alone, fall back to the independent image-level checks.
      if (filters.class !== undefined && filters.errorType !== undefined) {
        const isPredictError = filters.errorType === "false_positive";
        const map = isPredictError ? item._predClassErrorTypes : item._classErrorTypes;

        if (!map.get(filters.class)?.has(filters.errorType)) return false;
      } else {
        if (filters.class !== undefined) {
          if (!item.classesPresent.includes(filters.class)) return false;
        }
        if (filters.errorType !== undefined) {
          if (!item._errorTypes.has(filters.errorType)) return false;
        }
      }
   
      // Strict check - true only if this is the dominant error.
      // used by pattern-page drilldown.
      if (filters.dominantErrorType !== undefined) {
        if (item.dominantErrorType !== filters.dominantErrorType) return false;
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
function buildGroup(label: string, 
                    items: IndexEntry[],
                    galleryParams: Partial<ImageFilters> = {},): PatternGroup {
    if (items.length === 0) {
      return {
        label,
        count: 0,
        avgScore: 0,
        errorBreakdown: {},
        representativeImages: [],
        galleryParams,
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
    const representativeImages = [...items]
      .sort((a, b) => a.score - b.score)
      .slice(0, 3)
      .map((i) => ({ id: i.id, imageUrl: i.imageUrl }));
   
    return { label, count: items.length, avgScore, errorBreakdown, representativeImages, galleryParams };
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
      .map(([label, items]) => buildGroup(label, items, { class: label }))
      .sort((a, b) => b.count - a.count);
}

function groupByErrorType(entries: IndexEntry[]): PatternGroup[] {
    const buckets = new Map<string, IndexEntry[]>();
    for (const entry of entries) {
      const key = entry.dominantErrorType ?? "none";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(entry);
    }
   
    return (
      [...buckets.entries()]
        .map(([label, items]) => buildGroup(label, 
                                  items, 
                                  label !== "none" ? {dominantErrorType: label as ErrorType} : {}))
        .filter((g) => g.label !== "none")
        .sort((a, b) => b.count - a.count)
    );
}

function groupByConfidence(entries: IndexEntry[]): PatternGroup[] {
  const buckets: Array<{
    label: string;
    pred: (c: number) => boolean;
    galleryParams: Partial<ImageFilters>;
  }> = [
    { label: "high (0.7–1.0)",   pred: (c) => c >= 0.7,              galleryParams: { confMin: 0.7 } },
    { label: "medium (0.4–0.7)", pred: (c) => c >= 0.4 && c < 0.7,   galleryParams: { confMin: 0.4, confMax: 0.7 } },
    { label: "low (0–0.4)",      pred: (c) => c < 0.4,               galleryParams: { confMax: 0.4 } },
  ];
  return buckets
    .map(({ label, pred, galleryParams }) =>
      buildGroup(label, entries.filter((e) => pred(e._avgConf)), galleryParams),
    )
    .filter((g) => g.count > 0);
}
   

// ---------------------------------------------------------------------------
// Public API — these are the only functions route handlers call
// ---------------------------------------------------------------------------

/**
 * Returns the ValidationRun for the given runId, or null if not found.
 * The prototype has one fixture run; production would query MongoDB by ID.
 */
export function getRun(runId: string): ValidationRun | null {
    load();
    if (_run!.id !== runId) return null;
    return _run;
}

/**
 * Returns the full ImageResult (predictions + ground truths) for a single
 * image, or null if the imageId is not found.
 */
export function getImageDetail(imageId: string): ImageResult | null {
    load();
    return _detailById.get(imageId) ?? null;
}

/**
 * Applies filters, sort, and pagination to the image index for a run.
 * Returns a page of ImageListItem records (no predictions/groundTruths).
 */
export function queryImages(
    runId: string,
    filters: ImageFilters
  ): ImageListResponse {
    load();
   
    // Scope to this run (all images in the fixture belong to one run,
    // but the filter makes the contract explicit for a multi-run future).
    const runEntries = _entries.filter((e) => e.runId === runId);
   
    const filtered = applyFilters(runEntries, filters);
    const sorted = applySort(filtered, filters.sort);
   
    const total = sorted.length;
    const start = (filters.page - 1) * filters.pageSize;
    const page = sorted.slice(start, start + filters.pageSize);
   
    return {
      items: page.map(toListItem),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
}

/**
 * Groups images by the requested dimension and returns pattern-discovery
 * groups sorted by image count (most common failure cluster first).
 */
export function getPatterns(
    runId: string,
    groupBy: PatternGroupBy
  ): PatternsResponse {
    load();
   
    const runEntries = _entries.filter((e) => e.runId === runId);
   
    let groups: PatternGroup[];
    switch (groupBy) {
      case "class":
        groups = groupByClass(runEntries);
        break;
      case "errorType":
        groups = groupByErrorType(runEntries);
        break;
      case "confidence":
        groups = groupByConfidence(runEntries);
        break;
    }
   
    return { groupBy, groups };
}