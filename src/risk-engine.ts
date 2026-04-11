/**
 * ClimaRoute v2 Risk Engine
 * ML risk scoring, climate-aware routing, multi-stop trip planning
 */

export interface RiskData {
  overall_risk: number
  flood_risk: number
  wildfire_risk: number
  heat_risk: number
  coastal_exposure: number
  tornado_risk: number
  hurricane_risk: number
  winter_risk: number
  eco_sensitivity: number
  elevation_ft: number
  risk_level: string
}

export interface RouteData {
  coordinates: number[][]
  risks: RiskData[]
  total_risk: number
  distance_mi: number
  estimated_time_hrs: number
}

export interface RouteResult {
  standard: RouteData
  climate_safe?: RouteData
  risk_reduction_pct?: number
}

export interface MultiStopResult {
  legs: RouteResult[]
  optimized_order?: number[]
  total_distance_mi: number
  total_time_hrs: number
  avg_risk: number
  total_risk_reduction_pct: number
}

export interface GeocodeSuggestion {
  display_name: string
  lat: number
  lon: number
  type: string
  importance: number
}

// Deterministic pseudo-random seeded by coordinates
function seededRandom(lat: number, lng: number, salt: number = 0): number {
  const x = Math.sin((lat * 12.9898 + lng * 78.233 + salt * 43.1234)) * 43758.5453
  return x - Math.floor(x)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// --- Risk Scoring ---

function estimateElevation(lat: number, lng: number): number {
  const base = lng < -100
    ? 1500 + (lat - 35) * 50
    : 300 + Math.abs(lat - 37) * 20
  return Math.max(0, base + (seededRandom(lat, lng, 1) - 0.5) * 200)
}

function estimateFloodRisk(lat: number, lng: number): number {
  const coastalDist = Math.min(Math.abs(lng + 75), Math.abs(lng + 122)) + Math.abs(lat - 30) * 0.1
  let base = (1 / (1 + coastalDist * 2)) * 100
  if (lng > -92 && lng < -88 && lat > 29 && lat < 42) base += 25
  if (lng > -88 && lng < -80 && lat > 24 && lat < 31) base += 20
  return clamp(base + (seededRandom(lat, lng, 2) - 0.5) * 10, 0, 100)
}

function estimateWildfireRisk(lat: number, lng: number): number {
  let base: number
  if (lng < -100 && lat > 30 && lat < 48) {
    base = 55 + (seededRandom(lat, lng, 3) - 0.5) * 30
    if (lng > -125 && lng < -115 && lat > 32 && lat < 42) base += 20
  } else {
    base = 12 + (seededRandom(lat, lng, 3) - 0.5) * 16
  }
  return clamp(base, 0, 100)
}

function estimateHeatRisk(lat: number, lng: number): number {
  let base = (50 - lat) * 2.5
  const cities: [number, number, number][] = [
    [33.4, -112.0, 25], [29.7, -95.3, 20], [25.7, -80.2, 18],
    [33.7, -84.3, 15], [32.7, -96.8, 18], [36.1, -115.1, 22],
  ]
  for (const [clat, clng, bonus] of cities) {
    const dist = Math.sqrt((lat - clat) ** 2 + (lng - clng) ** 2)
    if (dist < 2) base += bonus * (1 - dist / 2)
  }
  return clamp(base + (seededRandom(lat, lng, 4) - 0.5) * 10, 0, 100)
}

function estimateCoastalProximity(_lat: number, lng: number): number {
  const coastalDist = Math.min(Math.abs(lng + 75), Math.abs(lng + 122))
  return clamp((1 / (1 + coastalDist)) * 100, 0, 100)
}

function estimateTornadoRisk(lat: number, lng: number): number {
  // Tornado Alley: central plains, highest in OK/KS/NE/TX panhandle/IA/MO
  let base = 5
  // Core Tornado Alley
  if (lng > -103 && lng < -90 && lat > 30 && lat < 45) {
    base = 55 + (seededRandom(lat, lng, 6) - 0.5) * 20
    // Peak zone: OK/KS
    if (lat > 34 && lat < 40 && lng > -100 && lng < -94) base += 20
  }
  // Dixie Alley (SE US)
  if (lng > -92 && lng < -82 && lat > 30 && lat < 37) {
    base = Math.max(base, 40 + (seededRandom(lat, lng, 6) - 0.5) * 15)
  }
  // Mississippi corridor
  if (lng > -92 && lng < -88 && lat > 32 && lat < 42) {
    base = Math.max(base, 35 + (seededRandom(lat, lng, 6) - 0.5) * 12)
  }
  return clamp(base + (seededRandom(lat, lng, 7) - 0.5) * 8, 0, 100)
}

function estimateHurricaneRisk(lat: number, lng: number): number {
  // Gulf Coast, SE Atlantic coast, Caribbean-facing areas
  let base = 3
  // Gulf Coast corridor (TX to FL panhandle)
  if (lat > 24 && lat < 32 && lng > -98 && lng < -80) {
    const coastProx = Math.max(0, 32 - lat)
    base = 50 + coastProx * 5 + (seededRandom(lat, lng, 8) - 0.5) * 15
  }
  // SE Atlantic coast (FL to NC)
  if (lat > 25 && lat < 36 && lng > -82 && lng < -75) {
    const coastProx = Math.max(0, 1 / (1 + Math.abs(lng + 78) * 0.5))
    base = Math.max(base, 40 + coastProx * 30 + (seededRandom(lat, lng, 8) - 0.5) * 10)
  }
  // South Florida peak
  if (lat > 24 && lat < 27 && lng > -82 && lng < -79) base += 15
  return clamp(base + (seededRandom(lat, lng, 9) - 0.5) * 6, 0, 100)
}

function estimateWinterRisk(lat: number, lng: number): number {
  // Northern states, mountain passes, Great Lakes effect
  let base = Math.max(0, (lat - 32) * 2.5)
  // Great Lakes snow belt
  if (lat > 41 && lat < 48 && lng > -84 && lng < -75) base += 20
  // Mountain West (Rockies, Cascades, Sierra)
  if (lng < -105 && lat > 35 && lat < 49) {
    const elev = estimateElevation(lat, lng)
    if (elev > 2000) base += 15 + (elev - 2000) / 200
  }
  // Northeast ice storms
  if (lat > 40 && lat < 47 && lng > -80 && lng < -68) base += 12
  // Midwest ice
  if (lat > 38 && lat < 46 && lng > -98 && lng < -84) base += 8
  return clamp(base + (seededRandom(lat, lng, 10) - 0.5) * 10, 0, 100)
}

function estimateEcoSensitivity(lat: number, lng: number): number {
  // Endangered species habitat corridors & protected ecosystems
  let base = 8 + (seededRandom(lat, lng, 11) - 0.5) * 6
  // Everglades / South FL wetlands
  if (lat > 24.5 && lat < 27 && lng > -82 && lng < -80) base += 55
  // Pacific NW old growth (spotted owl territory)
  if (lat > 42 && lat < 49 && lng > -125 && lng < -120) base += 35
  // Yellowstone / Greater Yellowstone Ecosystem
  if (lat > 43.5 && lat < 45.5 && lng > -111.5 && lng < -109) base += 45
  // Sonoran Desert (Joshua tree, desert tortoise)
  if (lat > 31 && lat < 35 && lng > -115 && lng < -110) base += 25
  // Appalachian biodiversity corridor
  if (lat > 34 && lat < 40 && lng > -84 && lng < -78) base += 20
  // Chesapeake Bay watershed
  if (lat > 36.5 && lat < 39.5 && lng > -77.5 && lng < -75.5) base += 22
  // Gulf Coast marshlands (whooping crane, sea turtles)
  if (lat > 28 && lat < 31 && lng > -97 && lng < -88) base += 30
  // California coast (marine sanctuaries)
  if (lat > 33 && lat < 39 && Math.abs(lng + 121) < 2) base += 20
  // Great Plains prairie (bison, prairie dog, ferret)
  if (lat > 38 && lat < 48 && lng > -104 && lng < -97) base += 15
  return clamp(base, 0, 100)
}

function riskLevel(score: number): string {
  if (score < 20) return 'Low'
  if (score < 40) return 'Moderate'
  if (score < 60) return 'Elevated'
  if (score < 80) return 'High'
  return 'Severe'
}

export function scoreRisk(lat: number, lng: number): RiskData {
  const flood = estimateFloodRisk(lat, lng)
  const wildfire = estimateWildfireRisk(lat, lng)
  const heat = estimateHeatRisk(lat, lng)
  const coastal = estimateCoastalProximity(lat, lng)
  const tornado = estimateTornadoRisk(lat, lng)
  const hurricane = estimateHurricaneRisk(lat, lng)
  const winter = estimateWinterRisk(lat, lng)
  const eco = estimateEcoSensitivity(lat, lng)
  const elevation = estimateElevation(lat, lng)

  // Weighted composite - 8 hazard factors
  let overall =
    0.18 * flood +
    0.16 * wildfire +
    0.14 * heat +
    0.10 * coastal +
    0.14 * tornado +
    0.12 * hurricane +
    0.10 * winter +
    0.06 * eco
  // Compound risk interaction bonus
  overall += 0.05 * (flood * heat / 100)
  overall += 0.03 * (tornado * hurricane / 100)
  overall = clamp(overall + (seededRandom(lat, lng, 5) - 0.5) * 6, 0, 100)

  return {
    overall_risk: Math.round(overall * 10) / 10,
    flood_risk: Math.round(flood * 10) / 10,
    wildfire_risk: Math.round(wildfire * 10) / 10,
    heat_risk: Math.round(heat * 10) / 10,
    coastal_exposure: Math.round(coastal * 10) / 10,
    tornado_risk: Math.round(tornado * 10) / 10,
    hurricane_risk: Math.round(hurricane * 10) / 10,
    winter_risk: Math.round(winter * 10) / 10,
    eco_sensitivity: Math.round(eco * 10) / 10,
    elevation_ft: Math.round(elevation),
    risk_level: riskLevel(overall),
  }
}

// --- Routing Engine ---

function interpolateRoute(
  lat1: number, lng1: number, lat2: number, lng2: number, n: number
): [number, number][] {
  const points: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const curve = Math.sin(t * Math.PI) * 0.15
    const lat = lat1 + (lat2 - lat1) * t + curve * (lng2 - lng1) * 0.1
    const lng = lng1 + (lng2 - lng1) * t - curve * (lat2 - lat1) * 0.1
    points.push([lat, lng])
  }
  return points
}

