# `/app/frontend/README.md`

```markdown
# QSVM NeuroDx — Frontend

React 19 dashboard for the QSVM Brain Tumor Detection backend.
Three routes: Diagnosis (upload + analyze), Model Insights (metrics),
History (past scans + PDF/DICOM export).

## Stack

| | |
|---|---|
| Framework | React 19 + react-router-dom |
| Build | react-scripts 5 + CRACO (path alias `@/*`) |
| Styling | Tailwind CSS, shadcn/ui primitives |
| Icons | lucide-react |
| HTTP | axios |
| Toasts | sonner |
| Fonts | Manrope (headings) · IBM Plex Sans (body) · JetBrains Mono (data) |

## Prerequisites

- Node.js 18+ (LTS)
- Yarn 1.22+ (`npm install -g yarn`)
- Running backend at `REACT_APP_BACKEND_URL`

## Setup

```bash
cd frontend
yarn install
```

Create `frontend/.env`:
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

> Use the **full external URL** when deployed (e.g.
> `https://qsvm.example.com`). Never hardcode `http://localhost`.
> All API calls go through `src/lib/api.js`, which prefixes
> `${REACT_APP_BACKEND_URL}/api`.

### Required patch — react-scripts ↔ webpack-dev-server 5

`react-scripts 5.0.1` ships an outdated dev-server config. Patch
`node_modules/react-scripts/config/webpackDevServer.config.js`:

1. Replace `https: getHttpsConfig(),` with
   `server: getHttpsConfig() ? { type: 'https', options: getHttpsConfig() === true ? undefined : getHttpsConfig() } : 'http',`
2. Replace `onBeforeSetupMiddleware` + `onAfterSetupMiddleware` blocks
   with a single `setupMiddlewares(middlewares, devServer)` that calls
   `evalSourceMapMiddleware`, optional `paths.proxySetup`,
   `redirectServedPath`, `noopServiceWorkerMiddleware`, and returns
   `middlewares`.

Persist via `patch-package`:
```bash
yarn add -D patch-package
npx patch-package react-scripts
```

## Run

```bash
yarn start            # dev server on http://localhost:3000
yarn build           
yarn test            
```

## Project layout

```
src/
├── App.js                          # router + Toaster
├── index.css                       # Tailwind layers + theme tokens + animations
├── lib/
│   ├── api.js                      # axios client, runPrediction(file), downloadReport(id), downloadDicom(id)
│   └── quantum.js                  # CLASSES, CLASS_COLORS, STAGES, formatTime, confidenceColor
├── pages/
│   ├── DashboardPage.jsx           # upload + submit + poll + results
│   ├── InsightsPage.jsx            # /api/metrics renderer
│   └── HistoryPage.jsx             # table with filters + PDF/DICOM/delete
└── components/
    ├── Layout.jsx                  # nav header + footer
    ├── UploadZone.jsx              # drag-drop + preview
    ├── ProcessingOverlay.jsx       # quantum circuit SVG + server-driven stages
    ├── ResultsPanel.jsx            # diagnosis headline + PDF/DICOM buttons
    ├── ConfidenceGauge.jsx         # animated SVG ring
    ├── ProbabilityChart.jsx        # horizontal bars across 4 classes
    ├── ConfusionMatrix.jsx         # heatmap table
    └── ui/                         # shadcn primitives 
```

## Data flow

```
DashboardPage.handleAnalyze()
  └─ runPrediction(file, onProgress)              [src/lib/api.js]
        ├─ POST /api/predict  →  {job_id, estimated_time_seconds}
        └─ loop: GET /api/predict/status/{job_id} every 600ms
              ├─ onProgress({status, stage_idx, elapsed_seconds, ...})
              │     → ProcessingOverlay reads serverStage / serverElapsed
              ├─ status === "done"  → resolve with result
              └─ status === "error" → throw
```

`ProcessingOverlay` falls back to a client-side timer if `serverStage`
/ `serverElapsed` are absent (mock mode without polling).

## Theming

Theme tokens live in `src/index.css`:

| Token | Value | Use |
|---|---|---|
| `--bg-main` | `#060913` | page background |
| `--bg-card` | `#0D1326` | primary card |
| `--bg-elevated` | `#131A33` | nested card |
| `--brand-primary` | `#8B5CF6` | violet — primary actions, predicted class |
| `--brand-accent` | `#2DD4BF` | teal — accents, "No Tumor" class |
| `--semantic-warning` | `#F97316` | low-confidence + Meningioma class |
| `--semantic-danger` | `#EF4444` | Glioma class |

Per-class colors come from `CLASS_COLORS` in `src/lib/quantum.js` — keep
in sync with backend if you add new classes.

## Routing & test IDs

| Route | data-testid roots |
|---|---|
| `/`          | `dashboard-page`, `upload-dropzone`, `analyze-button`, `processing-overlay`, `results-panel` |
| `/insights`  | `insights-page`, `confusion-matrix`, `kernel-separation` |
| `/history`   | `history-page`, `filter-{class}`, `history-row-{id}`, `download-report-{id}`, `download-dicom-{id}`, `delete-{id}` |

Every interactive element and key info node carries a `data-testid`. 

## Common issues

| Symptom | Fix |
|---|---|
| Blank page, console: `process.env.REACT_APP_BACKEND_URL is undefined` | `.env` not loaded — restart `yarn start` after editing |
| CORS error in console | Add your frontend origin to `CORS_ORIGINS` in `backend/.env` |
| Stages don't tick | Backend polling endpoint returning 404 — check `job_id` propagation; falls back to client timer automatically |
| `yarn start` fails with `onAfterSetupMiddleware` error | Apply the react-scripts patch above |
| Build warnings about `cmdk-input-wrapper` and shadcn calendar | Pre-existing shadcn lint noise; safe to ignore |

## Production build

```bash
yarn build
```

Outputs static assets to `build/`. Serve behind any reverse proxy (nginx,
Cloudflare Pages, Vercel static, S3+CloudFront). Set
`REACT_APP_BACKEND_URL` at **build time** — CRA inlines env vars, they
are not read at runtime.

Example nginx:
```nginx
location / {
    try_files $uri /index.html;
    root /var/www/qsvm-frontend/build;
}
location /api/ {
    proxy_pass http://localhost:8001;
}
```