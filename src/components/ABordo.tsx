import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Bus, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { UserCoords } from '../hooks/useUserLocation';
import { DetetorABordo, type Candidato } from '../utils/aBordo';
import { abordoLigado, definirAbordo, EVENTO_ABORDO } from '../utils/abordoPref';
import { chaveDeLinha } from '../utils/chaveLinha';
import { formatTransitName } from '../utils/transitFormatter';
import { fetchABordo, fetchVeiculos, SemSinalError } from '../services/veiculosApi';
import type { ParagemABordo, RespostaABordo, VeiculoLeve } from '../types/aBordo';
import { LineChip } from './LineChip';
import { t, tn, LOCALE } from '../i18n';

// «A bordo»: a app deteta (ou a pessoa diz) que vai num autocarro e mostra a linha, a próxima paragem e as seguintes enquanto ele anda.
//  - Só funciona com a app aberta: um site não tem acesso à posição em segundo plano.
//  - Pergunta sempre antes de assumir. A comparação do GPS com os autocarros faz-se no telemóvel; ao servidor só se pede a lista
//    de autocarros da zona, e a posição não fica guardada.
//  - Não há horas de chegada inventadas: a hora de cada paragem é a do horário (quando a viagem é a deste autocarro);
//    o tempo real é a posição do autocarro, que o operador envia.

const INTERVALO_DETECAO_MS = 12_000;
const INTERVALO_ABORDO_MS = 8_000;
const PERGUNTA_MAX_MS = 60_000;
/** Raio da zona pedida ao servidor à volta da pessoa (≈ 500 m) */
const GRAUS_LAT = 0.0045;
const GRAUS_LON = 0.006;
/** Memória curta entre separadores da app: ao voltar ao Perto continua a bordo */
const VALIDADE_GUARDADO_MS = 10 * 60_000;

type Fase = 'livre' | 'pergunta' | 'a-bordo';
interface Alvo { id: string; linha: string; op: VeiculoLeve['op']; origem: 'detetado' | 'manual' }

let guardado: { alvo: Alvo; quando: number } | null = null;

function lerGuardado(): Alvo | null {
  if (!guardado) return null;
  if (Date.now() - guardado.quando > VALIDADE_GUARDADO_MS) { guardado = null; return null; }
  return guardado.alvo;
}

export interface ControloABordo {
  fase: Fase;
  /** Fase «pergunta»: o mais provável primeiro */
  candidatos: Candidato[];
  alvo: Alvo | null;
  dados: RespostaABordo | null;
  paragens: ParagemABordo[];
  /** Há quanto tempo (ms desde 1970) o servidor deixou de ter sinal deste autocarro */
  semSinalDesde: number | null;
  /** Parece que a pessoa já saiu do autocarro */
  afastada: boolean;
  /** A pessoa ligou ou desligou as perguntas */
  perguntar: boolean;
  /** Linha (chave «stcp:803») do autocarro em que vai, para pedir só os autocarros dessa linha no mapa */
  chaveLinha: string | null;
  confirmar: (v: VeiculoLeve, origem: 'detetado' | 'manual') => void;
  recusar: () => void;
  sair: () => void;
  continuar: () => void;
  desligarPerguntas: () => void;
}

