// Relatórios no painel de estatísticas (só administração): escolhe-se o período e vêem-se os números principais; o relatório
// inteiro (por hora, por linha, todas as greves) descarrega-se em JSON para reportar aos operadores ou mandar a jornalistas.
import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { fetchRelatorio, type PeriodoRelatorio, type Relatorio } from '../services/relatoriosAdmin';

const PERIODOS: Array<[PeriodoRelatorio, string]> = [['dia', 'Ontem'], ['semana', '7 dias'], ['mes', '30 dias'], ['trimestre', 'Trimestre'], ['ano', 'Ano'], ['2anos', '2 anos'], ['3anos', '3 anos'], ['sempre', 'Sempre']];
const num = (n: number | null | undefined, suf = '') => (n === null || n === undefined ? '—' : `${n.toLocaleString('pt-PT')}${suf}`);
const data = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const Bloco: React.FC<{ titulo: string; nota?: string; children: React.ReactNode }> = ({ titulo, nota, children }) => (
  <section className="rounded-[16px] border border-[#E6E6E3] bg-[#FFFFFF] p-4">
    <h4 className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-[#6B6B6B]">{titulo}</h4>
    <div className="mt-2.5 space-y-1.5 text-[14px] text-[#111111]">{children}</div>
    {nota && <p className="mt-2.5 text-[12.5px] leading-snug text-[#6B6B6B]">{nota}</p>}
  </section>
);
const Linha: React.FC<{ nome: string; valor: string; extra?: string }> = ({ nome, valor, extra }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="min-w-0 truncate">{nome}</span>
    <span className="shrink-0 tabular-nums font-semibold">{valor}{extra && <span className="ml-1.5 font-normal text-[#6B6B6B]">{extra}</span>}</span>
  </div>
);

export const RelatoriosAdmin: React.FC = () => {
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>('semana');
  const [r, setR] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(false);
  const carregar = useCallback(async (p: PeriodoRelatorio) => {
    setACarregar(true); setErro('');
    try { setR(await fetchRelatorio(p)); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível fazer o relatório.'); setR(null); } finally { setACarregar(false); }
  }, []);
  useEffect(() => { void carregar(periodo); }, [periodo, carregar]);

  const descarregar = () => {
    if (!r) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `parou-relatorio-${r.periodo}-${r.desde}-a-${r.ate}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="space-y-3" data-teste="relatorios-admin">
      <h3 className="text-[17px] font-bold text-[#111111]">Relatórios</h3>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Período do relatório">
        {PERIODOS.map(([p, nome]) => (
          <button key={p} type="button" role="tab" aria-selected={periodo === p} onClick={() => setPeriodo(p)}
            className={`shrink-0 h-9 px-3 rounded-full text-[13.5px] font-semibold border cursor-pointer ${periodo === p ? 'bg-[#111111] text-[#FFFFFF] border-[#111111]' : 'bg-[#FFFFFF] text-[#111111] border-[#E6E6E3]'}`}>
            {nome}
          </button>
        ))}
      </div>
      {aCarregar && <p className="text-[13.5px] text-[#6B6B6B]" aria-live="polite">A fazer o relatório…</p>}
      {erro && <p role="alert" className="rounded-[12px] border border-[#F2B8B2] bg-[#FDECEA] px-3 py-2.5 text-[14px] text-[#9F1D14]">{erro}</p>}
      {r && !aCarregar && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13.5px] text-[#6B6B6B]">{data(r.desde)} a {data(r.ate)}</p>
            <button type="button" onClick={descarregar} className="h-10 px-3 rounded-[10px] inline-flex items-center gap-2 bg-[#F4F4F2] border border-[#E6E6E3] text-[13.5px] font-semibold text-[#111111] cursor-pointer">
              <Download className="w-4 h-4" aria-hidden="true" /> Descarregar
            </button>
          </div>
          <Bloco titulo="Atrasos medidos" nota="Previsões em direto, de 5 em 5 min. Percentagem de autocarros com 5 ou mais minutos de atraso; entre parênteses, a mediana.">
            {r.atrasos.length ? r.atrasos.map((a) => (
              <Linha key={a.feed} nome={a.operador} valor={num(a.pct_5min_ou_mais, '%')} extra={`(${num(a.mediana_min, ' min')}) · ${num(a.amostras)}`} />
            )) : <p className="text-[#6B6B6B]">Ainda sem medições neste período.</p>}
            {r.atrasos.filter((a) => a.pior_hora).map((a) => (
              <p key={`h-${a.feed}`} className="text-[12.5px] text-[#6B6B6B]">{a.operador}: pior hora às {a.pior_hora!.hora}h ({num(a.pior_hora!.pct_5min_ou_mais, '%')} com 5+ min)</p>
            ))}
          </Bloco>
          <Bloco titulo="Pontualidade das passagens" nota="A horas = de 1 min adiantado a 5 min atrasado.">
            {r.pontualidade.length ? r.pontualidade.map((p) => (
              <Linha key={p.operador} nome={p.operador} valor={num(p.a_horas_pct, '%')} extra={`a horas · ${num(p.atrasado_mais_10min_pct, '%')} com 10+ min`} />
            )) : <p className="text-[#6B6B6B]">Sem passagens gravadas neste período.</p>}
          </Bloco>
          <Bloco titulo="Avisos e greves">
            <Linha nome="Avisos dos operadores e do IPMA" valor={num(r.avisos.total)} />
            {Object.entries(r.avisos.por_tipo).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => <Linha key={t} nome={t} valor={num(n)} />)}
            {r.avisos.greves.length > 0 && <p className="pt-1 text-[12.5px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Greves</p>}
            {r.avisos.greves.slice(0, 12).map((g, i) => <p key={i} className="text-[13.5px] leading-snug">{g.operador}: {g.titulo} <span className="text-[#6B6B6B]">({data(g.inicio)}{g.fim ? ` a ${data(g.fim)}` : ''})</span></p>)}
          </Bloco>
          <Bloco titulo="Viagens programadas" nota={r.viagens.dias_com_dados ? `Média por dia, comparada com o período anterior (${r.viagens.dias_com_dados} dias com horários guardados).` : 'Os horários de cada dia começaram a ser guardados a 25/11/2026.'}>
            {r.viagens.por_operador.slice(0, 12).map((v) => <Linha key={v.feed} nome={v.operador} valor={num(v.viagens_dia)} extra={v.variacao_pct !== null ? `${v.variacao_pct > 0 ? '+' : ''}${num(v.variacao_pct, '%')}` : undefined} />)}
            {r.viagens.linhas_que_perderam_viagens.length > 0 && <p className="pt-1 text-[12.5px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">Linhas que perderam viagens</p>}
            {r.viagens.linhas_que_perderam_viagens.slice(0, 8).map((l, i) => <Linha key={i} nome={`${l.operador} ${l.linha}`} valor={num(l.variacao_pct, '%')} extra={`${num(l.antes)} → ${num(l.viagens_dia)}`} />)}
          </Bloco>
          <Bloco titulo="Notícias guardadas">
            {Object.keys(r.noticias).length ? Object.entries(r.noticias).map(([c, n]) => <Linha key={c} nome={c} valor={num(n)} />) : <p className="text-[#6B6B6B]">Nenhuma neste período.</p>}
          </Bloco>
        </>
      )}
    </div>
  );
};
