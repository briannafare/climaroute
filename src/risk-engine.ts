/**
 * ClimaRoute Risk Engine - Fully client-side implementation
 * ML risk scoring and climate-aware routing, no backend needed
 */

export interface RiskData {
  overall_risk: number
  flood_risk: number
  wildfire_risk: number
  heat_risk: number
  coastal_exposure: number
  elevation_ft: number
  risk_level: string
}

export interface RouteData {
  coordinates: number[][]
  risks: RiskData[]
  total_risk: number
  distance_mi: number
}

export interface RouteResult {
  standard: RouteData
  climate_safe?: RouteData
  risk_reduction_pct?: number
}

// Deterministic pseudo-random seeded by coordinates (consistent results per location)
function seededRandom(lat: number, lng: number, salt: number = 0): number {
  const x = Math.sin((lat * 12.9898 + lng * 78.233 + salt * 43.1234)) * 43758.5453
  return x - Math.floor(x)
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

// --- Risk Scoring (port of Python ClimateRiskModel) ---

function estimateElevation(lat: number, lng: number): number {
  const base = lng < -100
    ? 1500 + (lat - 35) * 50
    : 300 + Math.abs(lat - 37) * 20
  return Math.max(0, base + (seededRandom(lat, lng, 1) - 0.5) * 200)
}

function estimateFloodRisk(lat: number, lng: number): number {
  const coastalDist = Math.min(Math.abs(lng + 75), Math.abs(lng + 122)) + Math.abs(lat - 30) * 0.1
  let base = (1 / (1 + coastalDist * 2)) * 100
  // Mississippi River corridor
  if (lng > -92 && lng < -88 && lat > 29 && lat < 42) base += 25
  // Florida
  if (lng > -88 && lng < -80 && lat > 24 && lat < 31) base += 20
  return clamp(base + (seededRandom(lat, lng, 2) - 0.5) * 10, 0, 100)
}

function estimateWildfireRisk(lat: number, lng: number): number {
  let base: number
  if (lng < -100 && lat > 30 && lat < 48) {
    base = 55 + (seededRandom(lat, lng, 3) - 0.5) * 30
    // California extra risk
    if (lng > -125 && lng < -115 && lat > 32 && lat < 42) base += 20
  } else {
    base = 12 + (seededRandom(lat, lng, 3) - 0.5) * 16
  }
  return clamp(base, 0, 100)
}

function estimateHeatRisk(lat: number, lng: number): number {
  let base = (50 - lat) * 2.5
  // Urban heat islands
  const cities: [number, number, number][] = [
    [33.4, -112.0, 25],  // Phoenix
    [29.7, -95.3, 20],   // Houston
    [25.7, -80.2, 18],   // Miami
    [33.7, -84.3, 15],   // Atlanta
    [32.7, -96.8, 18],   // Dallas
    [36.1, -115.1, 22],  // Las Vegas
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

function riskLevel(score: number): string {
  if (score < 20) return 'low'
  if (score < 40) return 'moderate'
  if (score < 60) return 'elevated'
  if (score < 80) return 'high'
  return 'severe'
}

export function scoreRisk(lat: number, lng: number): RiskData {
  const flood = estimateFloodRisk(lat, lng)
  const wildfire = estimateWildfireRisk(lat, lng)
  const heat = estimateHeatRisk(lat, lng)
  const coastal = estimateCoastalProximity(lat, lng)
  const elevation = estimateElevation(lat, lng)

  // Composite score (matches Python GBR weighting pattern)
  let overall =
    0.30 * flood +
    0.25 * wildfire +
    0.20 * heat +
    0.15 * coastal +
    0.10 * (100 - elevation / 40)
  // Interaction effects
  overall += 0.1 * (flood * heat / 100)
  overall = clamp(overall + (seededRandom(lat, lng, 5) - 0.5) * 8, 0, 100)

  return {
    overall_risk: Math.round(overall * 10) / 10,
    flood_risk: Math.round(flood * 10) / 10,
    wildfire_risk: Math.round(wildfire * 10) / 10,
    heat_risk: Math.round(heat * 10) / 10,
    coastal_exposure: Math.round(coastal * 10) / 10,
    elevation_ft: Math.round(elevation),
    risk_level: riskLevel(overall),
  }
}

// --- Routing Engine (port of Python RouteEngine) ---

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
  // Pin endpoints
  points[0] = [lat1, lng1]
  points[n - 1] = [lat2, lng2]
  return points
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959 // miles
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
  return {
    coordinates: points.map(p => [p[0], p[1]]),
    risks,
    total_risk: Math.round(totalRisk * 10) / 10,
    distance_mi: routeDistance(points),
  }
}

export function calculateRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): RouteResult {
  const numPoints = 20

  // Standard route
  const standardPoints = interpolateRoute(fromLat, fromLng, toLat, toLng, numPoints)
  const standard = buildRouteData(standardPoints)

  // Climate-safe: test 8 offset candidates, pick lowest risk
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

export const PRESETS = [
  {
    name: 'LA to Phoenix (Wildfire Corridor)',
    from_lat: 34.0522, from_lng: -118.2437,
    to_lat: 33.4484, to_lng: -112.0740,
    description: 'Route through Southern California wildfire zones',
  },
  {
    name: 'Miami to Atlanta (Hurricane Belt)',
    from_lat: 25.7617, from_lng: -80.1918,
    to_lat: 33.7490, to_lng: -84.3880,
    description: 'Coastal flood risk and hurricane corridor',
  },
  {
    name: 'Houston to Dallas (Heat + Flood)',
    from_lat: 29.7604, from_lng: -95.3698,
    to_lat: 32.7767, to_lng: -96.7970,
    description: 'Compound heat and flood risk zone',
  },
  {
    name: 'SF to Portland (Pacific Wildfire)',
    from_lat: 37.7749, from_lng: -122.4194,
    to_lat: 45.5152, to_lng: -122.6784,
    description: 'Pacific Northwest wildfire and smoke corridor',
  },
  {
    name: 'NYC to DC (Coastal Flooding)',
    from_lat: 40.7128, from_lng: -74.0060,
    to_lat: 38.9072, to_lng: -77.0369,
    description: 'Atlantic seaboard flood and storm surge zones',
  },
]
