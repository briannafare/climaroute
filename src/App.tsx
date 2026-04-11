import { useState, useCallback, useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMapEvents, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import { motion, AnimatePresence } from 'framer-motion'
import {
  scoreRisk, calculateRoute, calculateMultiStopRoute, optimizeStopOrder,
  geocodeSearch,
  PRESETS, ROAD_TRIP_PRESETS,
  type RiskData, type RouteResult, type MultiStopResult, type GeocodeSuggestion
} from './risk-engine'
import {
  Flame, Droplets, Thermometer, MapPin, Navigation, Shield, AlertTriangle,
  Loader2, Mountain, Waves, RotateCcw, Zap, Plus, Trash2,
  Route as RouteIcon, MapPinned, Clock, Gauge, ChevronRight, X, ArrowRight, Sparkles, Info
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './App.css'

// Fix leaflet markers
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function createStopIcon(index: number, color: string) {
  return L.divIcon({
    className: 'custom-stop-marker',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${color}; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: white;
      font-family: 'Inter', sans-serif;
    ">${index + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function getRiskColor(risk: number): string {
  if (risk < 20) return '#34d399'
  if (risk < 40) return '#a3e635'
  if (risk < 60) return '#fbbf24'
  if (risk < 80) return '#fb923c'
  return '#f87171'
}

function getRiskLabel(risk: number): string {
  if (risk < 20) return 'Low'
  if (risk < 40) return 'Moderate'
  if (risk < 60) return 'Elevated'
  if (risk < 80) return 'High'
  return 'Severe'
}

// --- Components ---

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng) } })
  return null
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 })
  }, [bounds, map])
  return null
}

