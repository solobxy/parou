export interface TransitStopGeo {
  id: string;
  name: string;
  operator_id: string;
  operator_name: string;
  transport_mode: 'Metro' | 'Comboio' | 'Autocarro' | 'Barco' | 'Elétrico';
  lat: number;
  lon: number;
  locality: string;
  district: string;
  lines: Array<{
    code: string;
    name: string;
    color: string;
    destination: string;
    frequencyMinutes: number;
  }>;
  wheelchair_accessible?: boolean;
  zone?: string;
}

// Os dados das paragens vêm todos da base de horários (GTFS); aqui ficam só as contas de distância.

// Helper to compute geographic distance in meters using Haversine formula
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Format distance human-friendly in Portuguese
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Estimate walking time in minutes (~4.8 km/h or 80 meters/minute)
export function estimateWalkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / 80));
}
