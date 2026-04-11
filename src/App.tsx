import { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMapEvents, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import {
  scoreRisk, calculateRoute, calculateMultiStopRoute, optimizeStopOrder,
  geocodeSearch,
  PRESETS, ROAD_TRIP_PRESETS,
  type RiskData, type RouteResult, type MultiStopResult, type GeocodeSuggestion
} from './risk-engine'
import {
  MapPin, Navigation, Shield, AlertTriangle,
  Loader2, RotateCcw, Zap, Plus, Trash2,
  Route as RouteIcon, MapPinned, Clock, Gauge, ChevronRight, X, ArrowRight, Sparkles, Info,
  Sun, Moon, Droplets, Flame, Thermometer, Waves, Mountain
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

// ===== THEME =====

type Theme = 'light' | 'dark'
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  )
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark') }, [theme])
  const toggle = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), [])
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>
}
function useTheme() { return useContext(ThemeCtx) }

// ===== HOOKS =====

function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

// ===== HELPERS =====

function createStopIcon(index: number, color: string) {
  return L.divIcon({
    className: 'custom-stop-marker',
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;font-family:'Inter',sans-serif">${index + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function riskColor(risk: number): string {
  if (risk < 20) return 'var(--risk-low)'
  if (risk < 40) return 'var(--risk-mod)'
  if (risk < 60) return 'var(--risk-elev)'
  if (risk < 80) return 'var(--risk-high)'
  return 'var(--risk-severe)'
}

function riskHex(risk: number, dark: boolean): string {
  if (dark) {
    if (risk < 20) return '#34d399'
    if (risk < 40) return '#a3e635'
    if (risk < 60) return '#fbbf24'
    if (risk < 80) return '#fb923c'
    return '#f87171'
  }
  if (risk < 20) return '#1b7a4e'
  if (risk < 40) return '#5d8c1a'
  if (risk < 60) return '#b87d1e'
  if (risk < 80) return '#c05828'
  return '#b8432a'
}

function riskLabel(risk: number): string {
  if (risk < 20) return 'Low'
  if (risk < 40) return 'Moderate'
  if (risk < 60) return 'Elevated'
  if (risk < 80) return 'High'
  return 'Severe'
}

// ===== MAP HELPERS =====

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMapClick(e.latlng.lat, e.latlng.lng) } })
  return null
}

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap()
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 }) }, [bounds, map])
  return null
}

function ThemedTileLayer() {
  const { theme } = useTheme()
  const map = useMap()
  useEffect(() => { map.invalidateSize() }, [theme, map])

  if (theme === 'dark') {
    return <TileLayer key="dark" attribution='&copy; <a href="https://carto.com/">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
  }
  return <TileLayer key="light" attribution='&copy; <a href="https://opentopomap.org">OpenTopoMap</a>' url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" maxZoom={17} />
}

// ===== COMPONENTS =====

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} className="theme-toggle" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
      <div className="theme-toggle-knob">
        {theme === 'light' ? <Sun size={11} color="white" strokeWidth={2.5} /> : <Moon size={11} color="white" strokeWidth={2.5} />}
      </div>
    </button>
  )
}

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent)" opacity="0.12" />
      <path d="M8 22c2-1 4-2 6-1s4 1 6 0 4-1.5 4-1.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M10 18c1.5-.8 3-1.5 4.5-.8s3 .8 4.5 0" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      <path d="M16 6l-2 5h4l-2 5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="10" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.15" />
    </svg>
  )
}

