"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { filtersFromParams, galleryUrl } from "@/lib/filters";
import type { ErrorType, SortOrder } from "@/types/index";

const ERROR_TYPES: Array<{ value: ErrorType; label: string }> = [
  { value: "false_positive",  label: "False Positive" },
  { value: "false_negative",  label: "False Negative" },
  { value: "localization",    label: "Localization" },
  { value: "classification",  label: "Classification" },
  { value: "duplicate",       label: "Duplicate" },
];

const SORT_ORDERS: Array<{ value: SortOrder; label: string }> = [
  { value: "worst",       label: "Worst first" },
  { value: "best",        label: "Best first" },
  { value: "most_errors", label: "Most errors" },
];

interface Props {
  runId: string;
  classNames: string[];
  total: number;
}

export function FilterBar({ runId, classNames, total }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const filters = filtersFromParams(sp);

  function navigate(patch: Record<string, string | undefined>) {
    const next = { ...Object.fromEntries(sp.entries()), ...patch };
    // remove keys explicitly set to undefined
    Object.keys(next).forEach((k) => next[k] === undefined && delete next[k]);
    // reset to page 1 when filters change
    delete next.page;
    const params = new URLSearchParams(next as Record<string, string>);
    router.push(`/runs/${runId}/images?${params}`);
  }

  const hasFilters =
    filters.class !== undefined ||
    filters.errorType !== undefined ||
    filters.dominantErrorType != undefined || 
    filters.confMin !== undefined ||
    filters.confMax !== undefined;

  return (
    <div className="filter-bar">
      {/* Class filter */}
      <span className="filter-label">Class</span>
      <select
        className="filter-select"
        value={filters.class ?? ""}
        onChange={(e) =>
          navigate({ class: e.target.value || undefined })
        }
      >
        <option value="">All classes</option>
        {classNames.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* Error type filter */}
      <span className="filter-label">Error</span>
      <select
        className="filter-select"
        value={filters.errorType ?? filters.dominantErrorType ?? ""}
        onChange={(e) =>
          navigate({ errorType: e.target.value || undefined, dominantErrorType: undefined })
        }
      >
        <option value="">All types</option>
        {ERROR_TYPES.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Sort */}
      <span className="filter-label" style={{ marginLeft: "auto" }}>
        Sort
      </span>
      <select
        className="filter-select"
        value={filters.sort}
        onChange={(e) => navigate({ sort: e.target.value })}
      >
        {SORT_ORDERS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {/* Result count + clear */}
      <span
        className="text-mono text-dim"
        style={{ fontSize: "0.7rem", marginLeft: "0.5rem" }}
      >
        {total} image{total !== 1 ? "s" : ""}
      </span>

      {hasFilters && (
        <a
          href={galleryUrl(runId)}
          className="btn"
          style={{ marginLeft: "0.25rem", padding: "0.3rem 0.65rem", fontSize: "0.72rem" }}
        >
          Clear filters
        </a>
      )}
    </div>
  );
}
