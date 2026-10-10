import React, { useEffect, useState } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import type { TransitRouteOption } from '../types/perto';
import { criarLembrete, cancelarLembrete, lembreteAtivo, pushSuportado } from '../services/notifications';
import { formatTransitName } from '../utils/transitFormatter';
import { t } from '../i18n';

const ANTECEDENCIAS = [5, 10, 15];

/** "08:41" -> instante em que se sai de casa (hoje; se já passou há muito, é amanhã) */
function instanteDe(hhmm: string, agora = Date.now()): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  const d = new Date(agora);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let ms = d.getTime();
  if (ms < agora - 2 * 3600_000) ms += 24 * 3600_000;
  return ms;
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

/** Botão "Avisar-me": o servidor envia uma notificação X min antes de sair de casa, mesmo com a app fechada. */
export function AvisoPartida({ route }: { route: TransitRouteOption }) {
  const primeira = route.legs.find((l) => l.mode === 'TRANSIT');
  const tag = `partida-${route.departureTime}-${primeira?.lineCode || 'x'}`;
  const [ativo, setAtivo] = useState(() => lembreteAtivo(tag));
  const [aPedir, setAPedir] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => { setAtivo(lembreteAtivo(tag)); setErro(''); }, [tag]);
  useEffect(() => { const i = setInterval(() => setAgora(Date.now()), 20_000); return () => clearInterval(i); }, []);

  if (!primeira || !pushSuportado()) return null;
  const saida = instanteDe(route.departureTime, agora);
  if (saida == null) return null;
  const opcoes = ANTECEDENCIAS.filter((m) => saida - m * 60_000 > agora + 45_000);

  const marcar = async (min: number) => {
    setErro('');
    setAPedir(min);
    const quando = saida - min * 60_000;
    const linha = primeira.lineCode ? `${t('linha')} ${primeira.lineCode}` : t('o transporte');
    const de = formatTransitName(primeira.fromStopName || '');
    const r = await criarLembrete({
      tag,
      quando,
      titulo: t('Sai de casa daqui a {n} min', { n: min }),
      corpo: `${t('Apanha {l} às {h} em {p}', { l: linha, h: primeira.departureTime || route.departureTime, p: de })} · ${t('chegas às {h}', { h: route.arrivalTime })}`,
      url: '/',
    });
    setAPedir(null);
    if (r === 'ok') setAtivo(lembreteAtivo(tag));
    else if (r === 'sem-permissao') setErro(t('Ativa as notificações nas definições do telemóvel para receberes o aviso.'));
    else if (r === 'sem-suporte') setErro(t('Este telemóvel não suporta avisos com a app fechada.'));
    else setErro(t('Não foi possível agendar o aviso. Tenta outra vez.'));
  };

  const cancelar = async () => {
    await cancelarLembrete(tag);
    setAtivo(null);
  };

  if (ativo) {
    return (
      <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] bg-[#F4F4F2] px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#111111]">
          <BellRing className="w-4 h-4 text-[#C2410C] shrink-0" aria-hidden="true" />
          {t('Aviso às {h}', { h: hora(ativo.quando) })}
        </span>
        <button onClick={cancelar} className="inline-flex items-center gap-1 h-8 px-2 text-[12px] font-semibold text-[#6B6B6B] cursor-pointer" aria-label={t('Cancelar aviso')}>
          <X className="w-3.5 h-3.5" aria-hidden="true" /> {t('Cancelar')}
        </button>
      </div>
    );
  }

  if (!opcoes.length) return null;
  return (
    <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#111111] mb-1.5">
        <Bell className="w-4 h-4 shrink-0" aria-hidden="true" /> {t('Avisar-me antes de sair de casa')}
      </div>
      <div className="flex gap-2 flex-wrap">
        {opcoes.map((m) => (
          <button
            key={m}
            disabled={aPedir !== null}
            onClick={() => marcar(m)}
            className="h-9 px-3 rounded-[10px] border border-[#E6E6E3] bg-[#FFFFFF] text-[12.5px] font-semibold text-[#111111] active:bg-[#F4F4F2] disabled:opacity-60 cursor-pointer"
          >
            {aPedir === m ? '…' : t('{n} min antes', { n: m })}
          </button>
        ))}
      </div>
      {erro && <p role="alert" className="mt-1.5 text-[12px] text-[#B42318] leading-snug">{erro}</p>}
    </div>
  );
}
