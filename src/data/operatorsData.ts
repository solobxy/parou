import { TransitOperator, GtfsAgencyConfig, TransportMode } from '../types';

/**
 * Estrutura de dados centralizada dos operadores de transporte público em Portugal.
 * Modelada segundo as especificações GTFS (General Transit Feed Specification)
 * e GTFS-Realtime (GTFS-RT) para integração direta com feeds abertos e APIs governamentais (Transporlis, Dados.gov.pt).
 */
export const PORTUGAL_OPERATORS: TransitOperator[] = [
  // 1. Metro de Lisboa
  {
    id: 'metro-de-lisboa',
    code: 'ML',
    name: 'Metro de Lisboa',
    legalName: 'Metropolitano de Lisboa, E.P.E.',
    city: 'Lisboa',
    region: 'Área Metropolitana de Lisboa',
    coverageArea: ['Lisboa', 'Amadora', 'Odivelas'],
    transportModes: ['Metro'],
    website: 'https://www.metrolisboa.pt',
    alertsUrl: 'https://www.metrolisboa.pt/viajar/estado-das-linhas/',
    contactPhone: '+351 213 500 115',
    customerSupportEmail: 'atendimento@metrolisboa.pt',
    status: 'Condicionado',
    statusDescription: 'Linha Amarela com atrasos pontuais (+9 min) no troço Campo Grande ↔ Rato. Linhas Azul, Verde e Vermelha com circulação regular.',
    activeIncidentsCount: 3,
    lastStatusUpdate: 'há 2 min',
    lines: [
      { id: 'ml-azul', code: 'Linha Azul', name: 'Linha da Gaivota', origin: 'Reboleira', destination: 'Santa Apolónia', mode: 'Metro', status: 'Normal', color: '#0072CE', routeTypeGtfs: 1 },
      { id: 'ml-amarela', code: 'Linha Amarela', name: 'Linha do Girassol', origin: 'Odivelas', destination: 'Rato', mode: 'Metro', status: 'Atrasado', color: '#F4B223', routeTypeGtfs: 1 },
      { id: 'ml-verde', code: 'Linha Verde', name: 'Linha da Caravela', origin: 'Telheiras', destination: 'Cais do Sodré', mode: 'Metro', status: 'Normal', color: '#00843D', routeTypeGtfs: 1 },
      { id: 'ml-vermelha', code: 'Linha Vermelha', name: 'Linha do Oriente', origin: 'São Sebastião', destination: 'Aeroporto', mode: 'Metro', status: 'Normal', color: '#DA291C', routeTypeGtfs: 1 },
    ],
    gtfsConfig: {
      agencyId: 'PT-ML',
      agencyName: 'Metropolitano de Lisboa',
      agencyUrl: 'https://www.metrolisboa.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://api.transporlis.pt/gtfs/ml/google_transit.zip',
      gtfsRtServiceAlertsUrl: 'https://api.transporlis.pt/gtfs-rt/ml/alerts',
      gtfsRtTripUpdatesUrl: 'https://api.transporlis.pt/gtfs-rt/ml/tripupdates',
      apiDocumentationUrl: 'https://dados.gov.pt/pt/datasets/metropolitano-de-lisboa-gtfs/',
      isOpenDataAvailable: true,
    },
  },

  // 2. Metro do Porto
  {
    id: 'metro-do-porto',
    code: 'MP',
    name: 'Metro do Porto',
    legalName: 'Metro do Porto, S.A.',
    city: 'Porto',
    region: 'Área Metropolitana do Porto',
    coverageArea: ['Porto', 'Matosinhos', 'Vila Nova de Gaia', 'Maia', 'Gondomar', 'Vila do Conde', 'Póvoa de Varzim'],
    transportModes: ['Metro'],
    website: 'https://www.metrodoporto.pt',
    alertsUrl: 'https://www.metrodoporto.pt/pages/389',
    contactPhone: '+351 226 940 000',
    customerSupportEmail: 'metro@metrodoporto.pt',
    status: 'Gravemente Afetado',
    statusDescription: 'Circulação cortada na Linha A entre Trindade e Campanhã por quebra de catenária. Autocarros de apoio em circulação.',
    activeIncidentsCount: 8,
    lastStatusUpdate: 'há 3 min',
    lines: [
      { id: 'mp-a', code: 'Linha A', name: 'Linha Azul', origin: 'Estádio do Dragão', destination: 'Senhor de Matosinhos', mode: 'Metro', status: 'Interrompido', color: '#0070BA', routeTypeGtfs: 1 },
      { id: 'mp-b', code: 'Linha B', name: 'Linha Vermelha', origin: 'Estádio do Dragão', destination: 'Póvoa de Varzim', mode: 'Metro', status: 'Normal', color: '#ED1C24', routeTypeGtfs: 1 },
      { id: 'mp-c', code: 'Linha C', name: 'Linha Verde', origin: 'Campanhã', destination: 'ISMAI', mode: 'Metro', status: 'Normal', color: '#00A859', routeTypeGtfs: 1 },
      { id: 'mp-d', code: 'Linha D', name: 'Linha Amarela', origin: 'Hospital São João', destination: 'Santo Ovídio / Vila d’Este', mode: 'Metro', status: 'Normal', color: '#F5A800', routeTypeGtfs: 1 },
      { id: 'mp-e', code: 'Linha E', name: 'Linha Violeta', origin: 'Trindade', destination: 'Aeroporto', mode: 'Metro', status: 'Normal', color: '#7B2082', routeTypeGtfs: 1 },
      { id: 'mp-f', code: 'Linha F', name: 'Linha Laranja', origin: 'Senhora da Hora', destination: 'Fânzeres', mode: 'Metro', status: 'Normal', color: '#F58220', routeTypeGtfs: 1 },
    ],
    gtfsConfig: {
      agencyId: 'PT-MP',
      agencyName: 'Metro do Porto',
      agencyUrl: 'https://www.metrodoporto.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://opendata.porto.digital/dataset/gtfs-metro-do-porto',
      gtfsRtServiceAlertsUrl: 'https://api.metrodoporto.pt/gtfs-rt/alerts.pb',
      gtfsRtVehiclePositionsUrl: 'https://api.metrodoporto.pt/gtfs-rt/vehiclepositions.pb',
      apiDocumentationUrl: 'https://opendata.porto.digital/',
      isOpenDataAvailable: true,
    },
  },

  // 3. CP - Comboios de Portugal
  {
    id: 'cp-comboios-de-portugal',
    code: 'CP',
    name: 'CP - Comboios de Portugal',
    legalName: 'CP - Comboios de Portugal, E.P.E.',
    city: 'Nacional',
    region: 'Nacional (Continente)',
    coverageArea: ['Lisboa', 'Porto', 'Braga', 'Coimbra', 'Aveiro', 'Faro', 'Setúbal', 'Santarém', 'Leiria', 'Évora', 'Beja'],
    transportModes: ['Comboio'],
    website: 'https://www.cp.pt',
    alertsUrl: 'https://www.cp.pt/passageiros/pt/consultar-horarios/avisos',
    contactPhone: '+351 808 109 110',
    customerSupportEmail: 'apoioaocliente@cp.pt',
    status: 'Condicionado',
    statusDescription: 'Atrasos médios de 15 min na Linha de Sintra e no Regional do Algarve. Eixo Norte-Sul (Alfa Pendular e Intercidades) a operar dentro dos tempos regulares.',
    activeIncidentsCount: 14,
    lastStatusUpdate: 'há 4 min',
    lines: [
      { id: 'cp-sintra', code: 'Linha de Sintra', name: 'Urbanos de Lisboa', origin: 'Sintra', destination: 'Rossio / Oriente', mode: 'Comboio', status: 'Atrasado', color: '#00835D', routeTypeGtfs: 2 },
      { id: 'cp-cascais', code: 'Linha de Cascais', name: 'Urbanos de Lisboa', origin: 'Cais do Sodré', destination: 'Cascais', mode: 'Comboio', status: 'Normal', color: '#0270BA', routeTypeGtfs: 2 },
      { id: 'cp-azambuja', code: 'Linha da Azambuja', name: 'Urbanos de Lisboa', origin: 'Santa Apolónia', destination: 'Azambuja', mode: 'Comboio', status: 'Normal', color: '#FF7900', routeTypeGtfs: 2 },
      { id: 'cp-porto-braga', code: 'Linha de Braga', name: 'Urbanos do Porto', origin: 'Porto São Bento', destination: 'Braga', mode: 'Comboio', status: 'Normal', color: '#00835D', routeTypeGtfs: 2 },
      { id: 'cp-porto-guimaraes', code: 'Linha de Guimarães', name: 'Urbanos do Porto', origin: 'Porto São Bento', destination: 'Guimarães', mode: 'Comboio', status: 'Normal', color: '#8A2BE2', routeTypeGtfs: 2 },
      { id: 'cp-porto-aveiro', code: 'Linha de Aveiro', name: 'Urbanos do Porto', origin: 'Porto São Bento', destination: 'Aveiro', mode: 'Comboio', status: 'Normal', color: '#0270BA', routeTypeGtfs: 2 },
      { id: 'cp-alfa', code: 'Alfa Pendular', name: 'Longo Curso', origin: 'Braga / Porto', destination: 'Lisboa / Faro', mode: 'Comboio', status: 'Normal', color: '#C8102E', routeTypeGtfs: 2 },
      { id: 'cp-algarve', code: 'Linha do Algarve', name: 'Regional', origin: 'Lagos', destination: 'Vila Real de Santo António', mode: 'Comboio', status: 'Atrasado', color: '#2E8B57', routeTypeGtfs: 2 },
    ],
    gtfsConfig: {
      agencyId: 'PT-CP',
      agencyName: 'CP - Comboios de Portugal',
      agencyUrl: 'https://www.cp.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://dados.gov.pt/pt/datasets/horarios-dos-comboios-cp/',
      gtfsRtTripUpdatesUrl: 'https://api.cp.pt/gtfs-rt/trip-updates',
      apiDocumentationUrl: 'https://dados.gov.pt/pt/organizations/cp-comboios-de-portugal-e-p-e/',
      isOpenDataAvailable: true,
    },
  },

  // 4. Carris (Lisboa)
  {
    id: 'carris',
    code: 'CARRIS',
    name: 'Carris',
    legalName: 'Companhia Carris de Ferro de Lisboa, E.M., S.A.',
    city: 'Lisboa',
    region: 'Área Metropolitana de Lisboa',
    coverageArea: ['Lisboa', 'Amadora', 'Oeiras', 'Odivelas', 'Loures'],
    transportModes: ['Autocarro', 'Elétrico'],
    website: 'https://www.carris.pt',
    alertsUrl: 'https://www.carris.pt/viaje/alteracoes-de-servico/',
    contactPhone: '+351 213 582 333',
    customerSupportEmail: 'atendimento@carris.pt',
    status: 'Condicionado',
    statusDescription: 'Circulação no Elétrico 28E suspensa entre Graça e Portas do Sol devido a viatura em cima dos carris. Carreiras 728 e 736 com demoras de 12 min na zona ribeirinha.',
    activeIncidentsCount: 7,
    lastStatusUpdate: 'há 5 min',
    lines: [
      { id: 'carris-728', code: '728', name: 'Restelo ↔ Portela', origin: 'Restelo (Av. Descobertas)', destination: 'Portela - Rotunda', mode: 'Autocarro', status: 'Atrasado', color: '#E30613', routeTypeGtfs: 3 },
      { id: 'carris-736', code: '736', name: 'Cais do Sodré ↔ Odivelas', origin: 'Cais do Sodré', destination: 'Odivelas (Bairro Dr. Lima Pimentel)', mode: 'Autocarro', status: 'Atrasado', color: '#E30613', routeTypeGtfs: 3 },
      { id: 'carris-758', code: '758', name: 'Cais do Sodré ↔ Portas de Benfica', origin: 'Cais do Sodré', destination: 'Portas de Benfica', mode: 'Autocarro', status: 'Normal', color: '#E30613', routeTypeGtfs: 3 },
      { id: 'carris-28e', code: '28E', name: 'Elétrico de Alfama / Estrela', origin: 'Martim Moniz', destination: 'Campo de Ourique (Prazeres)', mode: 'Elétrico', status: 'Interrompido', color: '#FFCC00', routeTypeGtfs: 0 },
      { id: 'carris-15e', code: '15E', name: 'Elétrico Rápido de Belém', origin: 'Praça da Figueira', destination: 'Algés (Jardim)', mode: 'Elétrico', status: 'Normal', color: '#FFCC00', routeTypeGtfs: 0 },
    ],
    gtfsConfig: {
      agencyId: 'PT-CARRIS',
      agencyName: 'Carris Lisboa',
      agencyUrl: 'https://www.carris.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://api.transporlis.pt/gtfs/carris/google_transit.zip',
      gtfsRtVehiclePositionsUrl: 'https://api.transporlis.pt/gtfs-rt/carris/vehiclepositions',
      gtfsRtServiceAlertsUrl: 'https://api.transporlis.pt/gtfs-rt/carris/alerts',
      apiDocumentationUrl: 'https://dados.gov.pt/pt/datasets/carris-gtfs/',
      isOpenDataAvailable: true,
    },
  },

  // 5. STCP (Porto)
  {
    id: 'stcp',
    code: 'STCP',
    name: 'STCP',
    legalName: 'Sociedade de Transportes Colectivos do Porto, S.A.',
    city: 'Porto',
    region: 'Área Metropolitana do Porto',
    coverageArea: ['Porto', 'Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar', 'Valongo'],
    transportModes: ['Autocarro', 'Elétrico'],
    website: 'https://www.stcp.pt',
    alertsUrl: 'https://www.stcp.pt/pt/viajar/alteracoes-de-servico/',
    contactPhone: '+351 226 158 158',
    customerSupportEmail: 'reclamacoes@stcp.pt',
    status: 'Condicionado',
    statusDescription: 'Linha 205 condicionada por obras na Circunvalação. Linha 500 (marginal fluvial/marítima) a funcionar normalmente.',
    activeIncidentsCount: 4,
    lastStatusUpdate: 'há 6 min',
    lines: [
      { id: 'stcp-200', code: '200', name: 'Bolhão ↔ Castelo do Queijo', origin: 'Bolhão', destination: 'Castelo do Queijo', mode: 'Autocarro', status: 'Normal', color: '#0085CA', routeTypeGtfs: 3 },
      { id: 'stcp-205', code: '205', name: 'Campanhã ↔ Castelo do Queijo', origin: 'Campanhã', destination: 'Castelo do Queijo', mode: 'Autocarro', status: 'Atrasado', color: '#0085CA', routeTypeGtfs: 3 },
      { id: 'stcp-500', code: '500', name: 'Praça da Liberdade ↔ Matosinhos', origin: 'Praça da Liberdade', destination: 'Matosinhos (Mercado)', mode: 'Autocarro', status: 'Normal', color: '#0085CA', routeTypeGtfs: 3 },
      { id: 'stcp-601', code: '601', name: 'Cordoaria ↔ Aeroporto', origin: 'Cordoaria', destination: 'Aeroporto Sá Carneiro', mode: 'Autocarro', status: 'Normal', color: '#0085CA', routeTypeGtfs: 3 },
      { id: 'stcp-1', code: 'Linha 1', name: 'Carro Elétrico Infante ↔ Passeio Alegre', origin: 'Infante', destination: 'Passeio Alegre', mode: 'Elétrico', status: 'Normal', color: '#A65319', routeTypeGtfs: 0 },
    ],
    gtfsConfig: {
      agencyId: 'PT-STCP',
      agencyName: 'STCP Porto',
      agencyUrl: 'https://www.stcp.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://opendata.porto.digital/dataset/stcp-gtfs',
      gtfsRtVehiclePositionsUrl: 'https://api.stcp.pt/gtfs-rt/vehicle-positions',
      gtfsRtTripUpdatesUrl: 'https://api.stcp.pt/gtfs-rt/trip-updates',
      apiDocumentationUrl: 'https://opendata.porto.digital/dataset/stcp-gtfs',
      isOpenDataAvailable: true,
    },
  },

  // 6. Fertagus
  {
    id: 'fertagus',
    code: 'FERTAGUS',
    name: 'Fertagus',
    legalName: 'Fertagus - Travessia do Tejo, Transportes, S.A.',
    city: 'Setúbal',
    region: 'Área Metropolitana de Lisboa',
    coverageArea: ['Lisboa', 'Almada', 'Seixal', 'Sesimbra', 'Setúbal', 'Palmela'],
    transportModes: ['Comboio'],
    website: 'https://www.fertagus.pt',
    alertsUrl: 'https://www.fertagus.pt/avisos',
    contactPhone: '+351 707 127 127',
    customerSupportEmail: 'info@fertagus.pt',
    status: 'Operacional',
    statusDescription: 'Travessia da Ponte 25 de Abril sem constrangimentos. Horários cumpridos com regularidade.',
    activeIncidentsCount: 0,
    lastStatusUpdate: 'há 10 min',
    lines: [
      { id: 'fertagus-roma-setubal', code: 'Linha do Sul', name: 'Comboio da Ponte', origin: 'Lisboa (Roma-Areeiro)', destination: 'Setúbal', mode: 'Comboio', status: 'Normal', color: '#009EE0', routeTypeGtfs: 2 },
      { id: 'fertagus-roma-coina', code: 'Linha Curta', name: 'Roma-Areeiro ↔ Coina', origin: 'Lisboa (Roma-Areeiro)', destination: 'Coina', mode: 'Comboio', status: 'Normal', color: '#009EE0', routeTypeGtfs: 2 },
    ],
    gtfsConfig: {
      agencyId: 'PT-FERTAGUS',
      agencyName: 'Fertagus',
      agencyUrl: 'https://www.fertagus.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://api.transporlis.pt/gtfs/fertagus/google_transit.zip',
      isOpenDataAvailable: true,
    },
  },

  // 7. Transtejo Soflusa
  {
    id: 'transtejo-soflusa',
    code: 'TTSL',
    name: 'Transtejo Soflusa',
    legalName: 'Transtejo - Transportes Tejo, S.A. / Soflusa, S.A.',
    city: 'Lisboa',
    region: 'Área Metropolitana de Lisboa',
    coverageArea: ['Lisboa', 'Almada', 'Seixal', 'Barreiro', 'Montijo'],
    transportModes: ['Barco'],
    website: 'https://ttsl.pt',
    alertsUrl: 'https://ttsl.pt/avisos/',
    contactPhone: '+351 808 203 050',
    customerSupportEmail: 'apoio.cliente@ttsl.pt',
    status: 'Operacional',
    statusDescription: 'Ligações fluviais entre Cais do Sodré, Terreiro do Paço e a Margem Sul a operar em condições regulares.',
    activeIncidentsCount: 1,
    lastStatusUpdate: 'há 8 min',
    lines: [
      { id: 'ttsl-cacilhas', code: 'Cais do Sodré ↔ Cacilhas', name: 'Ligação Cacilhas', origin: 'Cais do Sodré', destination: 'Cacilhas', mode: 'Barco', status: 'Normal', color: '#005596', routeTypeGtfs: 4 },
      { id: 'ttsl-barreiro', code: 'Terreiro do Paço ↔ Barreiro', name: 'Ligação Barreiro (Catamarã)', origin: 'Terreiro do Paço', destination: 'Barreiro', mode: 'Barco', status: 'Normal', color: '#005596', routeTypeGtfs: 4 },
      { id: 'ttsl-seixal', code: 'Cais do Sodré ↔ Seixal', name: 'Ligação Seixal', origin: 'Cais do Sodré', destination: 'Seixal', mode: 'Barco', status: 'Normal', color: '#005596', routeTypeGtfs: 4 },
      { id: 'ttsl-montijo', code: 'Cais do Sodré ↔ Montijo', name: 'Ligação Montijo', origin: 'Cais do Sodré', destination: 'Montijo (Cais do Seixalinho)', mode: 'Barco', status: 'Normal', color: '#005596', routeTypeGtfs: 4 },
    ],
    gtfsConfig: {
      agencyId: 'PT-TTSL',
      agencyName: 'Transtejo Soflusa',
      agencyUrl: 'https://ttsl.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://api.transporlis.pt/gtfs/ttsl/google_transit.zip',
      isOpenDataAvailable: true,
    },
  },

  // 8. Carris Metropolitana (TML)
  {
    id: 'carris-metropolitana',
    code: 'CM',
    name: 'Carris Metropolitana',
    legalName: 'Transportes Metropolitanos de Lisboa, E.M.T., S.A.',
    city: 'Lisboa',
    region: 'Área Metropolitana de Lisboa',
    coverageArea: [
      'Amadora', 'Cascais', 'Lisboa', 'Loures', 'Mafra', 'Odivelas', 'Oeiras', 'Sintra', 'Vila Franca de Xira',
      'Alcochete', 'Almada', 'Barreiro', 'Moita', 'Montijo', 'Palmela', 'Seixal', 'Sesimbra', 'Setúbal'
    ],
    transportModes: ['Autocarro'],
    website: 'https://www.carrismetropolitana.pt',
    alertsUrl: 'https://www.carrismetropolitana.pt/avisos/',
    contactPhone: '+351 210 418 800',
    customerSupportEmail: 'contacto@carrismetropolitana.pt',
    status: 'Operacional',
    statusDescription: 'Rede rodoviária intermunicipal da Área Metropolitana de Lisboa com circulação globalmente estável nas 4 áreas operacionais.',
    activeIncidentsCount: 5,
    lastStatusUpdate: 'há 15 min',
    lines: [
      { id: 'cm-4701', code: '4701', name: 'Azeitão ↔ Lisboa (Sete Rios)', origin: 'Azeitão', destination: 'Lisboa (Sete Rios)', mode: 'Autocarro', status: 'Normal', color: '#FFCC00', routeTypeGtfs: 3 },
      { id: 'cm-1715', code: '1715', name: 'Belas ↔ Colégio Militar', origin: 'Belas (Estação)', destination: 'Colégio Militar (Metro)', mode: 'Autocarro', status: 'Normal', color: '#FFCC00', routeTypeGtfs: 3 },
      { id: 'cm-2601', code: '2601', name: 'Loures ↔ Campo Grande', origin: 'Loures (Centro)', destination: 'Campo Grande (Metro)', mode: 'Autocarro', status: 'Normal', color: '#FFCC00', routeTypeGtfs: 3 },
    ],
    gtfsConfig: {
      agencyId: 'PT-CM',
      agencyName: 'Carris Metropolitana',
      agencyUrl: 'https://www.carrismetropolitana.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://api.carrismetropolitana.pt/gtfs',
      gtfsRtVehiclePositionsUrl: 'https://api.carrismetropolitana.pt/gtfs-rt/vehicle-positions',
      gtfsRtTripUpdatesUrl: 'https://api.carrismetropolitana.pt/gtfs-rt/trip-updates',
      apiDocumentationUrl: 'https://github.com/carrismetropolitana/api',
      isOpenDataAvailable: true,
    },
  },

  // 9. UNIR Mobilidade (Porto)
  {
    id: 'unir-mobilidade',
    code: 'UNIR',
    name: 'UNIR Mobilidade',
    legalName: 'Área Metropolitana do Porto - Rede UNIR',
    city: 'Porto',
    region: 'Área Metropolitana do Porto',
    coverageArea: ['Porto', 'Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar', 'Valongo', 'Santo Tirso', 'Póvoa de Varzim', 'Vila do Conde', 'Trofa', 'Paredes', 'Penafiel', 'Santa Maria da Feira', 'Espinho', 'Oliveira de Azeméis', 'São João da Madeira', 'Arouca', 'Vale de Cambra'],
    transportModes: ['Autocarro'],
    website: 'https://www.unirmobilidade.pt',
    alertsUrl: 'https://www.unirmobilidade.pt/avisos',
    contactPhone: '+351 220 900 600',
    customerSupportEmail: 'geral@unirmobilidade.pt',
    status: 'Condicionado',
    statusDescription: 'Adaptações de horários e percursos em curso nos lotes 3 e 4. Linhas troncais com serviço regular.',
    activeIncidentsCount: 6,
    lastStatusUpdate: 'há 18 min',
    lines: [
      { id: 'unir-9001', code: '9001', name: 'Porto (Campanhã) ↔ Gondomar', origin: 'Porto (Campanhã)', destination: 'Gondomar (Souto)', mode: 'Autocarro', status: 'Normal', color: '#002B49', routeTypeGtfs: 3 },
      { id: 'unir-2001', code: '2001', name: 'Gaia (General Torres) ↔ Espinho', origin: 'V.N. Gaia (Gen. Torres)', destination: 'Espinho (Estação)', mode: 'Autocarro', status: 'Normal', color: '#002B49', routeTypeGtfs: 3 },
    ],
    gtfsConfig: {
      agencyId: 'PT-UNIR',
      agencyName: 'UNIR Mobilidade',
      agencyUrl: 'https://www.unirmobilidade.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      apiDocumentationUrl: 'https://opendata.porto.digital/',
      isOpenDataAvailable: false,
    },
  },

  // 10. TUB - Transportes Urbanos de Braga
  {
    id: 'tub-braga',
    code: 'TUB',
    name: 'TUB (Braga)',
    legalName: 'Transportes Urbanos de Braga, E.M.',
    city: 'Braga',
    region: 'Cávado / Minho',
    coverageArea: ['Braga'],
    transportModes: ['Autocarro'],
    website: 'https://tub.pt',
    alertsUrl: 'https://tub.pt/avisos/',
    contactPhone: '+351 253 606 890',
    customerSupportEmail: 'reclamacoes@tub.pt',
    status: 'Condicionado',
    statusDescription: 'Linha 7 com atrasos de 8 min devido a trânsito intenso no nó de acesso à Universidade do Minho (Gualtar).',
    activeIncidentsCount: 2,
    lastStatusUpdate: 'há 7 min',
    lines: [
      { id: 'tub-2', code: 'Linha 2', name: 'Ponte de Prado ↔ Bom Jesus', origin: 'Ponte de Prado', destination: 'Bom Jesus do Monte', mode: 'Autocarro', status: 'Normal', color: '#28A745', routeTypeGtfs: 3 },
      { id: 'tub-7', code: 'Linha 7', name: 'Gualtar (UMinho) ↔ Estação CP', origin: 'Universidade do Minho', destination: 'Estação de Braga', mode: 'Autocarro', status: 'Atrasado', color: '#28A745', routeTypeGtfs: 3 },
      { id: 'tub-9', code: 'Linha 9', name: 'Aveleda ↔ Dume', origin: 'Aveleda', destination: 'Dume', mode: 'Autocarro', status: 'Normal', color: '#28A745', routeTypeGtfs: 3 },
    ],
    gtfsConfig: {
      agencyId: 'PT-TUB',
      agencyName: 'TUB Braga',
      agencyUrl: 'https://tub.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://tub.pt/opendata/gtfs.zip',
      isOpenDataAvailable: true,
    },
  },

  // 11. SMTUC - Coimbra
  {
    id: 'smtuc-coimbra',
    code: 'SMTUC',
    name: 'SMTUC (Coimbra)',
    legalName: 'Serviços Municipalizados de Transportes Urbanos de Coimbra',
    city: 'Coimbra',
    region: 'Região de Coimbra',
    coverageArea: ['Coimbra'],
    transportModes: ['Autocarro', 'Elétrico'],
    website: 'https://www.smtuc.pt',
    alertsUrl: 'https://www.smtuc.pt/avisos/',
    contactPhone: '+351 239 801 100',
    customerSupportEmail: 'smtuc@smtuc.pt',
    status: 'Operacional',
    statusDescription: 'Circulação normal em todas as carreiras municipais de Coimbra.',
    activeIncidentsCount: 1,
    lastStatusUpdate: 'há 12 min',
    lines: [
      { id: 'smtuc-4', code: 'Linha 4', name: 'Arnado ↔ Santo António dos Olivais', origin: 'Arnado', destination: 'Santo António dos Olivais', mode: 'Autocarro', status: 'Normal', color: '#17A2B8', routeTypeGtfs: 3 },
      { id: 'smtuc-6', code: 'Linha 6', name: 'Praça da República ↔ Hospitais da Universidade (HUC)', origin: 'Praça da República', destination: 'HUC', mode: 'Autocarro', status: 'Normal', color: '#17A2B8', routeTypeGtfs: 3 },
      { id: 'smtuc-103', code: 'Linha 103', name: 'Estação Nova ↔ Polo II da Universidade', origin: 'Estação de Coimbra-A', destination: 'Polo II', mode: 'Autocarro', status: 'Normal', color: '#17A2B8', routeTypeGtfs: 3 },
    ],
    gtfsConfig: {
      agencyId: 'PT-SMTUC',
      agencyName: 'SMTUC Coimbra',
      agencyUrl: 'https://www.smtuc.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      staticGtfsFeedUrl: 'https://dados.gov.pt/pt/datasets/smtuc-horarios-e-linhas/',
      isOpenDataAvailable: true,
    },
  },

  // 12. Próximo (Faro)
  {
    id: 'proximo-faro',
    code: 'PROXIMO',
    name: 'Próximo (Faro)',
    legalName: 'Transportes Urbanos de Faro - Próximo',
    city: 'Faro',
    region: 'Algarve',
    coverageArea: ['Faro', 'Montenegro', 'Gambelas', 'Praia de Faro'],
    transportModes: ['Autocarro'],
    website: 'https://proximo.pt',
    alertsUrl: 'https://proximo.pt/avisos/',
    contactPhone: '+351 289 899 760',
    customerSupportEmail: 'faro@proximo.pt',
    status: 'Operacional',
    statusDescription: 'Carreiras para o Aeroporto e para a Praia de Faro com circulação pontual.',
    activeIncidentsCount: 0,
    lastStatusUpdate: 'há 20 min',
    lines: [
      { id: 'proximo-16', code: 'Linha 16', name: 'Terminal ↔ Praia de Faro (via Aeroporto)', origin: 'Terminal Rodoviário', destination: 'Praia de Faro', mode: 'Autocarro', status: 'Normal', color: '#FD7E14', routeTypeGtfs: 3 },
      { id: 'proximo-14', code: 'Linha 14', name: 'Terminal ↔ Campus de Gambelas', origin: 'Terminal Rodoviário', destination: 'Universidade do Algarve', mode: 'Autocarro', status: 'Normal', color: '#FD7E14', routeTypeGtfs: 3 },
    ],
    gtfsConfig: {
      agencyId: 'PT-PROXIMO',
      agencyName: 'Próximo Faro',
      agencyUrl: 'https://proximo.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      isOpenDataAvailable: false,
    },
  },

  // 13. AveiroBus
  {
    id: 'aveiro-bus',
    code: 'AVEIROBUS',
    name: 'AveiroBus',
    legalName: 'AveiroBus - Transdev',
    city: 'Aveiro',
    region: 'Região de Aveiro',
    coverageArea: ['Aveiro', 'Ílhavo', 'São Jacinto'],
    transportModes: ['Autocarro', 'Barco'],
    website: 'https://aveirobus.pt',
    alertsUrl: 'https://aveirobus.pt/avisos',
    contactPhone: '+351 234 403 860',
    customerSupportEmail: 'info@aveirobus.pt',
    status: 'Operacional',
    statusDescription: 'Circulação rodoviária e ferryboat de São Jacinto operacionais.',
    activeIncidentsCount: 0,
    lastStatusUpdate: 'há 15 min',
    lines: [
      { id: 'aveiro-1', code: 'Linha 1', name: 'Estação CP ↔ Universidade de Aveiro', origin: 'Estação de Aveiro', destination: 'Universidade', mode: 'Autocarro', status: 'Normal', color: '#6F42C1', routeTypeGtfs: 3 },
      { id: 'aveiro-ferry', code: 'Ferryboat', name: 'Forte da Barra ↔ São Jacinto', origin: 'Forte da Barra', destination: 'São Jacinto', mode: 'Barco', status: 'Normal', color: '#005596', routeTypeGtfs: 4 },
    ],
    gtfsConfig: {
      agencyId: 'PT-AVEIROBUS',
      agencyName: 'AveiroBus',
      agencyUrl: 'https://aveirobus.pt',
      agencyTimezone: 'Europe/Lisbon',
      agencyLang: 'pt',
      isOpenDataAvailable: false,
    },
  },
];

