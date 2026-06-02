/**
 * Root layout for rendering frontend pages in a browser.
 *
 * Required by the Next.js App Router: every page under `app/` is rendered
 * inside this shell. Provides the document structure (`<html>`, `<body>`) and
 * loads global styles (`globals.css`) — design tokens, typography, and
 * component classes shared across overview, gallery, and detail screens.
 *
 * Does not fetch data or render navigation; route-specific UI lives in
 * nested layouts/pages (e.g. `app/runs/[runId]/page.tsx`).
 */

import type { ReactNode } from "react";
import "./globals.css"

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}