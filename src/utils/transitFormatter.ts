import { t, LOCALE } from '../i18n';
import { expandirAbreviaturas } from './abreviaturas';
/**
 * PAROU - Transit Text & Departures Formatter
 * Formata nomes em maiúsculas vindos de feeds GTFS (preservando siglas)
 * e normaliza partidas (minutos em grande + hora exata em pequeno).
 */

const ACRONYMS = new Set([
  'CP', 'IC', 'AP', 'IR', 'R', 'U', 'STCP', 'MTS', 'TCB', 'TML',
  'RL', 'TST', 'TUB', 'SMTUC', 'TUG', 'TUA', 'TAV', 'AVE',
  'EST', 'GPS', 'ID', 'CE', 'HPH', 'HSJ', 'IPO', 'ISMAI', 'ISEP', 'ISCAP', 'ESMAD', 'FEUP'
]);

const LOWERCASE_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos',
  'por', 'pra', 'para', 'com', 'ao', 'aos', 'à', 'às', 'até', 'ou'
]);

/** O operador (ex.: Carris Lisboa) por vezes só envia "Destino" ou "Destino terminal" em vez do destino verdadeiro */
const DESTINO_GENERICO = /^\s*destino(\s+terminal)?\s*$/i;
export function destinoGenerico(destino?: string | null): boolean {
  return DESTINO_GENERICO.test(String(destino || ''));
}

/**
 * Destino a mostrar. Se o operador só deu um texto genérico ("Destino"), usa o nome da linha,
 * que diz de onde a onde vai (ex.: "Martim Moniz - Campo Ourique"). Devolve '' se não houver nada útil.
 */
export function destinoLegivel(destino?: string | null, nomeLinha?: string | null): string {
  const d = String(destino || '').trim();
  if (d && !destinoGenerico(d)) return formatTransitName(d);
  const n = String(nomeLinha || '').trim();
  if (n && !destinoGenerico(n)) return formatTransitName(n);
  return d ? formatTransitName(d) : '';
}

/**
 * Converte nomes em maiúsculas (ex.: "AV.ALIADOS", "CORDOARIA-S.PEDRO DA COVA")
 * para Title Case ("Av. Aliados", "Cordoaria - S. Pedro da Cova"), mantendo siglas como CP, IC, STCP.
 */
// Palavras curtas que aparecem em maiúsculas no meio de nomes normais mas não são siglas
const PALAVRAS_CURTAS = new Set(['RIO', 'MAR', 'SUL', 'LUZ', 'SÉ', 'RUA', 'SÃO', 'VALE', 'ALTO', 'CRUZ', 'MATA', 'CASA',
  'VILA', 'LAGO', 'POÇO', 'PICO', 'FOZ', 'PAZ', 'BOA', 'BOM', 'REI', 'SOL', 'NOVA', 'NOVO', 'ALVO', 'LOBO', 'OURO',
  'MEIO', 'FIM', 'SEDE', 'LAPA', 'BICA', 'PAÇO', 'PENA', 'FARO', 'BEJA', 'MAIA', 'ILHA', 'LIMA', 'RIBA']);
// Numeração romana ("D. João II", "Lusíadas III"): fica sempre em maiúsculas
const ROMANO = /^(?=.{2,5}$)X{0,3}(IX|IV|V?I{0,3})$/;

