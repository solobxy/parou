import { t, LOCALE } from '../i18n';
/**
 * PAROU - Transit Text & Departures Formatter
 * Formata nomes em maiúsculas vindos de feeds GTFS (preservando siglas)
 * e normaliza partidas (minutos em grande + hora exata em pequeno).
 */

const ACRONYMS = new Set([
  'CP', 'IC', 'AP', 'IR', 'R', 'U', 'STCP', 'MTS', 'TCB', 'TML', 'CARRIS',
  'METRO', 'RL', 'TST', 'TUB', 'SMTUC', 'TUG', 'TUA', 'TAV', 'AVE',
  'EST', 'GPS', 'ID', 'CE', 'HPH', 'HSJ', 'IPO'
]);

const LOWERCASE_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos',
  'por', 'pra', 'para', 'com'
]);

/**
 * Converte nomes em maiúsculas (ex.: "AV.ALIADOS", "CORDOARIA-S.PEDRO DA COVA")
 * para Title Case ("Av. Aliados", "Cordoaria - S. Pedro da Cova"), mantendo siglas como CP, IC, STCP.
 */
export function formatTransitName(raw?: string | null): string {
  if (!raw) return '';
  let text = String(raw).trim();
  if (!text) return '';

  // Insere espaço a seguir ao ponto se seguido imediatamente por letra (ex.: "AV.ALIADOS" -> "AV. ALIADOS", "S.PEDRO" -> "S. PEDRO")
  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ])\.([A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1. $2');

  // Normaliza hífen colado a letras (ex.: "CORDOARIA-S.PEDRO" -> "CORDOARIA - S. PEDRO")
  text = text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ])-([A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1 - $2');

  const words = text.split(/\s+/);
  return words.map((word, idx) => {
    // Preserva pontuação circundante como "(CP)", "[STCP]", "S.Bento,"
    const match = word.match(/^([(\[{]*)(.*?)([)\]},;:]*)$/);
    if (!match) return word;
    const [, pre, core, post] = match;
    if (!core) return word;

    const upperCore = core.toUpperCase();
    if (ACRONYMS.has(upperCore)) {
      return pre + upperCore + post;
    }

    const lowerCore = core.toLowerCase();
    if (idx > 0 && LOWERCASE_WORDS.has(lowerCore)) {
      return pre + lowerCore + post;
    }

    // Abreviaturas comuns com ponto como "Av.", "R.", "S.", "Sto."
    if (lowerCore.endsWith('.')) {
      const stem = lowerCore.slice(0, -1);
      return pre + stem.charAt(0).toUpperCase() + stem.slice(1) + '.' + post;
    }

    return pre + core.charAt(0).toUpperCase() + core.slice(1).toLowerCase() + post;
  }).join(' ');
}

export interface FormattedDeparture {
  minutesDiff: number;
  bigText: string;    // "4 min" ou "a chegar"
  exactTime: string;  // "14:44"
  subText: string;    // texto pequeno por baixo de bigText (hora exata, "em 2 h" ou "amanhã")
  isRealtime: boolean;
  isOutdated: boolean;
  isUrgent: boolean;  // minutos até 5 min (urgência)
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
  const lisbonTimeParts = now.toLocaleTimeString('pt-PT', {
    timeZone: 'Europe/Lisbon',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  }).split(':').map(Number);

  const nowMinutes = (lisbonTimeParts[0] || 0) * 60 + (lisbonTimeParts[1] || 0);

  // Data atual em dígitos yyyyMMdd no fuso de Portugal
  const todayDigits = now.toLocaleDateString('pt-PT', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).split('/').reverse().join('');

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
    exactTime = depDate.toLocaleTimeString('pt-PT', {
      timeZone: 'Europe/Lisbon',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
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
    const diaDep = depDate.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
    const diaHoje = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
    if (diaDep !== diaHoje) {
      // "amanhã" só no dia seguinte; mais longe (linhas que hoje não passam), o dia da semana
      const dias = Math.round((Date.parse(depDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })) - Date.parse(now.toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' }))) / 86400000);
      subText = dias >= 2 ? depDate.toLocaleDateString(LOCALE, { weekday: 'long', timeZone: 'Europe/Lisbon' }) : t('amanhã');
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
