// Título, descrição e endereço canónico de cada página da app. Usado pelo servidor (para o
// HTML inicial e as pré-visualizações) e pela app (ao mudar de página sem recarregar).

export interface Meta { titulo: string; descricao: string; canonico: string; indexar: boolean }

const DESCRICAO_INICIO = 'Vê o que passa perto de ti em tempo real: autocarros da Carris Metropolitana, Carris e STCP, metro, comboios da CP e barcos. Horários de todas as linhas, greves e alertas. Grátis e sem anúncios.';

export const ROTAS: Record<string, Meta> = {
  '/': { titulo: 'PAROU — Autocarros, metro e comboios perto de ti em tempo real', descricao: DESCRICAO_INICIO, canonico: '/', indexar: true },
  '/perto': { titulo: 'Transportes perto de mim em tempo real | PAROU', descricao: DESCRICAO_INICIO, canonico: '/', indexar: true },
  '/transportes': { titulo: 'Horários de autocarros, metro e comboios em Portugal | PAROU', descricao: 'Pesquisa qualquer linha de autocarro, metro, comboio ou barco em Portugal e vê os próximos horários e o tempo real: Carris Metropolitana, Carris, Metro, CP, STCP e mais.', canonico: '/transportes', indexar: true },
  '/horarios': { titulo: 'Horários de autocarros, metro e comboios em Portugal | PAROU', descricao: 'Pesquisa qualquer linha de autocarro, metro, comboio ou barco em Portugal e vê os próximos horários e o tempo real.', canonico: '/transportes', indexar: true },
  '/alertas': { titulo: 'Alertas de transportes: greves, mau tempo e perturbações | PAROU', descricao: 'Greves, avisos do IPMA, incêndios, perturbações nos transportes e feriados que mexem com as tuas viagens, sempre atualizados. Recebe os avisos no telemóvel.', canonico: '/alertas', indexar: true },
  '/mapa': { titulo: 'Mapa de incêndios, avisos e perturbações em Portugal | PAROU', descricao: 'Mapa em direto com incêndios e ocorrências da Proteção Civil, avisos meteorológicos do IPMA, greves e perturbações nos transportes em Portugal.', canonico: '/mapa', indexar: true },
  '/ocorrencias': { titulo: 'Ocorrências nos transportes e no trânsito agora | PAROU', descricao: 'Acidentes, atrasos, avarias e cortes de via reportados pela comunidade nas últimas 24 horas em Portugal.', canonico: '/ocorrencias', indexar: true },
  '/reports': { titulo: 'Ocorrências nos transportes e no trânsito agora | PAROU', descricao: 'Acidentes, atrasos, avarias e cortes de via reportados pela comunidade nas últimas 24 horas.', canonico: '/ocorrencias', indexar: true },
  '/reclamacoes': { titulo: 'Reclamações e opiniões sobre transportes públicos | PAROU', descricao: 'Partilha e lê opiniões e reclamações sobre transportes e serviços públicos em Portugal.', canonico: '/reclamacoes', indexar: true },
  '/catalogo': { titulo: 'Operadores de transportes públicos em Portugal | PAROU', descricao: 'Todos os operadores de autocarro, metro, comboio e barco com horários na PAROU, por região.', canonico: '/catalogo', indexar: true },
  '/cobertura': { titulo: 'Cobertura de horários e dados de transportes | PAROU', descricao: 'Que operadores e linhas de transportes públicos a PAROU cobre em Portugal e de onde vêm os dados.', canonico: '/cobertura', indexar: true },
  '/coverage': { titulo: 'Cobertura de horários e dados de transportes | PAROU', descricao: 'Que operadores e linhas de transportes públicos a PAROU cobre em Portugal.', canonico: '/cobertura', indexar: true },
  '/sobre': { titulo: 'Sobre a PAROU — transportes em tempo real, grátis', descricao: 'A PAROU é uma app gratuita e sem fins lucrativos com os transportes perto de ti em tempo real, horários de todas as linhas, greves e alertas em Portugal.', canonico: '/sobre', indexar: true },
  '/privacidade': { titulo: 'Política de privacidade | PAROU', descricao: 'Que dados a PAROU usa, para quê e quais são os teus direitos (RGPD).', canonico: '/privacidade', indexar: true },
  '/termos': { titulo: 'Termos de utilização | PAROU', descricao: 'Termos de utilização da PAROU, serviço gratuito de informação sobre transportes públicos em Portugal.', canonico: '/termos', indexar: true },
  '/contactar': { titulo: 'Contactar a PAROU | Dinis Sousa', descricao: 'Fala com o autor da PAROU: email e telemóvel para dúvidas, sugestões, erros nos horários, parcerias e dados de operadores.', canonico: '/contactar', indexar: true },
  '/comunidade': { titulo: 'Comunidade PAROU — perguntas, queixas e elogios sobre transportes', descricao: 'Fala com quem anda nos mesmos transportes: faz perguntas, partilha queixas e elogios sobre CP, Metro, Carris, STCP e mais. Respostas dos operadores e sem anúncios.', canonico: '/comunidade', indexar: true },
  '/favoritos': { titulo: 'Os meus favoritos | PAROU', descricao: 'As tuas linhas e paragens favoritas na PAROU.', canonico: '/favoritos', indexar: false },
  '/atrasos': { titulo: 'Atrasos nos transportes agora | PAROU', descricao: 'Atrasos reportados pela comunidade nas últimas 24 horas.', canonico: '/ocorrencias', indexar: false },
  '/acidentes': { titulo: 'Acidentes de trânsito agora | PAROU', descricao: 'Acidentes reportados nas últimas 24 horas.', canonico: '/ocorrencias', indexar: false },
  '/avarias': { titulo: 'Avarias nos transportes agora | PAROU', descricao: 'Avarias reportadas nas últimas 24 horas.', canonico: '/ocorrencias', indexar: false },
  '/cortes': { titulo: 'Cortes de via agora | PAROU', descricao: 'Cortes de via e interrupções reportados nas últimas 24 horas.', canonico: '/ocorrencias', indexar: false },
  '/interrupcoes': { titulo: 'Interrupções nos transportes agora | PAROU', descricao: 'Interrupções reportadas nas últimas 24 horas.', canonico: '/ocorrencias', indexar: false },
};

