import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { Folha } from './Folha';
import { PainelContas } from './PainelContas';
import { eAdmin } from '../utils/admin';
import { utilizadorAutenticado } from '../services/conta';
import { fetchEstatisticasAdmin, type EstatisticasAdmin } from '../services/estatisticasAdmin';
import { fetchSegurancaAdmin, type ResumoSeguranca } from '../services/segurancaAdmin';

// Painel só para a administração (conta do Criador ou chave de administração).
// "Pessoas" são telemóveis/browsers diferentes que abriram a app (contagem anónima, uma por dia);
// "contas" são as pessoas que criaram conta. Quem recusa a contagem na página de Privacidade não aparece.

const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-PT'));
const pct = (a: number, total: number) => (total > 0 ? Math.round((a / total) * 100) : 0);
const diaCurto = (d: string) => d.split('-').reverse().slice(0, 2).join('/');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

const NOME_ORIGEM: Record<string, string> = { android: 'App Android (Play Store)', instalada: 'App instalada no ecrã principal', site: 'Site no browser' };
const NOME_IDIOMA: Record<string, string> = { pt: 'Português', en: 'Inglês', de: 'Alemão', fr: 'Francês' };

interface Props { aberta: boolean; onFechar: () => void }

export const PainelEstatisticas: React.FC<Props> = ({ aberta, onFechar }) => {
  if (!aberta || !(eAdmin() || utilizadorAutenticado()?.admin)) return null;
  return <Conteudo onFechar={onFechar} />;
};

