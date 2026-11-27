// Horários dos próximos dias numa paragem de uma linha (pedido de um passageiro, 20/11/2026: «não consigo ver os
// horários de amanhã»). Uma fila de dias (Hoje, Amanhã e os 5 seguintes) e, para os outros dias, o horário completo
// agrupado por hora, como nas tabelas das paragens. Destinos diferentes na mesma linha levam uma letra e uma legenda.
import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchHorarioDoDia, HorarioDoDia } from '../services/transitApi';
import { destinoLegivel } from '../utils/transitFormatter';
import { t, LOCALE } from '../i18n';
import { AvisosGreve, textoGreve, type EstadoGreve } from './GreveNoHorario';

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
  const { grupos, legenda, marcas } = useMemo(() => {
    const partidas = horario?.partidas || [];
    const contagem = new Map<string, number>();
    for (const p of partidas) contagem.set(p.destino, (contagem.get(p.destino) || 0) + 1);
    const principal = [...contagem.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
    const letra = new Map<string, string>();
    for (const [d] of [...contagem.entries()].filter(([d]) => d !== principal && d)) {
      if (letra.size < LETRAS.length) letra.set(d, LETRAS[letra.size]);
    }
    const porHora = new Map<number, Array<{ min: string; letra?: string; s: number; greve?: EstadoGreve }>>();
    const marcas = new Set<EstadoGreve>();
    // o dia inteiro «pode não se realizar» (greve sem o operador dizer o que funciona): o aviso por cima chega, sem marcar
    // cada minuto
    const todasIncertas = partidas.length > 0 && partidas.every((p) => p.greve === 'incerta');
    // CP com serviços mínimos: marcam-se só os comboios garantidos (o aviso por cima diz que os outros podem não se realizar)
    const comMinimos = partidas.some((p) => p.greve === 'garantido');
    for (const p of partidas) {
      const h = Math.floor(p.s / 3600);
      const lista = porHora.get(h) || [];
      const greve = todasIncertas || (comMinimos && p.greve === 'incerta') ? undefined : p.greve;
      lista.push({ min: p.hora.slice(3), letra: letra.get(p.destino), s: p.s, greve });
      if (greve) marcas.add(greve);
      porHora.set(h, lista);
    }
    return {
      grupos: [...porHora.entries()].sort((x, y) => x[0] - y[0]),
      legenda: [...letra.entries()].map(([d, l]) => [l, d] as const),
      marcas,
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
      <AvisosGreve greves={horario.greves} className="pb-1" />
      {marcas.size > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#6B6B6B]" data-teste="legenda-greve">
          {marcas.has('sem-servico') && (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-condensada text-[13px] font-semibold tabular-nums line-through decoration-[1.5px]" aria-hidden="true">10</span>
              {t('sem serviço')}
            </span>
          )}
          {marcas.has('incerta') && (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-condensada text-[13px] font-semibold tabular-nums text-[#111111] underline decoration-dotted decoration-[1.5px] underline-offset-[3px]" aria-hidden="true">10</span>
              {t('pode não se realizar')}
            </span>
          )}
          {marcas.has('garantido') && (
            <span className="inline-flex items-center gap-1.5">
              <span className="font-condensada text-[13px] font-bold tabular-nums text-[#111111] border-b-2 border-[#111111] leading-none" aria-hidden="true">10</span>
              {t('serviço mínimo garantido')}
            </span>
          )}
          {marcas.has('reduzido') && <span>{t('Na parte que funciona, as horas são as do horário normal: conta a frequência da greve.')}</span>}
        </div>
      )}
      <div className="space-y-1">
        {grupos.map(([h, mins]) => (
          <div key={h} className="flex items-baseline gap-3">
            <span className="font-condensada text-[15px] text-[#6B6B6B] tabular-nums w-6 shrink-0">{String(h % 24).padStart(2, '0')}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-condensada text-[15px] font-semibold text-[#111111] tabular-nums">
              {mins.map((m) => (
                <span
                  key={`${m.s}-${m.letra || ''}`}
                  data-greve={m.greve || undefined}
                  className={m.greve === 'sem-servico'
                    ? 'text-[#6B6B6B] font-medium line-through decoration-[1.5px]'
                    : m.greve === 'incerta' ? 'underline decoration-dotted decoration-[1.5px] underline-offset-[3px]'
                      : m.greve === 'garantido' ? 'font-bold underline decoration-2 underline-offset-[3px]' : undefined}
                >
                  {m.min}
                  {m.letra && <sup className="ml-px text-[10px] font-semibold text-[#6B6B6B]">{m.letra}</sup>}
                  {m.greve && <span className="sr-only"> ({textoGreve(m.greve)})</span>}
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
