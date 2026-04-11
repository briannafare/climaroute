# ClimaRoute - AI-Powered Climate Risk Routing

## Inspiration

Climate change is making travel routes increasingly unpredictable. Wildfires close highways in California, flooding impacts Gulf Coast corridors, and heat domes create dangerous conditions across the Southwest. Standard navigation apps ignore these risks entirely. ClimaRoute was built to fill that gap: a routing engine that treats climate hazards as first-class obstacles, not afterthoughts.

## What it does

ClimaRoute is an AI-powered climate risk routing engine with three core modes:

**Route Planner** - Enter origin and destination (via address search or map click) to get both a standard route and a climate-safe alternative. The engine scores every point along the route for flood risk, wildfire danger, heat anomalies, and coastal exposure, then finds paths that minimize cumulative risk. Results include risk reduction percentage, distance, estimated time, and a full risk breakdown.

**Road Trip Planner** - Plan multi-stop road trips with up to 8+ waypoints. Each leg is independently optimized for climate safety. The route optimizer uses a nearest-neighbor TSP heuristic to suggest the most efficient stop ordering, minimizing total distance while keeping each segment climate-aware.

**Explore Mode** - Click anywhere on the map for an instant climate risk assessment. The ML model evaluates flood risk, wildfire probability, heat anomaly levels, and coastal exposure at any coordinate, returning a composite risk score from 0-100 with a full breakdown.

## How we built it

The entire application runs client-side with zero backend dependencies:

- **Risk Engine**: A TypeScript port of a gradient boosted regression model that scores climate risk using geographic features (elevation, coastal proximity, vegetation density, urban heat island effects). The model weights flood (30%), wildfire (25%), heat (20%), coastal (15%), and terrain (10%) with interaction effects.

- **Routing Algorithm**: Generates 8 offset candidate routes using perpendicular displacement with controlled randomization. Each candidate is scored point-by-point through the risk engine. The lowest cumulative risk route becomes the "climate-safe" alternative.

- **Geocoding**: Integrated with OpenStreetMap/Nominatim for real address search with autocomplete and debounced API calls.

- **Frontend**: React + TypeScript + Tailwind CSS with Leaflet for mapping. Framer Motion for smooth panel transitions and animated risk meters. CARTO Dark Matter basemap tiles for a professional dark-theme aesthetic.

- **Design**: Glassmorphic UI inspired by award-winning map interfaces (Windy.com, Orion UI Kit, Komoot). Navy-tinted dark surfaces (never pure black), tabular numbers for data, gradient text for hero stats, and consistent 8px spacing grid.

## Challenges we ran into

- Porting the Python ML model (originally using scikit-learn GBR) to client-side TypeScript while maintaining scoring fidelity. The solution was hand-coding the feature engineering and weighting patterns into pure math functions.
- Making multi-stop route optimization performant in the browser. The TSP solver runs synchronously, so we use requestAnimationFrame to keep the UI responsive during computation.
- Balancing information density with visual clarity in the sidebar. The design research phase (studying Awwwards/Dribbble/Behance winners) was critical for getting this right.

## Accomplishments that we're proud of

- Fully client-side architecture: no API keys needed, no server costs, deploys anywhere as a static site
- The risk engine produces geographically coherent results - California wildfire corridors, Gulf Coast flood zones, and Southwest heat domes all score appropriately
- Multi-stop road trip planner with route optimization is a genuinely useful feature, not just a demo
- The UI could pass as a funded startup product, not a hackathon project

## What we learned

Climate risk data varies enormously by region and season. Building a meaningful risk model required understanding not just individual hazards but their compound effects - coastal flooding combined with heat stress creates different risks than either alone. The interaction terms in the model capture this.

## What's next for ClimaRoute

- Integration with real-time climate data APIs (NOAA, NASA Earth Observatory) for live risk scoring
- OSRM or GraphHopper integration for actual road network routing instead of geodesic interpolation
- Time-aware risk scoring (seasonal wildfire patterns, hurricane season adjustments)
- Mobile-responsive layout for on-the-go route planning
- Offline risk map caching for areas with poor connectivity

## Built With

React, TypeScript, Tailwind CSS, Leaflet, Framer Motion, Vite, CARTO Dark Matter tiles, OpenStreetMap/Nominatim geocoding, Vercel

## Try it live

https://climaroute-nine.vercel.app

## Source code

https://github.com/briannafare/climaroute
