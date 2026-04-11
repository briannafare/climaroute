# ClimaRoute - AI Climate Risk Router

> ML-powered routing engine that scores 7 climate hazards + eco-sensitivity across every mile of your journey, then finds a safer alternative route.

**[Live Demo](https://climaroute-nine.vercel.app)** | **[Devpost Submission](https://algofest-hackathon26.devpost.com)**

![ClimaRoute](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## The Problem

Standard navigation apps optimize for time and distance but completely ignore environmental hazards. Drivers unknowingly route through wildfire corridors, tornado alleys, flood-prone lowlands, and hurricane belts with zero awareness of the climate risks they face. Meanwhile, critical wildlife habitats and endangered species corridors go unrecognized by routing software.

## The Solution

ClimaRoute applies a weighted composite risk-scoring model across **8 environmental factors** for every point along a route, then generates and evaluates multiple candidate paths to find the one that minimizes total climate risk exposure.

### 8-Factor Risk Model

| Factor | Weight | Coverage |
|--------|--------|----------|
| Flood Risk | 18% | Coastal proximity, river corridors, Mississippi/Gulf floodplains |
| Wildfire | 16% | Western US corridors, California, Pacific NW burn zones |
| Tornado | 14% | Tornado Alley (OK/KS), Dixie Alley, Mississippi corridor |
| Hurricane | 12% | Gulf Coast, SE Atlantic, South Florida storm surge |
| Heat Anomaly | 14% | Urban heat islands (Phoenix, Houston, Vegas, Miami, Atlanta, Dallas) |
| Winter Weather | 10% | Great Lakes snow belt, mountain passes, NE ice, Midwest |
| Coastal Exposure | 10% | Atlantic/Pacific proximity, sea-level vulnerability |
| Eco-Sensitivity | 6% | Endangered habitats, wildlife corridors, protected ecosystems |

**Compound risk interactions** boost scores where hazards overlap (flood + heat zones, tornado + hurricane corridors). Model aligns with [FEMA's National Risk Index](https://hazards.fema.gov/nri/) hazard categories.

### Eco-Sensitivity Layer

Routes are scored for proximity to critical ecosystems:
- **Everglades** (South FL wetlands)
- **Pacific NW old growth** (spotted owl habitat)
- **Greater Yellowstone Ecosystem**
- **Sonoran Desert** (Joshua tree, desert tortoise)
- **Appalachian biodiversity corridor**
- **Chesapeake Bay watershed**
- **Gulf Coast marshlands** (whooping crane, sea turtles)
- **California marine sanctuaries**
- **Great Plains prairie** (bison, prairie dog, black-footed ferret)

## Features

### Route Planner
Search addresses or click the map to plan routes between two points. ClimaRoute generates a standard route and a climate-safe alternative, with per-factor risk breakdowns and percentage risk reduction.

### Road Trip Planner
Plan multi-stop trips with 8+ waypoints. Each leg is independently scored and optimized. Built-in route optimizer uses a nearest-neighbor TSP heuristic for efficient stop ordering.

### Explore Mode
Click anywhere on the US map for an instant 8-factor risk assessment with composite score (0-100) and full breakdown.

### Preset Routes
7 demo routes showcasing different hazard profiles:
- LA to Phoenix (Wildfire Corridor)
- Miami to Atlanta (Hurricane Belt)
- Houston to Dallas (Heat + Tornado + Flood)
- SF to Portland (Pacific Wildfire)
- NYC to DC (Coastal + Eco Corridor)
- OKC to Memphis (Tornado Alley)
- Denver to Minneapolis (Winter + Tornado)

### Design
- Light mode (OpenTopoMap terrain) + dark mode (CARTO Dark Matter)
- Glassmorphic card system with design tokens
- Fully responsive mobile UI with touch-friendly bottom sheet
- Artistic, illustrative cartography

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS v4, CSS custom properties |
| Mapping | Leaflet, React-Leaflet, OpenTopoMap, CARTO |
| Animation | Framer Motion |
| Risk Engine | Custom TypeScript (client-side, zero-dependency) |
| Geocoding | OpenStreetMap Nominatim API |
| Deployment | Vercel (CI/CD from GitHub) |

## Architecture

```
src/
  App.tsx          # Full application - 3 modes, theme system, mobile UI
  risk-engine.ts   # 8-factor ML risk scoring, routing, TSP optimizer, geocoding
  index.css        # Design token system, light/dark themes, Leaflet overrides
  App.css          # Component-level styles
  main.tsx         # Entry point
```

**Fully client-side.** No API keys required. No backend. No database. Deploys as a static site anywhere. The entire risk model runs in the browser.

## Development

```bash
git clone https://github.com/briannafare/climaroute.git
cd climaroute
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build
# Deploy dist/ to any static host (Vercel, Netlify, S3, etc.)
```

## License

MIT
