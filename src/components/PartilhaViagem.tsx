import { useEffect, useState } from 'react';
import { Share2, X, Link as LinkIcon } from 'lucide-react';
import { t } from '../i18n';
import type { TransitRouteOption } from '../types/perto';
import type { UserCoords } from '../hooks/useUserLocation';
import { criarPartilha, enviarLigacao, enviarPosicao, pararPartilha, partilhaAtiva, EVENTO_PARTILHA, type PartilhaAtiva } from '../services/partilhaViagem';

/** A partilha em curso (lida do telemóvel), atualizada quando muda */
export function usePartilha(): PartilhaAtiva | null {
  const [p, setP] = useState<PartilhaAtiva | null>(() => partilhaAtiva());
  useEffect(() => {
    const ler = () => setP(partilhaAtiva());
    window.addEventListener(EVENTO_PARTILHA, ler);
    window.addEventListener('storage', ler);
    const i = setInterval(ler, 30_000); // acaba sozinha à hora marcada
    return () => { window.removeEventListener(EVENTO_PARTILHA, ler); window.removeEventListener('storage', ler); clearInterval(i); };
  }, []);
  return p;
}

/** Enquanto há partilha e a posição é do GPS, manda-a ao servidor (no máximo de 15 em 15 s) */
export function usePartilhaPosicao(coords: UserCoords | null, ativa: PartilhaAtiva | null): void {
  useEffect(() => {
    if (!ativa || !coords || coords.isManual) return;
    void enviarPosicao(coords.latitude, coords.longitude, coords.accuracy);
  }, [ativa, coords?.latitude, coords?.longitude, coords?.accuracy, coords?.isManual]);
}

const ligacao = 'inline-flex items-center gap-1 min-h-[40px] text-[13px] font-semibold text-[#111111] underline underline-offset-2 decoration-[#6B6B6B] hover:decoration-[#111111] rounded-[4px] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]';

/** Faixa «A partilhar a viagem» com copiar/enviar outra vez e parar */
export function PartilhaEmCurso({ partilha }: { partilha: PartilhaAtiva }) {
  const [aviso, setAviso] = useState('');
  const reenviar = async () => {
    const r = await enviarLigacao(partilha, t('Acompanha a minha viagem até {d}: chego por volta das {h}.', { d: partilha.destino, h: partilha.chegada }));
    if (r === 'copiado') { setAviso(t('Ligação copiada')); setTimeout(() => setAviso(''), 2500); }
  };
  return (
    <div className="mx-3 mt-1 mb-2 rounded-[12px] bg-[#F4F4F2] px-3 py-2" data-teste="partilha-em-curso" role="status">
      <p className="flex items-start gap-2 text-[13px] text-[#111111] leading-snug">
        <span className="relative mt-[5px] flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#FF6B1A] opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF6B1A]" />
        </span>
        <span className="min-w-0">
          <span className="font-semibold">{t('A partilhar a viagem até {d}', { d: partilha.destino })}</span>
          <span className="text-[#6B6B6B]">{` · ${t('enquanto a PAROU estiver aberta')}`}</span>
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-x-4 pl-4">
        <button type="button" onClick={reenviar} className={ligacao}>
          <LinkIcon className="w-3.5 h-3.5 stroke-[2.25]" aria-hidden="true" />
          {aviso || t('Enviar a ligação')}
        </button>
        <button type="button" onClick={() => void pararPartilha()} className={ligacao} data-teste="parar-partilha">
          <X className="w-3.5 h-3.5 stroke-[2.25]" aria-hidden="true" />
          {t('Parar')}
        </button>
      </p>
    </div>
  );
}

/** Botão nos detalhes de uma opção de viagem: cria a ligação e abre a partilha do telemóvel */
export function BotaoPartilharViagem({ route, destino, posicao, ativa }: {
  route: TransitRouteOption;
  destino: { nome: string; lat: number; lon: number };
  posicao: UserCoords | null;
  ativa: PartilhaAtiva | null;
}) {
  const [estado, setEstado] = useState<'' | 'a-criar' | 'erro' | 'copiado'>('');
  if (ativa) return null; // já há uma partilha: a faixa por cima diz e deixa parar
  const partilhar = async () => {
    setEstado('a-criar');
    const pos = posicao && !posicao.isManual ? { lat: posicao.latitude, lon: posicao.longitude, acc: posicao.accuracy } : null;
    const r = await criarPartilha(route, destino, pos);
    if (!r.ok) { setEstado('erro'); return; }
    const envio = await enviarLigacao(r.partilha, t('Acompanha a minha viagem até {d}: chego por volta das {h}.', { d: destino.nome, h: route.arrivalTime }));
    setEstado(envio === 'copiado' ? 'copiado' : '');
  };
  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={partilhar}
        disabled={estado === 'a-criar'}
        data-teste="partilhar-viagem"
        className="inline-flex items-center gap-1.5 min-h-[40px] text-[13px] font-semibold text-[#111111] underline underline-offset-2 decoration-[#6B6B6B] hover:decoration-[#111111] disabled:opacity-60 rounded-[4px] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
      >
        <Share2 className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />
        {estado === 'a-criar' ? t('A criar a ligação…') : t('Partilhar a viagem')}
      </button>
      {estado === 'copiado' && <p className="text-[12px] text-[#6B6B6B] leading-snug">{t('Ligação copiada: cola-a numa mensagem.')}</p>}
      {estado === 'erro' && <p role="alert" className="text-[12px] text-[#B42318] leading-snug">{t('Não foi possível criar a ligação. Tenta outra vez.')}</p>}
    </div>
  );
}