const Conteudo: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const [dados, setDados] = useState<EstatisticasAdmin | null>(null);
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(true);
  const [verContas, setVerContas] = useState(false);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro('');
    try { setDados(await fetchEstatisticasAdmin()); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar as estatísticas.'); }
    finally { setACarregar(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <>
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

        {dados && <Numeros d={dados} aoVerContas={() => setVerContas(true)} />}
      </div>
    </Folha>
    <PainelContas aberta={verContas} onFechar={() => setVerContas(false)} />
    </>
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
const Barras: React.FC<{ dados: Array<{ dia: string; valor: number; extra?: string }>; unidade: string; singular: string }> = ({ dados, unidade, singular }) => {
  const [escolhido, setEscolhido] = useState(dados.length - 1);
  const maximo = useMemo(() => Math.max(1, ...dados.map((d) => d.valor)), [dados]);
  const d = dados[Math.min(escolhido, dados.length - 1)];
  return (
    <div>
      <p className="text-[14px] text-[#111111] min-h-[22px]" aria-live="polite">
        <b className="font-semibold">{diaCurto(d.dia)}</b>: {num(d.valor)} {d.valor === 1 ? singular : unidade}{d.extra ? ` · ${d.extra}` : ''}
      </p>
      <div className="mt-2 h-[112px] flex items-end gap-[3px]" role="group" aria-label={`${unidade} por dia, últimos 30 dias`}>
        {dados.map((x, i) => (
          <button
            key={x.dia}
            type="button"
            onClick={() => setEscolhido(i)}
            aria-label={`${diaCurto(x.dia)}: ${x.valor} ${x.valor === 1 ? singular : unidade}`}
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

/** Tabela única: linhas = dia, semana, mês, ano e total; colunas = o que se conta. */
const Resumo: React.FC<{ d: EstatisticasAdmin }> = ({ d }) => {
  const linhas: Array<{ nome: string; sub: string; valores: Array<number | null>; forte?: boolean }> = [
    { nome: 'Dia', sub: 'hoje', valores: [d.hoje.pessoas, d.hoje.novas, d.hoje.aberturas, d.contas.novasHoje] },
    { nome: 'Semana', sub: 'últimos 7 dias', valores: [d.ultimos7Dias.pessoas, d.ultimos7Dias.novas, d.ultimos7Dias.aberturas, d.contas.novasUltimos7Dias] },
    { nome: 'Mês', sub: 'últimos 30 dias', valores: [d.ultimos30Dias.pessoas, d.ultimos30Dias.novas, d.ultimos30Dias.aberturas, d.contas.novasUltimos30Dias] },
    { nome: 'Ano', sub: 'últimos 365 dias', valores: [d.ultimos365Dias.pessoas, d.ultimos365Dias.novas, d.ultimos365Dias.aberturas, d.contas.novasUltimos365Dias] },
    { nome: 'Total', sub: d.desdeSempre.desde ? `desde ${diaCurto(d.desdeSempre.desde)}` : 'desde o início', forte: true, valores: [d.desdeSempre.pessoas, d.desdeSempre.pessoas, d.desdeSempre.aberturas, d.contas.total] },
  ];
  const colunas = ['Pessoas', 'Novas', 'Aberturas', 'Contas novas'];
  return (
    <table className="w-full border-collapse text-left tabular-nums" data-teste="tabela-periodos">
      <thead>
        <tr>
          <th scope="col" className="sr-only">Período</th>
          {colunas.map((c) => (
            <th key={c} scope="col" className="pb-2 pl-1 text-right align-bottom text-[12px] font-bold leading-[1.1] text-[#6B6B6B]">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.nome} className={`border-t border-[#E6E6E3] ${l.forte ? 'bg-[#F4F4F2]' : ''}`}>
            <th scope="row" className="py-2.5 pl-2 pr-1 align-middle">
              <span className="block text-[15px] font-bold text-[#111111] leading-tight">{l.nome}</span>
              <span className="block text-[11.5px] font-normal text-[#6B6B6B] leading-tight">{l.sub}</span>
            </th>
            {l.valores.map((v, i) => (
              <td key={colunas[i]} className={`py-2.5 pl-1 pr-1 text-right align-middle font-condensada font-bold ${i === 0 ? 'text-[24px] text-[#111111]' : 'text-[19px] text-[#4A4A4A]'}`}>{num(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** "+12% (eram 40)" ou, sem comparação possível, nada */
function variacaoTexto(v: number | null, comparavel: boolean, anterior: number): string | undefined {
  if (!comparavel) return undefined;
  if (v == null) return anterior === 0 ? 'semana anterior sem ninguém' : undefined;
  const sinal = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sinal}${Math.abs(v).toLocaleString('pt-PT')}% (eram ${num(anterior)})`;
}
function amostraTexto(r: { amostra: number; voltaram: number }): string {
  if (r.amostra === 0) return 'ainda sem pessoas com tempo suficiente';
  return `${num(r.voltaram)} de ${num(r.amostra)} pessoas${r.amostra < 30 ? ' · amostra pequena' : ''}`;
}


const NOME_EVENTO: Record<string, string> = {
  chave_errada: 'Chaves de administração erradas',
  admin_negado: 'Robôs na administração (sem chave)',
  entrada_falhada: 'Entradas falhadas',
  redefinir_falhada: 'Códigos de recuperação errados',
  limite: 'Pedidos travados por excesso',
  origem_recusada: 'Escritas de outros sites',
  erro_servidor: 'Erros internos',
  pedido_grande: 'Pedidos grandes demais',
  sondagem: 'Sondagens de robôs',
};
const NIVEL_AVISO: Record<string, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

/** Segurança: só eventos suspeitos, com códigos de origem que mudam todos os dias (ver política de privacidade) */
const CartaoSeguranca: React.FC = () => {
  const [r, setR] = useState<ResumoSeguranca | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    fetchSegurancaAdmin().then((x) => { if (vivo) setR(x); }).catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Sem dados.'); });
    return () => { vivo = false; };
  }, []);
  const tipos = Object.keys(NOME_EVENTO);
  const total = r ? tipos.reduce((a, t) => a + (r.ultimas24h[t] || 0), 0) : 0;
  return (
    <Cartao
      titulo="Segurança (últimas 24 h)"
      nota={r ? `Só eventos suspeitos, não visitas. As origens são códigos que mudam todos os dias (não há IPs) e apagam-se aos ${r.retencaoDias} dias. Atualizado às ${hora(r.atualizado)}.` : undefined}
    >
      {erro && <p className="text-[14px] text-[#6B6B6B]">{erro}</p>}
      {!r && !erro && <p className="text-[14px] text-[#6B6B6B]">A carregar…</p>}
      {r && (
        <>
          {r.avisos.length > 0 ? (
            <ul className="space-y-2" data-teste="avisos-seguranca">
              {r.avisos.map((a) => (
                <li key={a.codigo} role="alert" className="rounded-[12px] border border-[#F2B8B2] bg-[#FDECEA] px-3 py-2.5 text-[14px] text-[#9F1D14]">
                  <b className="font-semibold">{NIVEL_AVISO[a.nivel] || a.nivel}:</b> {a.texto}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-[#111111]" data-teste="seguranca-sem-avisos">Sem avisos. {total === 0 ? 'Nada de suspeito registado.' : `${num(total)} eventos registados, dentro do normal.`}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {tipos.map((t) => <Valor key={t} rotulo={NOME_EVENTO[t]} valor={num(r.ultimas24h[t] || 0)} />)}
          </div>
          {r.origensMaisAtivasHoje.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#E6E6E3]">
              <h4 className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">Origens mais ativas hoje</h4>
              <ul className="mt-2 space-y-1.5 text-[14px] text-[#111111]">
                {r.origensMaisAtivasHoje.slice(0, 5).map((o) => (
                  <li key={o.origem} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0"><code className="text-[13px]">{o.origem}</code> <span className="text-[#6B6B6B]">· {o.tipos.split(',').map((t) => NOME_EVENTO[t] || t).join(', ')}</span></span>
                    <span className="font-semibold tabular-nums shrink-0">{num(o.n)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
};

const Numeros: React.FC<{ d: EstatisticasAdmin; aoVerContas: () => void }> = ({ d, aoVerContas }) => {
  const origens = Object.entries(d.porOrigemUltimos30Dias);
  const totalOrigens = origens.reduce((a, [, v]) => a + v, 0);
  const idiomas = Object.entries(d.porIdiomaUltimos30Dias);
  const totalIdiomas = idiomas.reduce((a, [, v]) => a + v, 0);
  const f = d.fidelidade;
  const c = d.contas;
  const semana = d.evolucao.semana;
  const mes = d.evolucao.mes;
  const chegam = d.comoChegamUltimos30Dias;
  const ig = d.integridade;

  return (
    <>
      <section className="rounded-[16px] bg-[#111111] text-[#FFFFFF] p-4" aria-label="Resumo de hoje">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-condensada text-[56px] leading-[0.9] font-bold tabular-nums">{num(d.hoje.pessoas)}</div>
            <div className="mt-1 text-[14.5px] font-semibold">pessoas usaram a PAROU hoje</div>
            <div className="text-[13px] text-[#C9C9C4]">hoje ainda a contar · ontem, dia completo: {num(d.ontem.pessoas)} · {num(d.hoje.novas)} {d.hoje.novas === 1 ? 'nova' : 'novas'} hoje</div>
          </div>
          <div className="text-right shrink-0">
            <div className="inline-flex items-center gap-1.5 text-[13px] font-semibold"><span className="w-2 h-2 rounded-full bg-[#1F9D55]" aria-hidden="true" />agora</div>
            <div className="font-condensada text-[32px] leading-none font-bold tabular-nums">{num(d.ultimosMinutos30)}</div>
            <div className="text-[12px] text-[#C9C9C4]">abriram nos últimos 30 min</div>
          </div>
        </div>
      </section>

      <Cartao
        titulo="Dia, semana, mês, ano e total"
        nota="Cada pessoa conta uma só vez em cada período, venha pela app ou por uma página pública do site. ‘Novas’ são as que apareceram pela primeira vez nesse período; ‘Aberturas’ são as vezes que a app (ou uma página do site) foi aberta, no máximo uma por meia hora e por pessoa; ‘Contas novas’ são as contas criadas (no Total, todas as que existem)."
      >
        <Resumo d={d} />
      </Cartao>

      <Cartao titulo="Pessoas por dia" nota="Cada pessoa conta uma vez por dia, mesmo que abra a app muitas vezes. Toca numa barra para ver o dia.">
        <Barras
          unidade="pessoas"
          singular="pessoa"
          dados={d.serieDiaria30Dias.map((x) => ({ dia: x.dia, valor: x.pessoas, extra: `${num(x.novas)} ${x.novas === 1 ? 'nova' : 'novas'} · ${num(x.aberturas)} aberturas${x.viaPaginas ? ` · ${num(x.viaPaginas)} por páginas públicas` : ''}` }))}
        />
      </Cartao>

      <Cartao
        titulo="Está a crescer?"
        nota={semana.comparavel
          ? `Os últimos 7 dias completos (${diaCurto(semana.atual.de)} a ${diaCurto(semana.atual.ate)}, sem contar hoje) contra os 7 anteriores (${diaCurto(semana.anterior.de)} a ${diaCurto(semana.anterior.ate)}). Só se compara semanas inteiras, para um dia a meio não distorcer.`
          : `A comparação só aparece quando houver duas semanas inteiras de dados (a contagem começou a ${d.desdeSempre.desde ? diaCurto(d.desdeSempre.desde) : '—'}, e o primeiro dia nunca é inteiro). Enquanto isso, olha para as pessoas por dia.`}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Valor rotulo="Pessoas na semana" valor={num(semana.atual.pessoas)} sub={variacaoTexto(semana.variacaoPessoas, semana.comparavel, semana.anterior.pessoas)} />
          <Valor rotulo="Novas na semana" valor={num(semana.atual.novas)} sub={variacaoTexto(semana.variacaoNovas, semana.comparavel, semana.anterior.novas)} />
          <Valor rotulo="Pessoas por dia" valor={num(semana.atual.mediaPessoasPorDia)} sub="média dos últimos 7 dias completos" />
          <Valor rotulo="Usam num dia normal" valor={d.evolucao.usoRegular.percentagem == null ? '—' : `${d.evolucao.usoRegular.percentagem}%`} sub="das pessoas do mês (média de 7 dias)" />
        </div>
        {mes.comparavel && (
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Valor rotulo="Pessoas no mês" valor={num(mes.atual.pessoas)} sub={variacaoTexto(mes.variacaoPessoas, true, mes.anterior.pessoas)} />
            <Valor rotulo="Novas no mês" valor={num(mes.atual.novas)} sub={variacaoTexto(mes.variacaoNovas, true, mes.anterior.novas)} />
          </div>
        )}
      </Cartao>

      <Cartao
        titulo="Voltam à app?"
        nota="Só entram pessoas com tempo para voltar (quem chegou ontem ainda não teve oportunidade). A amostra diz de quantas pessoas é a percentagem: com poucas, o número oscila muito."
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Valor rotulo="Voltam no dia seguinte" valor={f.noDiaSeguinte.percentagem == null ? '—' : `${f.noDiaSeguinte.percentagem}%`} sub={amostraTexto(f.noDiaSeguinte)} />
          <Valor rotulo="Voltam na 1.ª semana" valor={f.naPrimeiraSemana.percentagem == null ? '—' : `${f.naPrimeiraSemana.percentagem}%`} sub={amostraTexto(f.naPrimeiraSemana)} />
          <Valor rotulo="Usaram em 3+ dias (30 dias)" valor={num(f.pessoasQueUsaramEm3OuMaisDiasNosUltimos30)} sub={f.percentagemDoMes == null ? undefined : `${f.percentagemDoMes}% das pessoas do mês`} />
        </div>
      </Cartao>

      {(chegam.novasPelaApp + chegam.novasPorPaginasPublicas) > 0 && (
        <Cartao
          titulo="Como chegam as pessoas novas (30 dias)"
          nota={`Pelas páginas públicas (linhas, paragens, greves… que o Google mostra) chegaram ${num(chegam.novasPorPaginasPublicas)} pessoas novas; ${num(chegam.pessoasQueUsaramPaginasPublicas)} pessoas usaram estas páginas pelo menos uma vez.`}
        >
          <ul className="space-y-3">
            <BarraH nome="Abriram a app" valor={chegam.novasPelaApp} total={chegam.novasPelaApp + chegam.novasPorPaginasPublicas} />
            <BarraH nome="Chegaram por uma página pública" valor={chegam.novasPorPaginasPublicas} total={chegam.novasPelaApp + chegam.novasPorPaginasPublicas} />
          </ul>
        </Cartao>
      )}

      {d.flyer && d.flyer.total > 0 && (
        <Cartao
          titulo="Flyer: leituras do código QR"
          nota="Conta cada vez que alguém abre o endereço do código QR do flyer (no máximo 20 por hora e por ligação, sem robôs). Mostra o interesse que o papel gera; não diz quantas dessas pessoas ficaram a usar a app."
        >
          <div className="grid grid-cols-3 gap-2.5">
            <Valor rotulo="Hoje" valor={num(d.flyer.hoje)} />
            <Valor rotulo="7 dias" valor={num(d.flyer.ultimos7Dias)} />
            <Valor rotulo="Total" valor={num(d.flyer.total)} />
          </div>
          {Object.keys(d.flyer.porLocal).length > 1 && (
            <ul className="mt-3 space-y-3">
              {Object.entries(d.flyer.porLocal).map(([k, v]) => <BarraH key={k} nome={k === 'geral' ? 'Flyer geral' : `Flyer · ${k}`} valor={v} total={d.flyer.total} />)}
            </ul>
          )}
        </Cartao>
      )}

      <Cartao titulo="Como abriram da última vez (30 dias)">
        {totalOrigens === 0 ? <p className="text-[14px] text-[#6B6B6B]">Ainda sem dados.</p> : (
          <ul className="space-y-3">{origens.map(([k, v]) => <BarraH key={k} nome={NOME_ORIGEM[k] || k} valor={v} total={totalOrigens} />)}</ul>
        )}
        {totalIdiomas > 0 && (
          <ul className="mt-4 pt-4 border-t border-[#E6E6E3] space-y-3">{idiomas.map(([k, v]) => <BarraH key={k} nome={NOME_IDIOMA[k] || k} valor={v} total={totalIdiomas} />)}</ul>
        )}
      </Cartao>

      <Cartao titulo="Contas" nota={c.primeiraConta ? `A primeira conta foi criada a ${diaCurto(c.primeiraConta)}.` : undefined}>
        <div className="grid grid-cols-2 gap-2.5">
          <Valor rotulo="Contas no total" valor={num(c.total)} />
          <Valor rotulo="Entraram em 7 dias" valor={num(c.comSessaoNosUltimos7Dias)} sub={`${num(c.comSessaoNasUltimas24Horas)} nas últimas 24 h`} />
        </div>
        <div className="mt-4">
          <Barras unidade="contas novas" singular="conta nova" dados={c.serieDiaria30Dias.map((x) => ({ dia: x.dia, valor: x.novas }))} />
        </div>
        <button
          type="button"
          onClick={aoVerContas}
          className="mt-4 w-full h-11 rounded-[10px] inline-flex items-center justify-center gap-2 bg-[#111111] text-[#FFFFFF] text-[14px] font-bold cursor-pointer"
          data-teste="abrir-contas"
        >
          <Users className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />
          Ver todas as contas ({num(c.total)})
        </button>
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

      <CartaoSeguranca />

      <p
        role={ig.ok ? undefined : 'alert'}
        className={`text-[12.5px] leading-snug ${ig.ok ? 'text-[#6B6B6B]' : 'rounded-[12px] border border-[#F2B8B2] bg-[#FDECEA] px-3 py-2.5 text-[#9F1D14]'}`}
        data-teste="integridade-estatisticas"
      >
        {ig.ok
          ? `Verificação às ${hora(ig.verificadoEm)}: os totais batem certo com os registos de cada pessoa e de cada visita (${num(ig.diasVerificados)} ${ig.diasVerificados === 1 ? 'dia' : 'dias'} conferidos).`
          : `Atenção: os totais de ${num(ig.diferencas.length)} ${ig.diferencas.length === 1 ? 'valor' : 'valores'} não batem com os registos${ig.diferencas[0] ? ` (por exemplo ${diaCurto(ig.diferencas[0].dia)}: ${ig.diferencas[0].resumo} no resumo, ${ig.diferencas[0].real} nos registos)` : ''}. São corrigidos automaticamente durante a noite.`}
      </p>

      <p className="text-[12.5px] leading-snug text-[#6B6B6B] pb-2">
        Contagem anónima: sem IP, sem nome, sem email e sem ligar à conta. Uma "pessoa" é um telemóvel ou browser (a app e as páginas públicas do site contam juntas); robôs e ferramentas automáticas não contam. Quem apagar os cookies conta como pessoa nova e quem desligar a contagem na página de Privacidade não aparece. Por isso os números são um mínimo realista.
      </p>
    </>
  );
};
