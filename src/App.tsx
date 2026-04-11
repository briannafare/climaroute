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
  Sun, Moon
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

// === THEME CONTEXT ===

type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} })

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const toggle = useCallback(() => setTheme(t => t === 'light' ? 'dark' : 'light'), [])

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  return useContext(ThemeContext)
}

// === ILLUSTRATED SVG CLIMATE ICONS ===
// Hand-drawn / organic style icons for the artistic identity

function FloodIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 17c1.5-1.5 3-2 4.5-1s3 1 4.5 0 3-1.5 4.5 0 3 1 4.5-1" stroke="currentColor" strokeWidth="1.8" opacity="0.7"/>
      <path d="M2 21c1.5-1.5 3-2 4.5-1s3 1 4.5 0 3-1.5 4.5 0 3 1 4.5-1" stroke="currentColor" strokeWidth="1.8" opacity="0.4"/>
      <path d="M12 3l-3 7h6l-3 7" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      <circle cx="8" cy="10" r="1.5" fill="currentColor" opacity="0.3"/>
      <circle cx="15" cy="8" r="1" fill="currentColor" opacity="0.2"/>
    </svg>
  )
}

function WildfireIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c-4 0-7-3-7-7 0-3 2-5 4-7 0 2 1.5 3 3 3s2.5-1.5 2-4c3 2 5 5 5 8 0 4-3 7-7 7z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      <path d="M12 22c-1.5 0-3-1.2-3-3 0-1.5 1-2.5 2-3.5.5 1 1.5 1.5 2 1.5s1-0.5 1-1.5c1 1 2 2 2 3.5 0 1.8-1.5 3-4 3z" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/>
    </svg>
  )
}

function HeatIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M12 9c0 1.5-1 2-1 3s.5 2 1 2 1-1 1-2-1-1.5-1-3z" fill="currentColor" opacity="0.3"/>
    </svg>
  )
}

function CoastalIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20c2-1 4-2 6-1s4 1 6 0 4-1.5 6 0" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M2 16c2-1 4-2 6-1s4 1 6 0 4-1.5 6 0" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      <path d="M17 4l-5 8h4l-3 5" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
      <path d="M6 6c0-2 1.5-4 3.5-4S13 4 13 6" stroke="currentColor" strokeWidth="1.8"/>
      <line x1="9.5" y1="6" x2="9.5" y2="14" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function MountainIcon({ size = 20, className = '', style }: { size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 20l5-12 4 5 4-9 5 16H3z" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      <path d="M8 8l2 2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
    </svg>
  )
}

// === COMPASS ROSE (decorative) ===

function CompassRose({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none">
      <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="0.5" opacity="0.15"/>
      <circle cx="50" cy="50" r="35" stroke="currentColor" strokeWidth="0.3" opacity="0.1"/>
      <path d="M50 5 L53 45 L50 50 L47 45Z" fill="currentColor" opacity="0.12"/>
      <path d="M50 95 L47 55 L50 50 L53 55Z" fill="currentColor" opacity="0.06"/>
      <path d="M5 50 L45 47 L50 50 L45 53Z" fill="currentColor" opacity="0.06"/>
      <path d="M95 50 L55 53 L50 50 L55 47Z" fill="currentColor" opacity="0.06"/>
      <text x="50" y="3" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.15" fontFamily="'DM Serif Display', serif">N</text>
      <text x="50" y="99" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.1" fontFamily="'DM Serif Display', serif">S</text>
      <text x="3" y="52" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.1" fontFamily="'DM Serif Display', serif">W</text>
      <text x="97" y="52" textAnchor="middle" fontSize="5" fill="currentColor" opacity="0.1" fontFamily="'DM Serif Display', serif">E</text>
    </svg>
  )
}

// === LOGO ===

function ClimaRouteLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="8" fill="var(--accent-primary)" opacity="0.15"/>
      <path d="M8 22c2-1 4-2 6-1s4 1 6 0 4-1.5 4-1.5" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
      <path d="M10 18c1.5-.8 3-1.5 4.5-.8s3 .8 4.5 0" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
      <path d="M16 6l-2 5h4l-2 5" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="16" cy="16" r="10" stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.2"/>
    </svg>
  )
}

// --- Hooks ---

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// --- Helpers ---