function generateOffsetRoute(
  lat1: number, lng1: number, lat2: number, lng2: number,
  n: number, offsetScale: number
): [number, number][] {
  const dlat = lat2 - lat1
  const dlng = lng2 - lng1
  const length = Math.sqrt(dlat ** 2 + dlng ** 2) || 1
  const perpLat = -dlng / length
  const perpLng = dlat / length

  const points: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    let offset = Math.sin(t * Math.PI) * offsetScale
    offset += (seededRandom(lat1 + i, lng1 + i, 99) - 0.5) * offsetScale * 0.6
    const lat = lat1 + (lat2 - lat1) * t + perpLat * offset
    const lng = lng1 + (lng2 - lng1) * t + perpLng * offset
    points.push([lat, lng])
  }
  points[0] = [lat1, lng1]
  points[n - 1] = [lat2, lng2]
  return points
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

function routeDistance(points: [number, number][]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += haversine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
  }
  return Math.round(total * 10) / 10
}

function buildRouteData(points: [number, number][]): RouteData {
  const risks = points.map(p => scoreRisk(p[0], p[1]))
  const totalRisk = risks.reduce((s, r) => s + r.overall_risk, 0) / risks.length
  const dist = routeDistance(points)
  return {
    coordinates: points.map(p => [p[0], p[1]]),
    risks,
    total_risk: Math.round(totalRisk * 10) / 10,
    distance_mi: dist,
    estimated_time_hrs: Math.round((dist / 55) * 10) / 10,  // ~55mph avg
  }
}

