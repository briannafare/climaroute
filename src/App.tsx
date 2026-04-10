import { useState, useCallback } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMapEvents, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import axios from 'axios'
import { Flame, Droplets, Thermometer, MapPin, Navigation, Shield, AlertTriangle, ChevronDown, Loader2, Mountain, Waves, RotateCcw, Zap } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

interface RiskData {
  overall_risk: number
  flood_risk: number
  wildfire_risk: number
  heat_risk: number
  coastal_exposure: number
  elevation_ft: number
  risk_level: string
}

interface RouteData {
  coordinates: number[][]
  risks: RiskData[]
  total_risk: number
  distance_mi: number
}

interface RouteResult {
  standard: RouteData
  climate_safe?: RouteData
  risk_reduction_pct?: number
}

interface Preset {
  name: string
  from_lat: number
  from_lng: number
  to_lat: number
  to_lng: number
  description: string
}

function getRiskColor(risk: number): string {
  if (risk < 20) return '#22c55e'
  if (risk < 40) return '#84cc16'
  if (risk < 60) return '#eab308'
  if (risk < 80) return '#f97316'
  return '#ef4444'
}

function getRiskBg(risk: number): string {
  if (risk < 20) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (risk < 40) return 'bg-lime-500/10 text-lime-400 border-lime-500/20'
  if (risk < 60) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
  if (risk < 80) return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  return 'bg-red-500/10 text-red-400 border-red-500/20'
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    }
  })
  return null
}

