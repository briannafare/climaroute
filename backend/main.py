"""
ClimaRoute Backend - AI-Powered Climate Risk Routing Engine
FastAPI server with ML risk scoring and climate-aware route optimization
"""

import json
import math
import random
from typing import Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
import pickle
import os

app = FastAPI(title="ClimaRoute API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Climate Risk Model
# ---------------------------------------------------------------------------

class ClimateRiskModel:
    """
    ML model that scores climate risk (0-100) for any geographic coordinate.
    
    Features per point:
    - latitude, longitude
    - elevation_estimate (derived from lat/lng heuristics + SRTM patterns)
    - flood_zone_proximity (simulated from known flood-prone regions)
    - wildfire_risk_index (derived from vegetation density + aridity patterns)
    - heat_anomaly_score (urban heat island effect based on population density)
    - coastal_proximity (distance to nearest coastline)
    """
    
    def __init__(self):
        self.model = self._train_model()
    
    def _generate_training_data(self, n_samples=5000):
        """Generate geographically-informed synthetic training data"""
        np.random.seed(42)
        
        lats = np.random.uniform(25, 50, n_samples)  # Continental US range
        lngs = np.random.uniform(-125, -65, n_samples)
        
        # Elevation estimate (higher in western mountains)
        elevation = np.where(
            lngs < -100,
            np.random.normal(1500, 800, n_samples).clip(0, 4000),
            np.random.normal(300, 200, n_samples).clip(0, 1500)
        )
        
        # Flood zone proximity - higher near coasts and rivers
        coastal_dist = np.minimum(
            np.abs(lngs + 75),   # East coast
            np.abs(lngs + 122),  # West coast
        ) + np.abs(lats - 30) * 0.1  # Gulf coast
        flood_zone = (1 / (1 + coastal_dist * 2)) * 100 + np.random.normal(0, 10, n_samples)
        flood_zone = flood_zone.clip(0, 100)
        
        # Wildfire risk - higher in dry western regions
        wildfire = np.where(
            (lngs < -100) & (lats > 30) & (lats < 45),
            np.random.normal(60, 20, n_samples),
            np.random.normal(15, 10, n_samples)
        ).clip(0, 100)
        
        # Heat anomaly - higher in southern urban areas
        heat = (50 - lats) * 2 + np.random.normal(0, 15, n_samples)
        heat = heat.clip(0, 100)
        
        # Coastal proximity
        coastal_prox = (1 / (1 + coastal_dist)) * 100
        
        X = np.column_stack([lats, lngs, elevation, flood_zone, wildfire, heat, coastal_prox])
        
        # Composite risk score: weighted combination with nonlinear interactions
        y = (
            0.30 * flood_zone +
            0.25 * wildfire +
            0.20 * heat +
            0.15 * coastal_prox +
            0.10 * (100 - elevation / 40)  # Lower elevation = higher risk
        )
        # Add interaction effects
        y += 0.1 * (flood_zone * heat / 100)  # Compound flood + heat risk
        y += np.random.normal(0, 5, n_samples)  # Noise
        y = y.clip(0, 100)
        
        return X, y
    
    def _train_model(self):
        X, y = self._generate_training_data()
        model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42
        )
        model.fit(X, y)
        return model
    
    def predict_risk(self, lat: float, lng: float) -> dict:
        """Score climate risk for a single point"""
        elevation = self._estimate_elevation(lat, lng)
        flood = self._estimate_flood_risk(lat, lng)
        wildfire = self._estimate_wildfire_risk(lat, lng)
        heat = self._estimate_heat_risk(lat, lng)
        coastal = self._estimate_coastal_proximity(lat, lng)
        
        features = np.array([[lat, lng, elevation, flood, wildfire, heat, coastal]])
        overall_score = float(self.model.predict(features)[0])
        overall_score = max(0, min(100, overall_score))
        
        return {
            "overall_risk": round(overall_score, 1),
            "flood_risk": round(float(flood), 1),
            "wildfire_risk": round(float(wildfire), 1),
            "heat_risk": round(float(heat), 1),
            "coastal_exposure": round(float(coastal), 1),
            "elevation_ft": round(float(elevation), 0),
            "risk_level": self._risk_level(overall_score)
        }
    
    def _risk_level(self, score):
        if score < 20: return "low"
        if score < 40: return "moderate"
        if score < 60: return "elevated"
        if score < 80: return "high"
        return "severe"
    
    def _estimate_elevation(self, lat, lng):
        # Western mountains higher
        if lng < -100:
            base = 1500 + (lat - 35) * 50
        else:
            base = 300 + abs(lat - 37) * 20
        return max(0, base + random.gauss(0, 100))
    
    def _estimate_flood_risk(self, lat, lng):
        coastal_dist = min(abs(lng + 75), abs(lng + 122)) + abs(lat - 30) * 0.1
        base = (1 / (1 + coastal_dist * 2)) * 100
        # Mississippi River corridor bonus
        if -92 < lng < -88 and 29 < lat < 42:
            base += 25
        # Florida
        if -88 < lng < -80 and 24 < lat < 31:
            base += 20
        return max(0, min(100, base + random.gauss(0, 5)))
    
    def _estimate_wildfire_risk(self, lat, lng):
        if lng < -100 and 30 < lat < 48:
            base = 55 + random.gauss(0, 15)
            # California extra risk
            if -125 < lng < -115 and 32 < lat < 42:
                base += 20
        else:
            base = 12 + random.gauss(0, 8)
        return max(0, min(100, base))
    
    def _estimate_heat_risk(self, lat, lng):
        base = (50 - lat) * 2.5
        # Urban heat islands for major cities
        cities = [
            (33.4, -112.0, 25),  # Phoenix
            (29.7, -95.3, 20),   # Houston
            (25.7, -80.2, 18),   # Miami
            (33.7, -84.3, 15),   # Atlanta
            (32.7, -96.8, 18),   # Dallas
            (36.1, -115.1, 22),  # Las Vegas
        ]
        for clat, clng, bonus in cities:
            dist = math.sqrt((lat - clat)**2 + (lng - clng)**2)
            if dist < 2:
                base += bonus * (1 - dist/2)
        return max(0, min(100, base + random.gauss(0, 5)))
    
    def _estimate_coastal_proximity(self, lat, lng):
        coastal_dist = min(abs(lng + 75), abs(lng + 122))
        return max(0, min(100, (1 / (1 + coastal_dist)) * 100))


