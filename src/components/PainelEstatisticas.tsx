import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Folha } from './Folha';
import { eAdmin } from '../utils/admin';
import { utilizadorAutenticado } from '../services/conta';
import { fetchEstatisticasAdmin, type EstatisticasAdmin } from '../services/estatisticasAdmin';

// Painel só para a administração (conta do Criador ou chave de administração).
// "Pessoas" são telemóveis/browsers diferentes que abriram a app (contagem anónima, uma por dia);
// "contas" são as pessoas que criaram conta. Quem recusa a contagem na página de Privacidade não aparece.

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-PT'));
const pct = (a: number, total: number) => (total > 0 ? Math.round((a / total) * 100) : 0);
const diaCurto = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

const NOME_ORIGEM: Record<string, string> = { android: 'App Android (Play Store)', instalada: 'App instalada no ecrã principal', site: 'Site no browser' };
const NOME_IDIOMA: Record<string, string> = { pt: 'Português', en: 'Inglês' };

interface Props { aberta: boolean; onFechar: () => void }

export const PainelEstatisticas: React.FC<Props> = ({ aberta, onFechar }) => {
  if (!aberta || !(eAdmin() || utilizadorAutenticado()?.admin)) return null;
  return <Conteudo onFechar={onFechar} />;
};

const Conteudo: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const [dados, setDados] = useState<EstatisticasAdmin | null>(null);
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro('');
    try { setDados(await fetchEstatisticasAdmin()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar as estatísticas.'); }
    finally { setACarregar(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <Folha aberta titulo="Estatísticas" onFechar={onFechar} largura="larga">
      <div className="space-y-4" data-teste="painel-estatisticas">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-[#6B6B6B]" aria-live="polite">
            {dados ? `Atualizado às ${hora(dados.geradoEm)}` : aCarregar ? 'A carregar…' : ''}
          </p>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={aCarregar}
            className="h-11 px-4 rounded-[10px] inline-flex items-center gap-2 bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[14px] font-semibold text-[#111111] cursor-pointer disabled:opacity-60"
            data-teste="atualizar-estatisticas"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2.4] ${aCarregar ? 'animate-spin' : ''}`} aria-hidden="true" />
            Atualizar
          </button>
        </div>

        {erro && (
          <p role="alert" className="rounded-[12px] border border-[#F2B8B2] bg-[#FDECEA] px-3 py-2.5 text-[14px] text-[#9F1D14]">{erro}</p>
        )}

        {dados && <Numeros d={dados} />}
      </div>
    </Folha>
  );
};

const Cartao: React.FC<{ titulo: string; children: React.ReactNode; nota?: string }> = ({ titulo, children, nota }) => (
  <section className="rounded-[16px] border border-[#E6E6E3] bg-[#FFFFFF] p-4">
    <h3 className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">{titulo}</h3>
    <div className="mt-2.5">{children}</div>
    {nota && <p className="mt-2.5 text-[12.5px] leading-snug text-[#6B6B6B]">{nota}</p>}
  </section>
);

const Valor: React.FC<{ rotulo: string; valor: string; sub?: string }> = ({ rotulo, valor, sub }) => (
  <div className="min-w-0 rounded-[12px] bg-[#F4F4F2] px-3 py-2.5">
    <div className="font-condensada text-[32px] leading-none font-bold tabular-nums text-[#111111]">{valor}</div>
    <div className="mt-1 text-[13px] font-semibold text-[#111111] leading-tight">{rotulo}</div>
    {sub && <div className="text-[12.5px] text-[#6B6B6B] leading-tight mt-0.5">{sub}</div>}
  </div>
);

/** Barras por dia. Toca numa barra para ver o dia. */
const Barras: React.FC<{ dados: Array<{ dia: string; valor: number; extra?: string }>; unidade: string }> = ({ dados, unidade }) => {
  const [escolhido, setEscolhido] = useState(dados.length - 1);
  const maximo = useMemo(() => Math.max(1, ...dados.map((d) => d.valor)), [dados]);
  const d = dados[Math.min(escolhido, dados.length - 1)];
  return (
    <div>
      <p className="text-[14px] text-[#111111] min-h-[22px]" aria-live="polite">
        <b className="font-semibold">{diaCurto(d.dia)}</b>: {num(d.valor)} {d.valor === 1 ? unidade.replace(/s$/, '') : unidade}{d.extra ? ` · ${d.extra}` : ''}
      </p>
      <div className="mt-2 h-[112px] flex items-end gap-[3px]" role="group" aria-label={`${unidade} por dia, últimos 30 dias`}>
        {dados.map((x, i) => (
          <button
            key={x.dia}
            type="button"
            onClick={() => setEscolhido(i)}
            aria-label={`${diaCurto(x.dia)}: ${x.valor} ${unidade}`}
            aria-pressed={i === escolhido}
            className="flex-1 min-w-0 h-full flex items-end cursor-pointer rounded-[3px] focus-visible:outline-2"
          >
            <span
              className={`block w-full rounded-t-[3px] ${x.valor === 0 ? 'bg-[#D6D6D2]' : i === escolhido ? 'bg-[#C2410C]' : 'bg-[#FF6B1A]'}`}
              style={{ height: x.valor === 0 ? 3 : `${Math.max(4, Math.round((x.valor / maximo) * 100))}%` }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-[#6B6B6B] tabular-nums">
        <span>{diaCurto(dados[0].dia)}</span>
        <span>{diaCurto(dados[Math.floor(dados.length / 2)].dia)}</span>
        <span>hoje</span>
      </div>
    </div>
  );
};

const BarraH: React.FC<{ nome: string; valor: number; total: number }> = ({ nome, valor, total }) => (
  <li>
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <span className="text-[#111111] min-w-0">{nome}</span>
      <span className="font-semibold tabular-nums text-[#111111] shrink-0">{num(valor)} <span className="text-[#6B6B6B] font-medium">· {pct(valor, total)}%</span></span>
    </div>
    <div className="mt-1 h-2 rounded-full bg-[#E6E6E3] overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full bg-[#FF6B1A]" style={{ width: `${pct(valor, total)}%` }} />
    </div>
  </li>
);

const Numeros: React.FC<{ d: EstatisticasAdmin }> = ({ d }) => {
  const origens = Object.entries(d.porOrigemUltimos30Dias);
  const totalOrigens = origens.reduce((a, [, v]) => a + v, 0);
  const idiomas = Object.entries(d.porIdiomaUltimos30Dias);
  const totalIdiomas = idiomas.reduce((a, [, v]) => a + v, 0);
  const f = d.fidelidade;
  const c = d.contas;

  return (
    <>
      <section className="rounded-[16px] bg-[#111111] text-[#FFFFFF] p-4" aria-label="Resumo de hoje">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-condensada text-[56px] leading-[0.9] font-bold tabular-nums">{num(d.hoje.pessoas)}</div>
            <div className="mt-1 text-[14.5px] font-semibold">pessoas abriram a PAROU hoje</div>
            <div className="text-[13px] text-[#C9C9C4]">ontem: {num(d.ontem.pessoas)} · {num(d.hoje.novas)} {d.hoje.novas === 1 ? 'nova' : 'novas'} hoje</div>
          </div>
          <div className="text-right shrink-0">
            <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold"><span className="w-2 h-2 rounded-full bg-[#1F9D55]" aria-hidden="true" />agora</div>
            <div className="font-condensada text-[32px] leading-none font-bold tabular-nums">{num(d.ultimosMinutos30)}</div>
            <div className="text-[12px] text-[#C9C9C4]">últimos 30 min</div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Valor rotulo="Últimos 7 dias" valor={num(d.ultimos7Dias.pessoas)} sub={`${num(d.ultimos7Dias.novas)} novas`} />
        <Valor rotulo="Últimos 30 dias" valor={num(d.ultimos30Dias.pessoas)} sub={`${num(d.ultimos30Dias.novas)} novas`} />
        <Valor rotulo="Desde sempre" valor={num(d.desdeSempre.pessoas)} sub={d.desdeSempre.desde ? `desde ${diaCurto(d.desdeSempre.desde)}` : undefined} />
        <Valor rotulo="Contas criadas" valor={num(c.total)} sub={`${num(c.novasUltimos7Dias)} nos últimos 7 dias`} />
      </div>

      <Cartao titulo="Pessoas por dia" nota="Cada pessoa conta uma vez por dia, mesmo que abra a app muitas vezes. Toca numa barra para ver o dia.">
        <Barras
          unidade="pessoas"
          dados={d.serieDiaria30Dias.map((x) => ({ dia: x.dia, valor: x.pessoas, extra: `${num(x.novas)} ${x.novas === 1 ? 'nova' : 'novas'} · ${num(x.aberturas)} aberturas` }))}
        />
      </Cartao>

      <Cartao
        titulo="Voltam à app?"
        nota={f.novasNosUltimos14DiasSemHoje > 0
          ? `Das ${num(f.novasNosUltimos14DiasSemHoje)} pessoas que apareceram pela primeira vez nos últimos 14 dias (sem contar hoje), ${num(f.voltaramNoutroDia)} voltaram noutro dia.`
          : 'Ainda não há pessoas suficientes para medir.'}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Valor rotulo="Voltaram noutro dia" valor={f.percentagemQueVoltou == null ? '—' : `${f.percentagemQueVoltou}%`} />
          <Valor rotulo="Usaram em 3+ dias (30 dias)" valor={num(f.pessoasQueUsaramEm3OuMaisDiasNosUltimos30)} sub={f.percentagemDoMes == null ? undefined : `${f.percentagemDoMes}% das pessoas do mês`} />
        </div>
      </Cartao>

      <Cartao titulo="Como abrem a app (30 dias)">
        {totalOrigens === 0 ? <p className="text-[14px] text-[#6B6B6B]">Ainda sem dados.</p> : (
          <ul className="space-y-3">{origens.map(([k, v]) => <BarraH key={k} nome={NOME_ORIGEM[k] || k} valor={v} total={totalOrigens} />)}</ul>
        )}
        {totalIdiomas > 0 && (
          <ul className="mt-4 pt-4 border-t border-[#E6E6E3] space-y-3">{idiomas.map(([k, v]) => <BarraH key={k} nome={NOME_IDIOMA[k] || k} valor={v} total={totalIdiomas} />)}</ul>
        )}
      </Cartao>

      <Cartao titulo="Contas" nota={c.primeiraConta ? `A primeira conta foi criada a ${diaCurto(c.primeiraConta)}.` : undefined}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Valor rotulo="Total" valor={num(c.total)} />
          <Valor rotulo="Novas hoje" valor={num(c.novasHoje)} />
          <Valor rotulo="Novas em 30 dias" valor={num(c.novasUltimos30Dias)} />
          <Valor rotulo="Entraram nos últimos 7 dias" valor={num(c.comSessaoNosUltimos7Dias)} sub={`${num(c.comSessaoNasUltimas24Horas)} nas últimas 24 h`} />
        </div>
        <div className="mt-4">
          <Barras unidade="contas novas" dados={c.serieDiaria30Dias.map((x) => ({ dia: x.dia, valor: x.novas }))} />
        </div>
      </Cartao>

      <Cartao titulo="Comunidade">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Valor rotulo="Publicações" valor={num(c.comunidade.publicacoes)} sub={`${num(c.comunidade.publicacoesUltimos7Dias)} em 7 dias`} />
          <Valor rotulo="Respostas" valor={num(c.comunidade.respostas)} sub={`${num(c.comunidade.respostasUltimos7Dias)} em 7 dias`} />
          <Valor rotulo="Escreveram (30 dias)" valor={num(c.comunidade.pessoasQueEscreveramNosUltimos30Dias)} sub="pessoas diferentes" />
          <Valor rotulo="Votos" valor={num(c.comunidade.votos)} />
        </div>
      </Cartao>

      <Cartao titulo="Outros números">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Valor rotulo="Notificações ligadas" valor={num(d.outrosNumeros.subscricoesDeNotificacoes)} sub="telemóveis" />
          <Valor rotulo="Cópias de favoritos" valor={num(d.outrosNumeros.telemoveisComCopiaDeFavoritos)} sub="telemóveis" />
          <Valor rotulo="Ocorrências" valor={num(d.outrosNumeros.ocorrenciasGuardadas)} sub="guardadas" />
          <Valor rotulo="Reclamações" valor={num(d.outrosNumeros.reclamacoesGuardadas)} sub="guardadas" />
        </div>
      </Cartao>

      <p className="text-[12.5px] leading-snug text-[#6B6B6B] pb-2">
        Contagem anónima: sem IP, sem nome, sem email e sem ligar à conta. Uma "pessoa" é um telemóvel ou browser; quem apagar os cookies conta como pessoa nova e quem desligar a contagem na página de Privacidade não aparece. Por isso os números são um mínimo realista.
      </p>
    </>
  );
};
