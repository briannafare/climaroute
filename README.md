# ClimaRoute

AI-powered climate risk routing engine. Navigate around flood zones, wildfire corridors, and heat anomalies.

**[Live Demo](https://climaroute-nine.vercel.app)**

## Features

### Route Planner
Search addresses or click the map to plan routes between two points. ClimaRoute calculates both a standard route and a climate-safe alternative, scoring every waypoint for flood risk, wildfire danger, heat anomalies, and coastal exposure.

### Road Trip Planner
Plan multi-stop trips with up to 8+ waypoints. Each leg is independently optimized for climate safety. Use the route optimizer to find the most efficient stop ordering.

### Explore Mode  
Click anywhere on the map for an instant climate risk assessment with a composite score (0-100) and full breakdown by hazard type.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4
- **Mapping**: Leaflet + React-Leaflet with CARTO Dark Matter tiles
- **Animations**: Framer Motion
- **Geocoding**: OpenStreetMap/Nominatim
- **Risk Engine**: Client-side TypeScript ML model (ported from Python GBR)
- **Hosting**: Vercel (fully static, no backend)

## Risk Model

The risk engine evaluates four climate hazard dimensions:

| Factor | Weight | Data Sources |
|--------|--------|-------------|
| Flood Risk | 30% | Coastal proximity, river corridors, elevation |
| Wildfire Risk | 25% | Vegetation density, western US fire corridors |
| Heat Anomaly | 20% | Latitude, urban heat island proximity |
| Coastal Exposure | 15% | Distance to coast |
| Terrain | 10% | Elevation-based vulnerability |

Compound interaction effects (e.g., flood + heat) add additional risk weighting.

## Architecture

```
src/
  App.tsx          # Main application with three modes
  risk-engine.ts   # Client-side ML risk scoring + routing algorithms
  index.css        # Glassmorphic dark theme + Leaflet overrides
  main.tsx         # Entry point
```

Fully client-side. No API keys. No backend. Deploys as a static site anywhere.

## Development

```bash
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build
# Deploy dist/ to any static host
```

## License

MIT