function AddressInput({ value, placeholder, onSelect, onClear, color, index }: {
  value: string; placeholder: string; color: string; index?: number
  onSelect: (lat: number, lng: number, name: string) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [show, setShow] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => { setQuery(value) }, [value])

  const doSearch = useCallback((q: string) => {
    if (q.length < 3) { setSuggestions([]); return }
    setSearching(true)
    geocodeSearch(q).then(r => { setSuggestions(r); setShow(r.length > 0); setSearching(false) })
  }, [])

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; setQuery(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => doSearch(v), 350)
  }

  const select = (s: GeocodeSuggestion) => {
    const name = s.display_name.split(',').slice(0, 3).join(',').trim()
    setQuery(name); setShow(false); onSelect(s.lat, s.lon, name)
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-3">
        {index !== undefined ? (
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: color }}>{index + 1}</div>
        ) : (
          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }} />
        )}
        <div className="flex-1 relative">
          <input
            value={query} onChange={handleInput}
            onFocus={() => suggestions.length > 0 && setShow(true)}
            onBlur={() => setTimeout(() => setShow(false), 200)}
            placeholder={placeholder}
            className="input-field"
          />
          {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--text-quaternary)' }} />}
          {query && !searching && (
            <button onClick={() => { setQuery(''); setSuggestions([]); onClear() }} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-quaternary)' }}><X size={14} /></button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-9 right-0 top-full mt-1.5 rounded-lg overflow-hidden z-50"
            style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}
          >
            {suggestions.map((s, i) => (
              <button key={i} onMouseDown={() => select(s)}
                className="w-full px-3 py-2.5 text-left flex items-start gap-2.5 transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <MapPin size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--text-quaternary)' }} />
                <span className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{s.display_name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RiskMeter({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-inset)' }}>
        <Icon size={15} style={{ color: riskColor(value) }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</span>
          <span className="text-xs font-mono font-semibold tabular" style={{ color: 'var(--text-primary)' }}>{value.toFixed(1)}</span>
        </div>
        <div className="risk-bar-track">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(value, 100)}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="risk-bar-fill"
            style={{ backgroundColor: riskColor(value) }}
          />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, unit, icon: Icon }: { label: string; value: string | number; unit?: string; icon: any }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={12} style={{ color: 'var(--text-quaternary)' }} />
        <span className="label">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-semibold font-mono tabular" style={{ color: 'var(--text-primary)' }}>{value}</span>
        {unit && <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{unit}</span>}
      </div>
    </div>
  )
}

function DemoPreset({ name, detail, tag, onClick }: { name: string; detail: string; tag: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card-interactive w-full flex items-center justify-between px-3.5 py-3 text-left">
      <div className="min-w-0 mr-3">
        <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{name}</div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{detail}</div>
      </div>
      <span className="label shrink-0 px-2.5 py-1 rounded-full" style={{ background: 'var(--surface-inset)', fontSize: '9px' }}>{tag}</span>
    </button>
  )
}

function SectionLabel({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={11} style={{ color: 'var(--text-quaternary)' }} />
      <span className="label">{label}</span>
    </div>
  )
}

// ===== PANEL CONTENT =====

function PanelContent({ mode, origin, setOrigin, destination, setDestination, tripStops, setTripStops, route, setRoute, multiStop, setMultiStop, pointRisk, clickedPoint, loading, optimizing, doCalculateRoute, doCalculateTrip, doOptimize, loadPreset, loadTripPreset, removeStop, routeColors, pad }: any) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const safe = isDark ? '#34d399' : '#1b7a4e'
  const danger = isDark ? '#f87171' : '#b8432a'

  return (
    <div className="space-y-4" style={{ padding: `0 ${pad}px ${pad + 8}px` }}>

      {/* === ROUTE MODE === */}
      {mode === 'route' && (
        <>
          <div className="space-y-3">
            <AddressInput value={origin?.label || ''} placeholder="Search origin address..." color={safe}
              onSelect={(lat, lng, name) => { setOrigin({ lat, lng, label: name }); setRoute(null) }}
              onClear={() => { setOrigin(null); setRoute(null) }} />
            <div className="divider mx-6" />
            <AddressInput value={destination?.label || ''} placeholder="Search destination address..." color={danger}
              onSelect={(lat, lng, name) => { setDestination({ lat, lng, label: name }); setRoute(null) }}
              onClear={() => { setDestination(null); setRoute(null) }} />
          </div>

          <button onClick={doCalculateRoute} disabled={!origin || !destination || loading} className="btn-primary">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={15} />}
            {loading ? 'Analyzing Route...' : 'Find Climate-Safe Route'}
          </button>

          {/* Demo Routes */}
          {!route && (
            <div>
              <SectionLabel icon={Zap} label="Demo Routes" />
              <div className="space-y-2">
                {PRESETS.map((p, i) => (
                  <DemoPreset key={i} name={p.name} detail={`${p.from_label} to ${p.to_label}`} tag={p.tag} onClick={() => loadPreset(p)} />
                ))}
              </div>
            </div>
          )}

          {/* Route Results */}
          <AnimatePresence>
            {route && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-3">
                {/* Hero card */}
                {route.climate_safe && route.risk_reduction_pct !== undefined && route.risk_reduction_pct > 0 && (
                  <div className="card-elevated p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-muted)' }}>
                        <Shield size={14} style={{ color: 'var(--accent)' }} />
                      </div>
                      <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Climate-Safe Route Found</span>
                    </div>
                    <div className="text-4xl font-bold font-mono tabular gradient-safe tracking-tight">{route.risk_reduction_pct.toFixed(1)}%</div>
                    <div className="text-[11px] mt-1 font-medium" style={{ color: 'var(--text-tertiary)' }}>risk reduction vs. standard route</div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <Stat label="Distance" value={route.climate_safe?.distance_mi || route.standard.distance_mi} unit="mi" icon={RouteIcon} />
                  <Stat label="Est. Time" value={route.climate_safe?.estimated_time_hrs || route.standard.estimated_time_hrs} unit="hrs" icon={Clock} />
                  <Stat label="Safe Risk" value={route.climate_safe?.total_risk || route.standard.total_risk} unit="/100" icon={Gauge} />
                  <Stat label="Std Risk" value={route.standard.total_risk} unit="/100" icon={AlertTriangle} />
                </div>

                {route.climate_safe && route.climate_safe.risks.length > 0 && (() => {
                  const r = route.climate_safe.risks
                  const avg = {
                    flood: r.reduce((s: number, x: any) => s + x.flood_risk, 0) / r.length,
                    fire: r.reduce((s: number, x: any) => s + x.wildfire_risk, 0) / r.length,
                    heat: r.reduce((s: number, x: any) => s + x.heat_risk, 0) / r.length,
                    coast: r.reduce((s: number, x: any) => s + x.coastal_exposure, 0) / r.length,
                  }
                  return (
                    <div className="card-elevated p-4">
                      <SectionLabel icon={Shield} label="Risk Breakdown" />
                      <div className="mt-1">
                        <RiskMeter label="Flood Risk" value={avg.flood} icon={Droplets} />
                        <RiskMeter label="Wildfire Risk" value={avg.fire} icon={Flame} />
                        <RiskMeter label="Heat Anomaly" value={avg.heat} icon={Thermometer} />
                        <RiskMeter label="Coastal Exposure" value={avg.coast} icon={Waves} />
                      </div>
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
          <div className="space-y-2.5">
            {tripStops.map((stop: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <AddressInput
                    value={stop.label}
                    placeholder={i === 0 ? 'Starting point...' : i === tripStops.length - 1 ? 'Final destination...' : `Stop ${i + 1}...`}
                    color={routeColors[i % routeColors.length]} index={i}
                    onSelect={(lat, lng, name) => { setTripStops((p: any[]) => p.map((s: any, j: number) => j === i ? { lat, lng, label: name } : s)); setMultiStop(null) }}
                    onClear={() => removeStop(i)}
                  />
                </div>
                {tripStops.length > 2 && (
                  <button onClick={() => removeStop(i)} className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--text-quaternary)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-quaternary)')}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setTripStops((p: any[]) => [...p, { lat: 0, lng: 0, label: '' }])}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-dashed text-xs font-medium transition-colors"
              style={{ borderColor: 'var(--border-default)', color: 'var(--text-tertiary)' }}>
              <Plus size={13} /> Add Stop
            </button>
          </div>

          <div className="flex gap-2.5">
            <button onClick={doCalculateTrip} disabled={tripStops.filter((s: any) => s.lat !== 0).length < 2 || loading} className="btn-primary flex-1">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RouteIcon size={15} />}
              {loading ? 'Planning...' : 'Plan Trip'}
            </button>
            <button onClick={doOptimize} disabled={tripStops.filter((s: any) => s.lat !== 0).length < 3 || optimizing}
              className="btn-ghost" style={{ width: 44 }} title="Optimize stop order">
              {optimizing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} style={{ color: 'var(--warning)' }} />}
            </button>
          </div>

          {/* Trip Presets */}
          {!multiStop && tripStops.length === 0 && (
            <div>
              <SectionLabel icon={Zap} label="Demo Trips" />
              <div className="space-y-2">
                {ROAD_TRIP_PRESETS.map((p, i) => (
                  <DemoPreset key={i} name={p.name} detail={`${p.stops.length} stops`} tag={p.tag} onClick={() => loadTripPreset(p)} />
                ))}
              </div>
            </div>
          )}

          {/* Multi-Stop Results */}
          <AnimatePresence>
            {multiStop && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-3">
                <div className="card-elevated p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-muted)' }}>
                      <Shield size={14} style={{ color: 'var(--accent)' }} />
                    </div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Trip Optimized</span>
                  </div>
                  <div className="text-3xl font-bold font-mono tabular gradient-safe tracking-tight">{multiStop.total_risk_reduction_pct.toFixed(1)}%</div>
                  <div className="text-[11px] mt-1 font-medium" style={{ color: 'var(--text-tertiary)' }}>avg risk reduction across all legs</div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Distance" value={multiStop.total_distance_mi} unit="mi" icon={RouteIcon} />
                  <Stat label="Time" value={multiStop.total_time_hrs} unit="hrs" icon={Clock} />
                  <Stat label="Avg Risk" value={multiStop.avg_risk} unit="/100" icon={Gauge} />
                </div>

                <div>
                  <SectionLabel icon={RouteIcon} label="Leg Details" />
                  <div className="space-y-2">
                    {multiStop.legs.map((leg: any, i: number) => (
                      <div key={i} className="card flex items-center gap-3 p-3.5">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: routeColors[i % routeColors.length] }}>{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {tripStops[i]?.label || `Stop ${i + 1}`}
                            <ArrowRight size={10} className="inline mx-1 opacity-40" />
                            {tripStops[i + 1]?.label || `Stop ${i + 2}`}
                          </div>
                          <div className="flex gap-3 mt-1">
                            <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{leg.climate_safe?.distance_mi || leg.standard.distance_mi} mi</span>
                            <span className="text-[11px] font-medium" style={{ color: riskColor(leg.climate_safe?.total_risk || leg.standard.total_risk) }}>
                              Risk: {leg.climate_safe?.total_risk || leg.standard.total_risk}
                            </span>
                            {leg.risk_reduction_pct > 0 && <span className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>-{leg.risk_reduction_pct.toFixed(0)}%</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
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
            <div className="text-center py-12 px-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-inset)' }}>
                <MapPinned size={22} style={{ color: 'var(--text-quaternary)' }} />
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                Click anywhere on the map to analyze climate risk at that location.
              </p>
            </div>
          )}

          <AnimatePresence>
            {pointRisk && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-3">
                <div className="card-elevated p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="label">Risk Assessment</span>
                    <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: `color-mix(in srgb, ${riskColor(pointRisk.overall_risk)} 12%, transparent)`, color: riskColor(pointRisk.overall_risk), border: `1px solid color-mix(in srgb, ${riskColor(pointRisk.overall_risk)} 20%, transparent)` }}>
                      {riskLabel(pointRisk.overall_risk)}
                    </span>
                  </div>
                  <div className="text-5xl font-bold font-mono tabular tracking-tight" style={{ color: riskColor(pointRisk.overall_risk) }}>
                    {pointRisk.overall_risk}
                    <span className="text-base ml-1.5 font-normal" style={{ color: 'var(--text-quaternary)' }}>/100</span>
                  </div>
                  {clickedPoint && (
                    <div className="text-[11px] font-mono mt-3" style={{ color: 'var(--text-quaternary)' }}>{clickedPoint[0].toFixed(4)}, {clickedPoint[1].toFixed(4)}</div>
                  )}
                </div>

                <div className="card-elevated p-4">
                  <SectionLabel icon={Shield} label="Factor Breakdown" />
                  <div className="mt-1">
                    <RiskMeter label="Flood Risk" value={pointRisk.flood_risk} icon={Droplets} />
                    <RiskMeter label="Wildfire Risk" value={pointRisk.wildfire_risk} icon={Flame} />
                    <RiskMeter label="Heat Anomaly" value={pointRisk.heat_risk} icon={Thermometer} />
                    <RiskMeter label="Coastal Exposure" value={pointRisk.coastal_exposure} icon={Waves} />
                  </div>
                </div>

                <div className="card p-3.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-inset)' }}>
                    <Mountain size={14} style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                  <div>
                    <span className="label">Elevation</span>
                    <div className="text-sm font-mono font-semibold tabular mt-0.5" style={{ color: 'var(--text-primary)' }}>{pointRisk.elevation_ft.toLocaleString()} ft</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}

// ===== MAIN APP =====

type AppMode = 'route' | 'trip' | 'explore'
interface Stop { lat: number; lng: number; label: string }

function AppContent() {
  const isMobile = useIsMobile()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [mode, setMode] = useState<AppMode>('route')
  const [origin, setOrigin] = useState<Stop | null>(null)
  const [destination, setDestination] = useState<Stop | null>(null)
  const [tripStops, setTripStops] = useState<Stop[]>([])
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [multiStop, setMultiStop] = useState<MultiStopResult | null>(null)
  const [pointRisk, setPointRisk] = useState<RiskData | null>(null)
  const [clickedPoint, setClickedPoint] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [mapBounds, setMapBounds] = useState<L.LatLngBoundsExpression | null>(null)
  const [showPanel, setShowPanel] = useState(true)
  const [sheetState, setSheetState] = useState<'peek' | 'half' | 'full'>('half')

  const reset = () => { setOrigin(null); setDestination(null); setTripStops([]); setRoute(null); setMultiStop(null); setPointRisk(null); setClickedPoint(null); setMapBounds(null) }

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (mode === 'explore') {
      setPointRisk(scoreRisk(lat, lng)); setClickedPoint([lat, lng])
      if (isMobile) setSheetState('half')
    } else if (mode === 'route') {
      if (!origin) setOrigin({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
      else if (!destination) setDestination({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
    } else if (mode === 'trip') {
      setTripStops(prev => [...prev, { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }])
    }
  }, [mode, origin, destination, isMobile])

  const fitBoundsFromCoords = (coords: number[][]) => {
    if (coords.length > 0) setMapBounds(L.latLngBounds(coords.map(c => [c[0], c[1]] as [number, number])))
  }

  const doCalculateRoute = useCallback(() => {
    if (!origin || !destination) return
    setLoading(true)
    requestAnimationFrame(() => {
      const r = calculateRoute(origin.lat, origin.lng, destination.lat, destination.lng)
      setRoute(r); setLoading(false)
      if (isMobile) setSheetState('half')
      fitBoundsFromCoords([...r.standard.coordinates, ...(r.climate_safe?.coordinates || [])])
    })
  }, [origin, destination, isMobile])

  const doCalculateTrip = useCallback(() => {
    if (tripStops.length < 2) return
    setLoading(true)
    requestAnimationFrame(() => {
      const r = calculateMultiStopRoute(tripStops.map(s => [s.lat, s.lng] as [number, number]))
      setMultiStop(r); setLoading(false)
      if (isMobile) setSheetState('half')
      fitBoundsFromCoords(r.legs.flatMap(l => (l.climate_safe?.coordinates || l.standard.coordinates)))
    })
  }, [tripStops, isMobile])

  const doOptimize = useCallback(() => {
    if (tripStops.length < 3) return
    setOptimizing(true)
    requestAnimationFrame(() => {
      const { order } = optimizeStopOrder(tripStops.map(s => [s.lat, s.lng] as [number, number]))
      setTripStops(order.map(i => tripStops[i])); setOptimizing(false)
    })
  }, [tripStops])

  const loadPreset = useCallback((p: typeof PRESETS[0]) => {
    setOrigin({ lat: p.from_lat, lng: p.from_lng, label: p.from_label })
    setDestination({ lat: p.to_lat, lng: p.to_lng, label: p.to_label })
    setLoading(true)
    requestAnimationFrame(() => {
      const r = calculateRoute(p.from_lat, p.from_lng, p.to_lat, p.to_lng)
      setRoute(r); setLoading(false)
      if (isMobile) setSheetState('half')
      fitBoundsFromCoords([...r.standard.coordinates, ...(r.climate_safe?.coordinates || [])])
    })
  }, [isMobile])

  const loadTripPreset = useCallback((p: typeof ROAD_TRIP_PRESETS[0]) => {
    const stops = p.stops.map(s => ({ lat: s.lat, lng: s.lng, label: s.label }))
    setTripStops(stops); setMode('trip'); setLoading(true)
    requestAnimationFrame(() => {
      const r = calculateMultiStopRoute(stops.map(s => [s.lat, s.lng] as [number, number]))
      setMultiStop(r); setLoading(false)
      if (isMobile) setSheetState('half')
      fitBoundsFromCoords(r.legs.flatMap(l => (l.climate_safe?.coordinates || l.standard.coordinates)))
    })
  }, [isMobile])

  const removeStop = (idx: number) => { setTripStops(p => p.filter((_, i) => i !== idx)); setMultiStop(null) }

  const routeColors = isDark
    ? ['#34d399', '#60a5fa', '#c084fc', '#fb923c', '#f87171', '#facc15', '#2dd4bf', '#e879f9']
    : ['#1b7a4e', '#2563eb', '#7c3aed', '#c05828', '#b8432a', '#92700c', '#0d6e8a', '#a21caf']

  const safe = isDark ? '#34d399' : '#1b7a4e'
  const danger = isDark ? '#f87171' : '#b8432a'

  const panelProps = { mode, origin, setOrigin, destination, setDestination, tripStops, setTripStops, route, setRoute, multiStop, setMultiStop, pointRisk, clickedPoint, loading, optimizing, doCalculateRoute, doCalculateTrip, doOptimize, loadPreset, loadTripPreset, removeStop, routeColors }

  const hintText = (() => {
    if (mode === 'explore') return 'Click anywhere to analyze climate risk'
    if (mode === 'route' && !origin) return 'Search or click to set origin'
    if (mode === 'route' && origin && !destination) return 'Now set your destination'
    if (mode === 'route' && route) return 'Route analyzed - green is safer'
    if (mode === 'trip' && tripStops.length === 0) return 'Add stops or try a demo trip'
    if (mode === 'trip' && multiStop) return `${tripStops.length} stops optimized`
    return ''
  })()

  const sheetH = { peek: 140, half: Math.round(window.innerHeight * 0.5), full: window.innerHeight - 40 }
  const cycleSheet = () => setSheetState(s => s === 'peek' ? 'half' : s === 'half' ? 'full' : 'peek')
  const handleDrag = (_: any, info: PanInfo) => {
    const { y: vy } = info.velocity; const { y: dy } = info.offset
    if (vy > 400 || dy > 80) setSheetState(s => s === 'full' ? 'half' : 'peek')
    else if (vy < -400 || dy < -80) setSheetState(s => s === 'peek' ? 'half' : 'full')
  }

  const tabs: { id: AppMode; label: string; icon: any }[] = [
    { id: 'route', label: 'Route', icon: Navigation },
    { id: 'trip', label: isMobile ? 'Trip' : 'Road Trip', icon: RouteIcon },
    { id: 'explore', label: 'Explore', icon: MapPinned },
  ]

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden" style={{ background: 'var(--surface-base)' }}>

      {/* ===== DESKTOP SIDEBAR ===== */}
      {!isMobile && (
        <>
          <AnimatePresence mode="wait">
            {showPanel && (
              <motion.div
                initial={{ x: -400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -400, opacity: 0 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="flex-shrink-0 flex flex-col sidebar-panel z-20" style={{ width: 'var(--sidebar-w)' }}
              >
                {/* Header */}
                <div style={{ padding: '20px 20px 16px' }}>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <Logo size={30} />
                      <div>
                        <h1 className="text-[15px] font-semibold tracking-tight" style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>ClimaRoute</h1>
                        <p className="text-[10px] font-medium mt-px" style={{ color: 'var(--text-quaternary)' }}>AI Climate Risk Router</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ThemeToggle />
                      <button onClick={reset} className="btn-ghost" style={{ height: 28, padding: '0 8px', fontSize: 10 }}>
                        <RotateCcw size={11} /> Reset
                      </button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="tabs-container">
                    {tabs.map(t => (
                      <button key={t.id} onClick={() => { setMode(t.id); reset() }} className={`tab-btn ${mode === t.id ? 'tab-active' : ''}`}>
                        <t.icon size={13} /> {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scroll">
                  <PanelContent {...panelProps} pad={20} />
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 border-t" style={{ padding: '12px 20px', borderColor: 'var(--border-subtle)' }}>
                  <Info size={10} style={{ color: 'var(--text-quaternary)' }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-quaternary)' }}>Risk scores are ML-modeled estimates. Not for emergency decisions.</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Panel toggle */}
          <button onClick={() => setShowPanel(!showPanel)}
            className="absolute z-30 rounded-lg transition-all"
            style={{
              top: 16, left: showPanel ? 'calc(var(--sidebar-w) + 12px)' : '16px',
              padding: '8px', background: 'var(--surface-panel)', backdropFilter: `blur(var(--glass-blur))`,
              border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)',
            }}>
            <ChevronRight size={16} className={`transition-transform duration-300 ${showPanel ? 'rotate-180' : ''}`} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </>
      )}

      {/* ===== MAP ===== */}
      <div className="flex-1 relative" style={{ zIndex: 1 }}>
        <MapContainer center={[39.0, -98.0]} zoom={isMobile ? 4 : 5} className="h-full w-full" zoomControl={false}>
          <ThemedTileLayer />
          <MapClickHandler onMapClick={handleMapClick} />
          <FitBounds bounds={mapBounds} />

          {mode === 'route' && origin && (
            <CircleMarker center={[origin.lat, origin.lng]} radius={8} pathOptions={{ color: safe, fillColor: safe, fillOpacity: 0.9, weight: 3 }}>
              <Popup><div style={{ fontSize: 12 }}><strong>Origin</strong><br />{origin.label}</div></Popup>
            </CircleMarker>
          )}
          {mode === 'route' && destination && (
            <CircleMarker center={[destination.lat, destination.lng]} radius={8} pathOptions={{ color: danger, fillColor: danger, fillOpacity: 0.9, weight: 3 }}>
              <Popup><div style={{ fontSize: 12 }}><strong>Destination</strong><br />{destination.label}</div></Popup>
            </CircleMarker>
          )}
          {mode === 'route' && route && (
            <>
              <Polyline positions={route.standard.coordinates.map(c => [c[0], c[1]] as [number, number])} pathOptions={{ color: danger, weight: 3, opacity: 0.35, dashArray: '8 8' }} />
              {route.climate_safe && (
                <Polyline positions={route.climate_safe.coordinates.map(c => [c[0], c[1]] as [number, number])} pathOptions={{ color: safe, weight: 4, opacity: 0.9 }} />
              )}
              {route.climate_safe?.coordinates.map((coord, i) => {
                const risk = route.climate_safe!.risks[i]
                if (!risk || i % 4 !== 0) return null
                return (
                  <CircleMarker key={i} center={[coord[0], coord[1]]} radius={4}
                    pathOptions={{ color: riskHex(risk.overall_risk, isDark), fillColor: riskHex(risk.overall_risk, isDark), fillOpacity: 0.5, weight: 1 }}>
                    <Popup><div style={{ fontSize: 12 }}><strong>Risk: {risk.overall_risk}</strong><br />Flood: {risk.flood_risk} | Fire: {risk.wildfire_risk}<br />Heat: {risk.heat_risk} | Coast: {risk.coastal_exposure}</div></Popup>
                  </CircleMarker>
                )
              })}
            </>
          )}

          {mode === 'trip' && tripStops.map((s, i) => s.lat !== 0 && (
            <Marker key={i} position={[s.lat, s.lng]} icon={createStopIcon(i, routeColors[i % routeColors.length])}>
              <Popup><div style={{ fontSize: 12 }}><strong>Stop {i + 1}</strong><br />{s.label}</div></Popup>
            </Marker>
          ))}
          {mode === 'trip' && multiStop?.legs.map((leg, i) => (
            <Polyline key={i} positions={(leg.climate_safe?.coordinates || leg.standard.coordinates).map(c => [c[0], c[1]] as [number, number])} pathOptions={{ color: routeColors[i % routeColors.length], weight: 4, opacity: 0.8 }} />
          ))}

          {mode === 'explore' && clickedPoint && (
            <CircleMarker center={clickedPoint} radius={10}
              pathOptions={{ color: riskHex(pointRisk?.overall_risk || 0, isDark), fillColor: riskHex(pointRisk?.overall_risk || 0, isDark), fillOpacity: 0.3, weight: 2 }}>
              <Popup><div style={{ fontSize: 12 }}><strong>Risk: {pointRisk?.overall_risk}</strong><br />Flood: {pointRisk?.flood_risk} | Fire: {pointRisk?.wildfire_risk}<br />Heat: {pointRisk?.heat_risk} | Coast: {pointRisk?.coastal_exposure}</div></Popup>
            </CircleMarker>
          )}
        </MapContainer>

        {/* Legend */}
        {!isMobile && (
          <div className="absolute bottom-6 right-6 z-[1000] rounded-xl px-4 py-3"
            style={{ background: 'var(--surface-panel)', backdropFilter: `blur(var(--glass-blur))`, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-md)' }}>
            <div className="label mb-2">Risk Level</div>
            <div className="flex gap-3">
              {[{ l: 'Low', r: 10 }, { l: 'Mod', r: 30 }, { l: 'Elev', r: 50 }, { l: 'High', r: 70 }, { l: 'Severe', r: 90 }].map(x => (
                <div key={x.l} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: riskHex(x.r, isDark) }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{x.l}</span>
                </div>
              ))}
            </div>
            {mode === 'route' && (
              <div className="flex gap-4 mt-2.5 pt-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2"><div className="w-5 h-[2px] rounded opacity-40" style={{ background: danger }} /><span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Standard</span></div>
                <div className="flex items-center gap-2"><div className="w-5 h-[2px] rounded" style={{ background: safe }} /><span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>Climate-Safe</span></div>
              </div>
            )}
          </div>
        )}

        {/* Hint pill */}
        {hintText && (
          <div className={`absolute left-1/2 -translate-x-1/2 z-[1000] rounded-full px-4 py-2 ${isMobile ? 'top-3' : 'top-4'}`}
            style={{ background: 'var(--surface-panel)', backdropFilter: `blur(var(--glass-blur))`, border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{hintText}</span>
          </div>
        )}
      </div>

      {/* ===== MOBILE BOTTOM SHEET ===== */}
      {isMobile && (
        <motion.div
          className="fixed bottom-0 left-0 right-0 z-30 flex flex-col"
          style={{ background: 'var(--surface-panel)', backdropFilter: `blur(var(--glass-blur)) saturate(var(--glass-saturate))`, borderTop: '1px solid var(--border-default)', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.12)' }}
          animate={{ height: sheetH[sheetState] }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.1} onDragEnd={handleDrag}
        >
          <div className="flex flex-col items-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing" onClick={cycleSheet}>
            <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} />
          </div>

          <div className="px-4 pb-3 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Logo size={24} />
                <span className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>ClimaRoute</span>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button onClick={reset} className="btn-ghost" style={{ height: 26, padding: '0 8px', fontSize: 10 }}>
                  <RotateCcw size={10} /> Reset
                </button>
              </div>
            </div>
            <div className="tabs-container">
              {tabs.map(t => (
                <button key={t.id} onClick={() => { setMode(t.id); reset() }} className={`tab-btn ${mode === t.id ? 'tab-active' : ''}`}>
                  <t.icon size={12} /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scroll overscroll-contain" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <PanelContent {...panelProps} pad={16} />
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default function App() {
  return <ThemeProvider><AppContent /></ThemeProvider>
}
