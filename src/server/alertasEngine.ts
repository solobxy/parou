// =====================================================================================
// PAROU.PT — Alertas
// Junta numa só resposta o que interessa a quem anda de transportes:
//   - tempo agora (Open-Meteo) e previsão + avisos meteorológicos (IPMA)
//   - feriados nacionais, regionais e municipais (calculados)
//   - perturbações e greves anunciadas pelos operadores (centro de alertas)
//   - notícias de greves, trânsito, mau tempo e obras (RSS de RTP, Público, Observador, CM)
// Cada fonte tem cache própria e falha em silêncio: se uma cair, as outras continuam.
// =====================================================================================
import { DateTime } from 'luxon';
import { getCentralAlerts } from './centralAlertsEngine';

const UA = 'PAROU.PT/2.0 (+https://parou.pt)';
const ZONA = 'Europe/Lisbon';

// ---------------------------------------------------------------------------------
// Cache simples com deduplicação de pedidos em curso
// ---------------------------------------------------------------------------------
const cache = new Map<string, { t: number; v: unknown }>();
const emCurso = new Map<string, Promise<unknown>>();

async function emCache<T>(chave: string, ttlMs: number, fn: () => Promise<T>, recurso: T): Promise<T> {
  const c = cache.get(chave);
  if (c && Date.now() - c.t < ttlMs) return c.v as T;
  const pendente = emCurso.get(chave);
  if (pendente) return pendente as Promise<T>;
  const p = (async () => {
    try {
      const v = await fn();
      cache.set(chave, { t: Date.now(), v });
      return v;
    } catch (err) {
      console.warn(`[Alertas] ${chave}: ${(err as Error)?.message || err}`);
      // Mantém o último valor bom durante mais algum tempo; tenta outra vez daqui a 1 min
      if (c) {
        cache.set(chave, { t: Date.now() - ttlMs + 60_000, v: c.v });
        return c.v as T;
      }
      // Fonte em baixo: não volta a tentar durante 5 min (para não atrasar cada pedido)
      cache.set(chave, { t: Date.now() - ttlMs + 5 * 60_000, v: recurso });
      return recurso;
    } finally {
      emCurso.delete(chave);
    }
  })();
  emCurso.set(chave, p);
  return p;
}

async function buscarJson(url: string, ms = 5000): Promise<any> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  return r.json();
}

