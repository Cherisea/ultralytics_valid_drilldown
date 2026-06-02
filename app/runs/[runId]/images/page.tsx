/**
 * Filtered gallary page mapped to api/runs/[runId]/images endpoint. 
 * 
 * By default, it renders a paginated grid of image cards for 60 images
 * sorted worst first -- each showing a thumbnail with metrics overlay. 
 * 
 * Filters are passed through URL query parameters.
 * 
*/

import { getRun, queryImages } from "@/lib/store";
import { notFound } from "next/navigation";
import { filtersFromParams, galleryUrl, filtersToParams } from "@/lib/filters";
import { FilterBar } from "@/components/gallery/FilterBar";
import { ImageCard } from "@/components/gallery/ImageCard";
import Link from "next/link";

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { runId }  = await params;
  const sp         = await searchParams;

  const run = getRun(runId);
  if (!run) notFound();

  const filters = filtersFromParams(sp);
  const { items, total, page, pageSize } = queryImages(runId, filters);

  const totalPages = Math.ceil(total / pageSize);
  // Build the current URL string to pass to ImageCards as the "from" param
  const fromSearch = filtersToParams(filters).toString();

  return (
    <main className="page" style={{ paddingTop: "1.5rem" }}>
      {/* Breadcrumb */}
      <div className="breadcrumb">
        <Link href={`/runs/${runId}`}>Overview</Link>
        <span className="breadcrumb-sep">/</span>
        <span style={{ color: "var(--t1)" }}>Gallery</span>
      </div>

      {/* Filter bar — client component, reads/writes URL */}
      <FilterBar
        runId={runId}
        classNames={run.classNames}
        total={total}
      />

      {/* Image grid */}
      {items.length === 0 ? (
        <div className="empty-state">
          <span style={{ fontSize: "1.5rem" }}>∅</span>
          <span>No images match the current filters</span>
          <Link
            href={galleryUrl(runId)}
            style={{ color: "var(--t2)", marginTop: "0.5rem" }}
          >
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="image-grid">
          {items.map((item) => (
            <ImageCard
              key={item.id}
              item={item}
              runId={runId}
              fromSearch={fromSearch}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          {page > 1 ? (
            <Link
              href={galleryUrl(runId, { ...filters, page: page - 1 })}
              className="btn"
            >
              ← Prev
            </Link>
          ) : (
            <span className="btn" style={{ opacity: 0.3, cursor: "not-allowed" }}>
              ← Prev
            </span>
          )}

          <span
            className="text-mono text-dim"
            style={{ fontSize: "0.72rem", minWidth: "6rem", textAlign: "center" }}
          >
            {page} / {totalPages}
          </span>

          {page < totalPages ? (
            <Link
              href={galleryUrl(runId, { ...filters, page: page + 1 })}
              className="btn"
            >
              Next →
            </Link>
          ) : (
            <span className="btn" style={{ opacity: 0.3, cursor: "not-allowed" }}>
              Next →
            </span>
          )}
        </div>
      )}
    </main>
  );
}