// ==========================================
// FUNÇÕES AUXILIARES E INTEGRAÇÃO DE APIS
// ==========================================

export function getOperatorById(id: string): TransitOperator | undefined {
  return PORTUGAL_OPERATORS.find((op) => op.id === id || op.code.toLowerCase() === id.toLowerCase());
}

export function getOperatorsByCity(city: string): TransitOperator[] {
  if (!city || city === 'Todas') return PORTUGAL_OPERATORS;
  const c = city.toLowerCase();
  return PORTUGAL_OPERATORS.filter((op) => 
    op.city.toLowerCase() === c || 
    op.city.toLowerCase() === 'nacional' ||
    op.coverageArea.some((area) => area.toLowerCase().includes(c))
  );
}

export function getOperatorsByRegion(region: string): TransitOperator[] {
  const r = region.toLowerCase();
  return PORTUGAL_OPERATORS.filter((op) => op.region.toLowerCase().includes(r));
}

export function getOperatorsByMode(mode: TransportMode): TransitOperator[] {
  return PORTUGAL_OPERATORS.filter((op) => op.transportModes.includes(mode));
}

export function searchOperators(query: string): TransitOperator[] {
  if (!query || !query.trim()) return PORTUGAL_OPERATORS;
  const q = query.toLowerCase().trim();
  return PORTUGAL_OPERATORS.filter((op) => 
    op.name.toLowerCase().includes(q) ||
    op.code.toLowerCase().includes(q) ||
    op.city.toLowerCase().includes(q) ||
    op.region.toLowerCase().includes(q) ||
    op.lines.some((l) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q))
  );
}

export function getGtfsAgenciesCatalog(): GtfsAgencyConfig[] {
  return PORTUGAL_OPERATORS.map((op) => op.gtfsConfig);
}