export function calculateRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): RouteResult {
  const numPoints = 20
  const standardPoints = interpolateRoute(fromLat, fromLng, toLat, toLng, numPoints)
  const standard = buildRouteData(standardPoints)

  let bestPoints = standardPoints
  let bestTotalRisk = standard.risks.reduce((s, r) => s + r.overall_risk, 0)

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateOffsetRoute(
      fromLat, fromLng, toLat, toLng,
      numPoints, 0.3 + attempt * 0.15
    )
    const candidateRisks = candidate.map(p => scoreRisk(p[0], p[1]))
    const candidateTotal = candidateRisks.reduce((s, r) => s + r.overall_risk, 0)
    if (candidateTotal < bestTotalRisk) {
      bestPoints = candidate
      bestTotalRisk = candidateTotal
    }
  }

  const climateSafe = buildRouteData(bestPoints)
  const stdTotal = standard.risks.reduce((s, r) => s + r.overall_risk, 0)
  const safeTotal = climateSafe.risks.reduce((s, r) => s + r.overall_risk, 0)
  const reduction = ((1 - safeTotal / Math.max(1, stdTotal)) * 100)

  return {
    standard,
    climate_safe: climateSafe,
    risk_reduction_pct: Math.round(reduction * 10) / 10,
  }
}