async function buscarTexto(url: string, ms = 6000): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${UA})`, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  const cabeca = new TextDecoder('latin1').decode(buf.slice(0, 200)).toLowerCase();
  const tipo = (r.headers.get('content-type') || '').toLowerCase();
  const latin = /iso-8859-1|latin1|windows-1252/.test(tipo) || /encoding=["'](iso-8859-1|windows-1252)/.test(cabeca);
  return new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(buf);
}

function semAcentos(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------------------------
// Distritos (IPMA)
// ---------------------------------------------------------------------------------
export interface DistritoIpma {
  area: string; // idAreaAviso (ex.: PRT)
  nome: string; // ex.: Porto
  globalIdLocal: number;
  lat: number;
  lon: number;
  idRegiao: number; // 1 continente, 2 Madeira, 3 Açores
}

// Recurso caso o IPMA não responda (capitais de distrito do continente)
const DISTRITOS_RECURSO: DistritoIpma[] = [
  { area: 'AVR', nome: 'Aveiro', globalIdLocal: 1010500, lat: 40.6413, lon: -8.6535, idRegiao: 1 },
  { area: 'BJA', nome: 'Beja', globalIdLocal: 1020500, lat: 38.02, lon: -7.87, idRegiao: 1 },
  { area: 'BRG', nome: 'Braga', globalIdLocal: 1030300, lat: 41.5475, lon: -8.4227, idRegiao: 1 },
  { area: 'BGC', nome: 'Bragança', globalIdLocal: 1040200, lat: 41.8076, lon: -6.7606, idRegiao: 1 },
  { area: 'CBO', nome: 'Castelo Branco', globalIdLocal: 1050200, lat: 39.8217, lon: -7.4957, idRegiao: 1 },
  { area: 'CBR', nome: 'Coimbra', globalIdLocal: 1060300, lat: 40.2081, lon: -8.4194, idRegiao: 1 },
  { area: 'EVR', nome: 'Évora', globalIdLocal: 1070500, lat: 38.5701, lon: -7.9104, idRegiao: 1 },
  { area: 'FAR', nome: 'Faro', globalIdLocal: 1080500, lat: 37.0146, lon: -7.9331, idRegiao: 1 },
  { area: 'GDA', nome: 'Guarda', globalIdLocal: 1090700, lat: 40.5379, lon: -7.2647, idRegiao: 1 },
  { area: 'LRA', nome: 'Leiria', globalIdLocal: 1100900, lat: 39.7473, lon: -8.8069, idRegiao: 1 },
  { area: 'LSB', nome: 'Lisboa', globalIdLocal: 1110600, lat: 38.766, lon: -9.1286, idRegiao: 1 },
  { area: 'PTG', nome: 'Portalegre', globalIdLocal: 1121400, lat: 39.2967, lon: -7.4284, idRegiao: 1 },
  { area: 'PTO', nome: 'Porto', globalIdLocal: 1131200, lat: 41.158, lon: -8.6294, idRegiao: 1 },
  { area: 'STR', nome: 'Santarém', globalIdLocal: 1141600, lat: 39.2362, lon: -8.685, idRegiao: 1 },
  { area: 'STB', nome: 'Setúbal', globalIdLocal: 1151200, lat: 38.5246, lon: -8.8856, idRegiao: 1 },
  { area: 'VCT', nome: 'Viana do Castelo', globalIdLocal: 1160900, lat: 41.6952, lon: -8.8365, idRegiao: 1 },
  { area: 'VRL', nome: 'Vila Real', globalIdLocal: 1171400, lat: 41.3002, lon: -7.7398, idRegiao: 1 },
  { area: 'VIS', nome: 'Viseu', globalIdLocal: 1182300, lat: 40.6619, lon: -7.9097, idRegiao: 1 },
];

async function obterDistritos(): Promise<DistritoIpma[]> {
  return emCache('ipma:distritos', 24 * 3600_000, async () => {
    const j = await buscarJson('https://api.ipma.pt/open-data/distrits-islands.json');
    const lista: DistritoIpma[] = (j?.data || [])
      .map((d: any) => ({
        area: String(d.idAreaAviso || ''),
        nome: String(d.local || ''),
        globalIdLocal: Number(d.globalIdLocal),
        lat: Number(d.latitude),
        lon: Number(d.longitude),
        idRegiao: Number(d.idRegiao) || 1,
      }))
      .filter((d: DistritoIpma) => d.area && d.nome && Number.isFinite(d.lat) && Number.isFinite(d.lon));
    if (lista.length < 10) throw new Error('lista de distritos incompleta');
    return lista;
  }, DISTRITOS_RECURSO);
}

// ---------------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------------
type Icone = 'sol' | 'lua' | 'sol-nuvens' | 'lua-nuvens' | 'nuvens' | 'nevoeiro' | 'chuvisco' | 'chuva' | 'aguaceiros' | 'neve' | 'trovoada';

function descreverWmo(codigo: number, dia: boolean): { descricao: string; icone: Icone } {
  if (codigo === 0) return { descricao: 'Céu limpo', icone: dia ? 'sol' : 'lua' };
  if (codigo === 1) return { descricao: 'Pouco nublado', icone: dia ? 'sol-nuvens' : 'lua-nuvens' };
  if (codigo === 2) return { descricao: 'Parcialmente nublado', icone: dia ? 'sol-nuvens' : 'lua-nuvens' };
  if (codigo === 3) return { descricao: 'Nublado', icone: 'nuvens' };
  if (codigo === 45 || codigo === 48) return { descricao: 'Nevoeiro', icone: 'nevoeiro' };
  if (codigo >= 51 && codigo <= 57) return { descricao: 'Chuvisco', icone: 'chuvisco' };
  if (codigo === 61) return { descricao: 'Chuva fraca', icone: 'chuva' };
  if (codigo === 63) return { descricao: 'Chuva', icone: 'chuva' };
  if (codigo === 65) return { descricao: 'Chuva forte', icone: 'chuva' };
  if (codigo === 66 || codigo === 67) return { descricao: 'Chuva gelada', icone: 'chuva' };
  if (codigo >= 71 && codigo <= 77) return { descricao: 'Neve', icone: 'neve' };
  if (codigo === 80) return { descricao: 'Aguaceiros fracos', icone: 'aguaceiros' };
  if (codigo === 81) return { descricao: 'Aguaceiros', icone: 'aguaceiros' };
  if (codigo === 82) return { descricao: 'Aguaceiros fortes', icone: 'aguaceiros' };
  if (codigo === 85 || codigo === 86) return { descricao: 'Aguaceiros de neve', icone: 'neve' };
  if (codigo >= 95) return { descricao: codigo === 95 ? 'Trovoada' : 'Trovoada com granizo', icone: 'trovoada' };
  return { descricao: '—', icone: 'nuvens' };
}

// Tipos de tempo do IPMA (idWeatherType) -> ícone
function iconeIpma(id: number): Icone {
  if (id === 1) return 'sol';
  if (id === 2 || id === 3 || id === 25) return 'sol-nuvens';
  if (id === 4 || id === 5 || id === 24 || id === 27) return 'nuvens';
  if (id === 16 || id === 17 || id === 26) return 'nevoeiro';
  if (id === 6 || id === 7 || id === 8 || id === 15) return 'aguaceiros';
  if (id === 9 || id === 10 || id === 11 || id === 12 || id === 13 || id === 14) return 'chuva';
  if (id === 18 || id === 21 || id === 22) return 'neve';
  if (id === 19 || id === 20 || id === 23) return 'trovoada';
  return 'nuvens';
}

async function tiposTempoIpma(): Promise<Map<number, string>> {
  const lista = await emCache('ipma:tipos', 24 * 3600_000, async () => {
    const j = await buscarJson('https://api.ipma.pt/open-data/weather-type-classe.json');
    return (j?.data || []).map((t: any) => [Number(t.idWeatherType), String(t.descWeatherTypePT || '').trim()] as [number, string]);
  }, [] as Array<[number, string]>);
  return new Map(lista);
}

export interface TempoAgora {
  temperatura: number;
  sensacao?: number;
  codigo: number;
  descricao: string;
  icone: Icone;
  vento?: number;
  dia: boolean;
  hora: string;
}

async function tempoAgora(lat: number, lon: number): Promise<TempoAgora | null> {
  const la = Math.round(lat * 20) / 20;
  const lo = Math.round(lon * 20) / 20;
  return emCache(`meteo:${la},${lo}`, 10 * 60_000, async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&timezone=Europe%2FLisbon`;
    const j = await buscarJson(url, 4000);
    const c = j?.current;
    if (!c || !Number.isFinite(Number(c.temperature_2m))) throw new Error('sem dados atuais');
    const dia = Number(c.is_day) === 1;
    const codigo = Number(c.weather_code) || 0;
    const { descricao, icone } = descreverWmo(codigo, dia);
    return {
      temperatura: Math.round(Number(c.temperature_2m)),
      sensacao: Number.isFinite(Number(c.apparent_temperature)) ? Math.round(Number(c.apparent_temperature)) : undefined,
      codigo,
      descricao,
      icone,
      vento: Number.isFinite(Number(c.wind_speed_10m)) ? Math.round(Number(c.wind_speed_10m)) : undefined,
      dia,
      hora: String(c.time || '').slice(11, 16),
    };
  }, null);
}

