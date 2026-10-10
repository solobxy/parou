import { Occurrence, DistrictData } from '../types';

// =========================================================================
// REAL DATA CONSTITUTION:
// Zero mock / fake occurrences. All data must come from real user reports
// in the community database or verified real-time public feeds.
// =========================================================================
export const INITIAL_FEATURED_OCCURRENCES: Occurrence[] = [];
export const INITIAL_IMPORTANT_OCCURRENCES: Occurrence[] = [];
export const INITIAL_RECENT_OCCURRENCES: Occurrence[] = [];

// Canonical Portugal districts list (dynamically populated with real incident counts)
export const PORTUGAL_DISTRICTS: DistrictData[] = [
  { id: 'viana-do-castelo', name: 'Viana do Castelo', count: 0, center: { x: 340, y: 75 } },
  { id: 'braga', name: 'Braga', count: 0, center: { x: 380, y: 125 } },
  { id: 'porto', name: 'Porto', count: 0, center: { x: 345, y: 175 } },
  { id: 'vila-real', name: 'Vila Real', count: 0, center: { x: 440, y: 155 } },
  { id: 'braganca', name: 'Bragança', count: 0, center: { x: 540, y: 105 } },
  { id: 'aveiro', name: 'Aveiro', count: 0, center: { x: 310, y: 245 } },
  { id: 'viseu', name: 'Viseu', count: 0, center: { x: 400, y: 235 } },
  { id: 'guarda', name: 'Guarda', count: 0, center: { x: 505, y: 240 } },
  { id: 'coimbra', name: 'Coimbra', count: 0, center: { x: 345, y: 310 } },
  { id: 'castelo-branco', name: 'Castelo Branco', count: 0, center: { x: 470, y: 335 } },
  { id: 'leiria', name: 'Leiria', count: 0, center: { x: 280, y: 375 } },
  { id: 'santarem', name: 'Santarém', count: 0, center: { x: 330, y: 440 } },
  { id: 'portalegre', name: 'Portalegre', count: 0, center: { x: 480, y: 440 } },
  { id: 'lisboa', name: 'Lisboa', count: 0, center: { x: 235, y: 510 } },
  { id: 'setubal', name: 'Setúbal', count: 0, center: { x: 300, y: 565 } },
  { id: 'evora', name: 'Évora', count: 0, center: { x: 440, y: 535 } },
  { id: 'beja', name: 'Beja', count: 0, center: { x: 395, y: 655 } },
  { id: 'faro', name: 'Faro', count: 0, center: { x: 360, y: 745 } },
  // Regiões Autónomas
  { id: 'madeira', name: 'Madeira', count: 0, center: { x: 120, y: 700 } },
  { id: 'acores', name: 'Açores', count: 0, center: { x: 120, y: 620 } },
];

export const DISTRITOS_OPTIONS = [
  'Todos',
  'Lisboa',
  'Porto',
  'Setúbal',
  'Braga',
  'Aveiro',
  'Coimbra',
  'Leiria',
  'Santarém',
  'Faro',
  'Viseu',
  'Viana do Castelo',
  'Vila Real',
  'Castelo Branco',
  'Évora',
  'Guarda',
  'Beja',
  'Bragança',
  'Portalegre',
  'Região Autónoma dos Açores',
  'Região Autónoma da Madeira',
];

export const CIDADES_OPTIONS = [
  'Todas',
  'Lisboa',
  'Porto',
  'Braga',
  'Coimbra',
  'Setúbal',
  'Aveiro',
  'Faro',
  'Leiria',
  'Santarém',
  'Viseu',
  'Viana do Castelo',
  'Évora',
  'Vila Real',
  'Castelo Branco',
  'Beja',
  'Guarda',
  'Portalegre',
  'Bragança',
  'Funchal (Madeira)',
  'Ponta Delgada (Açores)',
];