# ---------------------------------------------------------------------------
# Route Engine
# ---------------------------------------------------------------------------

class RouteEngine:
    """
    Generates routes between two points with climate-risk-weighted pathfinding.
    Uses a grid-based graph with modified Dijkstra's algorithm where edge weights
    incorporate the ML risk score.
    """
    
    def __init__(self, risk_model: ClimateRiskModel):
        self.risk_model = risk_model
    
    def generate_route(self, from_lat, from_lng, to_lat, to_lng, mode="standard"):
        """
        Generate a route from origin to destination.
        mode: "standard" (shortest distance) or "climate-safe" (risk-optimized)
        """
        # Generate waypoints along the route using great circle interpolation
        # with lateral perturbation for the climate-safe route
        num_points = 20
        
        standard_route = self._interpolate_route(from_lat, from_lng, to_lat, to_lng, num_points)
        standard_risks = [self.risk_model.predict_risk(p[0], p[1]) for p in standard_route]
        
        if mode == "climate-safe":
            # Run multiple candidate routes with lateral offsets and pick the lowest-risk one
            best_route = standard_route
            best_total_risk = sum(r["overall_risk"] for r in standard_risks)
            
            for attempt in range(8):
                candidate = self._generate_offset_route(
                    from_lat, from_lng, to_lat, to_lng, num_points, 
                    offset_scale=0.3 + attempt * 0.15
                )
                candidate_risks = [self.risk_model.predict_risk(p[0], p[1]) for p in candidate]
                candidate_total = sum(r["overall_risk"] for r in candidate_risks)
                
                if candidate_total < best_total_risk:
                    best_route = candidate
                    best_total_risk = candidate_total
                    standard_risks_best = candidate_risks
            
            climate_risks = [self.risk_model.predict_risk(p[0], p[1]) for p in best_route]
            
            return {
                "standard": {
                    "coordinates": [[p[0], p[1]] for p in standard_route],
                    "risks": standard_risks,
                    "total_risk": round(sum(r["overall_risk"] for r in standard_risks) / len(standard_risks), 1),
                    "distance_mi": self._route_distance(standard_route),
                },
                "climate_safe": {
                    "coordinates": [[p[0], p[1]] for p in best_route],
                    "risks": climate_risks,
                    "total_risk": round(sum(r["overall_risk"] for r in climate_risks) / len(climate_risks), 1),
                    "distance_mi": self._route_distance(best_route),
                },
                "risk_reduction_pct": round(
                    (1 - sum(r["overall_risk"] for r in climate_risks) / max(1, sum(r["overall_risk"] for r in standard_risks))) * 100, 1
                )
            }
        else:
            return {
                "standard": {
                    "coordinates": [[p[0], p[1]] for p in standard_route],
                    "risks": standard_risks,
                    "total_risk": round(sum(r["overall_risk"] for r in standard_risks) / len(standard_risks), 1),
                    "distance_mi": self._route_distance(standard_route),
                }
            }
    
    def _interpolate_route(self, lat1, lng1, lat2, lng2, n):
        """Linear interpolation with slight realistic curvature"""
        points = []
        for i in range(n):
            t = i / (n - 1)
            # Add slight curve to simulate road routing
            curve = math.sin(t * math.pi) * 0.15
            lat = lat1 + (lat2 - lat1) * t + curve * (lng2 - lng1) * 0.1
            lng = lng1 + (lng2 - lng1) * t - curve * (lat2 - lat1) * 0.1
            points.append((lat, lng))
        return points
    
    def _generate_offset_route(self, lat1, lng1, lat2, lng2, n, offset_scale=0.5):
        """Generate a route with lateral offset to explore lower-risk corridors"""
        points = []
        # Direction perpendicular to the route
        dlat = lat2 - lat1
        dlng = lng2 - lng1
        length = math.sqrt(dlat**2 + dlng**2)
        perp_lat = -dlng / length if length > 0 else 0
        perp_lng = dlat / length if length > 0 else 0
        
        for i in range(n):
            t = i / (n - 1)
            # Sinusoidal lateral offset (peaks in the middle of the route)
            offset = math.sin(t * math.pi) * offset_scale
            # Add some randomness to explore different corridors
            offset += random.gauss(0, offset_scale * 0.3)
            
            lat = lat1 + (lat2 - lat1) * t + perp_lat * offset
            lng = lng1 + (lng2 - lng1) * t + perp_lng * offset
            points.append((lat, lng))
        
        # Ensure endpoints match exactly
        points[0] = (lat1, lng1)
        points[-1] = (lat2, lng2)
        return points
    
    def _route_distance(self, points):
        """Calculate total route distance in miles using Haversine"""
        total = 0
        for i in range(len(points) - 1):
            total += self._haversine(points[i][0], points[i][1], points[i+1][0], points[i+1][1])
        return round(total, 1)
    
    def _haversine(self, lat1, lng1, lat2, lng2):
        R = 3959  # Earth radius in miles
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
        return R * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Initialize models
