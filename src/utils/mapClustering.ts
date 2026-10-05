import { Occurrence, SeverityLevel } from '../types';

export interface DistrictGeoData {
  id: string;
  name: string;
  code: string;
  center: { x: number; y: number };
  labelPos: { x: number; y: number };
  svgPath: string;
}

export interface CityHub {
  id: string;
  name: string;
  district: string;
  x: number;
  y: number;
  importance: number; // 1-5
}

export interface MapCluster {
  id: string;
  name: string;
  district: string;
  x: number;
  y: number;
  occurrences: Occurrence[];
  totalCount: number;
  graveCount: number;
  moderadaCount: number;
  infoCount: number;
  dominantSeverity: SeverityLevel;
  densityScore: number; // 0 to 100
}

/**
 * 18 Mainland Portugal Districts + Madeira & Azores with accurate district boundary paths
 * Viewbox calibrated for standard projection: (120, 15, 520, 785)
 */
export const DISTRICTS_GEO_DATA: DistrictGeoData[] = [
  {
    id: 'viana-do-castelo',
    name: 'Viana do Castelo',
    code: 'VC',
    center: { x: 335, y: 70 },
    labelPos: { x: 300, y: 65 },
    svgPath: 'M305,35 C320,30 355,28 375,42 C385,55 380,75 365,95 C350,98 335,92 320,95 C310,85 300,60 305,35 Z',
  },
  {
    id: 'braga',
    name: 'Braga',
    code: 'BR',
    center: { x: 365, y: 120 },
    labelPos: { x: 365, y: 115 },
    svgPath: 'M320,95 C335,92 350,98 365,95 C380,75 385,55 375,42 C405,55 425,75 420,105 C410,125 395,145 365,145 C345,145 330,135 320,120 C315,110 318,100 320,95 Z',
  },
  {
    id: 'porto',
    name: 'Porto',
    code: 'PT',
    center: { x: 335, y: 175 },
    labelPos: { x: 305, y: 175 },
    svgPath: 'M308,135 C330,135 345,145 365,145 C380,150 395,160 385,190 C365,200 345,205 325,205 C310,200 305,185 305,165 C305,150 306,140 308,135 Z',
  },
  {
    id: 'vila-real',
    name: 'Vila Real',
    code: 'VR',
    center: { x: 445, y: 145 },
    labelPos: { x: 445, y: 140 },
    svgPath: 'M420,105 C425,75 405,55 375,42 C420,40 455,50 480,75 C490,100 485,130 475,160 C445,175 415,180 385,190 C395,160 380,150 365,145 C395,145 410,125 420,105 Z',
  },
  {
    id: 'braganca',
    name: 'Bragança',
    code: 'BG',
    center: { x: 535, y: 95 },
    labelPos: { x: 535, y: 90 },
    svgPath: 'M480,75 C455,50 420,40 375,42 C410,25 470,25 520,35 C565,45 615,70 610,115 C605,140 575,165 540,175 C510,180 485,170 475,160 C485,130 490,100 480,75 Z',
  },
  {
    id: 'aveiro',
    name: 'Aveiro',
    code: 'AV',
    center: { x: 315, y: 245 },
    labelPos: { x: 285, y: 245 },
    svgPath: 'M305,205 C325,205 345,200 365,200 C365,225 360,255 350,280 C330,285 305,285 295,275 C290,250 295,225 305,205 Z',
  },
  {
    id: 'viseu',
    name: 'Viseu',
    code: 'VS',
    center: { x: 410, y: 230 },
    labelPos: { x: 410, y: 225 },
    svgPath: 'M365,200 C385,190 415,180 445,175 C475,160 485,170 510,180 C505,210 490,240 470,265 C440,270 405,275 375,270 C360,260 365,225 365,200 Z',
  },
  {
    id: 'guarda',
    name: 'Guarda',
    code: 'GD',
    center: { x: 515, y: 235 },
    labelPos: { x: 515, y: 230 },
    svgPath: 'M510,180 C540,175 575,165 610,115 C620,150 610,200 580,245 C555,275 530,290 495,295 C485,280 480,270 470,265 C490,240 505,210 510,180 Z',
  },
  {
    id: 'coimbra',
    name: 'Coimbra',
    code: 'CB',
    center: { x: 345, y: 310 },
    labelPos: { x: 315, y: 310 },
    svgPath: 'M295,275 C305,285 330,285 350,280 C360,285 375,270 405,275 C420,290 425,320 410,345 C380,355 340,360 315,355 C295,350 280,335 280,305 C285,290 290,280 295,275 Z',
  },
  {
    id: 'castelo-branco',
    name: 'Castelo Branco',
    code: 'CT',
    center: { x: 475, y: 335 },
    labelPos: { x: 475, y: 330 },
    svgPath: 'M405,275 C440,270 470,265 480,270 C485,280 495,295 530,290 C565,305 570,335 550,365 C520,385 480,395 440,395 C420,375 410,345 420,320 C425,320 420,290 405,275 Z',
  },
  {
    id: 'leiria',
    name: 'Leiria',
    code: 'LR',
    center: { x: 285, y: 385 },
    labelPos: { x: 255, y: 385 },
    svgPath: 'M280,355 C315,355 340,360 365,360 C370,390 355,420 335,440 C305,440 280,430 260,410 C250,390 265,370 280,355 Z',
  },
  {
    id: 'santarem',
    name: 'Santarém',
    code: 'ST',
    center: { x: 345, y: 440 },
    labelPos: { x: 345, y: 435 },
    svgPath: 'M365,360 C380,355 410,345 440,395 C435,425 410,460 380,480 C350,485 330,470 320,455 C335,440 355,420 370,390 Z',
  },
  {
    id: 'portalegre',
    name: 'Portalegre',
    code: 'PG',
    center: { x: 485, y: 430 },
    labelPos: { x: 485, y: 425 },
    svgPath: 'M440,395 C480,395 520,385 550,365 C565,385 575,415 560,445 C530,475 490,480 460,480 C445,460 435,425 440,395 Z',
  },
  {
    id: 'lisboa',
    name: 'Lisboa',
    code: 'LX',
    center: { x: 235, y: 510 },
    labelPos: { x: 195, y: 510 },
    svgPath: 'M260,410 C280,430 305,440 320,455 C330,470 330,500 315,530 C295,550 265,555 240,555 C215,545 200,515 210,480 C220,445 240,420 260,410 Z',
  },
  {
    id: 'setubal',
    name: 'Setúbal',
    code: 'SE',
    center: { x: 300, y: 575 },
    labelPos: { x: 270, y: 580 },
    svgPath: 'M240,555 C265,555 295,550 315,530 C330,500 350,485 380,480 C375,515 365,555 350,590 C325,620 295,640 280,640 C270,610 265,585 240,555 Z',
  },
  {
    id: 'evora',
    name: 'Évora',
    code: 'EV',
    center: { x: 440, y: 535 },
    labelPos: { x: 440, y: 530 },
    svgPath: 'M380,480 C410,460 445,460 460,480 C490,480 530,475 560,445 C565,480 550,520 520,560 C475,595 435,605 395,600 C365,555 375,515 380,480 Z',
  },
  {
    id: 'beja',
    name: 'Beja',
    code: 'BJ',
    center: { x: 395, y: 655 },
    labelPos: { x: 395, y: 650 },
    svgPath: 'M280,640 C295,640 325,620 350,590 C365,555 395,600 435,605 C475,595 520,560 520,600 C500,650 460,695 420,725 C370,730 330,725 305,705 C290,685 285,660 280,640 Z',
  },
  {
    id: 'faro',
    name: 'Faro',
    code: 'FR',
    center: { x: 360, y: 755 },
    labelPos: { x: 360, y: 750 },
    svgPath: 'M305,705 C330,725 370,730 420,725 C460,695 480,720 460,750 C430,775 370,780 320,775 C280,765 290,730 305,705 Z',
  },
  {
    id: 'madeira',
    name: 'Madeira',
    code: 'MD',
    center: { x: 340, y: 390 },
    labelPos: { x: 340, y: 440 },
    svgPath: 'M250,380 C290,340 390,340 450,380 C430,420 360,435 280,420 Z',
  },
  {
    id: 'acores',
    name: 'Açores',
    code: 'AC',
    center: { x: 340, y: 390 },
    labelPos: { x: 340, y: 450 },
    svgPath: 'M180,360 C230,320 440,320 500,380 C480,420 340,430 200,400 Z',
  }
];