export const CONCELHOS_BY_DISTRITO: Record<string, string[]> = {
  'Lisboa': ['Todos', 'Lisboa', 'Sintra', 'Cascais', 'Loures', 'Amadora', 'Oeiras', 'Odivelas', 'Vila Franca de Xira', 'Mafra', 'Torres Vedras', 'Alenquer', 'Arruda dos Vinhos', 'Sobral de Monte Agraço', 'Cadaval', 'Lourinhã', 'Azambuja'],
  'Porto': ['Todos', 'Porto', 'Vila Nova de Gaia', 'Matosinhos', 'Maia', 'Gondomar', 'Valongo', 'Paredes', 'Penafiel', 'Santo Tirso', 'Trofa', 'Vila do Conde', 'Póvoa de Varzim', 'Amarante', 'Felgueiras', 'Marco de Canaveses', 'Lousada', 'Baião'],
  'Setúbal': ['Todos', 'Setúbal', 'Almada', 'Seixal', 'Barreiro', 'Montijo', 'Sesimbra', 'Palmela', 'Moita', 'Alcochete', 'Santiago do Cacém', 'Sines', 'Grândola', 'Alcácer do Sal'],
  'Braga': ['Todos', 'Braga', 'Guimarães', 'Barcelos', 'Vila Nova de Famalicão', 'Esposende', 'Fafe', 'Vila Verde', 'Amares', 'Póvoa de Lanhoso', 'Vieira do Minho', 'Cabeceiras de Basto', 'Celorico de Basto', 'Terras de Bouro'],
  'Aveiro': ['Todos', 'Aveiro', 'Ílhavo', 'Ovar', 'Santa Maria da Feira', 'Águeda', 'Espinho', 'Oliveira de Azeméis', 'Albergaria-a-Velha', 'Anadia', 'Estarreja', 'Mealhada', 'Murtosa', 'Sever do Vouga', 'Vagos', 'Vale de Cambra', 'Arouca', 'Castelo de Paiva', 'São João da Madeira'],
  'Coimbra': ['Todos', 'Coimbra', 'Figueira da Foz', 'Cantanhede', 'Montemor-o-Velho', 'Lousã', 'Miranda do Corvo', 'Condeixa-a-Nova', 'Soure', 'Oliveira do Hospital', 'Tábua', 'Penacova', 'Góis', 'Arganil'],
  'Leiria': ['Todos', 'Leiria', 'Marinha Grande', 'Pombal', 'Alcobaça', 'Caldas da Rainha', 'Peniche', 'Nazaré', 'Porto de Mós', 'Batalha', 'Óbidos', 'Alvaiázere', 'Ansião', 'Castanheira de Pêra', 'Figueiró dos Vinhos', 'Pedrógão Grande'],
  'Santarém': ['Todos', 'Santarém', 'Torres Novas', 'Tomar', 'Entroncamento', 'Abrantes', 'Cartaxo', 'Ourém', 'Rio Maior', 'Benavente', 'Almeirim', 'Coruche', 'Salvaterra de Magos', 'Chamusca', 'Golegã', 'Constância', 'Ferreira do Zêzere', 'Mação', 'Sardoal', 'Alcanena'],
  'Faro': ['Todos', 'Faro', 'Portimão', 'Loulé', 'Olhão', 'Albufeira', 'Lagos', 'Silves', 'Tavira', 'Vila Real de Santo António', 'Lagoa', 'Castro Marim', 'São Brás de Alportel', 'Monchique', 'Aljezur', 'Vila do Bispo', 'Alcoutim'],
  'Viseu': ['Todos', 'Viseu', 'Lamego', 'Mangualde', 'Tondela', 'São Pedro do Sul', 'Cinfães', 'Castro Daire', 'Nelas', 'Santa Comba Dão', 'Sátão', 'Moimenta da Beira', 'Tarouca', 'Resende', 'Vouzela', 'Oliveira de Frades', 'Carregal do Sal', 'Mortágua', 'Penalva do Castelo', 'São João da Pesqueira', 'Tabuaço', 'Armamar', 'Penedono', 'Vila Nova de Paiva'],
  'Viana do Castelo': ['Todos', 'Viana do Castelo', 'Ponte de Lima', 'Arcos de Valdevez', 'Monção', 'Valença', 'Caminha', 'Paredes de Coura', 'Melgaço', 'Vila Nova de Cerveira', 'Ponte da Barca'],
  'Vila Real': ['Todos', 'Vila Real', 'Chaves', 'Peso da Régua', 'Valpaços', 'Vila Pouca de Aguiar', 'Montalegre', 'Alijó', 'Ribeira de Pena', 'Sabrosa', 'Santa Marta de Penaguião', 'Boticas', 'Mondim de Basto', 'Mesão Frio', 'Murça'],
  'Castelo Branco': ['Todos', 'Castelo Branco', 'Covilhã', 'Fundão', 'Idanha-a-Nova', 'Sertã', 'Belmonte', 'Penamacor', 'Oleiros', 'Proença-a-Nova', 'Vila Velha de Ródão', 'Vila de Rei'],
  'Évora': ['Todos', 'Évora', 'Montemor-o-Novo', 'Vendas Novas', 'Estremoz', 'Reguengos de Monsaraz', 'Vila Viçosa', 'Arraiolos', 'Borba', 'Redondo', 'Portel', 'Alandroal', 'Mora', 'Viana do Alentejo', 'Mourão'],
  'Guarda': ['Todos', 'Guarda', 'Seia', 'Gouveia', 'Pinhel', 'Sabugal', 'Trancoso', 'Almeida', 'Celoricoda Beira', 'Figueira de Castelo Rodrigo', 'Fornos de Algodres', 'Mêda', 'Aguiar da Beira', 'Vila Nova de Foz Côa'],
  'Beja': ['Todos', 'Beja', 'Serpa', 'Odemira', 'Moura', 'Aljustrel', 'Castro Verde', 'Mértola', 'Vidigueira', 'Almodôvar', 'Ferreira do Alentejo', 'Cuba', 'Ourique', 'Barrancos', 'Alvito'],
  'Bragança': ['Todos', 'Bragança', 'Mirandela', 'Macedo de Cavaleiros', 'Torre de Moncorvo', 'Mogadouro', 'Vinhais', 'Valpaços', 'Miranda do Douro', 'Carrazeda de Ansiães', 'Alfândega da Fé', 'Freixo de Espada à Cinta', 'Vimioso'],
  'Portalegre': ['Todos', 'Portalegre', 'Elvas', 'Ponte de Sor', 'Campo Maior', 'Nisa', 'Castelo de Vide', 'Marvão', 'Alter do Chão', 'Crato', 'Avis', 'Sousel', 'Fronteira', 'Gavião', 'Monforte', 'Arronches'],
  'Região Autónoma dos Açores': ['Todos', 'Ponta Delgada', 'Ribeira Grande', 'Angra do Heroísmo', 'Praia da Vitória', 'Horta', 'Lagoa (Açores)', 'Vila Franca do Campo', 'Madalena', 'Velas', 'Lajes do Pico', 'São Roque do Pico', 'Calheta', 'Nordeste', 'Povoação', 'Vila do Porto', 'Santa Cruz da Graciosa', 'Santa Cruz das Flores', 'Lajes das Flores', 'Corvo'],
  'Região Autónoma da Madeira': ['Todos', 'Funchal', 'Santa Cruz', 'Câmara de Lobos', 'Machico', 'Ribeira Brava', 'Calheta (Madeira)', 'Ponta do Sol', 'Santana', 'São Vicente', 'Porto Moniz', 'Porto Santo'],
};