export interface DiaPrevisao {
  data: string;
  rotulo: string;
  tMin: number;
  tMax: number;
  descricao: string;
  icone: Icone;
  probChuva: number;
}

async function previsaoIpma(globalIdLocal: number): Promise<DiaPrevisao[]> {
  const brutos = await emCache(`ipma:prev:${globalIdLocal}`, 30 * 60_000, async () => {
    const j = await buscarJson(`https://api.ipma.pt/open-data/forecast/meteorology/cities/daily/${globalIdLocal}.json`);
    const d = j?.data;
    if (!Array.isArray(d) || d.length === 0) throw new Error('previsão vazia');
    return d as any[];
  }, [] as any[]);
  const tipos = await tiposTempoIpma();
  const hoje = DateTime.now().setZone(ZONA).startOf('day');
  const dias = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
  return brutos
    .filter((d) => String(d.forecastDate) >= hoje.toISODate()!)
    .slice(0, 3)
    .map((d) => {
      const data = String(d.forecastDate);
      const dt = DateTime.fromISO(data, { zone: ZONA });
      const diff = Math.round(dt.diff(hoje, 'days').days);
      const rotulo = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : dias[dt.weekday - 1];
      const id = Number(d.idWeatherType);
      return {
        data,
        rotulo,
        tMin: Math.round(Number(d.tMin)),
        tMax: Math.round(Number(d.tMax)),
        descricao: tipos.get(id) || '',
        icone: iconeIpma(id),
        probChuva: Math.round(Number(d.precipitaProb) || 0),
      };
    });
}

export interface AvisoMeteo {
  nivel: 'yellow' | 'orange' | 'red';
  tipo: string;
  texto: string;
  inicio: string;
  fim: string;
  area: string;
  distrito: string;
  local: boolean;
  ativo: boolean;
}