export function formatTransitName(raw?: string | null): string {
  if (!raw) return '';
  let text = expandirAbreviaturas(String(raw));
  if (!text) return '';
  // Nome já escrito com minúsculas pelo operador: as palavras curtas em maiúsculas são siglas
  // ("(GNR)", "CMF", "EB1/JI") e ficam como estão, em vez de virar "Gnr" ou "Eb1/ji".
  // Conta a proporção: "BOAVISTA - CABO DO MUNDO (Via MAR Shop.)" continua a ser um nome em maiúsculas.
  const letras = text.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  const minusculas = letras.replace(/[^a-zà-ÿ]/g, '').length;
  const jaTemMinusculas = letras.length > 0 && minusculas / letras.length >= 0.25;

  // Insere espaço a seguir ao ponto se seguido imediatamente por letra (ex.: "AV.ALIADOS" -> "AV. ALIADOS", "S.PEDRO" -> "S. PEDRO")
  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ])\.(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1. ');

  // Normaliza hífen colado a letras (ex.: "CORDOARIA-S.PEDRO" -> "CORDOARIA - S. PEDRO")
  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-(?=[A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1 - ');

  const words = text.split(/\s+/);
  return words.map((word, idx) => {
    // Preserva pontuação circundante como "(CP)", "[STCP]", "S.Bento,"
    const match = word.match(/^([(\[{]*)(.*?)([)\]},;:]*)$/);
    if (!match) return word;
    const [, pre, core, post] = match;
    if (!core) return word;
    if (core.includes('/')) return pre + core.split('/').map((parte) => formatarPalavra(parte, idx, jaTemMinusculas)).join('/') + post;
    return pre + formatarPalavra(core, idx, jaTemMinusculas) + post;
  }).join(' ');
}

function formatarPalavra(core: string, idx: number, jaTemMinusculas: boolean): string {
  if (!core) return core;
  const upperCore = core.toUpperCase();
  const emMaiusculas = core === upperCore && /[A-ZÀ-Ý]/.test(core);
  // Códigos com números ("D2A", "750B", "EB1", "IC19", "T-19") e numeração romana ficam em maiúsculas
  if (emMaiusculas && /\d/.test(core) && core.length <= 8) return core;
  if (emMaiusculas && ROMANO.test(core)) return core;
  // Siglas não levam acentos ("URRÔ", "SÉ" são palavras)
  if (jaTemMinusculas && emMaiusculas && /^[A-Z]{2,4}$/.test(core) && !LOWERCASE_WORDS.has(core.toLowerCase()) && !PALAVRAS_CURTAS.has(core)) {
    return core;
  }
  // Palavras compostas ("CascaiShopping", "IronMan", "ESTBarreiro") ficam como o operador as escreveu;
  // gralhas como "CHarneca" ou "SUl" (só duas maiúsculas no início) continuam a ser corrigidas
  if (jaTemMinusculas && (/[a-zà-ÿ][A-ZÀ-Ý]/.test(core) || /^[A-ZÀ-Ý]{3,}[a-zà-ÿ]{2,}/.test(core))) return core;
  if (ACRONYMS.has(upperCore)) return upperCore;

  const lowerCore = core.toLowerCase();
  if (idx > 0 && LOWERCASE_WORDS.has(lowerCore)) return lowerCore;
  // "(via Courelas)": se o operador escreveu "via" em minúsculas, fica assim ("Via Rápida" não muda)
  if (idx > 0 && jaTemMinusculas && core === 'via') return core;

  // Abreviaturas comuns com ponto como "Av.", "R.", "S.", "Sto."
  if (lowerCore.endsWith('.')) {
    const stem = lowerCore.slice(0, -1);
    return stem.charAt(0).toUpperCase() + stem.slice(1) + '.';
  }

  // "d'Este" / "D'ESTE" -> "D'Este" (a letra a seguir ao apóstrofo também leva maiúscula)
  const comCaixa = core.charAt(0).toUpperCase() + core.slice(1).toLowerCase();
  const comApostrofo = comCaixa.replace(/(['’])([a-zà-ÿ])/g, (_m, ap: string, letra: string) => ap + letra.toUpperCase());
  // No meio do nome, "d'" fica em minúscula: "Vila d'Este"
  return idx > 0 && /^D['’]/.test(comApostrofo) ? 'd' + comApostrofo.slice(1) : comApostrofo;
}

// Formatadores criados uma única vez: construir um Intl.DateTimeFormat custa ~100× mais do que usá-lo,
// e esta função corre dezenas de vezes por segundo no Perto.
const TZ = 'Europe/Lisbon';
const FMT_HORA = new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' });
const FMT_DIGITOS = new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const FMT_DIA_PT = new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
const FMT_DIA_CA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
let fmtSemana: Intl.DateTimeFormat | null = null;

/** Hora/dia de Lisboa "agora", calculados no máximo uma vez por minuto (o fuso só muda em horas certas). */
let agoraBalde = -1;
let agoraCache = { nowMinutes: 0, todayDigits: '', diaHojePt: '', diaHojeCa: '' };
function contextoAgora(now: Date) {
  const balde = Math.floor(now.getTime() / 60000);
  if (balde !== agoraBalde) {
    const partes = FMT_HORA.format(now).split(':').map(Number);
    agoraCache = {
      nowMinutes: (partes[0] || 0) * 60 + (partes[1] || 0),
      todayDigits: FMT_DIGITOS.format(now).split('/').reverse().join(''),
      diaHojePt: FMT_DIA_PT.format(now),
      diaHojeCa: FMT_DIA_CA.format(now),
    };
    agoraBalde = balde;
  }
  return agoraCache;
}

/** Atraso a partir do qual se avisa (o servidor só marca atraso acima de 1,5 min, que arredonda para 2) */
const ATRASO_MINIMO_MIN = 2;
/** Acima disto, quase de certeza a hora está trocada (viagem mal associada): não se mostra um atraso destes */
const ATRASO_MAXIMO_MIN = 120;

/**
 * Atraso da partida, em minutos, ou null. Só conta quando a partida é em tempo real e a própria fonte (GPS do autocarro,
 * API da STCP, previsões da Carris Metropolitana) diz quanto vem atrasada: o servidor envia-o em `delay_seconds`
 * (partidas da paragem) ou `delay_minutes` (partidas da linha). Sem esse dado (horários, UNIR, CP, metros) não há
 * etiqueta, porque não há como saber.
 */
export function atrasoConhecido(dep: any, isRealtime: boolean): number | null {
  if (!dep || !isRealtime) return null;
  if (/supr/i.test(String(dep.state || ''))) return null;
  let min: number | null = null;
  const segundos = dep.delay_seconds ?? dep.delaySeconds;
  if (typeof segundos === 'number' && Number.isFinite(segundos)) {
    // Mesma regra do servidor: mais de 1,5 min de atraso (90 s ou menos é a margem normal do GPS)
    min = segundos > 90 ? Math.round(segundos / 60) : null;
  } else {
    const minutos = dep.delay_minutes ?? dep.delayMinutes;
    if (typeof minutos === 'number' && Number.isFinite(minutos)) min = Math.round(minutos);
  }
  if (min === null || min < ATRASO_MINIMO_MIN || min > ATRASO_MAXIMO_MIN) return null;
  return min;
}

export interface FormattedDeparture {
  minutesDiff: number;
  bigText: string;    // "4 min" ou "a chegar"
  exactTime: string;  // "14:44"
  subText: string;    // texto pequeno por baixo de bigText (hora exata, "em 2 h" ou "amanhã")
  isRealtime: boolean;
  isOutdated: boolean;
  isUrgent: boolean;  // minutos até 5 min (urgência)
  /** Minutos de atraso face ao horário, só quando a própria fonte em tempo real o indica (senão null: nunca se inventa) */
  delayMinutes: number | null;
  textColor: string;  // "#C2410C" até 5 min, "#111111" acima disso
  textColorClass: string; // "text-[#C2410C]" até 5 min, "text-[#111111]" acima disso
}

/**
 * Converte qualquer objeto de partida para o formato oficial:
 * Minutos em grande ("4 min" ou "a chegar") e hora exata em pequeno ("14:44").
 * Minutos até 5 min a #C2410C e acima disso a #111111.
 * O tempo real distingue-se só pelo ícone de sinal, em qualquer das cores.
 * Identifica se o feed está desatualizado (validade do feed expirada).
 */
export function parseDepartureTime(dep: any): FormattedDeparture {
  if (!dep) {
    return {
      minutesDiff: 999,
      bigText: '—',
      exactTime: '',
      subText: '',
      isRealtime: false,
      isOutdated: false,
      isUrgent: false,
      delayMinutes: null,
      textColor: '#111111',
      textColorClass: 'text-[#111111]',
    };
  }

  const isRealtime = Boolean(
    dep.isRealtime ||
    dep.is_realtime ||
    dep.state === 'Tempo Real' ||
    dep.state === 'REALTIME'
  );

  // 1. Obter hora atual em Portugal
  const now = new Date();
  const { nowMinutes, todayDigits, diaHojePt, diaHojeCa } = contextoAgora(now);

  // 2. Extrair hora exata da partida
  let rawTime =
    dep.expectedTime ||
    dep.expected_time ||
    (isRealtime ? dep.actual_time : '') ||
    dep.scheduledTime ||
    dep.departureTime ||
    dep.scheduled_time ||
    dep.time ||
    '';

  // Se rawTime vier com texto completo (ex: "14:44 · Programado...")
  if (typeof rawTime === 'string') {
    const timeMatch = rawTime.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (timeMatch) {
      rawTime = timeMatch[0];
    }
  }

  // Se rawTime ainda não estiver definido, extrair de displayText se contiver hora (ex: "amanhã às 00:51")
  if (!rawTime && typeof dep.displayText === 'string') {
    const timeMatch = dep.displayText.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (timeMatch) {
      rawTime = timeMatch[0];
    }
  }

  // 3. Determinar minutos restantes
  let diffMinutes: number | null = null;

  if (typeof dep.countdown_minutes === 'number') {
    diffMinutes = dep.countdown_minutes;
  } else if (typeof dep.countdownMinutes === 'number') {
    diffMinutes = dep.countdownMinutes;
  } else if (typeof dep.minutesRemaining === 'number') {
    diffMinutes = dep.minutesRemaining;
  } else if (typeof dep.diffMinutes === 'number') {
    diffMinutes = dep.diffMinutes;
  } else if (typeof dep.minutes === 'number') {
    diffMinutes = dep.minutes;
  } else if (typeof dep.displayText === 'string') {
    const lower = dep.displayText.toLowerCase();
    if (lower.includes('a chegar') || lower.includes('a partir')) {
      diffMinutes = 0;
    } else {
      const textMatch = dep.displayText.match(/daqui a ~?(\d+)\s*min/i);
      if (textMatch) {
        diffMinutes = parseInt(textMatch[1], 10);
      } else {
        const tomorrowMatch = dep.displayText.match(/amanhã às\s*([01]?\d|2[0-3]):([0-5]\d)/i);
        if (tomorrowMatch) {
          const tH = parseInt(tomorrowMatch[1], 10);
          const tM = parseInt(tomorrowMatch[2], 10);
          diffMinutes = (1440 - nowMinutes) + (tH * 60 + tM);
        }
      }
    }
  }

  // Se ainda não temos os minutos mas temos rawTime ("14:44")
  if (diffMinutes === null && typeof rawTime === 'string' && rawTime.includes(':')) {
    const [depH, depM] = rawTime.split(':').map(Number);
    if (!isNaN(depH) && !isNaN(depM)) {
      const depTotalMinutes = depH * 60 + depM;
      let d = depTotalMinutes - nowMinutes;
      if (d < -15) {
        // Já passou hoje há mais de 15 min -> partida do dia seguinte / noite
        d += 1440;
      } else if (d < 0) {
        // Janela de tolerância (a chegar na paragem)
        d = 0;
      }
      diffMinutes = d;
    }
  }

  const hasMinutes = diffMinutes !== null;
  const effectiveMinutes = hasMinutes ? Math.max(0, diffMinutes!) : null;

  // Se não temos rawTime mas temos minutos restantes, calcular hora exata
  let exactTime = typeof rawTime === 'string' && rawTime.length >= 4 ? rawTime.slice(0, 5) : '';
  if (!exactTime && effectiveMinutes !== null) {
    const depDate = new Date(now.getTime() + effectiveMinutes * 60000);
    exactTime = FMT_HORA.format(depDate);
  }

  // Até 1 hora: minutos em grande ("12 min"). Mais longe: a hora em grande ("23:56"),
  // porque "1392 min" não diz nada a ninguém.
  const longe = effectiveMinutes !== null && effectiveMinutes >= 60 && Boolean(exactTime);
  const bigText = effectiveMinutes === null 
    ? (exactTime || '—') 
    : longe
      ? exactTime
      : (effectiveMinutes < 1 ? t('a chegar') : `${effectiveMinutes} min`);

  // Texto pequeno por baixo: a hora exata, ou "em 2 h 10" / "amanhã" quando a hora já está em grande
  let subText = exactTime;
  if (longe && effectiveMinutes !== null) {
    const depDate = new Date(now.getTime() + effectiveMinutes * 60000);
    const diaDep = FMT_DIA_PT.format(depDate);
    if (diaDep !== diaHojePt) {
      // "amanhã" só no dia seguinte; mais longe (linhas que hoje não passam), o dia da semana
      const dias = Math.round((Date.parse(FMT_DIA_CA.format(depDate)) - Date.parse(diaHojeCa)) / 86400000);
      if (dias >= 2) {
        fmtSemana = fmtSemana || new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: TZ });
        subText = fmtSemana.format(depDate);
      } else {
        subText = t('amanhã');
      }
    } else {
      const h = Math.floor(effectiveMinutes / 60);
      const m = effectiveMinutes % 60;
      subText = m > 0 ? t('em {h}h{m}', { h, m: String(m).padStart(2, '0') }) : t('em {h}h', { h });
    }
  }

  // 4. Detetar aviso de desatualizado para qualquer feed cuja validade expirou
  let isOutdated = Boolean(
    dep.aviso_horario ||
    dep.avisoHorario ||
    dep.isOutdated ||
    dep.is_outdated ||
    dep.isExpired ||
    dep.is_expired ||
    dep.feed_status === 'horário expirado' ||
    dep.status === 'horário expirado'
  );

  if (!isOutdated && typeof dep.valid_until === 'string') {
    const validClean = dep.valid_until.replace(/\D/g, '').slice(0, 8);
    if (validClean && validClean < todayDigits) {
      isOutdated = true;
    }
  }

  // Minutos até 5 min a #C2410C (urgência) e acima disso a #111111
  const isUrgent = effectiveMinutes !== null && effectiveMinutes <= 5;
  const textColor = isUrgent ? '#C2410C' : '#111111';
  const textColorClass = isUrgent ? 'text-[#C2410C]' : 'text-[#111111]';

  return {
    minutesDiff: effectiveMinutes !== null ? effectiveMinutes : 999,
    bigText,
    exactTime,
    subText,
    isRealtime,
    isOutdated,
    isUrgent,
    delayMinutes: atrasoConhecido(dep, isRealtime),
    textColor,
    textColorClass,
  };
}

/**
 * Ordena partidas sempre pela mais próxima primeiro (menor tempo até à partida).
 */
export function sortDepartures<T>(departures: T[]): T[] {
  if (!Array.isArray(departures) || departures.length <= 1) return departures || [];
  return [...departures].sort((a, b) => {
    const parsedA = parseDepartureTime(a);
    const parsedB = parseDepartureTime(b);
    return parsedA.minutesDiff - parsedB.minutesDiff;
  });
}