function FitBounds({ route }: { route: RouteResult | null }) {
  const map = useMap()
  if (route) {
    const allCoords = [
      ...route.standard.coordinates,
      ...(route.climate_safe?.coordinates || [])
    ]
    if (allCoords.length > 0) {
      const bounds = L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }
  return null
}

function RiskMeter({ label, value, icon: Icon, color }: { label: string, value: number, icon: any, color: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon size={16} className={color} />
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
          <span className="text-sm font-mono font-semibold text-zinc-200">{value.toFixed(1)}</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${value}%`, backgroundColor: getRiskColor(value) }}
          />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [origin, setOrigin] = useState<[number, number] | null>(null)
  const [destination, setDestination] = useState<[number, number] | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [pointRisk, setPointRisk] = useState<RiskData | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectMode, setSelectMode] = useState<'origin' | 'destination'>('origin')
  const [showPresets, setShowPresets] = useState(false)
  const [presets] = useState<Preset[]>([
    { name: "LA to Phoenix", from_lat: 34.0522, from_lng: -118.2437, to_lat: 33.4484, to_lng: -112.0740, description: "Wildfire corridor" },
    { name: "Miami to Atlanta", from_lat: 25.7617, from_lng: -80.1918, to_lat: 33.7490, to_lng: -84.3880, description: "Hurricane belt" },
    { name: "Houston to Dallas", from_lat: 29.7604, from_lng: -95.3698, to_lat: 32.7767, to_lng: -96.7970, description: "Heat + flood zone" },
    { name: "SF to Portland", from_lat: 37.7749, from_lng: -122.4194, to_lat: 45.5152, to_lng: -122.6784, description: "Pacific wildfire" },
    { name: "NYC to DC", from_lat: 40.7128, from_lng: -74.0060, to_lat: 38.9072, to_lng: -77.0369, description: "Coastal flooding" },
  ])

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    if (selectMode === 'origin') {
      setOrigin([lat, lng])
      setSelectMode('destination')
      setRoute(null)
    } else {
      setDestination([lat, lng])
      setSelectMode('origin')
    }

    // Also get risk for the clicked point
    try {
      const res = await axios.get(`${API_BASE}/api/risk`, { params: { lat, lng } })
      setPointRisk(res.data)
    } catch (e) {
      console.error('Risk fetch failed', e)
    }
  }, [selectMode])

  const calculateRoute = useCallback(async () => {
    if (!origin || !destination) return
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/route`, {
        params: {
          from_lat: origin[0], from_lng: origin[1],
          to_lat: destination[0], to_lng: destination[1],
          mode: 'climate-safe'
        }
      })
      setRoute(res.data)
    } catch (e) {
      console.error('Route fetch failed', e)
    }
    setLoading(false)
  }, [origin, destination])

  const loadPreset = useCallback(async (preset: Preset) => {
    setOrigin([preset.from_lat, preset.from_lng])
    setDestination([preset.to_lat, preset.to_lng])
    setShowPresets(false)
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/api/route`, {
        params: {
          from_lat: preset.from_lat, from_lng: preset.from_lng,
          to_lat: preset.to_lat, to_lng: preset.to_lng,
          mode: 'climate-safe'
        }
      })
      setRoute(res.data)
    } catch (e) {
      console.error('Route fetch failed', e)
    }
    setLoading(false)
  }, [])

  const reset = () => {
    setOrigin(null)
    setDestination(null)
    setRoute(null)
    setPointRisk(null)
    setSelectMode('origin')
  }

  return (
    <div className="h-screen w-screen flex bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Sidebar */}
      <div className="w-[380px] flex-shrink-0 flex flex-col border-r border-zinc-800/80 bg-zinc-950 z-10">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Shield size={18} className="text-emerald-400" />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">ClimaRoute</h1>
          </div>
          <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">AI-powered climate risk routing engine. Navigate around flood zones, wildfire corridors, and heat anomalies.</p>
        </div>

        {/* Route Selection */}
        <div className="p-5 border-b border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Route</span>
            <button onClick={reset} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors">
              <RotateCcw size={12} /> Reset
            </button>
          </div>
          
          <div className="space-y-2">
            <button
              onClick={() => { setSelectMode('origin'); setRoute(null) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                selectMode === 'origin' 
                  ? 'border-emerald-500/40 bg-emerald-500/5' 
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
              <span className="text-sm">
                {origin ? `${origin[0].toFixed(4)}, ${origin[1].toFixed(4)}` : 'Click map to set origin'}
              </span>
            </button>
            <button
              onClick={() => { setSelectMode('destination'); setRoute(null) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                selectMode === 'destination' 
                  ? 'border-red-500/40 bg-red-500/5' 
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
              }`}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-500/20" />
              <span className="text-sm">
                {destination ? `${destination[0].toFixed(4)}, ${destination[1].toFixed(4)}` : 'Click map to set destination'}
              </span>
            </button>
          </div>

          <button
            onClick={calculateRoute}
            disabled={!origin || !destination || loading}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={16} />}
            {loading ? 'Calculating...' : 'Calculate Climate-Safe Route'}
          </button>

          {/* Preset Routes */}
          <div className="relative">
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 text-xs text-zinc-400 transition-colors"
            >
              <span className="flex items-center gap-2"><Zap size={12} /> Demo Routes</span>
              <ChevronDown size={14} className={`transition-transform ${showPresets ? 'rotate-180' : ''}`} />
            </button>
            {showPresets && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-xl z-50">
                {presets.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => loadPreset(p)}
                    className="w-full px-3 py-2.5 text-left hover:bg-zinc-800/80 transition-colors border-b border-zinc-800/50 last:border-0"
                  >
                    <div className="text-sm text-zinc-200">{p.name}</div>
                    <div className="text-xs text-zinc-500">{p.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {route && (
            <>
              {/* Risk Reduction Banner */}
              {route.climate_safe && route.risk_reduction_pct && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={16} className="text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-400">Climate-Safe Route Found</span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-300 font-mono">
                    {route.risk_reduction_pct.toFixed(1)}% <span className="text-sm font-normal text-emerald-400/70">risk reduction</span>
                  </div>
                </div>
              )}

              {/* Route Comparison */}
              <div className="grid grid-cols-2 gap-3">
                {/* Standard Route */}
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-0.5 bg-red-500 rounded" />
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Standard</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-lg font-bold font-mono" style={{ color: getRiskColor(route.standard.total_risk) }}>
                        {route.standard.total_risk}
                      </div>
                      <div className="text-[10px] text-zinc-500 uppercase">Avg Risk</div>
                    </div>
                    <div>
                      <div className="text-sm font-mono text-zinc-300">{route.standard.distance_mi} mi</div>
                      <div className="text-[10px] text-zinc-500 uppercase">Distance</div>
                    </div>
                  </div>
                </div>

                {/* Climate-Safe Route */}
                {route.climate_safe && (
                  <div className="bg-zinc-900/80 border border-emerald-500/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-3 h-0.5 bg-emerald-500 rounded" />
                      <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Climate-Safe</span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="text-lg font-bold font-mono" style={{ color: getRiskColor(route.climate_safe.total_risk) }}>
                          {route.climate_safe.total_risk}
                        </div>
                        <div className="text-[10px] text-zinc-500 uppercase">Avg Risk</div>
                      </div>
                      <div>
                        <div className="text-sm font-mono text-zinc-300">{route.climate_safe.distance_mi} mi</div>
                        <div className="text-[10px] text-zinc-500 uppercase">Distance</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Risk Breakdown for Climate-Safe Route */}
              {route.climate_safe && route.climate_safe.risks.length > 0 && (() => {
                const avgRisks = {
                  flood: route.climate_safe.risks.reduce((s, r) => s + r.flood_risk, 0) / route.climate_safe.risks.length,
                  wildfire: route.climate_safe.risks.reduce((s, r) => s + r.wildfire_risk, 0) / route.climate_safe.risks.length,
                  heat: route.climate_safe.risks.reduce((s, r) => s + r.heat_risk, 0) / route.climate_safe.risks.length,
                  coastal: route.climate_safe.risks.reduce((s, r) => s + r.coastal_exposure, 0) / route.climate_safe.risks.length,
                }
                return (
                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4">
                    <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Route Risk Breakdown</h3>
                    <RiskMeter label="Flood Risk" value={avgRisks.flood} icon={Droplets} color="text-blue-400" />
                    <RiskMeter label="Wildfire Risk" value={avgRisks.wildfire} icon={Flame} color="text-orange-400" />
                    <RiskMeter label="Heat Anomaly" value={avgRisks.heat} icon={Thermometer} color="text-red-400" />
                    <RiskMeter label="Coastal Exposure" value={avgRisks.coastal} icon={Waves} color="text-cyan-400" />
                  </div>
                )
              })()}
            </>
          )}

          {/* Point Risk (when clicking without a route) */}
          {!route && pointRisk && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Point Risk Analysis</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getRiskBg(pointRisk.overall_risk)}`}>
                  {pointRisk.risk_level}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono mb-4" style={{ color: getRiskColor(pointRisk.overall_risk) }}>
                {pointRisk.overall_risk}
                <span className="text-sm text-zinc-500 ml-1">/100</span>
              </div>
              <RiskMeter label="Flood Risk" value={pointRisk.flood_risk} icon={Droplets} color="text-blue-400" />
              <RiskMeter label="Wildfire Risk" value={pointRisk.wildfire_risk} icon={Flame} color="text-orange-400" />
              <RiskMeter label="Heat Anomaly" value={pointRisk.heat_risk} icon={Thermometer} color="text-red-400" />
              <RiskMeter label="Coastal Exposure" value={pointRisk.coastal_exposure} icon={Waves} color="text-cyan-400" />
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-800">
                <Mountain size={14} className="text-zinc-500" />
                <span className="text-xs text-zinc-500">Elevation: {pointRisk.elevation_ft.toLocaleString()} ft</span>
              </div>
            </div>
          )}

          {!route && !pointRisk && (
            <div className="text-center py-8">
              <MapPin size={24} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Click the map to analyze climate risk at any point, or use demo routes above.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-zinc-600" />
            <span className="text-[10px] text-zinc-600">Risk scores are ML-modeled estimates for demonstration. Not for emergency use.</span>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[39.0, -98.0]}
          zoom={5}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapClickHandler onMapClick={handleMapClick} />
          {route && <FitBounds route={route} />}

          {/* Origin marker */}
          {origin && (
            <CircleMarker
              center={origin}
              radius={8}
              pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.9, weight: 2 }}
            >
              <Popup>
                <span style={{ color: '#000' }}>Origin: {origin[0].toFixed(4)}, {origin[1].toFixed(4)}</span>
              </Popup>
            </CircleMarker>
          )}

          {/* Destination marker */}
          {destination && (
            <CircleMarker
              center={destination}
              radius={8}
              pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.9, weight: 2 }}
            >
              <Popup>
                <span style={{ color: '#000' }}>Destination: {destination[0].toFixed(4)}, {destination[1].toFixed(4)}</span>
              </Popup>
            </CircleMarker>
          )}

          {/* Standard route (red) */}
          {route && (
            <Polyline
              positions={route.standard.coordinates.map(c => [c[0], c[1]] as [number, number])}
              pathOptions={{ color: '#ef4444', weight: 4, opacity: 0.7, dashArray: '10, 8' }}
            />
          )}

          {/* Climate-safe route (green) */}
          {route?.climate_safe && (
            <Polyline
              positions={route.climate_safe.coordinates.map(c => [c[0], c[1]] as [number, number])}
              pathOptions={{ color: '#22c55e', weight: 5, opacity: 0.9 }}
            />
          )}

          {/* Risk markers along routes */}
          {route?.climate_safe?.coordinates.map((coord, i) => {
            const risk = route.climate_safe!.risks[i]
            if (!risk || i % 3 !== 0) return null // Show every 3rd point
            return (
              <CircleMarker
                key={`risk-${i}`}
                center={[coord[0], coord[1]]}
                radius={5}
                pathOptions={{
                  color: getRiskColor(risk.overall_risk),
                  fillColor: getRiskColor(risk.overall_risk),
                  fillOpacity: 0.6,
                  weight: 1
                }}
              >
                <Popup>
                  <div style={{ color: '#000', fontSize: '12px' }}>
                    <strong>Risk Score: {risk.overall_risk}</strong><br/>
                    Flood: {risk.flood_risk} | Fire: {risk.wildfire_risk}<br/>
                    Heat: {risk.heat_risk} | Coastal: {risk.coastal_exposure}
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>

        {/* Map Legend */}
        <div className="absolute bottom-6 right-6 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-lg px-4 py-3 z-[1000]">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2 font-medium">Risk Level</div>
          <div className="flex gap-3">
            {[
              { label: 'Low', color: '#22c55e' },
              { label: 'Mod', color: '#84cc16' },
              { label: 'Elev', color: '#eab308' },
              { label: 'High', color: '#f97316' },
              { label: 'Severe', color: '#ef4444' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-zinc-400">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2 pt-2 border-t border-zinc-800">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-red-500 rounded" style={{ borderBottom: '2px dashed #ef4444' }} />
              <span className="text-[10px] text-zinc-400">Standard</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 bg-emerald-500 rounded" />
              <span className="text-[10px] text-zinc-400">Climate-Safe</span>
            </div>
          </div>
        </div>

        {/* Selection hint */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800 rounded-full px-4 py-2 z-[1000]">
          <span className="text-xs text-zinc-400">
            {selectMode === 'origin' 
              ? 'Click map to set origin point' 
              : 'Click map to set destination point'}
          </span>
        </div>
      </div>
    </div>
  )
}
