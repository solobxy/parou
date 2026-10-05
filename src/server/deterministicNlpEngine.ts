/**
 * PAROU.PT - Motor NLP e Analítico 100% Determinístico
 * 
 * Substitui integralmente qualquer chamada ou dependência da Gemini API.
 * Funciona 24/7 sem rede externa, sem latência (tempo de resposta < 1ms),
 * sem chaves de API e com ZERO custos operacionais.
 */

export interface OccurrenceClassification {
  category: 'ACIDENTE' | 'ATRASOS' | 'AVARIA' | 'GREVE' | 'OBRAS' | 'CORTE' | 'SERVICO_PUBLICO';
  confidence: number;
  rationale: string;
}

export interface ExtractedLocation {
  district: string;
  concelho: string;
  locationDetails: string;
  confidence: number;
}

export interface IdentifiedOperator {
  operatorName: string;
  operatorCategory: 'Metro' | 'Comboio' | 'Autocarro' | 'Barco' | 'Rodoviário' | 'Emergência';
  lineOrRoute: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOfId: string;
  similarityScore: number;
  explanation: string;
}

export interface OccurrenceSummary {
  summary: string;
  bulletPoints: string[];
}

export interface FullAnalysisResult {
  category: string;
  severity: 'Grave' | 'Moderada' | 'Informação';
  district: string;
  concelho: string;
  locationDetails: string;
  operator: string;
  summary: string;
  suggestedTitle: string;
}

// -------------------------------------------------------------
// DICIONÁRIOS E PADRÕES REGEX DE TOPONÍMIA PORTUGUESA
// -------------------------------------------------------------
const PORTUGAL_DISTRICTS: Record<string, string[]> = {
  'Lisboa': ['lisboa', 'sintra', 'cascais', 'loures', 'amadora', 'oeiras', 'odivelas', 'vila franca de xira', 'mafra', 'torres vedras', 'alverca', 'sacavém', '2ª circular', 'segunda circular', 'cril', 'crel', 'ic19', 'eixo norte-sul', 'ponte 25 de abril', 'ponte vasco da gama', 'a5', 'a16', 'a8'],
  'Porto': ['porto', 'vila nova de gaia', 'matosinhos', 'maia', 'gondomar', 'valongo', 'vila do conde', 'póvoa de varzim', 'santo tirso', 'trofa', 'paredes', 'penafiel', 'vci', 'ponte da arrábida', 'ponte do freixo', 'ponte do infante', 'a28', 'a29', 'a4', 'a3', 'circunvalação', 'estádio do dragão', 'boavista', 'cordoaria', 'campanhã', 'são bento'],
  'Braga': ['braga', 'guimarães', 'vila nova de famalicão', 'barcelos', 'fafe', 'esposende', 'póvoa de lanhoso', 'amares', 'vieira do minho', 'a11', 'tub'],
  'Setúbal': ['setúbal', 'almada', 'seixal', 'barreiro', 'moita', 'montijo', 'palmela', 'sesimbra', 'alcochete', 'sines', 'grândola', 'a2', 'a33', 'fertagus', 'coina', 'pragal'],
  'Coimbra': ['coimbra', 'figueira da foz', 'cantanhede', 'montemor-o-velho', 'condeixa', 'lousã', 'smtuc'],
  'Faro': ['faro', 'portimão', 'olhão', 'loulé', 'lagos', 'albufeira', 'silves', 'tavira', 'vila real de santo antónio', 'a22', 'via do infante'],
  'Aveiro': ['aveiro', 'santa maria da feira', 'ílhavo', 'ovar', 'oliveira de azeméis', 'águada', 'espinho', 'aveirobus'],
  'Leiria': ['leiria', 'marinha grande', 'alcobaça', 'caldas da rainha', 'pombal', 'peniche'],
  'Santarém': ['santarém', 'tomar', 'abrantes', 'ourém', 'fátima', 'torres novas', 'entroncamento'],
  'Viseu': ['viseu', 'lamego', 'mangualde', 'tondela', 'são pedro do sul', 'a25'],
  'Viana do Castelo': ['viana do castelo', 'ponte de lima', 'valença', 'caminha', 'arcos de valdevez'],
  'Vila Real': ['vila real', 'chaves', 'peso da régua', 'alijó'],
  'Bragança': ['bragança', 'mirandela', 'macedo de cavaleiros'],
  'Guarda': ['guarda', 'seia', 'covilhã', 'gouveia'],
  'Castelo Branco': ['castelo branco', 'fundão', 'proença-a-nova'],
  'Évora': ['évora', 'montemor-o-novo', 'estremos', 'vendas novas'],
  'Beja': ['beja', 'sines', 'ourique', 'moura'],
  'Portalegre': ['portalegre', 'elvas', 'ponte de sor'],
  'Região Autónoma dos Açores': ['açores', 'ponta delgada', 'angra do heroísmo', 'horta'],
  'Região Autónoma da Madeira': ['madeira', 'funchal', 'câmara de lobos', 'santa cruz'],
};