function AddressInput({
  value, placeholder, onSelect, onClear, color, index
}: {
  value: string, placeholder: string,
  onSelect: (lat: number, lng: number, name: string) => void,
  onClear: () => void, color: string, index?: number
}) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  const doSearch = useCallback((q: string) => {
    if (q.length < 3) { setSuggestions([]); return }
    setSearching(true)
    geocodeSearch(q).then(results => {
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
      setSearching(false)
    })
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(v), 350)
  }

  const selectSuggestion = (s: GeocodeSuggestion) => {
    const shortName = s.display_name.split(',').slice(0, 3).join(',').trim()
    setQuery(shortName)
    setShowSuggestions(false)
    onSelect(s.lat, s.lon, shortName)
  }

  return (
    <div className="relative group">
      <div className="flex items-center gap-2.5">
        <div className="flex-shrink-0 flex items-center justify-center">
          {index !== undefined ? (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: color }}>
              {index + 1}
            </div>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full ring-[3px]" style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }} />
          )}
        </div>
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            value={query}
            onChange={handleInput}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={placeholder}
            className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/[0.06] focus:border-emerald-500/40 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all duration-200"
          />
          {searching && <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-zinc-500" />}
          {query && !searching && (
            <button onClick={() => { setQuery(''); setSuggestions([]); onClear() }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-8 right-0 top-full mt-1 bg-zinc-900 border border-white/[0.08] rounded-lg overflow-hidden shadow-2xl z-50 backdrop-blur-xl"
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={() => selectSuggestion(s)}
                className="w-full px-3 py-2.5 text-left hover:bg-white/[0.06] transition-colors flex items-start gap-2.5"
              >
                <MapPin size={14} className="text-zinc-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-zinc-300 leading-relaxed line-clamp-2">{s.display_name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RiskMeter({ label, value, icon: Icon, color }: { label: string, value: number, icon: any, color: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon size={14} className={color} />
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
          <span className="text-xs font-mono font-semibold text-zinc-300">{value.toFixed(1)}</span>
        </div>
        <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full"
            style={{ backgroundColor: getRiskColor(value) }}
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon: Icon }: { label: string, value: string | number, unit?: string, icon: any }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.04] rounded-xl p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} className="text-zinc-500" />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold font-mono text-zinc-100 tabular-nums">{value}</span>
        {unit && <span className="text-[10px] text-zinc-500">{unit}</span>}
      </div>
    </div>
  )
}

// --- MAIN APP ---

type AppMode = 'route' | 'trip' | 'explore'

interface Stop {
  lat: number
  lng: number
  label: string
}

export default function App() {
  const [mode, setMode] = useState<AppMode>('route')
  const [origin, setOrigin] = useState<Stop | null>(null)
  const [destination, setDestination] = useState<Stop | null>(null)
  const [tripStops, setTripStops] = useState<Stop[]>([])
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [multiStop, setMultiStop] = useState<MultiStopResult | null>(null)
  const [pointRisk, setPointRisk] = useState<RiskData | null>(null)
  const [clickedPoint, setClickedPoint] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(false)
  const [mapBounds, setMapBounds] = useState<L.LatLngBoundsExpression | null>(null)
  const [showPanel, setShowPanel] = useState(true)
  const [optimizing, setOptimizing] = useState(false)

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (mode === 'explore') {
      setPointRisk(scoreRisk(lat, lng))
      setClickedPoint([lat, lng])
    } else if (mode === 'route') {
      if (!origin) {
        setOrigin({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
      } else if (!destination) {
        setDestination({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
      }
    } else if (mode === 'trip') {
      setTripStops(prev => [...prev, { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }])
    }
  }, [mode, origin, destination])

  const doCalculateRoute = useCallback(() => {
    if (!origin || !destination) return
    setLoading(true)
    requestAnimationFrame(() => {
      const result = calculateRoute(origin.lat, origin.lng, destination.lat, destination.lng)
      setRoute(result)
      setLoading(false)
      const allCoords = [
        ...result.standard.coordinates,
        ...(result.climate_safe?.coordinates || [])
      ]
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [origin, destination])

  const doCalculateTrip = useCallback(() => {
    if (tripStops.length < 2) return
    setLoading(true)
    requestAnimationFrame(() => {
      const result = calculateMultiStopRoute(tripStops.map(s => [s.lat, s.lng] as [number, number]))
      setMultiStop(result)
      setLoading(false)
      const allCoords = result.legs.flatMap(l =>
        (l.climate_safe?.coordinates || l.standard.coordinates)
      )
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [tripStops])

  const doOptimize = useCallback(() => {
    if (tripStops.length < 3) return
    setOptimizing(true)
    requestAnimationFrame(() => {
      const { order } = optimizeStopOrder(tripStops.map(s => [s.lat, s.lng] as [number, number]))
      const reordered = order.map(i => tripStops[i])
      setTripStops(reordered)
      setOptimizing(false)
    })
  }, [tripStops])

  const loadPreset = useCallback((preset: typeof PRESETS[0]) => {
    setOrigin({ lat: preset.from_lat, lng: preset.from_lng, label: preset.from_label })
    setDestination({ lat: preset.to_lat, lng: preset.to_lng, label: preset.to_label })
    setLoading(true)
    requestAnimationFrame(() => {
      const result = calculateRoute(preset.from_lat, preset.from_lng, preset.to_lat, preset.to_lng)
      setRoute(result)
      setLoading(false)
      const allCoords = [
        ...result.standard.coordinates,
        ...(result.climate_safe?.coordinates || [])
      ]
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [])

  const loadTripPreset = useCallback((preset: typeof ROAD_TRIP_PRESETS[0]) => {
    const stops = preset.stops.map(s => ({ lat: s.lat, lng: s.lng, label: s.label }))
    setTripStops(stops)
    setMode('trip')
    setLoading(true)
    requestAnimationFrame(() => {
      const result = calculateMultiStopRoute(stops.map(s => [s.lat, s.lng] as [number, number]))
      setMultiStop(result)
      setLoading(false)
      const allCoords = result.legs.flatMap(l => (l.climate_safe?.coordinates || l.standard.coordinates))
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [])

  const reset = () => {
    setOrigin(null)
    setDestination(null)
    setTripStops([])
    setRoute(null)
    setMultiStop(null)
    setPointRisk(null)
    setClickedPoint(null)
    setMapBounds(null)
  }

  const removeStop = (idx: number) => {
    setTripStops(prev => prev.filter((_, i) => i !== idx))
    setMultiStop(null)
  }

  const routeColors = ['#34d399', '#60a5fa', '#c084fc', '#fb923c', '#f87171', '#facc15', '#2dd4bf', '#e879f9']

  return (
    <div className="h-screen w-screen flex text-zinc-100 overflow-hidden" style={{ background: 'var(--surface-base)' }}>
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {showPanel && (
          <motion.div
            initial={{ x: -380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -380, opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-[380px] flex-shrink-0 flex flex-col glass-sidebar z-20 relative"
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Shield size={16} className="text-white" />
                  </div>
                  <div>
                    <h1 className="text-[15px] font-semibold tracking-tight">ClimaRoute</h1>
                    <p className="text-[10px] text-zinc-500 font-medium">AI Climate Risk Router</p>
                  </div>
                </div>
                <button onClick={reset} className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors px-2 py-1 rounded-md hover:bg-white/[0.04]">
                  <RotateCcw size={11} /> Reset
                </button>
              </div>

              {/* Mode Tabs */}
              <div className="flex bg-white/[0.03] rounded-lg p-0.5 gap-0.5">
                {([
                  { id: 'route' as AppMode, label: 'Route', icon: Navigation },
                  { id: 'trip' as AppMode, label: 'Road Trip', icon: RouteIcon },
                  { id: 'explore' as AppMode, label: 'Explore', icon: MapPinned },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setMode(tab.id); reset() }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all duration-200 ${
                      mode === tab.id
                        ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                    }`}
                  >
                    <tab.icon size={13} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4 custom-scrollbar">
              {/* === ROUTE MODE === */}
              {mode === 'route' && (
                <>
                  <div className="space-y-2.5">
                    <AddressInput
                      value={origin?.label || ''}
                      placeholder="Search origin address..."
                      color="#34d399"
                      onSelect={(lat, lng, name) => { setOrigin({ lat, lng, label: name }); setRoute(null) }}
                      onClear={() => { setOrigin(null); setRoute(null) }}
                    />
                    <div className="flex justify-center">
                      <div className="w-[1px] h-3 bg-white/[0.06]" />
                    </div>
                    <AddressInput
                      value={destination?.label || ''}
                      placeholder="Search destination address..."
                      color="#f87171"
                      onSelect={(lat, lng, name) => { setDestination({ lat, lng, label: name }); setRoute(null) }}
                      onClear={() => { setDestination(null); setRoute(null) }}
                    />
                  </div>

                  <button
                    onClick={doCalculateRoute}
                    disabled={!origin || !destination || loading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 disabled:shadow-none"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={15} />}
                    {loading ? 'Analyzing route...' : 'Find Climate-Safe Route'}
                  </button>

                  {/* Demo Routes */}
                  {!route && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap size={11} className="text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Demo Routes</span>
                      </div>
                      <div className="grid grid-cols-1 gap-1.5">
                        {PRESETS.map((p, i) => (
                          <button
                            key={i}
                            onClick={() => loadPreset(p)}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all text-left group"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-xs text-zinc-300 font-medium">{p.name}</div>
                              <div className="text-[10px] text-zinc-600">{p.from_label} to {p.to_label}</div>
                            </div>
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-500 font-medium flex-shrink-0 ml-2">{p.tag}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Route Results */}
                  <AnimatePresence>
                    {route && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-3"
                      >
                        {route.climate_safe && route.risk_reduction_pct !== undefined && route.risk_reduction_pct > 0 && (
                          <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
                            <div className="relative">
                              <div className="flex items-center gap-2 mb-2">
                                <Shield size={14} className="text-emerald-400" />
                                <span className="text-xs font-medium text-emerald-400">Climate-Safe Route Found</span>
                              </div>
                              <div className="text-3xl font-bold font-mono tracking-tight gradient-text-safe tabular-nums">
                                {route.risk_reduction_pct.toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-emerald-400/60 mt-0.5">risk reduction vs standard route</div>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <StatCard
                            label="Safe Distance"
                            value={route.climate_safe?.distance_mi || route.standard.distance_mi}
                            unit="mi"
                            icon={RouteIcon}
                          />
                          <StatCard
                            label="Est. Time"
                            value={route.climate_safe?.estimated_time_hrs || route.standard.estimated_time_hrs}
                            unit="hrs"
                            icon={Clock}
                          />
                          <StatCard
                            label="Avg Risk"
                            value={route.climate_safe?.total_risk || route.standard.total_risk}
                            unit="/100"
                            icon={Gauge}
                          />
                          <StatCard
                            label="Std Risk"
                            value={route.standard.total_risk}
                            unit="/100"
                            icon={AlertTriangle}
                          />
                        </div>

                        {route.climate_safe && route.climate_safe.risks.length > 0 && (() => {
                          const r = route.climate_safe.risks
                          const avg = {
                            flood: r.reduce((s, x) => s + x.flood_risk, 0) / r.length,
                            wildfire: r.reduce((s, x) => s + x.wildfire_risk, 0) / r.length,
                            heat: r.reduce((s, x) => s + x.heat_risk, 0) / r.length,
                            coastal: r.reduce((s, x) => s + x.coastal_exposure, 0) / r.length,
                          }
                          return (
                            <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 space-y-1">
                              <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium mb-2">Risk Breakdown</h3>
                              <RiskMeter label="Flood Risk" value={avg.flood} icon={Droplets} color="text-blue-400" />
                              <RiskMeter label="Wildfire Risk" value={avg.wildfire} icon={Flame} color="text-orange-400" />
                              <RiskMeter label="Heat Anomaly" value={avg.heat} icon={Thermometer} color="text-red-400" />
                              <RiskMeter label="Coastal Exposure" value={avg.coastal} icon={Waves} color="text-cyan-400" />
                            </div>
                          )
                        })()}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              {/* === TRIP MODE === */}
              {mode === 'trip' && (
                <>
                  <div className="space-y-2">
                    {tripStops.map((stop, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex-1">
                          <AddressInput
                            value={stop.label}
                            placeholder={i === 0 ? 'Starting point...' : i === tripStops.length - 1 ? 'Final destination...' : `Stop ${i + 1}...`}
                            color={routeColors[i % routeColors.length]}
                            index={i}
                            onSelect={(lat, lng, name) => {
                              setTripStops(prev => prev.map((s, j) => j === i ? { lat, lng, label: name } : s))
                              setMultiStop(null)
                            }}
                            onClear={() => removeStop(i)}
                          />
                        </div>
                        {tripStops.length > 2 && (
                          <button onClick={() => removeStop(i)} className="text-zinc-600 hover:text-red-400 transition-colors p-1">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setTripStops(prev => [...prev, { lat: 0, lng: 0, label: '' }])}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-white/[0.08] hover:border-emerald-500/30 text-xs text-zinc-500 hover:text-emerald-400 transition-all"
                    >
                      <Plus size={13} /> Add Stop
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={doCalculateTrip}
                      disabled={tripStops.filter(s => s.lat !== 0).length < 2 || loading}
                      className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 disabled:shadow-none"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <RouteIcon size={15} />}
                      {loading ? 'Planning...' : 'Plan Trip'}
                    </button>
                    <button
                      onClick={doOptimize}
                      disabled={tripStops.filter(s => s.lat !== 0).length < 3 || optimizing}
                      className="px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] disabled:opacity-30 text-sm font-medium transition-all flex items-center gap-2"
                      title="Optimize stop order for shortest distance"
                    >
                      {optimizing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} className="text-amber-400" />}
                    </button>
                  </div>

                  {/* Trip Presets */}
                  {!multiStop && tripStops.length === 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap size={11} className="text-zinc-500" />
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Demo Trips</span>
                      </div>
                      {ROAD_TRIP_PRESETS.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => loadTripPreset(p)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/[0.04] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all text-left"
                        >
                          <div>
                            <div className="text-xs text-zinc-300 font-medium">{p.name}</div>
                            <div className="text-[10px] text-zinc-600">{p.stops.length} stops</div>
                          </div>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-500 font-medium">{p.tag}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Multi-Stop Results */}
                  <AnimatePresence>
                    {multiStop && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-3"
                      >
                        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
                          <div className="relative">
                            <div className="flex items-center gap-2 mb-2">
                              <Shield size={14} className="text-emerald-400" />
                              <span className="text-xs font-medium text-emerald-400">Trip Optimized</span>
                            </div>
                            <div className="text-2xl font-bold font-mono tracking-tight gradient-text-safe tabular-nums">
                              {multiStop.total_risk_reduction_pct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-emerald-400/60 mt-0.5">avg risk reduction across all legs</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <StatCard label="Total Dist" value={multiStop.total_distance_mi} unit="mi" icon={RouteIcon} />
                          <StatCard label="Est. Time" value={multiStop.total_time_hrs} unit="hrs" icon={Clock} />
                          <StatCard label="Avg Risk" value={multiStop.avg_risk} unit="/100" icon={Gauge} />
                        </div>

                        <div className="space-y-2">
                          <h3 className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Leg Details</h3>
                          {multiStop.legs.map((leg, i) => (
                            <div key={i} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 flex items-center gap-3">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: routeColors[i % routeColors.length] }}>
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-zinc-300 font-medium truncate">
                                  {tripStops[i]?.label || `Stop ${i + 1}`}
                                  <ArrowRight size={10} className="inline mx-1 text-zinc-600" />
                                  {tripStops[i + 1]?.label || `Stop ${i + 2}`}
                                </div>
                                <div className="flex gap-3 mt-0.5">
                                  <span className="text-[10px] text-zinc-500">{leg.climate_safe?.distance_mi || leg.standard.distance_mi} mi</span>
                                  <span className="text-[10px] font-medium" style={{ color: getRiskColor(leg.climate_safe?.total_risk || leg.standard.total_risk) }}>
                                    Risk: {leg.climate_safe?.total_risk || leg.standard.total_risk}
                                  </span>
                                  {leg.risk_reduction_pct !== undefined && leg.risk_reduction_pct > 0 && (
                                    <span className="text-[10px] text-emerald-400">-{leg.risk_reduction_pct.toFixed(0)}%</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}

              {/* === EXPLORE MODE === */}
              {mode === 'explore' && (
                <>
                  {!pointRisk && (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
                        <MapPinned size={20} className="text-zinc-600" />
                      </div>
                      <p className="text-sm text-zinc-500 leading-relaxed">
                        Click anywhere on the map to analyze climate risk at that location.
                      </p>
                    </div>
                  )}

                  <AnimatePresence>
                    {pointRisk && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-3"
                      >
                        <div className="relative overflow-hidden rounded-xl border border-white/[0.04] p-4"
                          style={{ background: `linear-gradient(135deg, ${getRiskColor(pointRisk.overall_risk)}08, transparent)`, borderColor: `${getRiskColor(pointRisk.overall_risk)}20` }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Risk Assessment</span>
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-semibold" style={{
                              background: `${getRiskColor(pointRisk.overall_risk)}15`,
                              color: getRiskColor(pointRisk.overall_risk),
                              border: `1px solid ${getRiskColor(pointRisk.overall_risk)}25`
                            }}>
                              {getRiskLabel(pointRisk.overall_risk)}
                            </span>
                          </div>
                          <div className="text-4xl font-bold font-mono tracking-tight tabular-nums" style={{ color: getRiskColor(pointRisk.overall_risk) }}>
                            {pointRisk.overall_risk}
                            <span className="text-sm text-zinc-600 ml-1 font-normal">/100</span>
                          </div>
                          {clickedPoint && (
                            <div className="text-[10px] text-zinc-600 mt-2 font-mono">
                              {clickedPoint[0].toFixed(4)}, {clickedPoint[1].toFixed(4)}
                            </div>
                          )}
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 space-y-1">
                          <RiskMeter label="Flood Risk" value={pointRisk.flood_risk} icon={Droplets} color="text-blue-400" />
                          <RiskMeter label="Wildfire Risk" value={pointRisk.wildfire_risk} icon={Flame} color="text-orange-400" />
                          <RiskMeter label="Heat Anomaly" value={pointRisk.heat_risk} icon={Thermometer} color="text-red-400" />
                          <RiskMeter label="Coastal Exposure" value={pointRisk.coastal_exposure} icon={Waves} color="text-cyan-400" />
                        </div>

                        <div className="flex items-center gap-2 px-1">
                          <Mountain size={13} className="text-zinc-600" />
                          <span className="text-[11px] text-zinc-500">
                            Elevation: <span className="text-zinc-300 font-mono">{pointRisk.elevation_ft.toLocaleString()} ft</span>
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/[0.04]" style={{ background: 'rgba(11, 15, 26, 0.95)' }}>
              <div className="flex items-center gap-1.5">
                <Info size={10} className="text-zinc-700" />
                <span className="text-[9px] text-zinc-600 leading-relaxed">Risk scores are ML-modeled estimates. Not for emergency decisions.</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Panel Button */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="absolute top-4 left-4 z-30 rounded-lg p-2 hover:bg-white/[0.08] transition-all"
        style={{ left: showPanel ? '392px' : '16px', background: 'rgba(11, 15, 26, 0.88)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <ChevronRight size={16} className={`text-zinc-400 transition-transform duration-300 ${showPanel ? 'rotate-180' : ''}`} />
      </button>

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
          <FitBounds bounds={mapBounds} />

          {/* Route Mode Markers */}
          {mode === 'route' && origin && (
            <CircleMarker center={[origin.lat, origin.lng]} radius={8}
              pathOptions={{ color: '#34d399', fillColor: '#34d399', fillOpacity: 0.9, weight: 3 }}>
              <Popup><div style={{ color: '#000', fontSize: 12 }}><strong>Origin</strong><br/>{origin.label}</div></Popup>
            </CircleMarker>
          )}
          {mode === 'route' && destination && (
            <CircleMarker center={[destination.lat, destination.lng]} radius={8}
              pathOptions={{ color: '#f87171', fillColor: '#f87171', fillOpacity: 0.9, weight: 3 }}>
              <Popup><div style={{ color: '#000', fontSize: 12 }}><strong>Destination</strong><br/>{destination.label}</div></Popup>
            </CircleMarker>
          )}

          {/* Route Lines */}
          {mode === 'route' && route && (
            <>
              <Polyline
                positions={route.standard.coordinates.map(c => [c[0], c[1]] as [number, number])}
                pathOptions={{ color: '#ef4444', weight: 3, opacity: 0.4, dashArray: '8, 8' }}
              />
              {route.climate_safe && (
                <Polyline
                  positions={route.climate_safe.coordinates.map(c => [c[0], c[1]] as [number, number])}
                  pathOptions={{ color: '#34d399', weight: 4, opacity: 0.9 }}
                />
              )}
              {route.climate_safe?.coordinates.map((coord, i) => {
                const risk = route.climate_safe!.risks[i]
                if (!risk || i % 4 !== 0) return null
                return (
                  <CircleMarker key={`r-${i}`} center={[coord[0], coord[1]]} radius={4}
                    pathOptions={{ color: getRiskColor(risk.overall_risk), fillColor: getRiskColor(risk.overall_risk), fillOpacity: 0.5, weight: 1 }}>
                    <Popup>
                      <div style={{ color: '#000', fontSize: 12 }}>
                        <strong>Risk: {risk.overall_risk}</strong><br/>
                        Flood: {risk.flood_risk} | Fire: {risk.wildfire_risk}<br/>
                        Heat: {risk.heat_risk} | Coast: {risk.coastal_exposure}
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </>
          )}

          {/* Trip Mode */}
          {mode === 'trip' && tripStops.map((stop, i) => (
            stop.lat !== 0 && (
              <Marker key={`stop-${i}`} position={[stop.lat, stop.lng]} icon={createStopIcon(i, routeColors[i % routeColors.length])}>
                <Popup><div style={{ color: '#000', fontSize: 12 }}><strong>Stop {i + 1}</strong><br/>{stop.label}</div></Popup>
              </Marker>
            )
          ))}
          {mode === 'trip' && multiStop && multiStop.legs.map((leg, i) => (
            <Polyline
              key={`leg-${i}`}
              positions={(leg.climate_safe?.coordinates || leg.standard.coordinates).map(c => [c[0], c[1]] as [number, number])}
              pathOptions={{ color: routeColors[i % routeColors.length], weight: 4, opacity: 0.8 }}
            />
          ))}

          {/* Explore Mode */}
          {mode === 'explore' && clickedPoint && (
            <CircleMarker center={clickedPoint} radius={10}
              pathOptions={{ color: getRiskColor(pointRisk?.overall_risk || 0), fillColor: getRiskColor(pointRisk?.overall_risk || 0), fillOpacity: 0.3, weight: 2 }}>
              <Popup>
                <div style={{ color: '#000', fontSize: 12 }}>
                  <strong>Risk: {pointRisk?.overall_risk}</strong> ({pointRisk?.risk_level})<br/>
                  Flood: {pointRisk?.flood_risk} | Fire: {pointRisk?.wildfire_risk}<br/>
                  Heat: {pointRisk?.heat_risk} | Coast: {pointRisk?.coastal_exposure}
                </div>
              </Popup>
            </CircleMarker>
          )}
        </MapContainer>

        {/* Map Legend */}
        <div className="absolute bottom-6 right-6 rounded-xl px-4 py-3 z-[1000]" style={{ background: 'rgba(11, 15, 26, 0.88)', backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}>
          <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2 font-semibold">Risk Level</div>
          <div className="flex gap-2.5">
            {[
              { label: 'Low', color: '#34d399' },
              { label: 'Mod', color: '#a3e635' },
              { label: 'Elev', color: '#fbbf24' },
              { label: 'High', color: '#fb923c' },
              { label: 'Severe', color: '#f87171' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[9px] text-zinc-500">{item.label}</span>
              </div>
            ))}
          </div>
          {mode === 'route' && (
            <div className="flex gap-3 mt-2 pt-2 border-t border-white/[0.04]">
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-[2px] bg-red-400 rounded opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #f87171 0, #f87171 4px, transparent 4px, transparent 8px)' }} />
                <span className="text-[9px] text-zinc-500">Standard</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-[2px] bg-emerald-400 rounded" />
                <span className="text-[9px] text-zinc-500">Climate-Safe</span>
              </div>
            </div>
          )}
        </div>

        {/* Mode hint overlay */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 z-[1000]" style={{ background: 'rgba(11, 15, 26, 0.85)', backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
          <span className="text-[11px] text-zinc-400 font-medium">
            {mode === 'explore' && 'Click anywhere to analyze climate risk'}
            {mode === 'route' && !origin && 'Search or click map to set origin'}
            {mode === 'route' && origin && !destination && 'Search or click map to set destination'}
            {mode === 'route' && origin && destination && !route && 'Click "Find Climate-Safe Route" to analyze'}
            {mode === 'route' && route && 'Route analyzed. Green = safer path.'}
            {mode === 'trip' && tripStops.length === 0 && 'Add stops or try a demo trip'}
            {mode === 'trip' && tripStops.length > 0 && !multiStop && 'Click map to add stops, then Plan Trip'}
            {mode === 'trip' && multiStop && `${tripStops.length}-stop trip planned. Each leg optimized for safety.`}
          </span>
        </div>
      </div>
    </div>
  )
}