async function avisosIpma(areaLocal: string, distritos: DistritoIpma[]): Promise<AvisoMeteo[]> {
  const brutos = await emCache('ipma:avisos', 10 * 60_000, async () => {
    const j = await buscarJson('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json');
    if (!Array.isArray(j)) throw new Error('formato inesperado');
    return j as any[];
  }, [] as any[]);
  const nomes = new Map(distritos.map((d) => [d.area, d.nome]));
  const agora = DateTime.now().setZone(ZONA);
  const peso = { red: 3, orange: 2, yellow: 1 } as const;
  const lista: AvisoMeteo[] = [];
  for (const w of brutos) {
    const nivel = String(w.awarenessLevelID || '');
    if (nivel !== 'yellow' && nivel !== 'orange' && nivel !== 'red') continue;
    const fim = DateTime.fromISO(String(w.endTime || ''), { zone: ZONA });
    const inicio = DateTime.fromISO(String(w.startTime || ''), { zone: ZONA });
    if (!fim.isValid || fim < agora) continue;
    const area = String(w.idAreaAviso || '');
    const local = area === areaLocal;
    // Noutros distritos só interessam os avisos laranja e vermelho
    if (!local && nivel === 'yellow') continue;
    lista.push({
      nivel,
      tipo: String(w.awarenessTypeName || 'Aviso'),
      texto: String(w.text || '').trim(),
      inicio: inicio.isValid ? inicio.toISO()! : '',
      fim: fim.toISO()!,
      area,
      distrito: nomes.get(area) || area,
      local,
      ativo: !inicio.isValid || inicio <= agora,
    });
  }
  lista.sort((a, b) => Number(b.local) - Number(a.local) || peso[b.nivel] - peso[a.nivel] || a.inicio.localeCompare(b.inicio));
  return lista.slice(0, 12);
}

// ---------------------------------------------------------------------------------
// Feriados
// ---------------------------------------------------------------------------------
function domingoDePascoa(ano: number): DateTime {
  // Algoritmo de Meeus/Jones/Butcher (calendário gregoriano)
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime.fromObject({ year: ano, month: mes, day: dia }, { zone: ZONA });
}

// Feriados municipais das capitais de distrito (só os confirmados)
const FERIADOS_MUNICIPAIS: Record<string, { mes: number; dia: number; nome: string }> = {
  Lisboa: { mes: 6, dia: 13, nome: 'Santo António' },
  Porto: { mes: 6, dia: 24, nome: 'São João' },
  Braga: { mes: 6, dia: 24, nome: 'São João' },
  Coimbra: { mes: 7, dia: 4, nome: 'Rainha Santa Isabel' },
  Aveiro: { mes: 5, dia: 12, nome: 'Santa Joana' },
  Évora: { mes: 6, dia: 29, nome: 'São Pedro' },
  Faro: { mes: 9, dia: 7, nome: 'Dia do Município' },
  Setúbal: { mes: 9, dia: 15, nome: 'Bocage' },
  Viseu: { mes: 9, dia: 21, nome: 'São Mateus' },
  Leiria: { mes: 5, dia: 22, nome: 'Dia da Cidade' },
  Funchal: { mes: 8, dia: 21, nome: 'Dia da Cidade' },
};

export interface Feriado {
  data: string;
  nome: string;
  ambito: 'nacional' | 'regional' | 'municipal' | 'tolerancia';
  local?: string;
  diaSemana: string;
  emDias: number;
}