// -------------------------------------------------------------
// OPERADORES E SERVIÇOS EM PORTUGAL
// -------------------------------------------------------------
interface KnownOperatorConfig {
  name: string;
  category: 'Metro' | 'Comboio' | 'Autocarro' | 'Barco' | 'Rodoviário' | 'Emergência';
  keywords: string[];
}

const KNOWN_OPERATORS: KnownOperatorConfig[] = [
  { name: 'Metro de Lisboa', category: 'Metro', keywords: ['metro de lisboa', 'metropolitano de lisboa', 'linha azul', 'linha amarela', 'linha verde', 'linha vermelha', 'estação de metro'] },
  { name: 'Metro do Porto', category: 'Metro', keywords: ['metro do porto', 'linha a', 'linha b', 'linha c', 'linha d', 'linha e', 'linha f', 'trindade'] },
  { name: 'CP - Comboios de Portugal', category: 'Comboio', keywords: ['cp', 'comboios de portugal', 'linha de sintra', 'linha de cascais', 'linha do norte', 'linha do douro', 'linha do minho', 'alfa pendular', 'intercidades', 'urbano de lisboa', 'urbano do porto'] },
  { name: 'Fertagus', category: 'Comboio', keywords: ['fertagus', 'comboio da ponte', 'eixo norte-sul', 'roma-areeiro', 'setúbal-lisboa', 'coina'] },
  { name: 'Carris', category: 'Autocarro', keywords: ['carris', 'ccl', 'elétrico 28', 'elétrico 15', 'autocarro da carris'] },
  { name: 'STCP', category: 'Autocarro', keywords: ['stcp', 'sociedade de transportes colectivos do porto', 'elétrico do porto'] },
  { name: 'Carris Metropolitana', category: 'Autocarro', keywords: ['carris metropolitana', 'amlisboa', 'tcb', 'barraqueiro', 'sulfertagus', 'alvorada'] },
  { name: 'UNIR Mobilidade', category: 'Autocarro', keywords: ['unir', 'unir mobilidade', 'amp', 'mobilidade do porto'] },
  { name: 'Transtejo Soflusa', category: 'Barco', keywords: ['transtejo', 'soflusa', 'catamarã', 'cacilhas', 'terreiro do paço', 'barreiro', 'montijo', 'seixal', 'trafaria'] },
  { name: 'TUB - Transportes Urbanos de Braga', category: 'Autocarro', keywords: ['tub', 'transportes urbanos de braga'] },
  { name: 'SMTUC - Serviços Municipalizados de Coimbra', category: 'Autocarro', keywords: ['smtuc', 'transportes de coimbra'] },
  { name: 'AveiroBus', category: 'Autocarro', keywords: ['aveirobus', 'transportes de aveiro'] },
  { name: 'Brisa Autoestradas', category: 'Rodoviário', keywords: ['brisa', 'autoestrada', 'portagem', 'a1', 'a2', 'a3', 'a5'] },
  { name: 'Infraestruturas de Portugal', category: 'Rodoviário', keywords: ['ip', 'infraestruturas de portugal', 'estrada nacional', 'en1', 'en125'] },
  { name: 'Proteção Civil (ANEPC)', category: 'Emergência', keywords: ['proteção civil', 'anepc', 'prociv', 'bombeiros', 'incêndio'] },
  { name: 'PSP / GNR', category: 'Emergência', keywords: ['psp', 'gnr', 'polícia', 'fiscalização'] },
];

/**
 * 1. CLASSIFICAR OCORRÊNCIA POR CATEGORIA (Determinístico)
 */