/**
 * High-density urban centers in Portugal with localized coordinates
 */
export const CITY_HUBS: CityHub[] = [
  { id: 'lisboa', name: 'Lisboa', district: 'Lisboa', x: 235, y: 510, importance: 5 },
  { id: 'porto', name: 'Porto', district: 'Porto', x: 345, y: 175, importance: 5 },
  { id: 'braga', name: 'Braga', district: 'Braga', x: 380, y: 125, importance: 4 },
  { id: 'coimbra', name: 'Coimbra', district: 'Coimbra', x: 345, y: 310, importance: 4 },
  { id: 'setubal', name: 'Setúbal', district: 'Setúbal', x: 300, y: 565, importance: 4 },
  { id: 'faro', name: 'Faro', district: 'Faro', x: 360, y: 745, importance: 4 },
  { id: 'aveiro', name: 'Aveiro', district: 'Aveiro', x: 310, y: 245, importance: 3 },
  { id: 'leiria', name: 'Leiria', district: 'Leiria', x: 280, y: 375, importance: 3 },
  { id: 'funchal', name: 'Funchal', district: 'Madeira', x: 340, y: 390, importance: 3 },
  { id: 'guimaraes', name: 'Guimarães', district: 'Braga', x: 395, y: 140, importance: 3 },
  { id: 'matosinhos', name: 'Matosinhos', district: 'Porto', x: 330, y: 165, importance: 3 },
  { id: 'sintra', name: 'Sintra', district: 'Lisboa', x: 215, y: 495, importance: 3 },
  { id: 'cascais', name: 'Cascais', district: 'Lisboa', x: 205, y: 525, importance: 3 },
  { id: 'almada', name: 'Almada', district: 'Setúbal', x: 250, y: 535, importance: 3 },
  { id: 'viseu', name: 'Viseu', district: 'Viseu', x: 400, y: 235, importance: 3 },
  { id: 'santarem', name: 'Santarém', district: 'Santarém', x: 330, y: 440, importance: 2 },
  { id: 'evora', name: 'Évora', district: 'Évora', x: 440, y: 535, importance: 2 },
  { id: 'portimao', name: 'Portimão', district: 'Faro', x: 320, y: 750, importance: 2 },
  { id: 'viana-do-castelo', name: 'Viana do Castelo', district: 'Viana do Castelo', x: 340, y: 75, importance: 2 },
  { id: 'vila-real', name: 'Vila Real', district: 'Vila Real', x: 440, y: 155, importance: 2 },
  { id: 'braganca', name: 'Bragança', district: 'Bragança', x: 540, y: 105, importance: 2 },
  { id: 'guarda', name: 'Guarda', district: 'Guarda', x: 505, y: 240, importance: 2 },
  { id: 'castelo-branco', name: 'Castelo Branco', district: 'Castelo Branco', x: 470, y: 335, importance: 2 },
  { id: 'beja', name: 'Beja', district: 'Beja', x: 395, y: 655, importance: 2 },
  { id: 'ponta-delgada', name: 'Ponta Delgada', district: 'Açores', x: 340, y: 390, importance: 2 },
];

