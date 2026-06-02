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

import type {
    ValidationRun, ImageListItem
} from "@/types/validation"


/**
 * Internal index entry: an additional field to standard API contract for
 * filtering and sorting purposes. The extra field is stripped before 
 * leaving the store script.
 */
type IndexEntry = ImageListItem & { _avgConf: number };

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