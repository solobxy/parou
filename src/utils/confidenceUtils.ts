import { Occurrence, VerificationStatus, ConfidenceRating, OccurrenceSourceItem } from '../types';

/**
 * Known official public transport operators, emergency authorities, and road concessions in Portugal
 */
export const OFFICIAL_AUTHORITY_KEYWORDS = [
  'proteção civil',
  'anepc',
  'metro de lisboa',
  'metro do porto',
  'cp - comboios de portugal',
  'cp oficial',
  'carris metropolitana',
  'carris',
  'stcp',
  'fertagus',
  'transtejo',
  'soflusa',
  'brisa',
  'infraestruturas de portugal',
  'gnr',
  'psp',
  'ip trânsito',
  'ascendi',
  'smtuc',
  'tub',
];

/**
 * Checks whether a given source name or company represents an official, authoritative entity
 */
export function isOfficialSource(sourceName?: string, companyOrService?: string): boolean {
  if (!sourceName && !companyOrService) return false;
  const combined = `${sourceName || ''} ${companyOrService || ''}`.toLowerCase();
  return OFFICIAL_AUTHORITY_KEYWORDS.some((kw) => combined.includes(kw));
}

export interface ConfidenceEvaluation {
  score: number; // 0 to 100
  level: ConfidenceRating; // 'Alta' | 'Média' | 'Inicial'
  status: VerificationStatus; // 'Reportado' | 'Confirmado' | 'Em verificação' | 'Resolvido'
  reasons: string[];
  lastUpdatedText: string;
  sourcesSummary: string;
  isOfficial: boolean;
  confirmations: number;
  unconfirmed: number;
}

/**
 * Dynamically computes verification status, confidence score and provenance insights for an occurrence
 */
export function calculateConfidence(occurrence: Partial<Occurrence>): ConfidenceEvaluation {
  const confirmations = 
    occurrence.confirmationsCount !== undefined 
      ? occurrence.confirmationsCount 
      : (occurrence.upvotes || 0);

  const unconfirmed = occurrence.unconfirmedCount || 0;
  const reportsCount = occurrence.reportsCount || 0;
  const hasOfficialSource = isOfficialSource(occurrence.sourceName, occurrence.companyOrService);
  const sourcesCount = (occurrence.sourcesList?.length || 0) + (occurrence.sourceName ? 1 : 0);

  // 1. Automatic Status Determination
  let status: VerificationStatus = 'Reportado';

  if (occurrence.status === 'Resolvida' || occurrence.verificationStatus === 'Resolvido') {
    status = 'Resolvido';
  } else if (unconfirmed >= 3 || reportsCount >= 2 || occurrence.status === 'Em análise') {
    status = 'Em verificação';
  } else if (
    hasOfficialSource ||
    confirmations >= 3 ||
    occurrence.isCommunityVerified ||
    sourcesCount >= 2 ||
    occurrence.verificationStatus === 'Confirmado'
  ) {
    status = 'Confirmado';
  } else {
    status = 'Reportado';
  }

  // 2. Score Computation (0 - 100)
  const reasons: string[] = [];
  let score = 25; // Base confidence for initial citizen report

  if (hasOfficialSource) {
    score += 45;
    reasons.push(`Fonte Oficial: ${occurrence.sourceName || occurrence.companyOrService}`);
  } else if (occurrence.companyOrService) {
    score += 15;
    reasons.push(`Entidade identificada: ${occurrence.companyOrService}`);
  }

  if (confirmations > 0) {
    const confirmationPoints = Math.min(35, confirmations * 7);
    score += confirmationPoints;
    reasons.push(`${confirmations} ${confirmations === 1 ? 'confirmação' : 'confirmações'} da comunidade`);
  }

  if (occurrence.isCommunityVerified) {
    score += 10;
    reasons.push('Validado por quórum comunitário');
  }

  if (sourcesCount >= 2) {
    score += 15;
    reasons.push(`${sourcesCount} fontes concordantes`);
  }

  if (occurrence.authorId && occurrence.authorName) {
    score += 5;
    reasons.push(`Utilizador identificado (${occurrence.authorName})`);
  }

  // Penalties
  if (unconfirmed > 0) {
    const penalty = unconfirmed * 12;
    score = Math.max(15, score - penalty);
    reasons.push(`-${penalty}% (${unconfirmed} contestação/ões)`);
  }

  if (reportsCount > 0) {
    const penalty = reportsCount * 20;
    score = Math.max(10, score - penalty);
    reasons.push(`Em revisão por denúncia (-${penalty}%)`);
  }

  // Status adjustments
  if (status === 'Confirmado' && score < 75) {
    score = Math.max(75, score);
  }

  // Cap score between 15% and 100%
  score = Math.min(100, Math.max(15, Math.round(score)));

  // 3. Level Determination
  let level: ConfidenceRating = 'Inicial';
  if (score >= 80) {
    level = 'Alta';
  } else if (score >= 50) {
    level = 'Média';
  } else {
    level = 'Inicial';
  }

  // 4. Last updated text formatting
  const lastTs = occurrence.updatedAt || occurrence.sourceFetchedAt || occurrence.timestamp || Date.now();
  const diffMinutes = Math.floor((Date.now() - lastTs) / (60 * 1000));
  let lastUpdatedText = '';

  if (diffMinutes <= 1) {
    lastUpdatedText = 'Atualizado agora mesmo';
  } else if (diffMinutes < 60) {
    lastUpdatedText = `Atualizado há ${diffMinutes} min`;
  } else {
    const date = new Date(lastTs);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    lastUpdatedText = `Atualizado às ${hours}:${mins}`;
  }

  // 5. Sources Summary
  let sourcesSummary = 'Comunidade PAROU';
  if (hasOfficialSource && occurrence.sourceName) {
    sourcesSummary = occurrence.sourceName;
    if (confirmations > 0) {
      sourcesSummary += ` + ${confirmations} ${confirmations === 1 ? 'relato' : 'relatos'}`;
    }
  } else if (occurrence.companyOrService) {
    sourcesSummary = occurrence.companyOrService;
    if (confirmations > 0) {
      sourcesSummary += ` + ${confirmations} ${confirmations === 1 ? 'relato' : 'relatos'}`;
    }
  } else if (confirmations > 0) {
    sourcesSummary = `${confirmations} ${confirmations === 1 ? 'testemunho' : 'testemunhos'} no local`;
  }

  return {
    score,
    level,
    status,
    reasons,
    lastUpdatedText,
    sourcesSummary,
    isOfficial: hasOfficialSource,
    confirmations,
    unconfirmed,
  };
}