/**
 * Normalizes text for robust geographical matching
 */
export function normalizeGeoString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Find coordinates for an occurrence based on concelho, district or text
 */
export function getOccurrenceCoordinates(
  occ: Occurrence,
  districtLookup: Record<string, DistrictGeoData>
): { x: number; y: number } {
  // 1. Try matching with known city hubs (concelho or location details)
  const textToScan = `${occ.concelho || ''} ${occ.locationDetails || ''} ${occ.title || ''}`;
  const normScan = normalizeGeoString(textToScan);

  for (const hub of CITY_HUBS) {
    const hubNorm = normalizeGeoString(hub.name);
    if (normScan.includes(hubNorm)) {
      // Add a slight deterministic offset so multiple occurrences in same city don't completely overlap
      const seed = (occ.id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const angle = (seed % 360) * (Math.PI / 180);
      const dist = (seed % 14) + 4;
      return {
        x: hub.x + Math.cos(angle) * dist,
        y: hub.y + Math.sin(angle) * dist,
      };
    }
  }

  // 2. Fallback to district center
  const distNorm = normalizeGeoString(occ.district || '');
  const foundDist = Object.values(districtLookup).find(
    (d) => normalizeGeoString(d.name) === distNorm || normalizeGeoString(d.id) === distNorm
  );

  if (foundDist) {
    const seed = (occ.id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const angle = (seed % 360) * (Math.PI / 180);
    const dist = (seed % 22) + 6;
    return {
      x: foundDist.center.x + Math.cos(angle) * dist,
      y: foundDist.center.y + Math.sin(angle) * dist,
    };
  }

  // Default fallback: Central Portugal
  return { x: 345, y: 310 };
}

/**
 * Clusters occurrences based on proximity and geographic hierarchy
 * Clusters are grouped by threshold distance (in SVG coordinates)
 */
export function buildMapClusters(
  occurrences: Occurrence[],
  districtLookup: Record<string, DistrictGeoData>,
  clusterThreshold: number = 42,
  archipelago: 'continental' | 'madeira' | 'acores' = 'continental'
): MapCluster[] {
  // Filter active occurrences by archipelago
  const activeOccurrences = occurrences.filter((occ) => {
    if (occ.status === 'Ocultada') return false;
    const distNorm = normalizeGeoString(occ.district || '');
    if (archipelago === 'madeira') return distNorm.includes('madeira') || distNorm.includes('funchal');
    if (archipelago === 'acores') return distNorm.includes('acores') || distNorm.includes('acorian');
    return !distNorm.includes('madeira') && !distNorm.includes('funchal') && !distNorm.includes('acores') && !distNorm.includes('acorian');
  });

  const clusters: MapCluster[] = [];

  for (const occ of activeOccurrences) {
    const coords = getOccurrenceCoordinates(occ, districtLookup);

    // Look for existing cluster within clusterThreshold
    let assigned = false;
    for (const cluster of clusters) {
      const dx = cluster.x - coords.x;
      const dy = cluster.y - coords.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= clusterThreshold) {
        cluster.occurrences.push(occ);
        cluster.totalCount += 1;
        if (occ.severity === 'Grave') cluster.graveCount += 1;
        else if (occ.severity === 'Moderada') cluster.moderadaCount += 1;
        else cluster.infoCount += 1;

        // Recalculate center (weighted centroid)
        cluster.x = Math.round((cluster.x * (cluster.totalCount - 1) + coords.x) / cluster.totalCount);
        cluster.y = Math.round((cluster.y * (cluster.totalCount - 1) + coords.y) / cluster.totalCount);

        assigned = true;
        break;
      }
    }

    if (!assigned) {
      const clusterName = occ.concelho || occ.district || 'Cluster';
      clusters.push({
        id: `cluster-${clusters.length + 1}-${normalizeGeoString(clusterName)}`,
        name: clusterName,
        district: occ.district || 'Portugal',
        x: coords.x,
        y: coords.y,
        occurrences: [occ],
        totalCount: 1,
        graveCount: occ.severity === 'Grave' ? 1 : 0,
        moderadaCount: occ.severity === 'Moderada' ? 1 : 0,
        infoCount: occ.severity === 'Informação' ? 1 : 0,
        dominantSeverity: occ.severity || 'Informação',
        densityScore: 10,
      });
    }
  }

  // Calculate dominant severity and density score for each cluster
  return clusters.map((cluster) => {
    let dominantSeverity: SeverityLevel = 'Informação';
    if (cluster.graveCount > 0) {
      dominantSeverity = 'Grave';
    } else if (cluster.moderadaCount > 0) {
      dominantSeverity = 'Moderada';
    }

    // Density score proportional to volume (capped at 100)
    const densityScore = Math.min(Math.round(cluster.totalCount * 8 + (cluster.graveCount * 12)), 100);

    return {
      ...cluster,
      dominantSeverity,
      densityScore,
    };
  });
}

/**
 * Get styling and color variables according to cluster severity
 */
export function getSeverityStyle(severity: SeverityLevel) {
  switch (severity) {
    case 'Grave':
      return {
        bg: 'bg-red-600',
        fill: '#dc2626',
        stroke: '#f87171',
        glow: 'rgba(239, 68, 68, 0.65)',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-300 border-red-500/40',
        border: 'border-red-500',
        gradientStart: '#ef4444',
        gradientEnd: '#991b1b',
        pulseClass: 'animate-ping',
      };
    case 'Moderada':
      return {
        bg: 'bg-amber-500',
        fill: '#f59e0b',
        stroke: '#fbbf24',
        glow: 'rgba(245, 158, 11, 0.55)',
        text: 'text-amber-400',
        badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        border: 'border-amber-500',
        gradientStart: '#f59e0b',
        gradientEnd: '#b45309',
        pulseClass: 'animate-pulse',
      };
    case 'Informação':
    default:
      return {
        bg: 'bg-blue-500',
        fill: '#3b82f6',
        stroke: '#60a5fa',
        glow: 'rgba(59, 130, 246, 0.45)',
        text: 'text-blue-400',
        badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        border: 'border-blue-500',
        gradientStart: '#3b82f6',
        gradientEnd: '#1d4ed8',
        pulseClass: '',
      };
  }
}
