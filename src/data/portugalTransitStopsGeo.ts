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

export const PORTUGAL_TRANSIT_STOPS: TransitStopGeo[] = [
  // ========================================================
  // METROPOLITANO DE LISBOA (Linhas Azul, Amarela, Verde, Vermelha)
  // ========================================================
  {
    id: 'ml-sa',
    name: 'Santa Apolónia',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7138,
    lon: -9.1226,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-tp',
    name: 'Terreiro do Paço',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7072,
    lon: -9.1352,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-bc',
    name: 'Baixa-Chiado',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7107,
    lon: -9.1396,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira', frequencyMinutes: 5 },
      { code: 'Verde', name: 'Linha Verde (Caravela)', color: '#00843D', destination: 'Telheiras', frequencyMinutes: 5 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-cs',
    name: 'Cais do Sodré',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7061,
    lon: -9.1444,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Verde', name: 'Linha Verde (Caravela)', color: '#00843D', destination: 'Telheiras', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-ro',
    name: 'Rossio',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7141,
    lon: -9.1390,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Verde', name: 'Linha Verde (Caravela)', color: '#00843D', destination: 'Telheiras', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-re',
    name: 'Restauradores',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7159,
    lon: -9.1418,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira / Santa Apolónia', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-av',
    name: 'Avenida',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7193,
    lon: -9.1455,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira / Santa Apolónia', frequencyMinutes: 5 }],
    wheelchair_accessible: false,
  },
  {
    id: 'ml-mp',
    name: 'Marquês de Pombal',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7253,
    lon: -9.1500,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira / Santa Apolónia', frequencyMinutes: 4 },
      { code: 'Amarela', name: 'Linha Amarela (Girassol)', color: '#F4B223', destination: 'Odivelas / Rato', frequencyMinutes: 5 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-ra',
    name: 'Rato',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7201,
    lon: -9.1541,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Amarela', name: 'Linha Amarela (Girassol)', color: '#F4B223', destination: 'Odivelas', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-sd',
    name: 'Saldanha',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7348,
    lon: -9.1453,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Amarela', name: 'Linha Amarela (Girassol)', color: '#F4B223', destination: 'Odivelas / Rato', frequencyMinutes: 5 },
      { code: 'Vermelha', name: 'Linha Vermelha (Oriente)', color: '#DA291C', destination: 'Aeroporto / São Sebastião', frequencyMinutes: 5 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-ss',
    name: 'São Sebastião',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7340,
    lon: -9.1540,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira / Santa Apolónia', frequencyMinutes: 4 },
      { code: 'Vermelha', name: 'Linha Vermelha (Oriente)', color: '#DA291C', destination: 'Aeroporto', frequencyMinutes: 5 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-jz',
    name: 'Jardim Zoológico (Sete Rios)',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7416,
    lon: -9.1685,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira / Santa Apolónia', frequencyMinutes: 4 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-cm',
    name: 'Colégio Militar/Luz',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7533,
    lon: -9.1895,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira / Santa Apolónia', frequencyMinutes: 4 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-po',
    name: 'Pontinha',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7624,
    lon: -9.2062,
    locality: 'Odivelas',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Reboleira / Santa Apolónia', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-rb',
    name: 'Reboleira',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7523,
    lon: -9.2241,
    locality: 'Amadora',
    district: 'Lisboa',
    lines: [{ code: 'Azul', name: 'Linha Azul (Gaivota)', color: '#0072CE', destination: 'Santa Apolónia', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-ec',
    name: 'Entre Campos',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7470,
    lon: -9.1481,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Amarela', name: 'Linha Amarela (Girassol)', color: '#F4B223', destination: 'Odivelas / Rato', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-cg',
    name: 'Campo Grande',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7601,
    lon: -9.1578,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Amarela', name: 'Linha Amarela (Girassol)', color: '#F4B223', destination: 'Odivelas / Rato', frequencyMinutes: 5 },
      { code: 'Verde', name: 'Linha Verde (Caravela)', color: '#00843D', destination: 'Cais do Sodré / Telheiras', frequencyMinutes: 5 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-od',
    name: 'Odivelas',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7932,
    lon: -9.1733,
    locality: 'Odivelas',
    district: 'Lisboa',
    lines: [{ code: 'Amarela', name: 'Linha Amarela (Girassol)', color: '#F4B223', destination: 'Rato', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-al',
    name: 'Alameda',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7369,
    lon: -9.1339,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Verde', name: 'Linha Verde (Caravela)', color: '#00843D', destination: 'Cais do Sodré / Telheiras', frequencyMinutes: 5 },
      { code: 'Vermelha', name: 'Linha Vermelha (Oriente)', color: '#DA291C', destination: 'Aeroporto / São Sebastião', frequencyMinutes: 5 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-or',
    name: 'Oriente (Parque das Nações)',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7679,
    lon: -9.0995,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Vermelha', name: 'Linha Vermelha (Oriente)', color: '#DA291C', destination: 'Aeroporto / São Sebastião', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'ml-ae',
    name: 'Aeroporto Humberto Delgado',
    operator_id: 'metro-de-lisboa',
    operator_name: 'Metro de Lisboa',
    transport_mode: 'Metro',
    lat: 38.7690,
    lon: -9.1287,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Vermelha', name: 'Linha Vermelha (Oriente)', color: '#DA291C', destination: 'São Sebastião', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },

  // ========================================================
  // CP - COMBOIOS DE PORTUGAL & FERTAGUS (Área de Lisboa e Margem Sul)
  // ========================================================
  {
    id: 'cp-rossio',
    name: 'Estação Ferroviária do Rossio',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.7145,
    lon: -9.1415,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Linha Sintra', name: 'Urbanos: Rossio ↔ Sintra', color: '#008542', destination: 'Sintra', frequencyMinutes: 15 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-campolide',
    name: 'Estação de Campolide',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.7323,
    lon: -9.1672,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Linha Sintra', name: 'Urbanos: Sintra ↔ Rossio/Oriente', color: '#008542', destination: 'Sintra / Rossio', frequencyMinutes: 10 },
      { code: 'Fertagus', name: 'Roma-Areeiro ↔ Setúbal', color: '#005CA9', destination: 'Setúbal / Coina', frequencyMinutes: 10 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-sete-rios',
    name: 'Sete Rios Interface',
    operator_id: 'cp-comboios',
    operator_name: 'CP / Fertagus',
    transport_mode: 'Comboio',
    lat: 38.7397,
    lon: -9.1663,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Linha Sintra', name: 'Urbanos: Sintra ↔ Oriente', color: '#008542', destination: 'Sintra / Oriente', frequencyMinutes: 10 },
      { code: 'Linha Azambuja', name: 'Urbanos: Azambuja ↔ Alcântara', color: '#008542', destination: 'Azambuja', frequencyMinutes: 15 },
      { code: 'Fertagus', name: 'Fertagus: Roma-Areeiro ↔ Setúbal', color: '#005CA9', destination: 'Setúbal', frequencyMinutes: 10 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-entrecampos',
    name: 'Entrecampos Interface',
    operator_id: 'cp-comboios',
    operator_name: 'CP / Fertagus',
    transport_mode: 'Comboio',
    lat: 38.7483,
    lon: -9.1488,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Linha Sintra', name: 'Urbanos: Sintra ↔ Oriente', color: '#008542', destination: 'Sintra / Oriente', frequencyMinutes: 10 },
      { code: 'Fertagus', name: 'Roma-Areeiro ↔ Setúbal', color: '#005CA9', destination: 'Setúbal', frequencyMinutes: 10 },
      { code: 'Longo Curso', name: 'Alfa Pendular / Intercidades', color: '#008542', destination: 'Porto / Faro', frequencyMinutes: 30 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-roma-areeiro',
    name: 'Roma-Areeiro Interface',
    operator_id: 'cp-comboios',
    operator_name: 'CP / Fertagus',
    transport_mode: 'Comboio',
    lat: 38.7461,
    lon: -9.1352,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Linha Sintra', name: 'Urbanos: Sintra ↔ Oriente', color: '#008542', destination: 'Oriente / Sintra', frequencyMinutes: 10 },
      { code: 'Fertagus', name: 'Terminal Norte Fertagus', color: '#005CA9', destination: 'Coina / Setúbal', frequencyMinutes: 10 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-oriente',
    name: 'Gare do Oriente (Lisboa)',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.7678,
    lon: -9.0991,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Alfa Pendular', name: 'Longo Curso Norte / Sul', color: '#008542', destination: 'Porto Campanhã / Braga / Faro', frequencyMinutes: 30 },
      { code: 'Linha Sintra', name: 'Urbanos: Oriente ↔ Sintra', color: '#008542', destination: 'Sintra', frequencyMinutes: 10 },
      { code: 'Linha Azambuja', name: 'Urbanos: Azambuja ↔ Santa Apolónia', color: '#008542', destination: 'Azambuja', frequencyMinutes: 15 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-cais-sodre',
    name: 'Cais do Sodré Estação Ferroviária',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.7058,
    lon: -9.1448,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Linha Cascais', name: 'Urbanos: Cais do Sodré ↔ Cascais', color: '#E31B23', destination: 'Cascais / Oeiras', frequencyMinutes: 10 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-belem',
    name: 'Belém Estação',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.6961,
    lon: -9.2001,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Linha Cascais', name: 'Urbanos: Cais do Sodré ↔ Cascais', color: '#E31B23', destination: 'Cascais / Cais do Sodré', frequencyMinutes: 12 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-oeiras',
    name: 'Oeiras Estação',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.6882,
    lon: -9.3115,
    locality: 'Oeiras',
    district: 'Lisboa',
    lines: [{ code: 'Linha Cascais', name: 'Urbanos: Cais do Sodré ↔ Cascais', color: '#E31B23', destination: 'Cascais / Cais do Sodré', frequencyMinutes: 10 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-cascais',
    name: 'Cascais Estação Terminal',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.7007,
    lon: -9.4184,
    locality: 'Cascais',
    district: 'Lisboa',
    lines: [{ code: 'Linha Cascais', name: 'Urbanos: Cascais ↔ Cais do Sodré', color: '#E31B23', destination: 'Cais do Sodré', frequencyMinutes: 10 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-sintra',
    name: 'Sintra Estação Terminal',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.7989,
    lon: -9.3828,
    locality: 'Sintra',
    district: 'Lisboa',
    lines: [{ code: 'Linha Sintra', name: 'Urbanos: Sintra ↔ Rossio / Oriente', color: '#008542', destination: 'Rossio / Oriente', frequencyMinutes: 10 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-pragal',
    name: 'Pragal Interface (Almada)',
    operator_id: 'fertagus',
    operator_name: 'Fertagus / CP / MTS',
    transport_mode: 'Comboio',
    lat: 38.6659,
    lon: -9.1788,
    locality: 'Almada',
    district: 'Setúbal',
    lines: [
      { code: 'Fertagus', name: 'Lisboa (Roma-Areeiro) ↔ Setúbal', color: '#005CA9', destination: 'Lisboa / Setúbal', frequencyMinutes: 10 },
      { code: 'MTS Linha 2', name: 'Metro Sul do Tejo: Corroios ↔ Pragal', color: '#00A3E0', destination: 'Corroios / Cacilhas', frequencyMinutes: 8 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-corroios',
    name: 'Corroios Interface',
    operator_id: 'fertagus',
    operator_name: 'Fertagus / MTS',
    transport_mode: 'Comboio',
    lat: 38.6433,
    lon: -9.1554,
    locality: 'Seixal',
    district: 'Setúbal',
    lines: [
      { code: 'Fertagus', name: 'Fertagus: Roma-Areeiro ↔ Setúbal', color: '#005CA9', destination: 'Lisboa / Setúbal', frequencyMinutes: 10 },
      { code: 'MTS Linha 1', name: 'MTS: Cacilhas ↔ Corroios', color: '#00A3E0', destination: 'Cacilhas', frequencyMinutes: 8 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-coina',
    name: 'Coina Estação',
    operator_id: 'fertagus',
    operator_name: 'Fertagus',
    transport_mode: 'Comboio',
    lat: 38.5995,
    lon: -9.0552,
    locality: 'Barreiro',
    district: 'Setúbal',
    lines: [{ code: 'Fertagus', name: 'Fertagus: Roma-Areeiro ↔ Coina / Setúbal', color: '#005CA9', destination: 'Lisboa / Setúbal', frequencyMinutes: 10 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-setubal',
    name: 'Setúbal Interface Terminal',
    operator_id: 'cp-comboios',
    operator_name: 'CP / Fertagus',
    transport_mode: 'Comboio',
    lat: 38.5303,
    lon: -8.8872,
    locality: 'Setúbal',
    district: 'Setúbal',
    lines: [
      { code: 'Fertagus', name: 'Fertagus: Setúbal ↔ Roma-Areeiro', color: '#005CA9', destination: 'Lisboa', frequencyMinutes: 20 },
      { code: 'Linha do Sado', name: 'Urbanos: Setúbal ↔ Barreiro', color: '#008542', destination: 'Barreiro', frequencyMinutes: 30 }
    ],
    wheelchair_accessible: true,
  },

  // ========================================================
  // TRANSTEJO / SOFLUSA (Terminais Fluviais Tejo)
  // ========================================================
  {
    id: 'tt-cais-sodre',
    name: 'Terminal Fluvial Cais do Sodré',
    operator_id: 'transtejo',
    operator_name: 'Transtejo Soflusa',
    transport_mode: 'Barco',
    lat: 38.7052,
    lon: -9.1441,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: 'Barco Cacilhas', name: 'Ligação Fluvial Cais do Sodré ↔ Cacilhas', color: '#00A3E0', destination: 'Cacilhas', frequencyMinutes: 10 },
      { code: 'Barco Seixal', name: 'Ligação Fluvial Cais do Sodré ↔ Seixal', color: '#00A3E0', destination: 'Seixal', frequencyMinutes: 20 },
      { code: 'Barco Montijo', name: 'Ligação Fluvial Cais do Sodré ↔ Montijo', color: '#00A3E0', destination: 'Montijo', frequencyMinutes: 20 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'tt-terreiro-paco',
    name: 'Terminal Fluvial Terreiro do Paço',
    operator_id: 'soflusa',
    operator_name: 'Transtejo Soflusa',
    transport_mode: 'Barco',
    lat: 38.7063,
    lon: -9.1355,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [{ code: 'Barco Barreiro', name: 'Ligação Fluvial Terreiro do Paço ↔ Barreiro', color: '#00A3E0', destination: 'Barreiro', frequencyMinutes: 10 }],
    wheelchair_accessible: true,
  },
  {
    id: 'tt-cacilhas',
    name: 'Terminal Fluvial de Cacilhas',
    operator_id: 'transtejo',
    operator_name: 'Transtejo Soflusa / MTS',
    transport_mode: 'Barco',
    lat: 38.6872,
    lon: -9.1481,
    locality: 'Almada',
    district: 'Setúbal',
    lines: [
      { code: 'Barco Lisboa', name: 'Ligação Fluvial Cacilhas ↔ Cais do Sodré', color: '#00A3E0', destination: 'Cais do Sodré (Lisboa)', frequencyMinutes: 10 },
      { code: 'MTS Linha 1', name: 'Metro Sul do Tejo: Cacilhas ↔ Corroios', color: '#00A3E0', destination: 'Corroios / Pragal', frequencyMinutes: 8 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'tt-barreiro',
    name: 'Terminal Fluvial e Ferroviário do Barreiro',
    operator_id: 'soflusa',
    operator_name: 'Soflusa / CP',
    transport_mode: 'Barco',
    lat: 38.6534,
    lon: -9.0778,
    locality: 'Barreiro',
    district: 'Setúbal',
    lines: [
      { code: 'Barco Lisboa', name: 'Soflusa: Barreiro ↔ Terreiro do Paço', color: '#00A3E0', destination: 'Terreiro do Paço (Lisboa)', frequencyMinutes: 10 },
      { code: 'Linha do Sado', name: 'CP Linha do Sado: Barreiro ↔ Praias do Sado', color: '#008542', destination: 'Setúbal', frequencyMinutes: 30 }
    ],
    wheelchair_accessible: true,
  },

  // ========================================================
  // METRO DO PORTO & CP PORTO (Área Metropolitana do Porto)
  // ========================================================
  {
    id: 'mp-trindade',
    name: 'Trindade Central Interface (Porto)',
    operator_id: 'metro-do-porto',
    operator_name: 'Metro do Porto',
    transport_mode: 'Metro',
    lat: 41.1517,
    lon: -8.6094,
    locality: 'Porto',
    district: 'Porto',
    lines: [
      { code: 'Linha A', name: 'Linha Azul: Estádio do Dragão ↔ Sr. Matosinhos', color: '#0072CE', destination: 'Senhor de Matosinhos', frequencyMinutes: 7 },
      { code: 'Linha B', name: 'Linha Vermelha: Dragão ↔ Póvoa de Varzim', color: '#DA291C', destination: 'Póvoa de Varzim', frequencyMinutes: 10 },
      { code: 'Linha C', name: 'Linha Verde: Campanhã ↔ ISMAI', color: '#00843D', destination: 'ISMAI / Maia', frequencyMinutes: 10 },
      { code: 'Linha D', name: 'Linha Amarela: Hospital São João ↔ Santo Ovídio', color: '#F4B223', destination: 'Santo Ovídio (Gaia) / H. S. João', frequencyMinutes: 5 },
      { code: 'Linha E', name: 'Linha Violeta: Trindade ↔ Aeroporto', color: '#7E22CE', destination: 'Aeroporto Sá Carneiro', frequencyMinutes: 15 },
      { code: 'Linha F', name: 'Linha Laranja: Fânzeres ↔ Senhora da Hora', color: '#EA580C', destination: 'Fânzeres / Gondomar', frequencyMinutes: 10 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'mp-sao-bento',
    name: 'Estação de São Bento (Porto)',
    operator_id: 'metro-do-porto',
    operator_name: 'Metro do Porto / CP Porto',
    transport_mode: 'Metro',
    lat: 41.1455,
    lon: -8.6102,
    locality: 'Porto',
    district: 'Porto',
    lines: [
      { code: 'Linha D', name: 'Linha Amarela: Hospital São João ↔ Santo Ovídio', color: '#F4B223', destination: 'Santo Ovídio (Gaia)', frequencyMinutes: 5 },
      { code: 'Urbanos Guimarães', name: 'CP Urbanos: Porto ↔ Guimarães', color: '#008542', destination: 'Guimarães', frequencyMinutes: 30 },
      { code: 'Urbanos Braga', name: 'CP Urbanos: Porto ↔ Braga', color: '#008542', destination: 'Braga', frequencyMinutes: 30 },
      { code: 'Urbanos Aveiro', name: 'CP Urbanos: Porto ↔ Aveiro', color: '#008542', destination: 'Aveiro', frequencyMinutes: 30 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'mp-campanha',
    name: 'Campanhã Intermodal Hub',
    operator_id: 'cp-comboios',
    operator_name: 'CP / Metro do Porto',
    transport_mode: 'Comboio',
    lat: 41.1491,
    lon: -8.5855,
    locality: 'Porto',
    district: 'Porto',
    lines: [
      { code: 'Alfa Pendular', name: 'Longo Curso: Porto ↔ Lisboa / Faro', color: '#008542', destination: 'Lisboa Oriente / Santa Apolónia', frequencyMinutes: 30 },
      { code: 'Linha A, B, C, F', name: 'Metro do Porto Tronco Comum', color: '#0072CE', destination: 'Trindade / Matosinhos / Póvoa', frequencyMinutes: 4 },
      { code: 'Urbanos Porto', name: 'CP Urbanos do Porto', color: '#008542', destination: 'Braga / Guimarães / Aveiro', frequencyMinutes: 15 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'mp-casa-musica',
    name: 'Casa da Música Interface',
    operator_id: 'metro-do-porto',
    operator_name: 'Metro do Porto / STCP / UNIR',
    transport_mode: 'Metro',
    lat: 41.1593,
    lon: -8.6298,
    locality: 'Porto',
    district: 'Porto',
    lines: [
      { code: 'Linhas A/B/C/E/F', name: 'Metro Tronco Comum', color: '#0072CE', destination: 'Trindade / Dragão / Aeroporto', frequencyMinutes: 3 },
      { code: 'STCP 201/203', name: 'Autocarros STCP Eixo Boavista', color: '#005CA9', destination: 'Foz / Castelo do Queijo', frequencyMinutes: 10 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'mp-aeroporto-porto',
    name: 'Aeroporto Francisco Sá Carneiro',
    operator_id: 'metro-do-porto',
    operator_name: 'Metro do Porto',
    transport_mode: 'Metro',
    lat: 41.2372,
    lon: -8.6698,
    locality: 'Maia',
    district: 'Porto',
    lines: [{ code: 'Linha E', name: 'Linha Violeta: Aeroporto ↔ Trindade / Dragão', color: '#7E22CE', destination: 'Trindade (Porto Centro)', frequencyMinutes: 15 }],
    wheelchair_accessible: true,
  },
  {
    id: 'mp-santo-ovidio',
    name: 'Santo Ovídio Interface (Vila Nova de Gaia)',
    operator_id: 'metro-do-porto',
    operator_name: 'Metro do Porto',
    transport_mode: 'Metro',
    lat: 41.1158,
    lon: -8.6059,
    locality: 'Vila Nova de Gaia',
    district: 'Porto',
    lines: [{ code: 'Linha D', name: 'Linha Amarela: Santo Ovídio ↔ Hospital São João', color: '#F4B223', destination: 'Porto Centro / H. S. João', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },
  {
    id: 'mp-hospital-sao-joao',
    name: 'Hospital de São João Interface',
    operator_id: 'metro-do-porto',
    operator_name: 'Metro do Porto / STCP / UNIR',
    transport_mode: 'Metro',
    lat: 41.1824,
    lon: -8.6010,
    locality: 'Porto',
    district: 'Porto',
    lines: [{ code: 'Linha D', name: 'Linha Amarela: Hospital São João ↔ Santo Ovídio', color: '#F4B223', destination: 'Trindade / Gaia', frequencyMinutes: 5 }],
    wheelchair_accessible: true,
  },

  // ========================================================
  // PRINCIPAIS ESTAÇÕES NACIONAIS (Centro, Norte e Sul de Portugal)
  // ========================================================
  {
    id: 'cp-braga',
    name: 'Estação Ferroviária de Braga',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal / TUB',
    transport_mode: 'Comboio',
    lat: 41.5479,
    lon: -8.4343,
    locality: 'Braga',
    district: 'Braga',
    lines: [
      { code: 'Alfa Pendular', name: 'Longo Curso: Braga ↔ Porto ↔ Lisboa', color: '#008542', destination: 'Porto Campanhã / Lisboa Oriente', frequencyMinutes: 60 },
      { code: 'Urbanos Braga', name: 'Urbanos: Braga ↔ Porto São Bento', color: '#008542', destination: 'Porto São Bento', frequencyMinutes: 30 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-guimaraes',
    name: 'Estação Ferroviária de Guimarães',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 41.4367,
    lon: -8.2974,
    locality: 'Guimarães',
    district: 'Braga',
    lines: [{ code: 'Urbanos Guimarães', name: 'Urbanos: Guimarães ↔ Porto São Bento', color: '#008542', destination: 'Porto São Bento', frequencyMinutes: 30 }],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-aveiro',
    name: 'Estação de Aveiro Interface',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 40.6438,
    lon: -8.6405,
    locality: 'Aveiro',
    district: 'Aveiro',
    lines: [
      { code: 'Linha do Norte', name: 'Alfa Pendular / Intercidades', color: '#008542', destination: 'Porto / Lisboa / Coimbra', frequencyMinutes: 30 },
      { code: 'Urbanos Aveiro', name: 'Urbanos: Aveiro ↔ Porto São Bento', color: '#008542', destination: 'Porto São Bento', frequencyMinutes: 30 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-coimbra-b',
    name: 'Estação Ferroviária Coimbra-B',
    operator_id: 'cp-comboios',
    operator_name: 'CP / SMTUC',
    transport_mode: 'Comboio',
    lat: 40.2248,
    lon: -8.4418,
    locality: 'Coimbra',
    district: 'Coimbra',
    lines: [
      { code: 'Linha do Norte', name: 'Alfa Pendular / Intercidades Norte-Sul', color: '#008542', destination: 'Lisboa / Porto', frequencyMinutes: 30 },
      { code: 'Regional', name: 'Regional: Coimbra ↔ Figueira da Foz', color: '#008542', destination: 'Figueira da Foz', frequencyMinutes: 60 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-faro',
    name: 'Estação Ferroviária de Faro Interface',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal / Próximo',
    transport_mode: 'Comboio',
    lat: 37.0189,
    lon: -7.9398,
    locality: 'Faro',
    district: 'Faro',
    lines: [
      { code: 'Alfa Pendular Sul', name: 'Alfa Pendular: Faro ↔ Lisboa ↔ Porto', color: '#008542', destination: 'Lisboa Oriente / Porto Campanhã', frequencyMinutes: 120 },
      { code: 'Linha do Algarve', name: 'Regional: Lagos ↔ Faro ↔ Vila Real Santo António', color: '#008542', destination: 'Lagos / VRSA', frequencyMinutes: 60 }
    ],
    wheelchair_accessible: true,
  },
  {
    id: 'cp-evora',
    name: 'Estação Ferroviária de Évora',
    operator_id: 'cp-comboios',
    operator_name: 'CP - Comboios de Portugal',
    transport_mode: 'Comboio',
    lat: 38.5638,
    lon: -7.9074,
    locality: 'Évora',
    district: 'Évora',
    lines: [{ code: 'Intercidades Alentejo', name: 'Intercidades: Évora ↔ Lisboa Oriente', color: '#008542', destination: 'Lisboa Oriente / Sete Rios', frequencyMinutes: 120 }],
    wheelchair_accessible: true,
  },
  {
    id: 'carris-belem',
    name: 'Mosteiro dos Jerónimos (Belém)',
    operator_id: 'carris-lisboa',
    operator_name: 'Carris',
    transport_mode: 'Elétrico',
    lat: 38.6978,
    lon: -9.2067,
    locality: 'Lisboa',
    district: 'Lisboa',
    lines: [
      { code: '15E', name: 'Elétrico Rápido: Praça da Figueira ↔ Algés', color: '#EAB308', destination: 'Praça da Figueira / Algés', frequencyMinutes: 8 },
      { code: '728', name: 'Autocarro Expresso: Restelo ↔ Portela', color: '#0284C7', destination: 'Oriente / Santa Apolónia', frequencyMinutes: 10 }
    ],
    wheelchair_accessible: true,
  }
];

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
