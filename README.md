# Validation Explorer -- Ultralytics Platform Prototype
This prototype demonstrates the image-drilldown layer that sits underneath the existing validation dashboard, allowing a user to inspect individual images that weren't performing as well as they expect on certain metrics. This layer also empowers a user to discover potential patterns from failing cases, thus providing actionable insights into how to improve model performance on later iterations.

## Setup
```bash
# 1. Install Python dependencies into a virtual environment.
pipenv install -r requirements.txt

# 2. Generate fixtures.
python run scripts/generate_mock_data.py

# 3. Install Node dependencies and start the app.
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser. This lands on an overview page of validation run.

## The drilldown workflow

The three pages form one continuous funnel:
 
![Drilldown workflow](asset/drilldown_flow.png)
Every entry poinnt -- a confusion matrix cell, a per-class table row, a pattern group card -- lands in the same filtered gallery.


## Dataset
This demo leverages a subset of COCO128 dataset from Ultralytics. A total of 11 classes amomg all 80 are used to keep confusion matrix readable. Images that contain none of these classes are skipped.

## Frontend Architecture

```
Browser
  └── Pages (Next.js server components)
        ├── app/runs/[runId]/page.tsx          Overview
        ├── app/runs/[runId]/images/page.tsx   Gallery
        ├── app/runs/[runId]/images/[id]/...   Detail
        └── app/runs/[runId]/patterns/page.tsx Patterns
              │
              │  direct function call (no HTTP)
              ▼
        lib/store.ts                    Data logic — filter, sort, group
              │
              ▼
        data/fixtures/*.json            COCO128 GT + simulated predictions
 
  Three "use client" components are separated from pages as they can't import server-side modules:
    ConfusionMatrix.tsx   — cell clicks navigate to filtered gallery
    FilterBar.tsx         — dropdowns update URL via router.push()
    BoxOverlay.tsx        — SVG box rendering with hover interaction
 
  app/api/runs/[runId]/.../route.ts     — HTTP contract for external consumers
```

**URL is the filter state.** Filter changes are navigations, not React state updates. This means filtered views are shareable links, the browser back button works through the entire drilldown, and clicking a confusion matrix cell is identical to typing a filter — both just change the URL.


## Product and UX decisions
### Frontend
- **Server-side data retrieval**. Scripts in `app/api` defines the HTTP contract for external consumers and client components. All pages in `api/runs` are server components that directly fetch JSON data through `lib/store.ts` stored in local disk. This allows for one-command launch, end-to-end type safety and separation of concerns without unnecessary maintenance burnden.
- **Worst-first default**. The gallery sorts by per-image F1 ascending. A reviewer opening the gallery immediately sees the most broken images, not a random sample. The sort is overridable. Note per-class table sorts by mAP50 ascending -- the class that the model struggles the most appeares at the top. The sorting critieria is not overridable.
- **Dominant error type as a first-class signal.** Each image carries a `dominantErrorType` — whichever failure mode appeared most (false negative, localization, classification, false positive). This single field powers the gallery filter, the pattern grouping, and the badge on each card, making it the consistent vocabulary across all three screens.
- **Pattern discovery through clustering.** The patterns view groups by class, error type, or confidence band — three dimensions that answer different questions without requiring any additional inference. The result is a ranked list of failure clusters (e.g. "28 images where false negatives dominate, average F1 of 0.41") with representative thumbnails and links to the full filtered gallery.
- **Confusion matrix as a navigation element.** Each cell is clickable and navigates to the gallery filtered by that true/predicted class pair. The matrix is not just a read-only chart — it is the primary drilldown entry point from the overview.

### Backend
- Backend data models are stored in `scripts/models.py` to mirror the same contract for frontend defined in `types/validation.ts` and are for reference only to keep this project frontend focused. In production, data is sent in JSON format over HTTP protocol. 

## Assumptions
- Per-image evaluation results;
- Predictions
- Image labels (ground truth)
- Confidence scores
- Error metadata

## API endpoints
```
GET /api/runs/:id/summary

Aggregate metrics, per-class tables and confusion matrix.
```

```
GET /api/runs/:id/images?class=&errorType=&confMin&confMax=&sort=worst&page=
```
The filtered, paginated list of images on which a model doens't perform well.

```
GET /api/images/:id
```
Full image-level detail: prediction, ground truth, confidence score and error tag.


## Mocked and implemented
- **Data Model**: considering Ultralytics API already provides dataset-level performance metrics and  per-image summary, a mocked data model is created that stores individual box coordinates, prediction confidence score, error-type classification and IoU values;

## Scope

## Evolution to production

## Roadmap
- [x] Data model and a mock generator;
- [x] A hierachical page that flows from result overview to filtered example list to image detail view;
- [x] Bounding box overlay between prediction and ground truth;
- [x] Pattern-discovery grouping and clickable confusion matrix and filter/sort feature;
- [ ] Polish README and create a short GIF demo;

## File Structure
validation-prototype/
├── README.md
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       # redirect → /runs/run_001
│   ├── globals.css
│   │
│   ├── runs/[runId]/
│   │   ├── page.tsx                   # SCREEN 1  overview
│   │   ├── patterns/page.tsx          #           pattern discovery
│   │   └── images/
│   │       ├── page.tsx               # SCREEN 2  filtered gallery
│   │       └── [imageId]/page.tsx     # SCREEN 3  detail + overlays
│   │
│   └── api/                           # TS route handlers (the "backend")
│       ├── runs/[runId]/
│       │   ├── summary/route.ts       # GET run summary
│       │   ├── images/route.ts        # GET filtered image list
│       │   └── patterns/route.ts      # GET pattern groups
│       └── images/[imageId]/route.ts  # GET image detail
│
├── components/
│   ├── overview/
│   │   ├── MetricsSummary.tsx
│   │   ├── ConfusionMatrix.tsx        # cells deep-link into filtered list
│   │   └── PerClassTable.tsx
│   ├── gallery/
│   │   ├── ImageCard.tsx
│   │   └── FilterBar.tsx
│   ├── detail/
│   │   ├── BoxOverlay.tsx             # SVG box renderer — the showpiece
│   │   ├── LayerToggle.tsx
│   │   └── DetailSidebar.tsx
│   ├── patterns/GroupCard.tsx
│   └── ui/                            # Badge, Card, Spinner
│
├── lib/
│   ├── store.ts                       # load fixtures + filter/sort/group LOGIC
│   ├── api.ts                         # typed client fetch wrappers
│   ├── filters.ts                     # URL searchParams ↔ ImageFilters
│   └── colors.ts                      # errorType → color
│
├── types/
│   └── validation.ts                  # ← already built (the contract)
│
├── scripts/
│   └── generate_mock_data.py          # ← already built
│
├── backend/
│   └── models.py                      # ← reference only; see README
│
└── data/fixtures/                     # ← already built
    ├── run_001.json
    ├── images.json
    └── images_index.json