export const CONCELHOS_BY_CIDADE = CONCELHOS_BY_DISTRITO;

export const OPERADORES_OPTIONS = [
  'Todos',
  'CP - Comboios de Portugal',
  'Carris (Lisboa)',
  'Metro de Lisboa',
  'STCP (Porto)',
  'Metro do Porto',
  'Carris Metropolitana',
  'Fertagus',
  'Transtejo Soflusa',
  'TUB (Braga)',
  'SMTUC (Coimbra)',
  'Próximo (Faro)',
  'AveiroBus',
  'Brisa Autoestradas',
  'Ascendi',
  'Infraestruturas de Portugal',
  'E-Redes (Energia)',
  'EPAL / Águas de Portugal',
  'Proteção Civil (ANEPC)',
];

export const SERVICOS_OPTIONS = [
  'Todos',
  'Urbano',
  'Suburbano',
  'Regional / Inter-regional',
  'Intercidades / Longo Curso',
  'Expresso / Rodoviário',
  'Fluvial / Travessias',
  'Linha de Metro / Subterrâneo',
  'Autoestradas & Vias Principais',
  'Rede Municipal / Local',
];

export const TIPOS_TRANSPORTE_OPTIONS = [
  'Todos',
  'Metro',
  'Comboio',
  'Autocarro',
  'Barco',
  'Elétrico',
  'Rodoviário',
];

export const CATEGORIAS_OPTIONS = [
  'Todas',
  'Acidentes',
  'Avarias',
  'Greves',
  'Atrasos',
  'Obras',
  'Cortes de Trânsito',
  'Serviços Públicos',
];

// Backwards compatibility aliases
export const TRANSPORTES_OPTIONS = OPERADORES_OPTIONS;
export const TIPOS_OCORRENCIA_OPTIONS = CATEGORIAS_OPTIONS;
