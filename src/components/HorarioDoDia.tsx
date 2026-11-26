// Horários dos próximos dias numa paragem de uma linha (pedido de um passageiro, 20/11/2026: «não consigo ver os
// horários de amanhã»). Uma fila de dias (Hoje, Amanhã e os 5 seguintes) e, para os outros dias, o horário completo
// agrupado por hora, como nas tabelas das paragens. Destinos diferentes na mesma linha levam uma letra e uma legenda.
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchHorarioDoDia, HorarioDoDia } from '../services/transitApi';
import { destinoLegivel } from '../utils/transitFormatter';
import { t, LOCALE } from '../i18n';

export interface DiaEscolhivel { data: string; rotulo: string }

/** Hoje e os dias seguintes, pela hora de Portugal continental (a das linhas) */
export function proximosDias(n = 7, agora: Date = new Date()): DiaEscolhivel[] {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  const [a, m, d] = hoje.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(a, m - 1, d + i, 12));
    const data = dt.toISOString().slice(0, 10);
    if (i === 0) return { data, rotulo: t('Hoje') };
    if (i === 1) return { data, rotulo: t('Amanhã') };
    const partes = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).formatToParts(dt);
    const semana = (partes.find((p) => p.type === 'weekday')?.value || '').replace(/\.$/, '');
    const dia = partes.find((p) => p.type === 'day')?.value || '';
    return { data, rotulo: `${semana.charAt(0).toUpperCase()}${semana.slice(1)} ${dia}` };
  });
}

export const SeletorDias: React.FC<{ dias: DiaEscolhivel[]; escolhido: number; onEscolher: (i: number) => void }> = ({ dias, escolhido, onEscolher }) => (
  <div role="group" aria-label={t('Dia')} className="flex items-center gap-1.5 overflow-x-auto pb-1 -mr-1" data-teste="dias-horario">
    {dias.map((d, i) => (
      <button
        key={d.data}
        type="button"
        aria-pressed={escolhido === i}
        onClick={() => onEscolher(i)}
        className={`shrink-0 px-3 rounded-[8px] border text-xs font-semibold whitespace-nowrap min-h-[40px] cursor-pointer transition-colors ${
          escolhido === i ? 'bg-[#111111] border-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#E6E6E3] text-[#111111] hover:border-[#6B6B6B]'
        }`}
      >
        {d.rotulo}
      </button>
    ))}
  </div>
);

const LETRAS = 'abcdefghij';

export const HorarioDoDiaPainel: React.FC<{ lineId: string; stopId: string; sentido: number; data: string; nomeLinha?: string; viagem?: string }> = ({
  lineId, stopId, sentido, data, nomeLinha, viagem,
}) => {
  const [estado, setEstado] = useState<'a-carregar' | 'pronto' | 'erro'>('a-carregar');
  const [horario, setHorario] = useState<HorarioDoDia | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setEstado('a-carregar');
    fetchHorarioDoDia(lineId, stopId, sentido, data, ac.signal, viagem)
      .then((r) => { setHorario(r); setEstado('pronto'); })
      .catch(() => { if (!ac.signal.aborted) setEstado('erro'); });
    return () => ac.abort();
  }, [lineId, stopId, sentido, data, tentativa, viagem]);

  // Horas com os minutos de cada partida; os destinos que não são o principal levam uma letra
  const { grupos, legenda } = useMemo(() => {
    const partidas = horario?.partidas || [];
    const contagem = new Map<string, number>();
    for (const p of partidas) contagem.set(p.destino, (contagem.get(p.destino) || 0) + 1);
    const principal = [...contagem.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const letra = new Map<string, string>();
    for (const [d] of [...contagem.entries()].filter(([d]) => d !== principal && d)) {
      if (letra.size < LETRAS.length) letra.set(d, LETRAS[letra.size]);
    }
    const porHora = new Map<number, Array<{ min: string; letra?: string; s: number }>>();
    for (const p of partidas) {
      const h = Math.floor(p.s / 3600);
      const lista = porHora.get(h) || [];
      lista.push({ min: p.hora.slice(3), letra: letra.get(p.destino), s: p.s });
      porHora.set(h, lista);
    }
    return {
      grupos: [...porHora.entries()].sort((x, y) => x[0] - y[0]),
      legenda: [...letra.entries()].map(([d, l]) => [l, d] as const),
    };
  }, [horario]);

  if (estado === 'a-carregar') {
    return (
      <div className="py-2 text-xs text-[#6B6B6B] flex items-center gap-2" data-teste="horario-dia-a-carregar">
        <RefreshCw className="w-4 h-4 animate-spin text-[#111111]" />
        <span>{t('A carregar horário…')}</span>
      </div>
    );
  }
  if (estado === 'erro' || !horario) {
    return (
      <div className="py-1 flex items-center justify-between gap-3" data-teste="horario-dia-erro">
        <span className="text-xs text-[#6B6B6B]">{t('Não foi possível carregar o horário.')}</span>
        <button type="button" onClick={() => setTentativa((n) => n + 1)} className="text-xs font-semibold text-[#111111] underline min-h-[40px] px-1 cursor-pointer">
          {t('Tentar outra vez')}
        </button>
      </div>
    );
  }
  if (horario.estado !== 'ok') {
    const texto = horario.estado === 'ultima-paragem'
      ? t('É a última paragem neste sentido. Escolhe o outro sentido para ver as partidas.')
      : horario.estado === 'sem-partidas'
        ? t('Esta linha não passa aqui neste dia.')
        : t('Ainda não há horário desta linha para este dia.');
    return <p className="text-xs text-[#6B6B6B] py-1" data-teste="horario-dia-vazio">{texto}</p>;
  }
  return (
    <div className="space-y-2" data-teste="horario-dia">
      {horario.previsto && (
        <p className="text-[11px] text-[#6B6B6B]">{t('Horário previsto: o operador ainda não publicou este dia.')}</p>
      )}
      <div className="space-y-1">
        {grupos.map(([h, mins]) => (
          <div key={h} className="flex items-baseline gap-3">
            <span className="font-condensada text-[15px] text-[#6B6B6B] tabular-nums w-6 shrink-0">{String(h % 24).padStart(2, '0')}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-condensada text-[15px] font-semibold text-[#111111] tabular-nums">
              {mins.map((m) => (
                <span key={`${m.s}-${m.letra || ''}`}>
                  {m.min}
                  {m.letra && <sup className="ml-px text-[10px] font-semibold text-[#6B6B6B]">{m.letra}</sup>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {legenda.length > 0 && (
        <div className="pt-1 space-y-0.5 text-[11px] text-[#6B6B6B]">
          {legenda.map(([l, d]) => (
            <p key={l}><span className="font-semibold text-[#111111]">{l}</span> {destinoLegivel(d, nomeLinha) || d}</p>
          ))}
        </div>
      )}
    </div>
  );
};