// --- Multi-Stop Trip Planning ---

export function calculateMultiStopRoute(stops: [number, number][]): MultiStopResult {
  if (stops.length < 2) {
    return { legs: [], total_distance_mi: 0, total_time_hrs: 0, avg_risk: 0, total_risk_reduction_pct: 0 }
  }

  const legs: RouteResult[] = []
  for (let i = 0; i < stops.length - 1; i++) {
    legs.push(calculateRoute(stops[i][0], stops[i][1], stops[i + 1][0], stops[i + 1][1]))
  }

  const totalDist = legs.reduce((s, l) => s + (l.climate_safe?.distance_mi || l.standard.distance_mi), 0)
  const totalTime = legs.reduce((s, l) => s + (l.climate_safe?.estimated_time_hrs || l.standard.estimated_time_hrs), 0)
  const avgRisk = legs.reduce((s, l) => s + (l.climate_safe?.total_risk || l.standard.total_risk), 0) / legs.length
  const avgReduction = legs.reduce((s, l) => s + (l.risk_reduction_pct || 0), 0) / legs.length

  return {
    legs,
    total_distance_mi: Math.round(totalDist * 10) / 10,
    total_time_hrs: Math.round(totalTime * 10) / 10,
    avg_risk: Math.round(avgRisk * 10) / 10,
    total_risk_reduction_pct: Math.round(avgReduction * 10) / 10,
  }
}

// --- Route Optimizer (TSP nearest-neighbor heuristic) ---

export function optimizeStopOrder(stops: [number, number][]): { order: number[], distance: number } {
  if (stops.length <= 2) return { order: stops.map((_, i) => i), distance: 0 }

  // Keep first and last fixed, optimize middle stops
  const first = 0
  const last = stops.length - 1
  const middleIndices = stops.slice(1, -1).map((_, i) => i + 1)

  // Nearest neighbor from start
  const visited: number[] = [first]
  const remaining = new Set(middleIndices)

  let current = first
  while (remaining.size > 0) {
    let nearest = -1
    let nearestDist = Infinity
    for (const idx of remaining) {
      const d = haversine(stops[current][0], stops[current][1], stops[idx][0], stops[idx][1])
      if (d < nearestDist) {
        nearestDist = d
        nearest = idx
      }
    }
    visited.push(nearest)
    remaining.delete(nearest)
    current = nearest
  }
  visited.push(last)

  // Calculate total distance
  let totalDist = 0
  for (let i = 0; i < visited.length - 1; i++) {
    totalDist += haversine(
      stops[visited[i]][0], stops[visited[i]][1],
      stops[visited[i + 1]][0], stops[visited[i + 1]][1]
    )
  }

  return { order: visited, distance: Math.round(totalDist * 10) / 10 }
}

// --- Geocoding ---

let geocodeAbortController: AbortController | null = null

