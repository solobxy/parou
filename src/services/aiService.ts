import { Occurrence, OccurrenceType, SeverityLevel } from '../types';

export interface AiClassificationResult {
  category: OccurrenceType;
  confidence: number;
  rationale: string;
}

export interface AiLocationExtractionResult {
  district: string;
  concelho: string;
  locationDetails: string;
  confidence?: number;
}

export interface AiOperatorIdentificationResult {
  operatorName: string;
  operatorCategory: string;
  lineOrRoute?: string;
}

export interface AiDuplicateDetectionResult {
  isDuplicate: boolean;
  duplicateOfId?: string;
  similarityScore: number;
  explanation: string;
}

export interface AiSummaryResult {
  summary: string;
  bulletPoints?: string[];
}

export interface AiFullAnalysisResult {
  category: OccurrenceType;
  severity: SeverityLevel;
  district: string;
  concelho: string;
  locationDetails: string;
  operator: string;
  summary: string;
  suggestedTitle: string;
}

/**
 * Serviço cliente para invocar os endpoints analíticos e NLP do backend do PAROU.PT.
 * 100% autónomo, determinístico, sem chamadas Gemini e com ZERO custos de IA.
 * Comunica via /api/ai/*.
 */
export const aiService = {
  /**
   * 1. Classificar ocorrência por categoria (Determinístico - Zero IA)
   */
  async classify(title: string, description: string): Promise<AiClassificationResult> {
    const res = await fetch('/api/ai/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    if (!res.ok) throw new Error('Falha ao classificar ocorrência');
    return await res.json();
  },

  /**
   * 2. Extrair distrito, concelho e via/local com Gemini
   */
  async extractLocation(text: string): Promise<AiLocationExtractionResult> {
    const res = await fetch('/api/ai/extract-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('Falha ao extrair localização');
    return await res.json();
  },

  /**
   * 3. Identificar empresa operadora ou serviço afetado com Gemini
   */
  async identifyOperator(text: string, location?: string): Promise<AiOperatorIdentificationResult> {
    const res = await fetch('/api/ai/identify-operator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, location }),
    });
    if (!res.ok) throw new Error('Falha ao identificar operador');
    return await res.json();
  },

  /**
   * 4. Detetar se uma nova ocorrência é duplicada de relatos existentes com Gemini
   */
  async detectDuplicates(
    newIncident: Partial<Occurrence>,
    existingIncidents: Occurrence[]
  ): Promise<AiDuplicateDetectionResult> {
    const res = await fetch('/api/ai/detect-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newIncident, existingIncidents }),
    });
    if (!res.ok) throw new Error('Falha ao verificar duplicados');
    return await res.json();
  },

  /**
   * 5. Resumir descrições longas com Gemini
   */
  async summarize(text: string): Promise<AiSummaryResult> {
    const res = await fetch('/api/ai/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('Falha ao resumir descrição');
    return await res.json();
  },

  /**
   * 6. Análise Integrada All-in-One com Gemini
   */
  async analyzeOccurrence(title: string, description: string): Promise<AiFullAnalysisResult> {
    const res = await fetch('/api/ai/analyze-occurrence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    if (!res.ok) throw new Error('Falha na análise completa');
    return await res.json();
  },
};
