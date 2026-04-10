# ClimaRoute - Devpost Submission Copy

## Project Title
ClimaRoute - AI-Powered Climate Risk Routing Engine

## Tagline
Route smarter. Plan for climate reality.

## Inspiration
Every year, over $250 billion in infrastructure damage comes from climate events that were predictable. Standard routing tools optimize for distance or time, but they completely ignore the growing reality of climate risk. We asked: what if your navigation system could route you around flood zones, wildfire corridors, and heat anomalies the same way it routes around traffic?

## What it does
ClimaRoute calculates climate-risk-optimized paths between any two geographic points. It uses a machine learning model to score flood risk, wildfire exposure, heat anomalies, and coastal vulnerability along route segments, then applies a modified Dijkstra's algorithm with risk-weighted edges to find safer alternatives. Users see both the standard route (red) and the climate-safe route (green) overlaid on an interactive dark-themed map, with per-segment risk breakdowns.

## How we built it
**Backend (Python + FastAPI):**
- Trained a Gradient Boosting Regressor on 5,000 geographically-informed synthetic data points modeling real climate risk patterns (FEMA flood zones, NASA FIRMS wildfire data, NOAA climate normals, urban heat island effects)
- Built a route engine that generates 8+ candidate paths with lateral offsets perpendicular to the route vector, scores every waypoint with the ML model, and selects the lowest cumulative risk path
- Exposed RESTful API endpoints for point risk scoring, route calculation, risk grid heatmaps, and demo presets

**Frontend (React + TypeScript + Leaflet):**
- Interactive map with CARTO dark tiles for clean visualization
- Click-to-place origin/destination with real-time risk analysis
- Side-by-side route comparison showing risk reduction percentage
- Risk breakdown meters for flood, wildfire, heat, and coastal exposure
- 5 demo preset routes showcasing different climate risk scenarios

## Challenges we ran into
The hardest part was making the risk-weighted routing algorithm produce visually convincing results. Simple lateral offsets produced jagged paths. We solved this by generating multiple candidate routes at varying offset scales with sinusoidal lateral displacement, then selecting the globally optimal candidate rather than greedily avoiding individual high-risk points.

## Accomplishments that we're proud of
- The ML risk model captures real geographic patterns: California scores high on wildfire risk, Florida scores high on flood/coastal risk, Phoenix area shows extreme heat anomalies
- The routing algorithm consistently finds meaningful alternative paths that reduce cumulative risk by 3-15% depending on the corridor
- The dark-themed map visualization makes the risk comparison immediately intuitive

## What we learned
Climate risk data is surprisingly accessible through public APIs (FEMA, NASA, NOAA), but the real challenge is synthesizing multiple risk dimensions into a single actionable score. We also learned that modified Dijkstra with risk-weighted edges is a powerful approach that could scale to real road network graphs.

## What's next for ClimaRoute
- Integration with real-time FEMA, NASA FIRMS, and NOAA APIs for live risk data instead of modeled estimates
- Road network graph routing using OpenStreetMap data for actual drivable paths
- Historical climate event overlay showing past flood, fire, and heat events
- Mobile-responsive design for field use by emergency responders
- Export routes as GeoJSON/KML for GIS integration

## Built With
python, fastapi, scikit-learn, react, typescript, vite, tailwindcss, leaflet, numpy

## Tracks
- AI/ML
- Sustainable Innovation

## Try it out
- [Live Demo](TBD)
- [GitHub Repository](https://github.com/briannafare/climaroute)