export function classifyOccurrenceText(title: string, description: string): OccurrenceClassification {
  const text = `${title} ${description}`.toLowerCase();

  // Ordem de precedência analítica
  if (text.includes('greve') || text.includes('paralisação') || text.includes('plenário') || text.includes('reivindicação')) {
    return {
      category: 'GREVE',
      confidence: 0.98,
      rationale: 'Detetadas palavras-chave de ação laboral ou greve de transportes.',
    };
  }

  if (text.includes('acidente') || text.includes('colisão') || text.includes('despiste') || text.includes('atropelamento') || text.includes('embate') || text.includes('choque')) {
    return {
      category: 'ACIDENTE',
      confidence: 0.96,
      rationale: 'Incidente de trânsito rodoviário ou ferroviário com colisão/acidente.',
    };
  }

  if (text.includes('corte de via') || text.includes('via cortada') || text.includes('trânsito cortado') || text.includes('interrupção total') || text.includes('circulação suspensa') || text.includes('cortada ao trânsito') || text.includes('interrompida')) {
    return {
      category: 'CORTE',
      confidence: 0.95,
      rationale: 'Bloqueio total ou interrupção de circulação confirmada na via ou linha.',
    };
  }

  if (text.includes('avaria') || text.includes('avariado') || text.includes('falha técnica') || text.includes('catenária') || text.includes('sinalização') || text.includes('problema mecânico') || text.includes('pantógrafo')) {
    return {
      category: 'AVARIA',
      confidence: 0.95,
      rationale: 'Problema técnico, infraestrutural ou avaria de veículo/equipamento.',
    };
  }

  if (text.includes('obras') || text.includes('trabalhos na via') || text.includes('repavimentação') || text.includes('manutenção') || text.includes('fresagem') || text.includes('remodelação')) {
    return {
      category: 'OBRAS',
      confidence: 0.94,
      rationale: 'Intervenção planeada ou trabalhos de manutenção na via/linha.',
    };
  }

  if (text.includes('atraso') || text.includes('atrasos') || text.includes('fila') || text.includes('demora') || text.includes('tráfego lento') || text.includes('congestionamento') || text.includes('pára-arranca') || text.includes('compacto')) {
    return {
      category: 'ATRASOS',
      confidence: 0.92,
      rationale: 'Perturbação de fluxo, atraso de horário ou tráfego condicionado.',
    };
  }

  return {
    category: 'SERVICO_PUBLICO',
    confidence: 0.85,
    rationale: 'Aviso de utilidade pública ou informação geral de mobilidade.',
  };
}

/**
 * 2. EXTRAIR CIDADE E LOCALIZAÇÃO ESPECÍFICA (Determinístico)
 */
export function extractLocationFromText(text: string): ExtractedLocation {
  const lower = text.toLowerCase();
  let matchedDistrict = 'Lisboa';
  let matchedConcelho = 'Lisboa';
  let matchedDetails = '';

  // 1. Procurar concelho/distrito no dicionário
  let maxScore = 0;
  for (const [district, keywords] of Object.entries(PORTUGAL_DISTRICTS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const score = kw.length;
        if (score > maxScore) {
          maxScore = score;
          matchedDistrict = district;
          matchedConcelho = kw.charAt(0).toUpperCase() + kw.slice(1);
        }
      }
    }
  }

  // 2. Extrair via/rua/estrada específica por Regex
  const highwayMatch = text.match(/\b(A\d{1,2}|IC\d{1,2}|IP\d{1,2}|EN\d{1,3}|VCI|CRIL|CREL|2ª\s*Circular|Segunda\s*Circular)\b/i);
  const kmMatch = text.match(/\bkm\s*\d+(\+\d+)?\b/i);
  const stationMatch = text.match(/(estação|paragem|apeadeiro|terminal)\s+(de\s+|dos\s+|das\s+)?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/i);
  const streetMatch = text.match(/(rua|avenida|praça|alameda|ponte|rotunda)\s+(de\s+|dos\s+|das\s+)?([A-ZÀ-Ú0-9ªº][a-zà-ú0-9ªº]+(?:\s+[A-ZÀ-Ú0-9ªº][a-zà-ú0-9ªº]+)*)/i);

  if (highwayMatch) {
    matchedDetails = highwayMatch[0].toUpperCase();
    if (kmMatch) matchedDetails += ` ${kmMatch[0]}`;
  } else if (stationMatch) {
    matchedDetails = stationMatch[0];
  } else if (streetMatch) {
    matchedDetails = streetMatch[0];
  } else {
    matchedDetails = `Zona central de ${matchedConcelho}`;
  }

  return {
    district: matchedDistrict,
    concelho: matchedConcelho,
    locationDetails: matchedDetails,
    confidence: maxScore > 0 ? 0.95 : 0.70,
  };
}

/**
 * 3. IDENTIFICAR OPERADORA OU CONCESSIONÁRIA (Determinístico)
 */
export function identifyOperatorFromText(text: string, location?: string): IdentifiedOperator {
  const combined = `${text} ${location || ''}`.toLowerCase();

  for (const op of KNOWN_OPERATORS) {
    for (const kw of op.keywords) {
      if (combined.includes(kw)) {
        // Tentar captar linha se mencionada (ex: Linha 728, Linha Azul, Linha de Cascais)
        const lineMatch = text.match(/(linha\s+[a-zà-ú0-9]+|carreira\s+\d+|autocarro\s+\d+)/i);
        return {
          operatorName: op.name,
          operatorCategory: op.category,
          lineOrRoute: lineMatch ? lineMatch[0] : '',
        };
      }
    }
  }

  // Fallback para tráfego rodoviário genérico
  return {
    operatorName: 'Tráfego Rodoviário Geral',
    operatorCategory: 'Rodoviário',
    lineOrRoute: '',
  };
}

