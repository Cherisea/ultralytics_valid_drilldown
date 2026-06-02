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
    ImageResult
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
      // Images with no predictions (all GT objects missed) get avgConf = 0,
      // which correctly places them in the "low confidence" bucket.
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

/** Remove the internal _avgConf field before returning to a caller. */
function toListItem({ _avgConf, ...rest }: IndexEntry): ImageListItem {
    return rest;
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