export const NAO_ENCONTRADA: Meta = { titulo: 'Página não encontrada | PAROU', descricao: 'Esta página não existe ou mudou de sítio.', canonico: '/', indexar: false };


// Uma conversa da comunidade (/comunidade/pub-…): existe sempre para a app abrir, mas não vai para os motores de busca
const CONVERSA = /^\/comunidade\/pub-[a-z0-9]{1,12}-[a-f0-9]{10}$/;
export const CONVERSA_DA_COMUNIDADE: Meta = { titulo: 'Conversa na comunidade | PAROU', descricao: 'Conversa na comunidade PAROU sobre transportes públicos em Portugal.', canonico: '/comunidade', indexar: false };

export function metaDaRota(caminho: string): { meta: Meta; existe: boolean } {
  const limpo = (String(caminho || '/').toLowerCase().replace(/\/+$/, '') || '/');
  if (CONVERSA.test(limpo)) return { meta: CONVERSA_DA_COMUNIDADE, existe: true };
  const meta = ROTAS[limpo];
  return { meta: meta || NAO_ENCONTRADA, existe: Boolean(meta) };
}

/** No browser: atualiza título, descrição, canónico e robots ao mudar de página */
export function aplicarMetaRota(caminho: string): void {
  if (typeof document === 'undefined') return;
  const { meta } = metaDaRota(caminho);
  document.title = meta.titulo;
  const definir = (seletor: string, attr: string, valor: string) => {
    const el = document.querySelector(seletor);
    if (el) el.setAttribute(attr, valor);
  };
  definir('meta[name="description"]', 'content', meta.descricao);
  definir('link[rel="canonical"]', 'href', `https://parou.pt${meta.canonico}`);
  definir('meta[name="robots"]', 'content', meta.indexar ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' : 'noindex, follow');
  definir('meta[property="og:url"]', 'content', `https://parou.pt${meta.canonico}`);
  definir('meta[property="og:title"]', 'content', meta.titulo);
  definir('meta[property="og:description"]', 'content', meta.descricao);
}