export async function geocodeSearch(query: string): Promise<GeocodeSuggestion[]> {
  if (geocodeAbortController) geocodeAbortController.abort()
  geocodeAbortController = new AbortController()

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=us&addressdetails=1`,
      {
        signal: geocodeAbortController.signal,
        headers: { 'Accept-Language': 'en' }
      }
    )
    const data = await response.json()
    return data.map((item: any) => ({
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      type: item.type,
      importance: item.importance,
    }))
  } catch (e: any) {
    if (e.name === 'AbortError') return []
    console.error('Geocode error:', e)
    return []
  }
}

export const PRESETS = [
  {
    name: 'LA to Phoenix',
    tag: 'Wildfire Corridor',
    from_lat: 34.0522, from_lng: -118.2437,
    to_lat: 33.4484, to_lng: -112.0740,
    from_label: 'Los Angeles, CA',
    to_label: 'Phoenix, AZ',
  },
  {
    name: 'Miami to Atlanta',
    tag: 'Hurricane Belt',
    from_lat: 25.7617, from_lng: -80.1918,
    to_lat: 33.7490, to_lng: -84.3880,
    from_label: 'Miami, FL',
    to_label: 'Atlanta, GA',
  },
  {
    name: 'Houston to Dallas',
    tag: 'Heat + Tornado + Flood',
    from_lat: 29.7604, from_lng: -95.3698,
    to_lat: 32.7767, to_lng: -96.7970,
    from_label: 'Houston, TX',
    to_label: 'Dallas, TX',
  },
  {
    name: 'SF to Portland',
    tag: 'Pacific Wildfire',
    from_lat: 37.7749, from_lng: -122.4194,
    to_lat: 45.5152, to_lng: -122.6784,
    from_label: 'San Francisco, CA',
    to_label: 'Portland, OR',
  },
  {
    name: 'NYC to DC',
    tag: 'Coastal + Eco Corridor',
    from_lat: 40.7128, from_lng: -74.0060,
    to_lat: 38.9072, to_lng: -77.0369,
    from_label: 'New York, NY',
    to_label: 'Washington, DC',
  },
  {
    name: 'OKC to Memphis',
    tag: 'Tornado Alley',
    from_lat: 35.4676, from_lng: -97.5164,
    to_lat: 35.1495, to_lng: -90.0490,
    from_label: 'Oklahoma City, OK',
    to_label: 'Memphis, TN',
  },
  {
    name: 'Denver to Minneapolis',
    tag: 'Winter + Tornado',
    from_lat: 39.7392, from_lng: -104.9903,
    to_lat: 44.9778, to_lng: -93.2650,
    from_label: 'Denver, CO',
    to_label: 'Minneapolis, MN',
  },
]

export const ROAD_TRIP_PRESETS = [
  {
    name: 'West Coast Highway',
    tag: 'Fire + Coastal',
    stops: [
      { lat: 32.7157, lng: -117.1611, label: 'San Diego, CA' },
      { lat: 34.0522, lng: -118.2437, label: 'Los Angeles, CA' },
      { lat: 36.7783, lng: -119.4179, label: 'Fresno, CA' },
      { lat: 37.7749, lng: -122.4194, label: 'San Francisco, CA' },
      { lat: 45.5152, lng: -122.6784, label: 'Portland, OR' },
    ]
  },
  {
    name: 'Southern Cross-Country',
    tag: 'Heat + Hurricane',
    stops: [
      { lat: 34.0522, lng: -118.2437, label: 'Los Angeles, CA' },
      { lat: 33.4484, lng: -112.0740, label: 'Phoenix, AZ' },
      { lat: 32.2226, lng: -110.9747, label: 'Tucson, AZ' },
      { lat: 29.7604, lng: -95.3698, label: 'Houston, TX' },
      { lat: 29.9511, lng: -90.0715, label: 'New Orleans, LA' },
      { lat: 25.7617, lng: -80.1918, label: 'Miami, FL' },
    ]
  },
  {
    name: 'Eastern Seaboard',
    tag: 'Flood + Storm Surge',
    stops: [
      { lat: 42.3601, lng: -71.0589, label: 'Boston, MA' },
      { lat: 40.7128, lng: -74.0060, label: 'New York, NY' },
      { lat: 39.9526, lng: -75.1652, label: 'Philadelphia, PA' },
      { lat: 38.9072, lng: -77.0369, label: 'Washington, DC' },
      { lat: 33.7490, lng: -84.3880, label: 'Atlanta, GA' },
      { lat: 25.7617, lng: -80.1918, label: 'Miami, FL' },
    ]
  },
]