/**
 * 4. DETETAR OCORRÊNCIAS DUPLICADAS (Determinístico)
 */
export function detectDuplicateOccurrence(
  newIncident: { title: string; description: string; district?: string; locationDetails?: string; companyOrService?: string },
  existingIncidents: Array<{ id: string; title: string; description: string; district?: string; locationDetails?: string; companyOrService?: string }>
): DuplicateCheckResult {
  if (!existingIncidents || existingIncidents.length === 0) {
    return {
      isDuplicate: false,
      duplicateOfId: '',
      similarityScore: 0,
      explanation: 'Sem ocorrências existentes para comparação.',
    };
  }

  const newWords = new Set(
    `${newIncident.title} ${newIncident.description} ${newIncident.locationDetails || ''}`
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
  );

  let bestMatchId = '';
  let highestScore = 0;
  let explanation = 'Ocorrência única verificada deterministicamente.';

  for (const existing of existingIncidents) {
    // 1. O mesmo distrito aumenta relevância
    const sameDistrict = (newIncident.district || '').toLowerCase() === (existing.district || '').toLowerCase();
    const sameOperator = Boolean(
      newIncident.companyOrService && 
      existing.companyOrService && 
      newIncident.companyOrService.toLowerCase() === existing.companyOrService.toLowerCase()
    );

    const existWords = new Set(
      `${existing.title} ${existing.description} ${existing.locationDetails || ''}`
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3)
    );

    // Calcular Jaccard Index de termos chave
    let intersection = 0;
    newWords.forEach(w => {
      if (existWords.has(w)) intersection++;
    });

    const union = new Set([...newWords, ...existWords]).size;
    let score = union > 0 ? intersection / union : 0;

    if (sameDistrict) score += 0.15;
    if (sameOperator) score += 0.20;

    if (score > highestScore) {
      highestScore = score;
      bestMatchId = existing.id;
    }
  }

  if (highestScore >= 0.65) {
    explanation = `Elevada similaridade de termos e localização com a ocorrência já existente #${bestMatchId.slice(0, 8)}.`;
    return {
      isDuplicate: true,
      duplicateOfId: bestMatchId,
      similarityScore: Math.min(Number(highestScore.toFixed(2)), 1.0),
      explanation,
    };
  }

  return {
    isDuplicate: false,
    duplicateOfId: '',
    similarityScore: Number(highestScore.toFixed(2)),
    explanation,
  };
}

/**
 * 5. RESUMIR DESCRIÇÕES LONGAS (Determinístico)
 */
export function summarizeOccurrenceText(text: string): OccurrenceSummary {
  if (!text) return { summary: '', bulletPoints: [] };

  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const summary = sentences.length > 0 ? `${sentences.slice(0, 2).join('. ')}.` : text.slice(0, 160);

  const bulletPoints: string[] = [];
  if (sentences[0]) bulletPoints.push(`Impacto: ${sentences[0]}`);
  if (sentences[1]) bulletPoints.push(`Detalhes: ${sentences[1]}`);

  return {
    summary,
    bulletPoints: bulletPoints.slice(0, 3),
  };
}

/**
 * 6. ANÁLISE INTEGRADA (ALL-IN-ONE) (Determinístico)
 */
export function analyzeOccurrenceAllInOne(title: string, description: string): FullAnalysisResult {
  const classification = classifyOccurrenceText(title, description);
  const location = extractLocationFromText(`${title} ${description}`);
  const operator = identifyOperatorFromText(`${title} ${description}`, location.locationDetails);
  const summaryObj = summarizeOccurrenceText(description || title);

  // Determinar severidade analiticamente
  let severity: 'Grave' | 'Moderada' | 'Informação' = 'Moderada';
  if (classification.category === 'ACIDENTE' || classification.category === 'CORTE' || classification.category === 'GREVE') {
    severity = 'Grave';
  } else if (classification.category === 'SERVICO_PUBLICO') {
    severity = 'Informação';
  }

  // Título jornalístico padronizado
  const cleanTitle = title?.trim() || `${classification.category}: ${location.concelho} (${operator.operatorName})`;

  return {
    category: classification.category,
    severity,
    district: location.district,
    concelho: location.concelho,
    locationDetails: location.locationDetails,
    operator: operator.operatorName,
    summary: summaryObj.summary,
    suggestedTitle: cleanTitle,
  };
}
