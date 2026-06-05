/**
 * 
 * A translation layer between URL filters and typed ImageFilters object. Functions in this
 * file is shared by both server and client components.
*/

import type { ImageFilters, ErrorType, SortOrder } from "@/types/index";

const VALID_ERROR_TYPES = new Set<string>([
  "false_positive",
  "false_negative",
  "localization",
  "classification",
  "duplicate",
]);

const VALID_SORT_ORDERS = new Set<string>(["worst", "best", "most_errors"]);

/**
 * Accepts either:
 *  - Next.js server-component searchParams (Record after awaiting)
 *  - URLSearchParams / ReadonlyURLSearchParams from useSearchParams()
 */
type RawParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams
  | { get(key: string): string | null };

function getStr(sp: RawParams, key: string): string | undefined {
  if (typeof (sp as { get?: unknown }).get === "function") {
    return (sp as URLSearchParams).get(key) ?? undefined;
  }
  const rec = sp as Record<string, string | string[] | undefined>;
  const v = rec[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Parse raw search params into a validated ImageFilters object. */
export function filtersFromParams(sp: RawParams): ImageFilters {
  const rawSort = getStr(sp, "sort") ?? "worst";
  const sort: SortOrder = VALID_SORT_ORDERS.has(rawSort)
    ? (rawSort as SortOrder)
    : "worst";

  const rawErrorType = getStr(sp, "errorType");
  const rawDominantErrorType = getStr(sp, "dominantErrorType");
  const dominantErrorType: ErrorType | undefined =
    rawDominantErrorType && VALID_ERROR_TYPES.has(rawDominantErrorType)
      ? (rawDominantErrorType as ErrorType)
      : undefined;

  const errorType: ErrorType | undefined =
    rawErrorType && VALID_ERROR_TYPES.has(rawErrorType)
      ? (rawErrorType as ErrorType)
      : undefined;

  const rawClass = getStr(sp, "class");
  const rawConfMin = getStr(sp, "confMin");
  const rawConfMax = getStr(sp, "confMax");
  const confMin = rawConfMin ? parseFloat(rawConfMin) : undefined;
  const confMax = rawConfMax ? parseFloat(rawConfMax) : undefined;

  return {
    ...(rawClass   !== undefined && { class: rawClass }),
    ...(dominantErrorType !== undefined && { dominantErrorType}),
    ...(errorType  !== undefined && { errorType }),
    ...(confMin    !== undefined && !isNaN(confMin) && { confMin }),
    ...(confMax    !== undefined && !isNaN(confMax) && { confMax }),
    sort,
    page:     Math.max(1, parseInt(getStr(sp, "page") ?? "1", 10)),
    pageSize: Math.min(60, Math.max(1, parseInt(getStr(sp, "pageSize") ?? "20", 10))),
  };
}

/** Serialize an ImageFilters object into URLSearchParams for navigation. */
export function filtersToParams(filters: Partial<ImageFilters>): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.class      !== undefined) sp.set("class",     filters.class);
  if (filters.errorType  !== undefined) sp.set("errorType", filters.errorType);
  if (filters.dominantErrorType !== undefined) sp.set("dominantErrorType", filters.dominantErrorType);
  if (filters.confMin    !== undefined) sp.set("confMin",   String(filters.confMin));
  if (filters.confMax    !== undefined) sp.set("confMax",   String(filters.confMax));
  if (filters.sort                    ) sp.set("sort",      filters.sort);
  if (filters.page && filters.page > 1) sp.set("page",     String(filters.page));
  return sp;
}

/** Build a gallery URL with the given filter overrides applied. */
export function galleryUrl(
  runId: string,
  overrides: Partial<ImageFilters> = {},
): string {
  const sp = filtersToParams(overrides);
  const qs = sp.toString();
  return `/runs/${runId}/images${qs ? `?${qs}` : ""}`;
}