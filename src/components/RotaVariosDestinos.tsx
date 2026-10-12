import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Plus, RefreshCw, X } from 'lucide-react';
import { OpcaoRota } from './OpcaoRota';
import {
  MAX_DESTINOS, PERMANENCIAS_MIN, calcularTroco, chegadaDe, formatarDuracao, horaDe, pontoDoDestino,
  primeiroTrocoAlterado, textoChegada, textoPermanencia, trocoVazio,
  type DestinoViagem, type Ponto, type Troco,
} from '../services/rotaVarios';
import { t, tn } from '../i18n';
import type { TransitRouteOption } from '../types/perto';

/** O que o mapa desenha: a opção escolhida de cada troço, os destinos numerados e (opcional) o troço em foco */
export interface MapaViagem {
  rotas: Array<TransitRouteOption | null>;
  destinos: DestinoViagem[];
  foco: number | null;
}

interface Props {
  /** Onde se começa (posição atual ou local escolhido) */
  origem: Ponto;
  /** Nome do ponto de partida (por omissão, "A tua localização") */
  origemNome?: string;
  destinos: DestinoViagem[];
  onMudar: (destinos: DestinoViagem[]) => void;
  /** Fecha a viagem e volta aos transportes perto */
  onSair: () => void;
  onMapa: (mapa: MapaViagem | null) => void;
  /** Abre o ecrã "Adicionar paragens" (para juntar, tirar ou mudar a ordem das paragens) */
  onAdicionar: () => void;
  /** Percursos do 1.º destino já calculados (pela rota simples), para não os pedir outra vez ao abrir */
  inicial?: { opcoes: TransitRouteOption[]; escolhida: number; partida: number } | null;
}

