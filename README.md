# ultralytics_valid_drilldown
This prototype demonstrates the image-drilldown layer that sits underneath the existing validation dashboard, allowing a user to inspect individual images that weren't performing as well as we expect on certain metrics. This layer also empowers a user to discover potential patterns from failing cases, thus providing actionable insights into how to improve model performance on later iterations.

## Get started

## How to run this project

## Dataset
This demo leverages a subset of COCO128 dataset from Ultralytics. A total of 11 classes amomg all 80 are used to keep confusion matrix readable. Images that contain none of these classes are skipped.

## Architecture Overview
- **Frontend**: Next.js + TypeScript;
- **Backend**: Python serverless endpoints

## Product and UX decisions
### Frontend
- Scripts in `app/api` defines the HTTP contract for external consumers and client components. All pages in `api/runs` are server components that directly fetch JSON data through `lib/store.ts` stored in local disk. This allows for one-command launch, end-to-end type safety and separation of concerns without unnecessary maintenance burnden.

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
- [ ] Bounding box overlay between prediction and ground truth;
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