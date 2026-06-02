/**
 *
 * Typed client-side fetch wrappers. Used only from "use client" components
 * that need to re-fetch data without a full page navigation (e.g. the
 * patterns tab switcher).
 *
 * Server components import from lib/store.ts directly — no HTTP roundtrip.
 */

import type {
    ImageFilters,
    ImageListResponse,
    PatternGroupBy,
    PatternsResponse,
  } from "@/types/validation";
  import { filtersToParams } from "./filters";
  
  async function apiFetch<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }
  
  export function fetchImages(
    runId: string,
    filters: ImageFilters,
  ): Promise<ImageListResponse> {
    const sp = filtersToParams(filters);
    return apiFetch<ImageListResponse>(`/api/runs/${runId}/images?${sp}`);
  }
  
  export function fetchPatterns(
    runId: string,
    groupBy: PatternGroupBy,
  ): Promise<PatternsResponse> {
    return apiFetch<PatternsResponse>(
      `/api/runs/${runId}/patterns?groupBy=${groupBy}`,
    );
  }