function feriadosDoAno(ano: number, distrito: DistritoIpma): Array<Omit<Feriado, 'diaSemana' | 'emDias'> & { dt: DateTime }> {
  const p = domingoDePascoa(ano);
  const f = (mes: number, dia: number) => DateTime.fromObject({ year: ano, month: mes, day: dia }, { zone: ZONA });
  const lista: Array<Omit<Feriado, 'diaSemana' | 'emDias'> & { dt: DateTime }> = [
    { dt: f(1, 1), nome: 'Ano Novo', ambito: 'nacional', data: '' },
    { dt: p.minus({ days: 47 }), nome: 'Carnaval', ambito: 'tolerancia', data: '' },
    { dt: p.minus({ days: 2 }), nome: 'Sexta-feira Santa', ambito: 'nacional', data: '' },
    { dt: p, nome: 'Páscoa', ambito: 'nacional', data: '' },
    { dt: f(4, 25), nome: 'Dia da Liberdade', ambito: 'nacional', data: '' },
    { dt: f(5, 1), nome: 'Dia do Trabalhador', ambito: 'nacional', data: '' },
    { dt: p.plus({ days: 60 }), nome: 'Corpo de Deus', ambito: 'nacional', data: '' },
    { dt: f(6, 10), nome: 'Dia de Portugal', ambito: 'nacional', data: '' },
    { dt: f(8, 15), nome: 'Assunção de Nossa Senhora', ambito: 'nacional', data: '' },
    { dt: f(10, 5), nome: 'Implantação da República', ambito: 'nacional', data: '' },
    { dt: f(11, 1), nome: 'Dia de Todos os Santos', ambito: 'nacional', data: '' },
    { dt: f(12, 1), nome: 'Restauração da Independência', ambito: 'nacional', data: '' },
    { dt: f(12, 8), nome: 'Imaculada Conceição', ambito: 'nacional', data: '' },
    { dt: f(12, 25), nome: 'Natal', ambito: 'nacional', data: '' },
  ];
  if (distrito.idRegiao === 2) lista.push({ dt: f(7, 1), nome: 'Dia da Região Autónoma da Madeira', ambito: 'regional', local: 'Madeira', data: '' });
  if (distrito.idRegiao === 3) lista.push({ dt: p.plus({ days: 50 }), nome: 'Dia da Região Autónoma dos Açores', ambito: 'regional', local: 'Açores', data: '' });
  const mun = FERIADOS_MUNICIPAIS[distrito.nome];
  if (mun) lista.push({ dt: f(mun.mes, mun.dia), nome: mun.nome, ambito: 'municipal', local: distrito.nome, data: '' });
  return lista;
}

function proximosFeriados(distrito: DistritoIpma): Feriado[] {
  const hoje = DateTime.now().setZone(ZONA).startOf('day');
  const dias = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
  const todos = [...feriadosDoAno(hoje.year, distrito), ...feriadosDoAno(hoje.year + 1, distrito)];
  return todos
    .map((x) => ({ ...x, emDias: Math.round(x.dt.startOf('day').diff(hoje, 'days').days) }))
    .filter((x) => x.emDias >= 0 && x.emDias <= 120)
    .sort((a, b) => a.emDias - b.emDias)
    .slice(0, 4)
    .map(({ dt, ...x }) => ({ ...x, data: dt.toISODate()!, diaSemana: dias[dt.weekday - 1] }));
}

// ---------------------------------------------------------------------------------
// Perturbações e greves anunciadas pelos operadores
// ---------------------------------------------------------------------------------
type Regiao = 'lisboa' | 'porto' | 'outra';

function regiaoDoDistrito(nome: string): Regiao {
  if (nome === 'Lisboa' || nome === 'Setúbal') return 'lisboa';
  if (nome === 'Porto' || nome === 'Braga' || nome === 'Aveiro') return 'porto';
  return 'outra';
}

export interface OcorrenciaOficial {
  id: string;
  categoria: 'greve' | 'rede' | 'obras';
  tipo: string;
  titulo: string;
  resumo: string;
  operador: string;
  inicio: string;
  fim: string | null;
  estado: 'Ativo' | 'Futuro';
  url: string;
  gravidade: 'Grave' | 'Moderada' | 'Informativo';
  regiao: string;
  linhas: string[];
  local: boolean;
}

