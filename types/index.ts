// Manually maintained adapter — re-exports generated types with clean names.
// When adding a new schema to openapi.yaml, add one line here.

export type { components, paths } from './api';
import type { components } from './api';

export type ErrorType       = components['schemas']['ErrorType'];
export type RunStatus       = components['schemas']['RunStatus'];
export type DataSplit       = components['schemas']['DataSplit'];
export type PatternGroupBy  = components['schemas']['PatternGroupBy'];
export type SortOrder       = components['schemas']['SortOrder'];
export type BBox            = components['schemas']['BBox'];
export type Detection       = components['schemas']['Detection'];
export type GroundTruth     = components['schemas']['GroundTruth'];
export type ImageListItem   = components['schemas']['ImageListItem'];
export type ImageResult     = components['schemas']['ImageResult'];
export type AggregateMetrics = components['schemas']['AggregateMetrics'];
export type ClassMetrics    = components['schemas']['ClassMetrics'];
export type ValidationRun   = components['schemas']['ValidationRun'];
export type ImageFilters    = components['schemas']['ImageFilters'];
export type PatternGroup    = components['schemas']['PatternGroup'];
export type PatternsResponse = components['schemas']['PatternsResponse'];
export type RunSummaryResponse  = components['schemas']['RunSummaryResponse'];
export type ImageListResponse   = components['schemas']['ImageListResponse'];
export type ImageDetailResponse = components['schemas']['ImageDetailResponse'];