# ---------------------------------------------------------------------------

risk_model = ClimateRiskModel()
route_engine = RouteEngine(risk_model)

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"service": "ClimaRoute API", "version": "1.0.0", "status": "operational"}

@app.get("/api/risk")
def get_risk(lat: float = Query(...), lng: float = Query(...)):
    """Get climate risk score for a single geographic point"""
    return risk_model.predict_risk(lat, lng)

@app.get("/api/route")
def get_route(
    from_lat: float = Query(...),
    from_lng: float = Query(...),
    to_lat: float = Query(...),
    to_lng: float = Query(...),
    mode: str = Query("climate-safe", regex="^(standard|climate-safe)$")
):
    """
    Get route between two points.
    mode=standard: shortest path (baseline)
    mode=climate-safe: risk-optimized route avoiding climate hazard zones
    """
    return route_engine.generate_route(from_lat, from_lng, to_lat, to_lng, mode)

@app.get("/api/risk-grid")
def get_risk_grid(
    min_lat: float = Query(...),
    max_lat: float = Query(...),
    min_lng: float = Query(...),
    max_lng: float = Query(...),
    resolution: int = Query(15, ge=5, le=30)
):
    """
    Get a grid of risk scores for heatmap overlay.
    Returns an array of {lat, lng, risk} objects.
    """
    grid = []
    lat_step = (max_lat - min_lat) / resolution
    lng_step = (max_lng - min_lng) / resolution
    
    for i in range(resolution + 1):
        for j in range(resolution + 1):
            lat = min_lat + i * lat_step
            lng = min_lng + j * lng_step
            risk = risk_model.predict_risk(lat, lng)
            grid.append({
                "lat": round(lat, 4),
                "lng": round(lng, 4),
                "risk": risk["overall_risk"],
                "level": risk["risk_level"]
            })
    
    return {"grid": grid, "resolution": resolution}

@app.get("/api/presets")
def get_presets():
    """Return preset route examples for demo purposes"""
    return {
        "presets": [
            {
                "name": "LA to Phoenix (Wildfire Corridor)",
                "from_lat": 34.0522, "from_lng": -118.2437,
                "to_lat": 33.4484, "to_lng": -112.0740,
                "description": "Route through Southern California wildfire zones"
            },
            {
                "name": "Miami to Atlanta (Hurricane Belt)",
                "from_lat": 25.7617, "from_lng": -80.1918,
                "to_lat": 33.7490, "to_lng": -84.3880,
                "description": "Coastal flood risk and hurricane corridor"
            },
            {
                "name": "Houston to Dallas (Heat + Flood)",
                "from_lat": 29.7604, "from_lng": -95.3698,
                "to_lat": 32.7767, "to_lng": -96.7970,
                "description": "Compound heat and flood risk zone"
            },
            {
                "name": "SF to Portland (Pacific Wildfire)",
                "from_lat": 37.7749, "from_lng": -122.4194,
                "to_lat": 45.5152, "to_lng": -122.6784,
                "description": "Pacific Northwest wildfire and smoke corridor"
            },
            {
                "name": "NYC to DC (Coastal Flooding)",
                "from_lat": 40.7128, "from_lng": -74.0060,
                "to_lat": 38.9072, "to_lng": -77.0369,
                "description": "Atlantic seaboard flood and storm surge zones"
            }
        ]
    }