async function ocorrenciasOficiais(regiao: Regiao, distrito: string): Promise<OcorrenciaOficial[]> {
  const todas = await Promise.race([
    getCentralAlerts().catch(() => []),
    new Promise<any[]>((r) => setTimeout(() => r([]), 3500)),
  ]);
  const lista: OcorrenciaOficial[] = [];
  for (const a of todas as any[]) {
    if (a.status !== 'Ativo' && a.status !== 'Futuro') continue;
    if (/ipma/i.test(String(a.operador || '')) || /ipma/i.test(String(a.source || ''))) continue; // o tempo tem secção própria
    const textoRegiao = semAcentos(`${a.região || ''} ${(a.municípios || []).join(' ')}`);
    const daRegiao =
      (regiao === 'lisboa' && /lisboa|setubal|almada|seixal|barreiro|sintra|cascais|oeiras|amadora|loures|odivelas|moita|montijo|palmela|sesimbra|mafra|vila franca/.test(textoRegiao)) ||
      (regiao === 'porto' && /porto|gaia|matosinhos|maia|gondomar|valongo|vila do conde|povoa|espinho|santo tirso|trofa|paredes|braga|aveiro/.test(textoRegiao)) ||
      new RegExp(`\\b${semAcentos(distrito)}\\b`).test(textoRegiao);
    const greve = a.tipo === 'greve';
    if (!daRegiao && !greve) continue;
    const categoria: OcorrenciaOficial['categoria'] = greve ? 'greve' : a.tipo === 'obras' ? 'obras' : 'rede';
    const resumo = String(a.descrição || '').replace(/\s+/g, ' ').trim();
    lista.push({
      id: String(a.id),
      categoria,
      tipo: String(a.tipo || ''),
      titulo: String(a.título || '').replace(/\s+/g, ' ').trim(),
      resumo: resumo.length > 240 ? `${resumo.slice(0, 237).trimEnd()}…` : resumo,
      operador: String(a.operador || ''),
      inicio: String(a.start_datetime || ''),
      fim: a.end_datetime ? String(a.end_datetime) : null,
      estado: a.status,
      url: String(a.source_url || ''),
      gravidade: a.severity || 'Informativo',
      regiao: String(a.região || ''),
      linhas: Array.isArray(a.linhas) ? a.linhas.slice(0, 6).map(String) : [],
      local: daRegiao,
    });
  }
  const pesoGrav = { Grave: 2, Moderada: 1, Informativo: 0 } as const;
  lista.sort((x, y) =>
    Number(y.local) - Number(x.local) ||
    Number(y.categoria === 'greve') - Number(x.categoria === 'greve') ||
    Number(y.estado === 'Ativo') - Number(x.estado === 'Ativo') ||
    (pesoGrav[y.gravidade] ?? 0) - (pesoGrav[x.gravidade] ?? 0) ||
    String(y.inicio).localeCompare(String(x.inicio)),
  );
  return lista.slice(0, 40);
}