/**
 * Augments any Occurrence object with normalized verificationStatus and confidence metadata
 */
export function enhanceOccurrenceWithConfidence(occ: Occurrence): Occurrence {
  const evalData = calculateConfidence(occ);
  return {
    ...occ,
    verificationStatus: evalData.status,
    confidenceScore: evalData.score,
    confidenceLevel: evalData.level,
    updatedAt: occ.updatedAt || occ.sourceFetchedAt || occ.timestamp,
  };
}

/**
 * Visual styling presets for the 4 distinct verification statuses
 */
export function getVerificationStatusConfig(status: VerificationStatus) {
  switch (status) {
    case 'Confirmado':
      return {
        label: 'Confirmado',
        bg: 'bg-[#F4F4F2]',
        border: 'border-[#E6E6E3]',
        text: 'text-[#111111]',
        dot: 'bg-[#111111]',
        glow: '',
        cardBorder: 'border-[#E6E6E3]',
        cardBg: 'bg-[#FFFFFF]',
        badgeBg: 'bg-[#F4F4F2]',
        badgeText: 'text-[#111111] border-[#E6E6E3]',
        description: 'Validado por entidades oficiais ou múltiplos relatos no local.',
      };
    case 'Em verificação':
      return {
        label: 'Em verificação',
        bg: 'bg-[#F4F4F2]',
        border: 'border-[#E6E6E3]',
        text: 'text-[#6B6B6B]',
        dot: 'bg-[#6B6B6B]',
        glow: '',
        cardBorder: 'border-[#E6E6E3]',
        cardBg: 'bg-[#FFFFFF]',
        badgeBg: 'bg-[#F4F4F2]',
        badgeText: 'text-[#6B6B6B] border-[#E6E6E3]',
        description: 'Em análise pelas equipas e a aguardar confirmação presencial.',
      };
    case 'Resolvido':
      return {
        label: 'Resolvido',
        bg: 'bg-[#F4F4F2]',
        border: 'border-[#E6E6E3]',
        text: 'text-[#6B6B6B]',
        dot: 'bg-[#6B6B6B]',
        glow: '',
        cardBorder: 'border-[#E6E6E3]',
        cardBg: 'bg-[#FFFFFF]',
        badgeBg: 'bg-[#F4F4F2]',
        badgeText: 'text-[#6B6B6B] border-[#E6E6E3]',
        description: 'Situação normalizada e circulação restabelecida.',
      };
    case 'Reportado':
    default:
      return {
        label: 'Reportado',
        bg: 'bg-[#F4F4F2]',
        border: 'border-[#E6E6E3]',
        text: 'text-[#111111]',
        dot: 'bg-[#111111]',
        glow: '',
        cardBorder: 'border-[#E6E6E3]',
        cardBg: 'bg-[#FFFFFF]',
        badgeBg: 'bg-[#F4F4F2]',
        badgeText: 'text-[#111111] border-[#E6E6E3]',
        description: 'Alerta inicial submetido pela comunidade, aguarda confirmações.',
      };
  }
}

/**
 * Visual styling presets for the 3 confidence levels
 */
export function getConfidenceLevelConfig(level: ConfidenceRating) {
  switch (level) {
    case 'Alta':
      return {
        label: 'Alta',
        text: 'text-[#111111]',
        bg: 'bg-[#F4F4F2]',
        border: 'border-[#E6E6E3]',
        bar: 'bg-[#111111]',
        dot: 'bg-[#111111]',
        pill: 'bg-[#F4F4F2] text-[#111111] border-[#E6E6E3]',
      };
    case 'Média':
      return {
        label: 'Média',
        text: 'text-[#6B6B6B]',
        bg: 'bg-[#F4F4F2]',
        border: 'border-[#E6E6E3]',
        bar: 'bg-[#6B6B6B]',
        dot: 'bg-[#6B6B6B]',
        pill: 'bg-[#F4F4F2] text-[#6B6B6B] border-[#E6E6E3]',
      };
    case 'Inicial':
    default:
      return {
        label: 'Inicial',
        text: 'text-[#6B6B6B]',
        bg: 'bg-[#F4F4F2]',
        border: 'border-[#E6E6E3]',
        bar: 'bg-[#6B6B6B]',
        dot: 'bg-[#6B6B6B]',
        pill: 'bg-[#F4F4F2] text-[#6B6B6B] border-[#E6E6E3]',
      };
  }
}