function createStopIcon(index: number, color: string) {
  return L.divIcon({
    className: 'custom-stop-marker',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${color}; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: white;
      font-family: 'Inter', sans-serif;
    ">${index + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

function getRiskColor(risk: number, theme: Theme = 'light'): string {
  if (theme === 'dark') {
    if (risk < 20) return '#34d399'
    if (risk < 40) return '#a3e635'
    if (risk < 60) return '#fbbf24'
    if (risk < 80) return '#fb923c'
    return '#f87171'
  }
  if (risk < 20) return '#2d6a4f'
  if (risk < 40) return '#6b8e23'
  if (risk < 60) return '#c77b2f'
  if (risk < 80) return '#c25e30'
  return '#b44730'
}

function getRiskLabel(risk: number): string {
  if (risk < 20) return 'Low'
  if (risk < 40) return 'Moderate'
  if (risk < 60) return 'Elevated'
  if (risk < 80) return 'High'
  return 'Severe'
}

// --- Sub-Components ---

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

// Theme-aware tile layer that re-renders when theme changes
function ThemedTileLayer() {
  const { theme } = useTheme()
  const map = useMap()

  useEffect(() => {
    map.invalidateSize()
  }, [theme, map])

  if (theme === 'dark') {
    return (
      <TileLayer
        key="dark-tiles"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
    )
  }

  return (
    <TileLayer
      key="light-tiles"
      attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://stamen.com/">Stamen Design</a>'
      url="https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.png"
    />
  )
}

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button
      onClick={toggle}
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className="theme-toggle-thumb">
        {theme === 'light' ? (
          <Sun size={10} color="white" />
        ) : (
          <Moon size={10} color="white" />
        )}
      </div>
    </button>
  )
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
            style={{
              background: 'var(--input-bg)',
              borderColor: 'var(--input-border)',
              color: 'var(--text-primary)',
            }}
            className="w-full border rounded-lg px-3 py-2 text-sm placeholder-[var(--text-muted)] outline-none transition-all duration-200 hover:brightness-105 focus:border-[var(--input-focus-border)]"
          />
          {searching && <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--text-muted)' }} />}
          {query && !searching && (
            <button onClick={() => { setQuery(''); setSuggestions([]); onClear() }} className="absolute right-2.5 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--text-muted)' }}>
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
            className="absolute left-8 right-0 top-full mt-1 rounded-lg overflow-hidden shadow-2xl z-50"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--glass-border-vivid)' }}
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={() => selectSuggestion(s)}
                className="w-full px-3 py-2.5 text-left transition-colors flex items-start gap-2.5 hover:brightness-95"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg-light)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{s.display_name}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RiskMeter({ label, value, icon: Icon, iconColor }: { label: string, value: number, icon: any, iconColor: string }) {
  const { theme } = useTheme()
  return (
    <div className="flex items-center gap-3 py-1.5">
      <Icon size={16} style={{ color: iconColor }} />
      <div className="flex-1">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
          <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-secondary)' }}>{value.toFixed(1)}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--glass-bg-light)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full"
            style={{ backgroundColor: getRiskColor(value, theme) }}
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, unit, icon: Icon }: { label: string, value: string | number, unit?: string, icon: any }) {
  return (
    <div className="illustrated-card p-3">
      <div className="flex items-center gap-1.5 mb-1.5 relative">
        <Icon size={12} style={{ color: 'var(--text-muted)' }} />
        <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-1 relative">
        <span className="text-lg font-semibold font-mono tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</span>
        {unit && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{unit}</span>}
      </div>
    </div>
  )
}

// --- PANEL CONTENT ---

function PanelContent({
  mode, setMode: _setMode, reset: _reset, origin, setOrigin, destination, setDestination,
  tripStops, setTripStops, route, setRoute, multiStop, setMultiStop,
  pointRisk, clickedPoint, loading, optimizing,
  doCalculateRoute, doCalculateTrip, doOptimize, loadPreset, loadTripPreset,
  removeStop, routeColors, isMobile
}: any) {
  const { theme } = useTheme()
  return (
    <div className={`space-y-4 ${isMobile ? 'px-4 pb-8' : 'px-5 pb-5'}`}>
      {/* === ROUTE MODE === */}
      {mode === 'route' && (
        <>
          <div className="space-y-2.5">
            <AddressInput
              value={origin?.label || ''}
              placeholder="Search origin address..."
              color={theme === 'dark' ? '#34d399' : '#2d6a4f'}
              onSelect={(lat: number, lng: number, name: string) => { setOrigin({ lat, lng, label: name }); setRoute(null) }}
              onClear={() => { setOrigin(null); setRoute(null) }}
            />
            <div className="flex justify-center">
              <div className="ornament-divider w-full mx-4" />
            </div>
            <AddressInput
              value={destination?.label || ''}
              placeholder="Search destination address..."
              color={theme === 'dark' ? '#f87171' : '#b44730'}
              onSelect={(lat: number, lng: number, name: string) => { setDestination({ lat, lng, label: name }); setRoute(null) }}
              onClear={() => { setDestination(null); setRoute(null) }}
            />
          </div>

          <button
            onClick={doCalculateRoute}
            disabled={!origin || !destination || loading}
            className="w-full py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 text-white disabled:opacity-40"
            style={{
              background: !origin || !destination || loading ? 'var(--surface-elevated)' : `linear-gradient(135deg, var(--btn-primary-from), var(--btn-primary-to))`,
              boxShadow: !origin || !destination || loading ? 'none' : `0 4px 16px var(--btn-primary-shadow)`,
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Navigation size={15} />}
            {loading ? 'Analyzing...' : 'Find Climate-Safe Route'}
          </button>

          {/* Demo Routes */}
          {!route && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap size={11} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>Demo Routes</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => loadPreset(p)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left group"
                    style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--glass-border-vivid)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.from_label} to {p.to_label}</div>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2" style={{ background: 'var(--glass-bg-light)', color: 'var(--text-muted)' }}>{p.tag}</span>
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
                  <div className="illustrated-card p-4">
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield size={14} style={{ color: 'var(--accent-safe)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--accent-safe)' }}>Climate-Safe Route Found</span>
                      </div>
                      <div className="text-3xl font-bold font-mono tracking-tight gradient-text-safe tabular-nums">
                        {route.risk_reduction_pct.toFixed(1)}%
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--accent-safe)', opacity: 0.6 }}>risk reduction vs standard route</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Safe Distance" value={route.climate_safe?.distance_mi || route.standard.distance_mi} unit="mi" icon={RouteIcon} />
                  <StatCard label="Est. Time" value={route.climate_safe?.estimated_time_hrs || route.standard.estimated_time_hrs} unit="hrs" icon={Clock} />
                  <StatCard label="Avg Risk" value={route.climate_safe?.total_risk || route.standard.total_risk} unit="/100" icon={Gauge} />
                  <StatCard label="Std Risk" value={route.standard.total_risk} unit="/100" icon={AlertTriangle} />
                </div>

                {route.climate_safe && route.climate_safe.risks.length > 0 && (() => {
                  const r = route.climate_safe.risks
                  const avg = {
                    flood: r.reduce((s: number, x: any) => s + x.flood_risk, 0) / r.length,
                    wildfire: r.reduce((s: number, x: any) => s + x.wildfire_risk, 0) / r.length,
                    heat: r.reduce((s: number, x: any) => s + x.heat_risk, 0) / r.length,
                    coastal: r.reduce((s: number, x: any) => s + x.coastal_exposure, 0) / r.length,
                  }
                  return (
                    <div className="illustrated-card p-4 space-y-1">
                      <h3 className="text-[10px] uppercase tracking-wider font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Risk Breakdown</h3>
                      <RiskMeter label="Flood Risk" value={avg.flood} icon={FloodIcon} iconColor={theme === 'dark' ? '#60a5fa' : '#2563eb'} />
                      <RiskMeter label="Wildfire Risk" value={avg.wildfire} icon={WildfireIcon} iconColor={theme === 'dark' ? '#fb923c' : '#c25e30'} />
                      <RiskMeter label="Heat Anomaly" value={avg.heat} icon={HeatIcon} iconColor={theme === 'dark' ? '#f87171' : '#b44730'} />
                      <RiskMeter label="Coastal Exposure" value={avg.coastal} icon={CoastalIcon} iconColor={theme === 'dark' ? '#22d3ee' : '#0d6e8a'} />
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
            {tripStops.map((stop: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <AddressInput
                    value={stop.label}
                    placeholder={i === 0 ? 'Starting point...' : i === tripStops.length - 1 ? 'Final destination...' : `Stop ${i + 1}...`}
                    color={routeColors[i % routeColors.length]}
                    index={i}
                    onSelect={(lat: number, lng: number, name: string) => {
                      setTripStops((prev: any[]) => prev.map((s: any, j: number) => j === i ? { lat, lng, label: name } : s))
                      setMultiStop(null)
                    }}
                    onClear={() => removeStop(i)}
                  />
                </div>
                {tripStops.length > 2 && (
                  <button onClick={() => removeStop(i)} className="transition-colors p-1" style={{ color: 'var(--text-muted)' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setTripStops((prev: any[]) => [...prev, { lat: 0, lng: 0, label: '' }])}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed text-xs transition-all"
              style={{ borderColor: 'var(--glass-border-vivid)', color: 'var(--text-muted)' }}
            >
              <Plus size={13} /> Add Stop
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={doCalculateTrip}
              disabled={tripStops.filter((s: any) => s.lat !== 0).length < 2 || loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 text-white disabled:opacity-40"
              style={{
                background: loading ? 'var(--surface-elevated)' : `linear-gradient(135deg, var(--btn-primary-from), var(--btn-primary-to))`,
                boxShadow: loading ? 'none' : `0 4px 16px var(--btn-primary-shadow)`,
              }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RouteIcon size={15} />}
              {loading ? 'Planning...' : 'Plan Trip'}
            </button>
            <button
              onClick={doOptimize}
              disabled={tripStops.filter((s: any) => s.lat !== 0).length < 3 || optimizing}
              className="px-4 py-2.5 rounded-xl border disabled:opacity-30 text-sm font-medium transition-all flex items-center gap-2"
              style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
              title="Optimize stop order"
            >
              {optimizing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} style={{ color: 'var(--accent-warning)' }} />}
            </button>
          </div>

          {/* Trip Presets */}
          {!multiStop && tripStops.length === 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap size={11} style={{ color: 'var(--text-muted)' }} />
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>Demo Trips</span>
              </div>
              {ROAD_TRIP_PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => loadTripPreset(p)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left"
                  style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
                >
                  <div>
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{p.stops.length} stops</div>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--glass-bg-light)', color: 'var(--text-muted)' }}>{p.tag}</span>
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
                <div className="illustrated-card p-4">
                  <div className="relative">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={14} style={{ color: 'var(--accent-safe)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--accent-safe)' }}>Trip Optimized</span>
                    </div>
                    <div className="text-2xl font-bold font-mono tracking-tight gradient-text-safe tabular-nums">
                      {multiStop.total_risk_reduction_pct.toFixed(1)}%
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--accent-safe)', opacity: 0.6 }}>avg risk reduction across all legs</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Total Dist" value={multiStop.total_distance_mi} unit="mi" icon={RouteIcon} />
                  <StatCard label="Est. Time" value={multiStop.total_time_hrs} unit="hrs" icon={Clock} />
                  <StatCard label="Avg Risk" value={multiStop.avg_risk} unit="/100" icon={Gauge} />
                </div>

                <div className="space-y-2">
                  <h3 className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>Leg Details</h3>
                  {multiStop.legs.map((leg: any, i: number) => (
                    <div key={i} className="illustrated-card p-3 flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white relative" style={{ background: routeColors[i % routeColors.length] }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 relative">
                        <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {tripStops[i]?.label || `Stop ${i + 1}`}
                          <ArrowRight size={10} className="inline mx-1" style={{ color: 'var(--text-muted)' }} />
                          {tripStops[i + 1]?.label || `Stop ${i + 2}`}
                        </div>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{leg.climate_safe?.distance_mi || leg.standard.distance_mi} mi</span>
                          <span className="text-[10px] font-medium" style={{ color: getRiskColor(leg.climate_safe?.total_risk || leg.standard.total_risk, theme) }}>
                            Risk: {leg.climate_safe?.total_risk || leg.standard.total_risk}
                          </span>
                          {leg.risk_reduction_pct !== undefined && leg.risk_reduction_pct > 0 && (
                            <span className="text-[10px]" style={{ color: 'var(--accent-safe)' }}>-{leg.risk_reduction_pct.toFixed(0)}%</span>
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
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--glass-bg-light)' }}>
                <MapPinned size={20} style={{ color: 'var(--text-muted)' }} />
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {isMobile ? 'Tap anywhere on the map to analyze climate risk.' : 'Click anywhere on the map to analyze climate risk at that location.'}
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
                <div className="illustrated-card p-4"
                  style={{ borderColor: `${getRiskColor(pointRisk.overall_risk, theme)}30` }}
                >
                  <div className="flex items-center justify-between mb-3 relative">
                    <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>Risk Assessment</span>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full font-semibold" style={{
                      background: `${getRiskColor(pointRisk.overall_risk, theme)}15`,
                      color: getRiskColor(pointRisk.overall_risk, theme),
                      border: `1px solid ${getRiskColor(pointRisk.overall_risk, theme)}25`
                    }}>
                      {getRiskLabel(pointRisk.overall_risk)}
                    </span>
                  </div>
                  <div className="text-4xl font-bold font-mono tracking-tight tabular-nums relative" style={{ color: getRiskColor(pointRisk.overall_risk, theme) }}>
                    {pointRisk.overall_risk}
                    <span className="text-sm ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>/100</span>
                  </div>
                  {clickedPoint && (
                    <div className="text-[10px] font-mono mt-2 relative" style={{ color: 'var(--text-muted)' }}>
                      {clickedPoint[0].toFixed(4)}, {clickedPoint[1].toFixed(4)}
                    </div>
                  )}
                </div>

                <div className="illustrated-card p-4 space-y-1">
                  <RiskMeter label="Flood Risk" value={pointRisk.flood_risk} icon={FloodIcon} iconColor={theme === 'dark' ? '#60a5fa' : '#2563eb'} />
                  <RiskMeter label="Wildfire Risk" value={pointRisk.wildfire_risk} icon={WildfireIcon} iconColor={theme === 'dark' ? '#fb923c' : '#c25e30'} />
                  <RiskMeter label="Heat Anomaly" value={pointRisk.heat_risk} icon={HeatIcon} iconColor={theme === 'dark' ? '#f87171' : '#b44730'} />
                  <RiskMeter label="Coastal Exposure" value={pointRisk.coastal_exposure} icon={CoastalIcon} iconColor={theme === 'dark' ? '#22d3ee' : '#0d6e8a'} />
                </div>

                <div className="flex items-center gap-2 px-1">
                  <MountainIcon size={13} className="" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Elevation: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{pointRisk.elevation_ft.toLocaleString()} ft</span>
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
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

function AppContent() {
  const isMobile = useIsMobile()
  const { theme } = useTheme()
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

  const [sheetState, setSheetState] = useState<'peek' | 'half' | 'full'>('half')

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (mode === 'explore') {
      setPointRisk(scoreRisk(lat, lng))
      setClickedPoint([lat, lng])
      if (isMobile) setSheetState('half')
    } else if (mode === 'route') {
      if (!origin) {
        setOrigin({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
      } else if (!destination) {
        setDestination({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
      }
    } else if (mode === 'trip') {
      setTripStops(prev => [...prev, { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` }])
    }
  }, [mode, origin, destination, isMobile])

  const doCalculateRoute = useCallback(() => {
    if (!origin || !destination) return
    setLoading(true)
    requestAnimationFrame(() => {
      const result = calculateRoute(origin.lat, origin.lng, destination.lat, destination.lng)
      setRoute(result)
      setLoading(false)
      if (isMobile) setSheetState('half')
      const allCoords = [
        ...result.standard.coordinates,
        ...(result.climate_safe?.coordinates || [])
      ]
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [origin, destination, isMobile])

  const doCalculateTrip = useCallback(() => {
    if (tripStops.length < 2) return
    setLoading(true)
    requestAnimationFrame(() => {
      const result = calculateMultiStopRoute(tripStops.map(s => [s.lat, s.lng] as [number, number]))
      setMultiStop(result)
      setLoading(false)
      if (isMobile) setSheetState('half')
      const allCoords = result.legs.flatMap(l =>
        (l.climate_safe?.coordinates || l.standard.coordinates)
      )
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [tripStops, isMobile])

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
      if (isMobile) setSheetState('half')
      const allCoords = [
        ...result.standard.coordinates,
        ...(result.climate_safe?.coordinates || [])
      ]
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [isMobile])

  const loadTripPreset = useCallback((preset: typeof ROAD_TRIP_PRESETS[0]) => {
    const stops = preset.stops.map(s => ({ lat: s.lat, lng: s.lng, label: s.label }))
    setTripStops(stops)
    setMode('trip')
    setLoading(true)
    requestAnimationFrame(() => {
      const result = calculateMultiStopRoute(stops.map(s => [s.lat, s.lng] as [number, number]))
      setMultiStop(result)
      setLoading(false)
      if (isMobile) setSheetState('half')
      const allCoords = result.legs.flatMap(l => (l.climate_safe?.coordinates || l.standard.coordinates))
      if (allCoords.length > 0) {
        setMapBounds(L.latLngBounds(allCoords.map(c => [c[0], c[1]] as [number, number])))
      }
    })
  }, [isMobile])

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

  const routeColors = theme === 'dark'
    ? ['#34d399', '#60a5fa', '#c084fc', '#fb923c', '#f87171', '#facc15', '#2dd4bf', '#e879f9']
    : ['#2d6a4f', '#2563eb', '#7c3aed', '#c25e30', '#b44730', '#92700c', '#0d6e8a', '#a21caf']

  const panelProps = {
    mode, setMode, reset, origin, setOrigin, destination, setDestination,
    tripStops, setTripStops, route, setRoute, multiStop, setMultiStop,
    pointRisk, clickedPoint, loading, optimizing,
    doCalculateRoute, doCalculateTrip, doOptimize, loadPreset, loadTripPreset,
    removeStop, routeColors, isMobile
  }

  const sheetHeights = {
    peek: 140,
    half: Math.round(window.innerHeight * 0.5),
    full: window.innerHeight - 40,
  }

  const cycleSheet = () => {
    if (sheetState === 'peek') setSheetState('half')
    else if (sheetState === 'half') setSheetState('full')
    else setSheetState('peek')
  }

  const handleSheetDragEnd = (_: any, info: PanInfo) => {
    const vy = info.velocity.y
    const dy = info.offset.y
    if (vy > 400 || dy > 80) {
      if (sheetState === 'full') setSheetState('half')
      else setSheetState('peek')
    } else if (vy < -400 || dy < -80) {
      if (sheetState === 'peek') setSheetState('half')
      else setSheetState('full')
    }
  }

  const hintText = (() => {
    if (mode === 'explore') return 'Tap anywhere to analyze climate risk'
    if (mode === 'route' && !origin) return 'Search or tap to set origin'
    if (mode === 'route' && origin && !destination) return 'Tap to set destination'
    if (mode === 'route' && origin && destination && !route) return 'Tap "Find Climate-Safe Route"'
    if (mode === 'route' && route) return 'Route analyzed. Green = safer.'
    if (mode === 'trip' && tripStops.length === 0) return 'Add stops or try a demo trip'
    if (mode === 'trip' && tripStops.length > 0 && !multiStop) return 'Tap map to add stops'
    if (mode === 'trip' && multiStop) return `${tripStops.length} stops optimized`
    return ''
  })()

  const safeColor = theme === 'dark' ? '#34d399' : '#2d6a4f'
  const dangerColor = theme === 'dark' ? '#f87171' : '#b44730'

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden" style={{ background: 'var(--surface-base)', color: 'var(--text-primary)' }}>

      {/* === DESKTOP SIDEBAR === */}
      {!isMobile && (
        <>
          <AnimatePresence mode="wait">
            {showPanel && (
              <motion.div
                initial={{ x: -380, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -380, opacity: 0 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="w-[380px] flex-shrink-0 flex flex-col glass-sidebar z-20 relative"
              >
                {/* Decorative compass in background */}
                <div className="absolute top-8 right-4 w-32 h-32 pointer-events-none compass-rose" style={{ color: 'var(--text-primary)' }}>
                  <CompassRose />
                </div>

                {/* Header */}
                <div className="px-5 pt-5 pb-4 relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <ClimaRouteLogo size={32} />
                      <div>
                        <h1 className="text-[15px] font-semibold tracking-tight" style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>ClimaRoute</h1>
                        <p className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>AI Climate Risk Router</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ThemeToggle />
                      <button onClick={reset} className="text-[10px] flex items-center gap-1 transition-colors px-2 py-1 rounded-md" style={{ color: 'var(--text-muted)' }}>
                        <RotateCcw size={11} /> Reset
                      </button>
                    </div>
                  </div>

                  {/* Mode Tabs */}
                  <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'var(--glass-bg-light)' }}>
                    {([
                      { id: 'route' as AppMode, label: 'Route', icon: Navigation },
                      { id: 'trip' as AppMode, label: 'Road Trip', icon: RouteIcon },
                      { id: 'explore' as AppMode, label: 'Explore', icon: MapPinned },
                    ]).map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => { setMode(tab.id); reset() }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all duration-200"
                        style={{
                          background: mode === tab.id ? 'var(--tab-active-bg)' : 'transparent',
                          color: mode === tab.id ? 'var(--tab-active-text)' : 'var(--tab-inactive-text)',
                        }}
                      >
                        <tab.icon size={13} />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  <PanelContent {...panelProps} />
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t" style={{ borderColor: 'var(--divider-line)', background: 'var(--glass-bg)' }}>
                  <div className="flex items-center gap-1.5">
                    <Info size={10} style={{ color: 'var(--text-muted)' }} />
                    <span className="text-[9px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>Risk scores are ML-modeled estimates. Not for emergency decisions.</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle Panel Button */}
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="absolute top-4 left-4 z-30 rounded-lg p-2 transition-all"
            style={{
              left: showPanel ? '392px' : '16px',
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--glass-border-vivid)',
            }}
          >
            <ChevronRight size={16} className={`transition-transform duration-300 ${showPanel ? 'rotate-180' : ''}`} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </>
      )}

      {/* === MAP === */}
      <div className="flex-1 relative" style={{ zIndex: 1 }}>
        <MapContainer
          center={[39.0, -98.0]}
          zoom={isMobile ? 4 : 5}
          className="h-full w-full"
          zoomControl={false}
        >
          <ThemedTileLayer />
          <MapClickHandler onMapClick={handleMapClick} />
          <FitBounds bounds={mapBounds} />

          {/* Route Mode Markers */}
          {mode === 'route' && origin && (
            <CircleMarker center={[origin.lat, origin.lng]} radius={8}
              pathOptions={{ color: safeColor, fillColor: safeColor, fillOpacity: 0.9, weight: 3 }}>
              <Popup><div style={{ color: 'var(--popup-text)', fontSize: 12 }}><strong>Origin</strong><br/>{origin.label}</div></Popup>
            </CircleMarker>
          )}
          {mode === 'route' && destination && (
            <CircleMarker center={[destination.lat, destination.lng]} radius={8}
              pathOptions={{ color: dangerColor, fillColor: dangerColor, fillOpacity: 0.9, weight: 3 }}>
              <Popup><div style={{ color: 'var(--popup-text)', fontSize: 12 }}><strong>Destination</strong><br/>{destination.label}</div></Popup>
            </CircleMarker>
          )}

          {/* Route Lines */}
          {mode === 'route' && route && (
            <>
              <Polyline
                positions={route.standard.coordinates.map(c => [c[0], c[1]] as [number, number])}
                pathOptions={{ color: dangerColor, weight: 3, opacity: 0.4, dashArray: '8, 8' }}
              />
              {route.climate_safe && (
                <Polyline
                  positions={route.climate_safe.coordinates.map(c => [c[0], c[1]] as [number, number])}
                  pathOptions={{ color: safeColor, weight: 4, opacity: 0.9 }}
                />
              )}
              {route.climate_safe?.coordinates.map((coord, i) => {
                const risk = route.climate_safe!.risks[i]
                if (!risk || i % 4 !== 0) return null
                return (
                  <CircleMarker key={`r-${i}`} center={[coord[0], coord[1]]} radius={4}
                    pathOptions={{ color: getRiskColor(risk.overall_risk, theme), fillColor: getRiskColor(risk.overall_risk, theme), fillOpacity: 0.5, weight: 1 }}>
                    <Popup>
                      <div style={{ color: 'var(--popup-text)', fontSize: 12 }}>
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
                <Popup><div style={{ color: 'var(--popup-text)', fontSize: 12 }}><strong>Stop {i + 1}</strong><br/>{stop.label}</div></Popup>
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
              pathOptions={{ color: getRiskColor(pointRisk?.overall_risk || 0, theme), fillColor: getRiskColor(pointRisk?.overall_risk || 0, theme), fillOpacity: 0.3, weight: 2 }}>
              <Popup>
                <div style={{ color: 'var(--popup-text)', fontSize: 12 }}>
                  <strong>Risk: {pointRisk?.overall_risk}</strong> ({pointRisk?.risk_level})<br/>
                  Flood: {pointRisk?.flood_risk} | Fire: {pointRisk?.wildfire_risk}<br/>
                  Heat: {pointRisk?.heat_risk} | Coast: {pointRisk?.coastal_exposure}
                </div>
              </Popup>
            </CircleMarker>
          )}
        </MapContainer>

        {/* Map Legend - desktop only */}
        {!isMobile && (
          <div className="absolute bottom-6 right-6 rounded-xl px-4 py-3 z-[1000]" style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(24px) saturate(180%)',
            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid var(--glass-border-vivid)',
            boxShadow: 'var(--card-shadow)',
          }}>
            <div className="text-[9px] uppercase tracking-wider mb-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Risk Level</div>
            <div className="flex gap-2.5">
              {[
                { label: 'Low', color: getRiskColor(10, theme) },
                { label: 'Mod', color: getRiskColor(30, theme) },
                { label: 'Elev', color: getRiskColor(50, theme) },
                { label: 'High', color: getRiskColor(70, theme) },
                { label: 'Severe', color: getRiskColor(90, theme) },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                </div>
              ))}
            </div>
            {mode === 'route' && (
              <div className="flex gap-3 mt-2 pt-2" style={{ borderTop: `1px solid var(--divider-line)` }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-[2px] rounded opacity-50" style={{ background: dangerColor }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Standard</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-[2px] rounded" style={{ background: safeColor }} />
                  <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Climate-Safe</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode hint */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 rounded-full px-4 py-2 z-[1000] ${isMobile ? 'top-3' : 'top-4'}`}
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            border: '1px solid var(--glass-border-vivid)',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>{hintText}</span>
        </div>
      </div>

      {/* === MOBILE BOTTOM SHEET === */}
      {isMobile && (
        <motion.div
          className="fixed bottom-0 left-0 right-0 z-30 flex flex-col mobile-sheet"
          style={{
            background: 'var(--surface-raised)',
            borderTop: '1px solid var(--glass-border-vivid)',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
            borderRadius: '20px 20px 0 0',
          }}
          animate={{ height: sheetHeights[sheetState] }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.1}
          onDragEnd={handleSheetDragEnd}
        >
          {/* Drag handle */}
          <div
            className="flex flex-col items-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing flex-shrink-0"
            onClick={cycleSheet}
          >
            <div className="w-9 h-1 rounded-full mb-2" style={{ background: 'var(--glass-border-vivid)' }} />
          </div>

          {/* Header with tabs + reset + theme toggle */}
          <div className="px-4 pb-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <ClimaRouteLogo size={24} />
                <span className="text-sm font-semibold tracking-tight" style={{ fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>ClimaRoute</span>
              </div>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button onClick={reset} className="text-[10px] flex items-center gap-1 px-2 py-1 rounded-md" style={{ color: 'var(--text-muted)' }}>
                  <RotateCcw size={10} /> Reset
                </button>
              </div>
            </div>

            {/* Mode Tabs */}
            <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: 'var(--glass-bg-light)' }}>
              {([
                { id: 'route' as AppMode, label: 'Route', icon: Navigation },
                { id: 'trip' as AppMode, label: 'Trip', icon: RouteIcon },
                { id: 'explore' as AppMode, label: 'Explore', icon: MapPinned },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setMode(tab.id); reset() }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all duration-200"
                  style={{
                    background: mode === tab.id ? 'var(--tab-active-bg)' : 'transparent',
                    color: mode === tab.id ? 'var(--tab-active-text)' : 'var(--tab-inactive-text)',
                  }}
                >
                  <tab.icon size={12} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain">
            <PanelContent {...panelProps} />
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}