function BotaoIcone({ rotulo, onClick, children }: { rotulo: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-[#6B6B6B] hover:bg-[#F4F4F2] active:bg-[#F4F4F2] cursor-pointer"
    >
      {children}
    </button>
  );
}

/** Uma linha da linha do tempo: coluna estreita à esquerda (marca + traço) e o conteúdo à direita */
function LinhaTempo({ marca, traco, children }: { marca?: React.ReactNode; traco: boolean; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-2.5">
      <div className="flex flex-col items-center" aria-hidden="true">
        {marca}
        {traco && <span className="block w-0.5 flex-1 min-h-3 rounded-full bg-[#E6E6E3]" />}
      </div>
      <div className="min-w-0 pb-3">{children}</div>
    </li>
  );
}

export function RotaVariosDestinos({ origem, origemNome, destinos, onMudar, onSair, onMapa, onAdicionar, inicial = null }: Props) {
  const inicialRef = useRef(inicial);
  const [trocos, setTrocos] = useState<Troco[]>([]);
  const trocosRef = useRef<Troco[]>([]);
  const tokenRef = useRef(0);
  const destinosRef = useRef<DestinoViagem[]>(destinos);
  const anteriorRef = useRef<DestinoViagem[] | null>(null);
  const origemRef = useRef<Ponto>(origem);
  origemRef.current = origem;
  const onMapaRef = useRef(onMapa);
  onMapaRef.current = onMapa;

  const [aberto, setAberto] = useState<number>(0);
  const [foco, setFoco] = useState<number | null>(null);
  const [calculadoEm, setCalculadoEm] = useState<number>(() => Date.now());

  const fimRef = useRef<HTMLDivElement | null>(null);

  const aplicar = useCallback((lista: Troco[]) => {
    const certa = lista.slice(0, destinosRef.current.length);
    trocosRef.current = certa;
    setTrocos(certa);
  }, []);

  /** Calcula os troços a partir do `desde` (os anteriores ficam como estão), um a seguir ao outro */
  const calcularDesde = useCallback(async (desdeIn: number) => {
    const token = ++tokenRef.current;
    let desde = desdeIn;
    const base = trocosRef.current;
    // Um troço anterior que falhou tem de ser refeito primeiro: os seguintes dependem dele
    const naoOk = base.findIndex((x, i) => i < desde && x.estado !== 'ok');
    if (naoOk >= 0) desde = naoOk;
    const lista: Troco[] = base.slice(0, desde);
    for (let i = desde; i < destinosRef.current.length; i++) lista.push(trocoVazio('espera'));
    aplicar(lista);
    if (desde === 0) setCalculadoEm(Date.now());

    for (let i = desde; i < destinosRef.current.length; i++) {
      const ds = destinosRef.current;
      if (i > 0 && lista[i - 1].estado !== 'ok') break;
      const partida = i === 0 ? Date.now() : (lista[i - 1].chegada ?? Date.now()) + ds[i - 1].permanencia * 60_000;
      lista[i] = { ...trocoVazio('a-calcular'), partida };
      aplicar([...lista]);
      const de = i === 0 ? origemRef.current : pontoDoDestino(ds[i - 1]);
      let opcoes: TransitRouteOption[] = [];
      let falhou = false;
      try {
        opcoes = await calcularTroco(de, pontoDoDestino(ds[i]), ds[i].dest.title, partida, () => token === tokenRef.current);
      } catch {
        falhou = true;
      }
      if (token !== tokenRef.current) return;
      if (falhou) { lista[i] = { ...trocoVazio('erro'), partida }; aplicar([...lista]); break; }
      if (!opcoes.length) { lista[i] = { ...trocoVazio('sem-ligacao'), partida }; aplicar([...lista]); break; }
      lista[i] = { estado: 'ok', opcoes, escolhida: 0, partida, chegada: chegadaDe(opcoes[0], partida) };
      aplicar([...lista]);
    }
  }, [aplicar]);

  // Mudou a lista de destinos (juntar, tirar, mudar a ordem, tempo no local): refaz só o que depende disso
  useEffect(() => {
    destinosRef.current = destinos;
    const antigo = anteriorRef.current;
    anteriorRef.current = destinos;
    // Juntou-se um destino ao fim: abre o novo troço e leva-o ao ecrã
    if (antigo && destinos.length > antigo.length) {
      setAberto(destinos.length - 1);
      setFoco(null);
      setTimeout(() => fimRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250);
    }
    // Ao abrir: aproveita o percurso que a rota simples já tinha calculado para o 1.º destino
    const semente = !antigo ? inicialRef.current : null;
    if (semente && semente.opcoes[semente.escolhida]) {
      inicialRef.current = null;
      aplicar([{ estado: 'ok', opcoes: semente.opcoes, escolhida: semente.escolhida, partida: semente.partida, chegada: chegadaDe(semente.opcoes[semente.escolhida], semente.partida) }]);
      setCalculadoEm(semente.partida);
      if (destinos.length > 1) calcularDesde(1);
      return;
    }
    const desde = antigo ? primeiroTrocoAlterado(antigo, destinos) : 0;
    if (desde >= destinos.length) {
      if (trocosRef.current.length > destinos.length) aplicar(trocosRef.current);
      return;
    }
    calcularDesde(desde);
  }, [destinos, calcularDesde, aplicar]);

  // O ecrã fecha: nada continua a calcular
  useEffect(() => () => { tokenRef.current++; onMapaRef.current(null); }, []);

  // O mapa acompanha as opções escolhidas
  const rotas = useMemo(() => trocos.map((x) => (x.estado === 'ok' ? x.opcoes[x.escolhida] ?? null : null)), [trocos]);
  useEffect(() => {
    onMapaRef.current({ rotas, destinos, foco });
  }, [rotas, destinos, foco]);

  const escolher = (i: number, j: number) => {
    const atual = trocosRef.current[i];
    if (!atual || atual.estado !== 'ok' || !atual.opcoes[j]) return;
    if (j === atual.escolhida) return;
    const chegada = chegadaDe(atual.opcoes[j], atual.partida);
    const mudaHora = Math.round(chegada / 60_000) !== Math.round((atual.chegada ?? 0) / 60_000);
    const nova = trocosRef.current.map((x, k) => (k === i ? { ...x, escolhida: j, chegada } : x));
    aplicar(nova);
    setFoco(i);
    // A hora de chegada mudou: os troços seguintes partem noutra hora
    if (mudaHora && i < destinosRef.current.length - 1) calcularDesde(i + 1);
  };

  const abrirTroco = (i: number) => { setAberto(i); setFoco(i); };

  const remover = (i: number) => {
    if (destinos.length <= 1) return;
    setFoco(null);
    setAberto((a) => Math.max(0, Math.min(a, destinos.length - 2)));
    onMudar(destinos.filter((_, k) => k !== i));
  };

  const mover = (i: number, passo: -1 | 1) => {
    const j = i + passo;
    if (j < 0 || j >= destinos.length) return;
    const nova = destinos.slice();
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setFoco(null);
    setAberto(Math.min(i, j));
    onMudar(nova);
  };

  const mudarPermanencia = (i: number, minutos: number) => {
    onMudar(destinos.map((d, k) => (k === i ? { ...d, permanencia: minutos } : d)));
  };

  const atualizar = () => { setFoco(null); calcularDesde(0); };

  // ---------------------------------------------------------------- resumo
  const n = destinos.length;
  const todosOk = trocos.length === n && trocos.every((x) => x.estado === 'ok');
  const emCalculo = trocos.some((x) => x.estado === 'a-calcular' || x.estado === 'espera') && !trocos.some((x) => x.estado === 'erro' || x.estado === 'sem-ligacao');
  const ultimoTroco = trocos[n - 1];
  const inicio = trocos[0]?.partida;
  const totalMin = todosOk && ultimoTroco?.chegada && inicio ? Math.round((ultimoTroco.chegada - inicio) / 60_000) : null;
  const transbordos = trocos.reduce((s, x) => s + (x.estado === 'ok' ? x.opcoes[x.escolhida]?.transfersCount || 0 : 0), 0);
  const calculados = trocos.filter((x) => x.estado === 'ok').length;
  const falhado = trocos.findIndex((x) => x.estado === 'sem-ligacao' || x.estado === 'erro');
  const desatualizado = Date.now() - calculadoEm > 5 * 60_000;

  // ---------------------------------------------------------------- troço
  const renderTroco = (i: number) => {
    const troco = trocos[i];
    const destino = destinos[i];
    if (!troco || !destino) return null;
    if (troco.estado === 'espera') {
      return <p className="text-[12.5px] text-[#6B6B6B] py-1.5">{t('Depende da paragem anterior.')}</p>;
    }
    if (troco.estado === 'a-calcular') {
      return (
        <div className="rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] p-3 flex items-center gap-3 text-[13px] text-[#6B6B6B]">
          <RefreshCw className="w-4 h-4 animate-spin text-[#111111] stroke-[2] shrink-0" />
          <span>{t('A calcular o percurso com os horários de hoje…')}</span>
        </div>
      );
    }
    if (troco.estado === 'erro') {
      return (
        <div className="rounded-[12px] bg-[#F4F4F2] p-3">
          <p className="text-[13.5px] font-semibold text-[#111111]">{t('Não foi possível calcular este percurso.')}</p>
          <button type="button" onClick={() => calcularDesde(i)} className="mt-2 h-10 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13px] font-semibold cursor-pointer">
            {t('Tentar outra vez')}
          </button>
        </div>
      );
    }
    if (troco.estado === 'sem-ligacao') {
      return (
        <div className="rounded-[12px] bg-[#F4F4F2] p-3">
          <p className="text-[13.5px] font-semibold text-[#111111]">{t('Sem ligações nas próximas 2 horas')}</p>
          <p className="text-[12.5px] text-[#6B6B6B] mt-1 leading-snug">
            {t('Não encontrámos ligações em transportes daqui para lá (até três transbordos e ~900 m a pé de cada lado).')}
            {i < n - 1 ? ` ${t('As paragens seguintes dependem desta.')}` : ''}
          </p>
          {n > 1 && (
            <button type="button" onClick={() => remover(i)} className="mt-2.5 h-10 px-4 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13px] font-semibold cursor-pointer">
              {t('Tirar esta paragem')}
            </button>
          )}
        </div>
      );
    }
    const abertoAqui = aberto === i;
    const lista = abertoAqui ? troco.opcoes : [troco.opcoes[troco.escolhida]];
    return (
      <div className="space-y-2">
        {lista.map((op) => {
          const j = troco.opcoes.indexOf(op);
          const escolhida = j === troco.escolhida;
          return (
            <OpcaoRota
              key={op.id}
              route={op}
              selecionada={escolhida}
              detalhes={abertoAqui && escolhida}
              avisar={i === 0}
              destinoNome={destino.dest.title}
              onSelecionar={() => (abertoAqui ? escolher(i, j) : abrirTroco(i))}
            />
          );
        })}
        {troco.opcoes.length > 1 && (
          <button
            type="button"
            onClick={() => (abertoAqui ? setAberto(-1) : abrirTroco(i))}
            className="h-9 px-1 text-[12.5px] font-semibold text-[#111111] underline underline-offset-2 decoration-[#C9C9C4] cursor-pointer"
          >
            {abertoAqui ? t('Mostrar só a escolhida') : tn(troco.opcoes.length - 1, 'Ver a outra opção', 'Ver as outras {n} opções')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-6" data-teste="rota-varios">
      <div className="hidden lg:flex items-center gap-2.5 px-1 pb-2">
        <button type="button" onClick={onSair} className="shrink-0 w-9 h-9 rounded-full bg-[#F4F4F2] active:bg-[#E6E6E3] text-[#111111] flex items-center justify-center cursor-pointer" aria-label={t('Voltar aos transportes perto')}>
          <ArrowLeft className="w-4.5 h-4.5 stroke-[2.25]" />
        </button>
        <span className="font-semibold text-[15px] text-[#111111] truncate">
          {t('Como chegar')} · {tn(n, '{n} paragem', '{n} paragens')}
        </span>
      </div>

      {/* Resumo */}
      <div className="rounded-[14px] bg-[#F4F4F2] p-3" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {todosOk && ultimoTroco?.chegada ? (
              <>
                <p className="font-condensada text-[22px] leading-none font-bold text-[#111111] tabular-nums">
                  {textoChegada(ultimoTroco.chegada, inicio ?? ultimoTroco.chegada)}
                </p>
                <p className="text-[12.5px] text-[#6B6B6B] mt-1.5 leading-snug">
                  {[
                    t('Duração total {d}', { d: formatarDuracao(totalMin ?? 0) }),
                    tn(n, '{n} paragem', '{n} paragens'),
                    transbordos ? tn(transbordos, '{n} transbordo', '{n} transbordos') : t('Sem transbordos'),
                  ].join(' · ')}
                </p>
              </>
            ) : emCalculo ? (
              <p className="text-[13.5px] font-semibold text-[#111111] flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin stroke-[2] shrink-0" />
                {t('A calcular o percurso {i} de {n}…', { i: Math.min(calculados + 1, n), n })}
              </p>
            ) : (
              <p className="text-[13.5px] font-semibold text-[#111111] leading-snug">
                {falhado >= 0 ? t('Sem ligação para {d}', { d: destinos[falhado]?.dest.title || '' }) : t('A calcular…')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={atualizar}
            className={`shrink-0 h-10 min-w-10 px-3 max-[379px]:px-0 max-[379px]:justify-center rounded-full text-[12.5px] font-semibold flex items-center gap-1.5 cursor-pointer ${
              desatualizado ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] text-[#111111] border border-[#E6E6E3]'
            }`}
            aria-label={t('Atualizar horários')}
          >
            <RefreshCw className="w-3.5 h-3.5 stroke-[2.25]" />
            <span className="max-[379px]:sr-only">{t('Atualizar')}</span>
          </button>
        </div>
        <p className="text-[11.5px] text-[#6B6B6B] mt-2 tabular-nums">
          {t('Calculado às {h}', { h: horaDe(calculadoEm) })}
          {desatualizado ? ` · ${t('Já passou algum tempo: atualiza para ver as horas certas.')}` : ''}
        </p>
        {foco !== null && n > 1 && (
          <button type="button" onClick={() => setFoco(null)} className="mt-1.5 h-8 text-[12.5px] font-semibold text-[#111111] underline underline-offset-2 decoration-[#C9C9C4] cursor-pointer">
            {t('Ver tudo no mapa')}
          </button>
        )}
      </div>

      {/* Linha do tempo */}
      <ol className="mt-4" data-teste="rota-varios-lista">
        <LinhaTempo
          traco
          marca={<span className="mt-1.5 block w-3.5 h-3.5 rounded-full bg-[#FFFFFF] border-[3px] border-[#111111] shrink-0" />}
        >
          <p className="text-[14px] font-semibold text-[#111111] leading-tight break-words">{origemNome || t('A tua localização')}</p>
          {trocos[0]?.partida ? (
            <p className="text-[12px] text-[#6B6B6B] mt-0.5 tabular-nums">{t('Saída a partir das {h}', { h: horaDe(trocos[0].partida) })}</p>
          ) : null}
        </LinhaTempo>

        {destinos.map((d, i) => {
          const ultimo = i === n - 1;
          const troco = trocos[i];
          const chegada = troco?.estado === 'ok' ? troco.chegada : null;
          return (
            <React.Fragment key={d.uid}>
              <LinhaTempo traco>
                {renderTroco(i)}
              </LinhaTempo>
              <LinhaTempo
                traco={!ultimo}
                marca={
                  <span className="w-7 h-7 rounded-full bg-[#111111] text-[#FFFFFF] ring-2 ring-[#FF6B1A] flex items-center justify-center font-condensada text-[15px] font-bold shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                }
              >
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-[14.5px] font-semibold text-[#111111] leading-tight break-words">{d.dest.title}</p>
                    {d.dest.subtitle && <p className="text-[11.5px] text-[#6B6B6B] mt-0.5 truncate">{d.dest.subtitle}</p>}
                  </div>
                  <div className="flex items-center -mr-1.5 -mt-1 shrink-0">
                    {i > 0 && (
                      <BotaoIcone rotulo={t('Mover para cima')} onClick={() => mover(i, -1)}><ChevronUp className="w-[18px] h-[18px] stroke-[2.25]" /></BotaoIcone>
                    )}
                    {!ultimo && (
                      <BotaoIcone rotulo={t('Mover para baixo')} onClick={() => mover(i, 1)}><ChevronDown className="w-[18px] h-[18px] stroke-[2.25]" /></BotaoIcone>
                    )}
                    {n > 1 && (
                      <BotaoIcone rotulo={t('Tirar esta paragem')} onClick={() => remover(i)}><X className="w-[18px] h-[18px] stroke-[2.25]" /></BotaoIcone>
                    )}
                  </div>
                </div>
                {chegada ? (
                  <p className="text-[12.5px] text-[#111111] mt-1 tabular-nums">
                    {textoChegada(chegada, inicio ?? chegada)}
                    {!ultimo && d.permanencia > 0 ? <span className="text-[#6B6B6B]"> · {t('segues às {h}', { h: horaDe(chegada + d.permanencia * 60_000) })}</span> : null}
                  </p>
                ) : null}
                {!ultimo && (
                  <label className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-[#6B6B6B]">
                    <Clock className="w-3.5 h-3.5 stroke-[2] shrink-0" />
                    <span>{t('No local:')}</span>
                    <select
                      value={d.permanencia}
                      onChange={(e) => mudarPermanencia(i, Number(e.target.value))}
                      className="h-9 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-[12.5px] font-semibold text-[#111111] pl-2 pr-1 cursor-pointer"
                      aria-label={t('Tempo que ficas em {d}', { d: d.dest.title })}
                    >
                      {PERMANENCIAS_MIN.map((m) => <option key={m} value={m}>{textoPermanencia(m)}</option>)}
                    </select>
                  </label>
                )}
              </LinhaTempo>
            </React.Fragment>
          );
        })}
      </ol>

      {/* Juntar outro destino */}
      <div className="mt-1" ref={fimRef}>
        {n < MAX_DESTINOS ? (
          <button
            type="button"
            onClick={onAdicionar}
            data-teste="juntar-destino-botao"
            className="w-full min-h-11 rounded-[12px] border border-dashed border-[#D5D5D0] text-[#111111] text-[13.5px] font-semibold flex items-center justify-center gap-2 px-3 cursor-pointer active:bg-[#F4F4F2] hover:bg-[#F4F4F2]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            {t('Adicionar paragem')}
            <span className="text-[#6B6B6B] font-medium tabular-nums">{n}/{MAX_DESTINOS}</span>
          </button>
        ) : (
          <p className="text-[12.5px] text-[#6B6B6B] text-center py-2">{t('Chegaste ao máximo de {n} paragens.', { n: MAX_DESTINOS })}</p>
        )}
      </div>
    </div>
  );
}