// ---------------------------------------------------------------------------------
// Notícias (RSS públicos de órgãos de comunicação social portugueses)
// ---------------------------------------------------------------------------------
const FONTES_RSS = [
  { nome: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss/pais' },
  { nome: 'RTP Notícias', url: 'https://www.rtp.pt/noticias/rss' },
  { nome: 'Público', url: 'https://feeds.feedburner.com/PublicoRSS' },
  { nome: 'Público', url: 'https://feeds.feedburner.com/PublicoLocal' },
  { nome: 'Público', url: 'https://feeds.feedburner.com/PublicoSociedade' },
  { nome: 'Observador', url: 'https://observador.pt/feed/' },
  { nome: 'Correio da Manhã', url: 'https://www.cmjornal.pt/rss' },
  { nome: 'Diário de Notícias', url: 'https://www.dn.pt/feed' },
  { nome: 'SAPO 24', url: 'https://24.sapo.pt/rss' },
];

export interface Noticia {
  id: string;
  titulo: string;
  resumo?: string;
  fonte: string;
  url: string;
  data: string;
  categoria: 'greve' | 'transportes' | 'transito' | 'tempo' | 'obras';
  local: boolean;
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function limparTexto(s: string): string {
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  t = decodificarEntidades(t);
  t = t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'); // alguns feeds escapam o CDATA
  t = t.replace(/<[^>]+>/g, ' ');
  return decodificarEntidades(t).replace(/\s+/g, ' ').trim();
}

function campo(item: string, nome: string): string {
  const m = item.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'));
  return m ? m[1] : '';
}

const RE_GREVE = /\bgreve|\bparalisac|servicos minimos|plenario de trabalhadores/;
const RE_TRANSPORTES = /\b(comboios?|ferrovi\w*|cp\b|metro\b|metropolitano|carris|stcp|autocarros?|transportes? publicos?|fertagus|transtejo|soflusa|travessia do tejo|navegante|andante|metrobus|brt\b|alta velocidade|aeroporto|ryanair|tap\b|easyjet|maquinistas|revisores|motoristas)/;
const RE_TRANSITO_FORTE = /\b(transito(?! em julgado)|estrada cortada|cortad[ao]s? ao transito|corte de estrada|condicionamento de transito|engarrafamento|filas de transito|ponte 25 de abril|ponte vasco da gama|ponte da arrabida|ponte do freixo|ponte do infante|vci\b|segunda circular|eixo norte-sul|crel|cril|autoestrada|auto-estrada)\b/;
const RE_ACIDENTE = /\b(acidente|despiste|colisao|capotou|atropel\w*)/;
const RE_VIA = /\b(estrada|viacao|rodoviari\w*|a\d{1,2}\b|ic\d{1,2}\b|ip\d{1,2}\b|en\s?\d{1,3}\b|ponte|autoestrada|auto-estrada|camiao|carro|automovel|mota|motociclo|veiculo|comboio|autocarro|eletrico)/;
const RE_TEMPO = /\b(mau tempo|temporal|tempestade|chuva (?:forte|intensa)|inundac\w*|aviso (?:amarelo|laranja|vermelho)|ipma|ventos? fortes?|rajadas|nevoeiro|onda de calor|calor extremo|queda de neve|neve\b|granizo|agitacao maritima|furacao)/;
const RE_OBRAS = /\b(obras|empreitada|requalificac\w*|infraestruturas de portugal|nova linha|linha rubi|linha rosa|linha circular|linha violeta|prolongamento|tunel|viaduto|nova ponte|estacao de (?:metro|comboios?))/;
const RE_EXCLUIR = /\b(futebol|benfica|sporting|fc porto|liga dos campeoes|golo|treinador|ciclismo|formula 1|motogp|selecao nacional|basquetebol|andebol|tenis)\b/;

function classificarNoticia(titulo: string, resumo: string): Noticia['categoria'] | null {
  const t = semAcentos(`${titulo} ${resumo}`);
  const tt = semAcentos(titulo);
  if (RE_EXCLUIR.test(tt)) return null;
  // "UNIR" (rede de autocarros do Porto) só conta em maiúsculas — "unir" é um verbo
  const transportes = RE_TRANSPORTES.test(t) || /\bUNIR\b/.test(`${titulo} ${resumo}`);
  if (RE_GREVE.test(tt) && transportes) return 'greve';
  if (RE_TEMPO.test(tt)) return 'tempo';
  if (RE_TRANSITO_FORTE.test(tt) || (RE_ACIDENTE.test(tt) && RE_VIA.test(t))) return 'transito';
  if (RE_OBRAS.test(tt) && (transportes || RE_VIA.test(t))) return 'obras';
  if (RE_TRANSPORTES.test(tt) || /\bUNIR\b/.test(titulo)) return 'transportes';
  return null;
}

async function lerFeed(fonte: { nome: string; url: string }): Promise<Array<Omit<Noticia, 'local'> & { texto: string }>> {
  return emCache(`rss:${fonte.url}`, 15 * 60_000, async () => {
    const xml = await buscarTexto(fonte.url);
    const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    const lista: Array<Omit<Noticia, 'local'> & { texto: string }> = [];
    for (const it of itens.slice(0, 60)) {
      const titulo = limparTexto(campo(it, 'title'));
      let url = limparTexto(campo(it, 'link'));
      if (!url) url = limparTexto(campo(it, 'guid'));
      if (!titulo || !/^https?:\/\//.test(url)) continue;
      const resumoBruto = limparTexto(campo(it, 'description'));
      const resumo = resumoBruto.length > 200 ? `${resumoBruto.slice(0, 197).trimEnd()}…` : resumoBruto;
      const dataBruta = limparTexto(campo(it, 'pubDate')) || limparTexto(campo(it, 'dc:date'));
      const dt = DateTime.fromRFC2822(dataBruta).isValid ? DateTime.fromRFC2822(dataBruta) : DateTime.fromISO(dataBruta);
      const categoria = classificarNoticia(titulo, resumoBruto);
      if (!categoria) continue;
      lista.push({
        id: `${fonte.nome}:${url}`,
        titulo,
        resumo: resumo && semAcentos(resumo) !== semAcentos(titulo) ? resumo : undefined,
        fonte: fonte.nome,
        url,
        data: dt.isValid ? dt.toUTC().toISO()! : new Date().toISOString(),
        categoria,
        texto: semAcentos(`${titulo} ${resumoBruto}`),
      });
    }
    return lista;
  }, []);
}

const TERMOS_REGIAO: Record<Regiao, RegExp> = {
  lisboa: /\b(lisboa|setubal|almada|seixal|barreiro|sintra|cascais|oeiras|amadora|loures|odivelas|ponte 25 de abril|vasco da gama|cril|crel|ic19|ic17|segunda circular|fertagus|transtejo|soflusa|carris|metro de lisboa)\b/,
  porto: /\b(porto|gaia|matosinhos|maia|gondomar|valongo|vila do conde|povoa de varzim|espinho|stcp|metro do porto|vci|arrabida|freixo|andante|braga|aveiro)\b/,
  outra: /$^/,
};

async function noticias(regiao: Regiao, distrito: string): Promise<Noticia[]> {
  const listas = await Promise.all(FONTES_RSS.map((f) => lerFeed(f)));
  const limite = DateTime.now().minus({ days: 4 });
  const vistos = new Set<string>();
  const termoDistrito = new RegExp(`\\b${semAcentos(distrito).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const todas: Noticia[] = [];
  for (const n of listas.flat().sort((a, b) => b.data.localeCompare(a.data))) {
    if (DateTime.fromISO(n.data) < limite) continue;
    const chave = semAcentos(n.titulo).replace(/[^a-z0-9 ]/g, '').split(' ').filter((p) => p.length > 3).slice(0, 7).join(' ');
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const { texto, ...resto } = n;
    todas.push({ ...resto, local: TERMOS_REGIAO[regiao].test(texto) || termoDistrito.test(texto) });
  }
  const peso: Record<Noticia['categoria'], number> = { greve: 5, tempo: 3, transito: 2, obras: 1, transportes: 1 };
  // As mais relevantes primeiro (da região e de greves/tempo), mas sem esconder as recentes
  todas.sort((a, b) => {
    const pa = (a.local ? 3 : 0) + peso[a.categoria] - (Date.now() - Date.parse(a.data)) / (12 * 3600_000);
    const pb = (b.local ? 3 : 0) + peso[b.categoria] - (Date.now() - Date.parse(b.data)) / (12 * 3600_000);
    return pb - pa;
  });
  return todas.slice(0, 24);
}

// ---------------------------------------------------------------------------------
// Resposta
// ---------------------------------------------------------------------------------
export interface RespostaAlertas {
  atualizado: string;
  local: { distrito: string; area: string; regiao: Regiao; lat: number; lon: number; porGps: boolean };
  distritos: Array<{ area: string; nome: string }>;
  tempo: { agora: TempoAgora | null; dias: DiaPrevisao[] };
  avisosMeteo: AvisoMeteo[];
  feriados: Feriado[];
  ocorrencias: OcorrenciaOficial[];
  noticias: Noticia[];
}

export async function obterAlertas(opcoes: { lat?: number; lon?: number; area?: string }): Promise<RespostaAlertas> {
  const distritos = await obterDistritos();
  let distrito: DistritoIpma | undefined;
  const temGps = Number.isFinite(opcoes.lat) && Number.isFinite(opcoes.lon);
  if (temGps) {
    distrito = [...distritos].sort(
      (a, b) => distanciaKm(opcoes.lat!, opcoes.lon!, a.lat, a.lon) - distanciaKm(opcoes.lat!, opcoes.lon!, b.lat, b.lon),
    )[0];
  } else if (opcoes.area) {
    distrito = distritos.find((d) => d.area === opcoes.area);
  }
  if (!distrito) distrito = distritos.find((d) => d.area === 'LSB') || distritos[0];
  const lat = temGps ? opcoes.lat! : distrito.lat;
  const lon = temGps ? opcoes.lon! : distrito.lon;
  const regiao = regiaoDoDistrito(distrito.nome);

  const [agora, dias, avisos, ocorrencias, listaNoticias] = await Promise.all([
    tempoAgora(lat, lon).catch(() => null),
    previsaoIpma(distrito.globalIdLocal).catch(() => []),
    avisosIpma(distrito.area, distritos).catch(() => []),
    ocorrenciasOficiais(regiao, distrito.nome).catch(() => []),
    noticias(regiao, distrito.nome).catch(() => []),
  ]);

  return {
    atualizado: new Date().toISOString(),
    local: { distrito: distrito.nome, area: distrito.area, regiao, lat, lon, porGps: temGps },
    distritos: distritos
      .filter((d) => d.idRegiao === 1 || ['MCN', 'MPS', 'ACE', 'AOR', 'AOC'].includes(d.area) || d.nome === 'Funchal' || d.nome === 'Ponta Delgada')
      .map((d) => ({ area: d.area, nome: d.nome }))
      .filter((d, i, arr) => arr.findIndex((x) => x.area === d.area) === i)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt')),
    tempo: { agora, dias },
    avisosMeteo: avisos,
    feriados: proximosFeriados(distrito),
    ocorrencias,
    noticias: listaNoticias,
  };
}

// Aquece as caches gerais (avisos, notícias) logo no arranque do servidor
export function aquecerAlertas(): void {
  setTimeout(() => {
    obterAlertas({ area: 'LSB' }).catch(() => {});
    obterAlertas({ area: 'PTO' }).catch(() => {});
  }, 15_000);
}