export function useABordo(coords: UserCoords | null | undefined, ativo: boolean): ControloABordo {
  const detetor = useRef<DetetorABordo>(new DetetorABordo());
  const inicial = useMemo(() => lerGuardado(), []);
  const [fase, setFase] = useState<Fase>(inicial ? 'a-bordo' : 'livre');
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [alvo, setAlvo] = useState<Alvo | null>(inicial);
  const [dados, setDados] = useState<RespostaABordo | null>(null);
  const [paragens, setParagens] = useState<ParagemABordo[]>([]);
  const [semSinalDesde, setSemSinalDesde] = useState<number | null>(null);
  const [afastada, setAfastada] = useState(false);
  const [perguntar, setPerguntar] = useState<boolean>(() => abordoLigado());

  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  const faseRef = useRef(fase);
  faseRef.current = fase;
  const candidatosRef = useRef(candidatos);
  candidatosRef.current = candidatos;
  const paragensRef = useRef(paragens);
  paragensRef.current = paragens;
  const indiceRef = useRef<number>(-1);
  const perguntaDesdeRef = useRef<number>(0);
  const semCandidatoRef = useRef<number>(0);
  const dispensadaAfastadaRef = useRef<boolean>(false);

  useEffect(() => {
    const aoMudar = () => setPerguntar(abordoLigado());
    window.addEventListener(EVENTO_ABORDO, aoMudar);
    return () => window.removeEventListener(EVENTO_ABORDO, aoMudar);
  }, []);

  // As leituras do GPS vão para o detetor (também a bordo, para saber se a pessoa já saiu)
  useEffect(() => {
    if (!coords || coords.isManual) return;
    detetor.current.adicionarLeitura({
      t: coords.timestamp > 0 ? coords.timestamp : Date.now(),
      lat: coords.latitude,
      lon: coords.longitude,
      precisao: Number.isFinite(coords.accuracy) ? coords.accuracy : 30,
    });
  }, [coords?.timestamp, coords?.latitude, coords?.longitude, coords?.accuracy, coords?.isManual]);

  // Deteção: só com a pessoa em movimento e a app visível, e só enquanto não vai a bordo
  useEffect(() => {
    if (!ativo || !perguntar || fase === 'a-bordo') return;
    let vivo = true;
    let ocupado = false;
    const tick = async () => {
      const c = coordsRef.current;
      if (!vivo || ocupado || document.visibilityState === 'hidden' || !c || c.isManual) return;
      if (faseRef.current === 'pergunta' && Date.now() - perguntaDesdeRef.current > PERGUNTA_MAX_MS) {
        const principal = candidatosRef.current[0];
        if (principal) detetor.current.recusar(principal.veiculo.id, 3);
        setCandidatos([]);
        setFase('livre');
        return;
      }
      if (!detetor.current.emMovimento()) return;
      ocupado = true;
      try {
        const r = await fetchVeiculos({ caixa: { sul: c.latitude - GRAUS_LAT, norte: c.latitude + GRAUS_LAT, oeste: c.longitude - GRAUS_LON, leste: c.longitude + GRAUS_LON } });
        if (!vivo) return;
        detetor.current.adicionarVeiculos(r.veiculos, { agoraServidorS: r.agora, recebidoEmMs: Date.now() });
        const e = detetor.current.escolher();
        if (e) {
          semCandidatoRef.current = 0;
          const lista = [e.principal, ...e.alternativas];
          if (faseRef.current !== 'pergunta') perguntaDesdeRef.current = Date.now();
          setCandidatos(lista);
          setFase('pergunta');
        } else if (faseRef.current === 'pergunta') {
          semCandidatoRef.current += 1;
          if (semCandidatoRef.current >= 3) { semCandidatoRef.current = 0; setCandidatos([]); setFase('livre'); }
        }
      } catch {
        /* sem rede: tenta-se na próxima volta */
      } finally {
        ocupado = false;
      }
    };
    const id = setInterval(tick, INTERVALO_DETECAO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [ativo, perguntar, fase]);

  // A bordo: de 8 em 8 segundos pede a posição do autocarro e a paragem em que vai
  useEffect(() => {
    if (fase !== 'a-bordo' || !alvo) return;
    let vivo = true;
    let ocupado = false;
    let longeSeguidas = 0;
    const tick = async () => {
      if (!vivo || ocupado || document.visibilityState === 'hidden') return;
      ocupado = true;
      try {
        const r = await fetchABordo(alvo.id, {
          desde: indiceRef.current > 0 ? indiceRef.current - 1 : undefined,
          completo: paragensRef.current.length === 0,
        });
        if (!vivo) return;
        setDados(r);
        if (r.paragens && r.paragens.length) setParagens(r.paragens);
        if (typeof r.indice === 'number') indiceRef.current = r.indice;
        setSemSinalDesde(null);
        detetor.current.acertarRelogio(r.agora ?? Math.floor(Date.now() / 1000), Date.now());
        // A pessoa já saiu? Compara-se onde ela estava na hora a que o autocarro mediu a posição (a posição do operador chega atrasada)
        const d = detetor.current.distanciaA(r.veiculo);
        const c = coordsRef.current;
        if (d !== null && c && !c.isManual) {
          longeSeguidas = d > Math.max(120, 2.5 * (c.accuracy || 0)) ? longeSeguidas + 1 : 0;
          setAfastada(longeSeguidas >= 3 && !dispensadaAfastadaRef.current);
        }
      } catch (e) {
        if (!vivo) return;
        if (e instanceof SemSinalError) setSemSinalDesde((antes) => antes ?? Date.now());
      } finally {
        ocupado = false;
      }
    };
    tick();
    const id = setInterval(tick, INTERVALO_ABORDO_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [fase, alvo?.id]);

  // Sem sinal há muito tempo (o autocarro acabou o serviço, por exemplo): sai sozinho
  useEffect(() => {
    if (semSinalDesde === null) return;
    const id = setTimeout(() => sair(), 5 * 60_000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semSinalDesde]);

  const confirmar = (v: VeiculoLeve, origem: 'detetado' | 'manual') => {
    const novo: Alvo = { id: v.id, linha: v.linha, op: v.op, origem };
    guardado = { alvo: novo, quando: Date.now() };
    indiceRef.current = -1;
    dispensadaAfastadaRef.current = false;
    setAlvo(novo);
    setDados(null);
    setParagens([]);
    setSemSinalDesde(null);
    setAfastada(false);
    setCandidatos([]);
    setFase('a-bordo');
  };

  const recusar = () => {
    // «Não»: este autocarro não volta a ser perguntado durante uns minutos (os outros candidatos também ficam de fora)
    for (const c of candidatosRef.current) detetor.current.recusar(c.veiculo.id, 10);
    setCandidatos([]);
    setFase('livre');
  };

  function sair() {
    if (alvo) detetor.current.recusar(alvo.id, 5);
    guardado = null;
    indiceRef.current = -1;
    setAlvo(null);
    setDados(null);
    setParagens([]);
    setSemSinalDesde(null);
    setAfastada(false);
    setCandidatos([]);
    setFase('livre');
  }

  const continuar = () => { dispensadaAfastadaRef.current = true; setAfastada(false); };
  const desligarPerguntas = () => { definirAbordo(false); setCandidatos([]); setFase('livre'); };

  // O guardado só se mantém enquanto se vai a bordo
  useEffect(() => { if (fase === 'a-bordo' && alvo) guardado = { alvo, quando: Date.now() }; }, [fase, alvo, dados]);

  const chaveLinha = alvo ? chaveDeLinha(alvo.op, alvo.linha) : null;
  return { fase, candidatos, alvo, dados, paragens, semSinalDesde, afastada, perguntar, chaveLinha, confirmar, recusar, sair, continuar, desligarPerguntas };
}

// ---------------------------------------------------------------- pergunta ----------------------------------------------------------------

export const PerguntaABordo: React.FC<{ controlo: ControloABordo }> = ({ controlo }) => {
  const { candidatos, confirmar, recusar, desligarPerguntas } = controlo;
  if (controlo.fase !== 'pergunta' || !candidatos.length) return null;
  const varias = candidatos.length > 1;
  const principal = candidatos[0];
  return (
    <div
      role="group"
      aria-label={t('Estás num autocarro?')}
      data-teste="pergunta-a-bordo"
      className="absolute z-30 left-3 right-3 bottom-8 lg:bottom-4 lg:left-4 lg:right-auto lg:w-[360px] rounded-[16px] bg-[#FFFFFF] shadow-[0_8px_28px_rgba(17,17,17,0.22)] border border-[#E6E6E3] p-3.5"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="shrink-0 w-10 h-10 rounded-full bg-[#FF6B1A] text-[#111111] flex items-center justify-center">
          <Bus className="w-5 h-5 stroke-[2.25]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold text-[#111111] leading-snug">
            {varias ? t('Em qual destes autocarros estás?') : t('Estás no autocarro {l}?', { l: principal.veiculo.linha })}
          </p>
          <p className="text-[12.5px] text-[#6B6B6B] leading-snug mt-0.5">
            {varias ? t('Estás a ir ao lado de mais do que um. Escolhe o teu.') : t('Parece que vais com ele. Se sim, mostro-te as próximas paragens.')}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {candidatos.map((c) => (
          <button
            key={c.veiculo.id}
            type="button"
            onClick={() => confirmar(c.veiculo, 'detetado')}
            data-teste="a-bordo-sim"
            className="h-11 min-w-[44px] px-4 rounded-[12px] bg-[#FF6B1A] text-[#111111] font-bold text-[15px] cursor-pointer active:scale-[0.98] transition-transform"
          >
            {varias ? c.veiculo.linha : t('Sim, estou')}
          </button>
        ))}
        <button
          type="button"
          onClick={recusar}
          data-teste="a-bordo-nao"
          className="h-11 px-4 rounded-[12px] bg-[#F4F4F2] text-[#111111] font-semibold text-[15px] cursor-pointer active:bg-[#E6E6E3]"
        >
          {varias ? t('Nenhum') : t('Não')}
        </button>
      </div>
      <button
        type="button"
        onClick={desligarPerguntas}
        data-teste="a-bordo-desligar"
        className="mt-1.5 -mb-1 h-11 text-[12.5px] font-medium text-[#6B6B6B] underline underline-offset-2 cursor-pointer"
      >
        {t('Não perguntar mais')}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------- painel ----------------------------------------------------------------

function formatarMetros(m: number): string {
  if (!Number.isFinite(m)) return '';
  if (m >= 1000) return `${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(m / 1000)} km`;
  if (m < 50) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${Math.round(m / 10) * 10} m`;
}

export const PainelABordo: React.FC<{ controlo: ControloABordo; aoVerNoMapa: (lat: number, lon: number) => void }> = ({ controlo, aoVerNoMapa }) => {
  const { fase, alvo, dados, paragens, semSinalDesde, afastada, sair, continuar } = controlo;
  const [verPassadas, setVerPassadas] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const proximaRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (semSinalDesde === null) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [semSinalDesde]);

  const indice = typeof dados?.indice === 'number' ? dados.indice : -1;
  useEffect(() => { proximaRef.current?.scrollIntoView({ block: 'nearest' }); }, [indice, verPassadas]);

  if (fase !== 'a-bordo' || !alvo) return null;
  const linha = dados?.linha || alvo.linha;
  const destino = dados?.destino ? formatTransitName(dados.destino) : '';
  const proxima = indice >= 0 && indice < paragens.length ? paragens[indice] : null;
  const naParagem = Boolean(dados?.naParagem);
  const ultima = paragens.length > 0 && indice === paragens.length - 1;
  const passadas = indice > 0 ? indice : 0;
  const seguintes = indice >= 0 ? paragens.slice(indice) : [];
  const faltam = indice >= 0 ? paragens.length - 1 - indice : 0;
  const desvio = (dados?.desvioM ?? 0) > 250;

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col bg-[#FFFFFF] rounded-t-[20px] lg:rounded-none"
      data-teste="painel-a-bordo"
      role="region"
      aria-label={t('A bordo')}
    >
      <div className="shrink-0 px-4 pt-3 pb-2.5 flex items-center gap-2.5 border-b border-[#E6E6E3]">
        <LineChip number={linha || '—'} color={dados?.cor} />
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#6B6B6B] leading-none">{t('A bordo')}</div>
          <div className="text-[15px] font-semibold text-[#111111] truncate mt-0.5">{destino ? t('para {d}', { d: destino }) : t('Autocarro {l}', { l: linha })}</div>
        </div>
        <button
          type="button"
          onClick={sair}
          data-teste="a-bordo-sair"
          className="shrink-0 h-11 pl-3.5 pr-3 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[14px] font-semibold text-[#111111] flex items-center gap-1.5 cursor-pointer"
          aria-label={t('Já saí do autocarro')}
        >
          {t('Já saí')}
          <X className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
        </button>
      </div>

      {afastada && (
        <div role="alert" className="shrink-0 mx-4 mt-3 rounded-[12px] bg-[#F4F4F2] border border-[#E6E6E3] px-3 py-2.5" data-teste="a-bordo-afastada">
          <p className="text-[14px] font-semibold text-[#111111]">{t('Parece que já saíste do autocarro.')}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={sair} className="h-11 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[14px] font-bold cursor-pointer">{t('Sim, saí')}</button>
            <button type="button" onClick={continuar} className="h-11 px-4 rounded-[10px] bg-[#FFFFFF] border border-[#E6E6E3] text-[#111111] text-[14px] font-semibold cursor-pointer">{t('Ainda estou a bordo')}</button>
          </div>
        </div>
      )}

      {semSinalDesde !== null && (
        <div role="status" className="shrink-0 mx-4 mt-3 rounded-[12px] bg-[#FFF7ED] border border-[#FFEDD5] px-3 py-2 text-[13px] text-[#9A3412]">
          {t('Sem sinal do autocarro há {s} s. A mostrar a última posição.', { s: Math.max(1, Math.round((agora - semSinalDesde) / 1000)) })}
        </div>
      )}

      {!dados && (
        <div className="px-4 py-6 text-[14px] text-[#6B6B6B]" role="status">{t('A procurar o percurso…')}</div>
      )}

      {dados?.semPercurso && (
        <div className="px-4 py-5" data-teste="a-bordo-sem-percurso">
          <p className="text-[15px] font-semibold text-[#111111]">{t('Sem percurso disponível para esta linha.')}</p>
          <p className="text-[13px] text-[#6B6B6B] mt-1">{t('Continuas a ver o autocarro a andar no mapa.')}</p>
        </div>
      )}

      {proxima && (
        <div className="shrink-0 px-4 pt-3.5 pb-3 border-b border-[#E6E6E3]" data-teste="a-bordo-proxima">
          <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#6B6B6B]">
            {ultima ? (naParagem ? t('Fim de linha') : t('Última paragem')) : naParagem ? t('Na paragem') : t('Próxima paragem')}
          </div>
          <div className="mt-0.5 flex items-end justify-between gap-3">
            <div className="font-condensada text-[28px] leading-[1.05] font-bold text-[#111111] min-w-0 break-words">{formatTransitName(proxima.nome)}</div>
            <div className="shrink-0 text-right pb-0.5">
              {!naParagem && typeof dados?.distanciaProximaM === 'number' && (
                <div className="font-condensada text-[22px] leading-none font-bold text-[#111111] tabular-nums">{formatarMetros(dados.distanciaProximaM)}</div>
              )}
              {proxima.hora && (
                <div className="text-[12.5px] text-[#6B6B6B] tabular-nums mt-1">{t('horário {h}', { h: proxima.hora })}</div>
              )}
            </div>
          </div>
          {faltam > 0 && (
            <div className="mt-1 text-[13px] text-[#6B6B6B]">{tn(faltam, 'Depois, mais {n} paragem até ao fim', 'Depois, mais {n} paragens até ao fim')}</div>
          )}
          {desvio && <div className="mt-1.5 text-[12.5px] font-semibold text-[#C2410C]">{t('O autocarro saiu do percurso habitual (desvio).')}</div>}
        </div>
      )}

      {seguintes.length > 0 && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4" data-teste="a-bordo-paragens">
          {passadas > 0 && (
            <button
              type="button"
              onClick={() => setVerPassadas((v) => !v)}
              aria-expanded={verPassadas}
              className="mt-1.5 h-11 px-0 flex items-center gap-1.5 text-[13px] font-semibold text-[#6B6B6B] cursor-pointer"
            >
              {verPassadas ? <ChevronUp className="w-4 h-4 stroke-[2.25]" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />}
              {verPassadas ? t('Esconder as paragens já passadas') : tn(passadas, '{n} paragem já passada', '{n} paragens já passadas')}
            </button>
          )}
          <ol className="py-1">
            {(verPassadas ? paragens : seguintes).map((p, k) => {
              const i = verPassadas ? k : indice + k;
              const eProxima = i === indice;
              const passou = i < indice;
              const primeira = k === 0;
              const fim = i === paragens.length - 1;
              return (
                <li key={`${p.id}-${i}`} ref={eProxima ? proximaRef : undefined}>
                  <button
                    type="button"
                    onClick={() => aoVerNoMapa(p.lat, p.lon)}
                    className="w-full flex items-stretch gap-3 text-left cursor-pointer active:bg-[#F4F4F2] rounded-[8px]"
                  >
                    <span className="relative w-5 shrink-0 flex justify-center" aria-hidden="true">
                      <span className={`absolute left-1/2 -translate-x-1/2 w-[4px] ${primeira ? 'top-1/2' : 'top-0'} ${fim ? 'bottom-1/2' : 'bottom-0'} ${passou ? 'bg-[#FF6B1A]/35' : 'bg-[#FF6B1A]'}`} />
                      <span
                        className={`relative self-center rounded-full border-2 ${
                          eProxima ? 'w-4 h-4 bg-[#FF6B1A] border-[#111111]'
                          : fim ? 'w-4 h-4 bg-[#111111] border-[#FF6B1A]'
                          : `w-2.5 h-2.5 bg-[#FFFFFF] ${passou ? 'border-[#FF6B1A]/50' : 'border-[#FF6B1A]'}`
                        }`}
                      />
                    </span>
                    <span className="min-w-0 flex-1 py-2.5 flex items-center justify-between gap-2">
                      <span className={`block truncate text-[14px] ${eProxima ? 'font-bold text-[#111111]' : passou ? 'font-medium text-[#6B6B6B]' : 'font-medium text-[#111111]'}`}>
                        {formatTransitName(p.nome)}
                      </span>
                      {p.hora && (
                        <span className={`shrink-0 font-condensada text-[15px] font-semibold tabular-nums ${passou ? 'text-[#6B6B6B]' : 'text-[#111111]'}`}>{p.hora}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {dados?.origem === 'posicao' && (
            <p className="pb-1 text-[11.5px] text-[#6B6B6B]">{t('Mostra as paragens por ordem; as horas de passagem não estão disponíveis para esta linha.')}</p>
          )}
          <p className="pb-1 text-[11.5px] text-[#6B6B6B]">{t('A posição do autocarro vem do operador e pode ter alguns segundos de atraso.')}</p>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- mapa ----------------------------------------------------------------

/** Desenha no mapa o percurso do autocarro em que a pessoa vai: o que falta a laranja, o que já passou esbatido, a próxima paragem em destaque */
export function ABordoNoMapa({ mapa, controlo }: { mapa: L.Map | null; controlo: ControloABordo }) {
  const grupoRef = useRef<L.LayerGroup | null>(null);
  const ajustadoRef = useRef<string>('');
  const { fase, paragens, dados } = controlo;
  const indice = typeof dados?.indice === 'number' ? dados.indice : -1;

  useEffect(() => {
    grupoRef.current?.remove();
    grupoRef.current = null;
    if (!mapa || fase !== 'a-bordo' || paragens.length < 2 || indice < 0) return;
    const pts = paragens.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (pts.length < 2) return;
    const i = Math.min(indice, pts.length - 1);
    const todos: L.LatLngTuple[] = pts.map((p) => [p.lat, p.lon]);
    const grupo = L.layerGroup();
    const nome = (p: ParagemABordo) =>
      `<span style="font:600 12px/1.2 Inter,system-ui,sans-serif">${formatTransitName(p.nome).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))}${p.hora ? `<span style="font-weight:500;opacity:.75"> · ${p.hora}</span>` : ''}</span>`;
    if (i > 0) {
      L.polyline(todos.slice(0, i + 1), { color: '#FFFFFF', weight: 9, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(grupo);
      L.polyline(todos.slice(0, i + 1), { color: '#FF6B1A', weight: 5, opacity: 0.35, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);
    }
    const restante = todos.slice(i);
    L.polyline(restante, { color: '#FFFFFF', weight: 11, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);
    L.polyline(restante, { color: '#FF6B1A', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(grupo);
    pts.forEach((p, k) => {
      if (k === i) return;
      L.circleMarker([p.lat, p.lon], { radius: k === pts.length - 1 ? 6 : 3.5, color: '#FF6B1A', weight: 2, opacity: k < i ? 0.5 : 1, fillColor: k === pts.length - 1 ? '#111111' : '#FFFFFF', fillOpacity: 1 })
        .bindTooltip(nome(p), { direction: 'top', offset: [0, -4], className: 'parou-rota-tip' })
        .addTo(grupo);
    });
    const prox = pts[i];
    L.circleMarker([prox.lat, prox.lon], { radius: 9, color: '#111111', weight: 3, fillColor: '#FF6B1A', fillOpacity: 1 })
      .bindTooltip(nome(prox), { permanent: true, direction: 'top', offset: [0, -9], className: 'parou-rota-tip' })
      .addTo(grupo);
    grupo.addTo(mapa);
    grupoRef.current = grupo;
    // Enquadra o percurso uma vez (por autocarro/percurso); depois o mapa fica livre para a pessoa o mexer
    const chave = `${controlo.alvo?.id}|${pts.length}|${pts[0].id}|${pts[pts.length - 1].id}`;
    if (ajustadoRef.current !== chave) {
      ajustadoRef.current = chave;
      try {
        mapa.fitBounds(L.latLngBounds(restante.length > 1 ? restante : todos), { paddingTopLeft: [28, 76], paddingBottomRight: [28, 40], maxZoom: 16, animate: true });
      } catch { /* mapa ainda sem tamanho */ }
    }
  }, [mapa, fase, paragens, indice, controlo.alvo?.id]);

  useEffect(() => () => { grupoRef.current?.remove(); grupoRef.current = null; }, []);
  useEffect(() => { if (fase !== 'a-bordo') ajustadoRef.current = ''; }, [fase]);
  return null;
}
