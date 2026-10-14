import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { Folha } from './Folha';
import { Bandeira } from './Bandeira';
import { fetchContasAdmin, type ContaAdmin } from '../services/contasAdmin';
import type { Idioma } from '../i18n';

// Lista de todas as contas, só para a administração: nome, email, data de criação, último acesso e idioma.
// Feita para ler muitas de seguida: letra pequena, uma linha por conta (no telemóvel, três linhas curtas), pesquisa e ordenação.

const POR_PAGINA = 50;
const ZONA = 'Europe/Lisbon';
const fmtDia = new Intl.DateTimeFormat('pt-PT', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtHora = new Intl.DateTimeFormat('pt-PT', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const dia = (ms: number) => (ms > 0 ? fmtDia.format(ms) : '—');
const diaHora = (ms: number) => (ms > 0 ? `${fmtDia.format(ms)} ${fmtHora.format(ms)}` : '—');
const NOME_IDIOMA: Record<string, string> = { pt: 'Português', en: 'Inglês', de: 'Alemão', fr: 'Francês' };
const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Ordem = 'recentes' | 'acesso' | 'nome';
const ORDENS: Array<{ id: Ordem; nome: string }> = [
  { id: 'recentes', nome: 'Mais recentes' },
  { id: 'acesso', nome: 'Último acesso' },
  { id: 'nome', nome: 'Nome' },
];

interface Props { aberta: boolean; onFechar: () => void }

export const PainelContas: React.FC<Props> = ({ aberta, onFechar }) => {
  if (!aberta) return null;
  return <Conteudo onFechar={onFechar} />;
};

const Lingua: React.FC<{ idioma: string | null }> = ({ idioma }) => {
  if (!idioma) return <span className="text-[#6B6B6B]" title="Ainda sem idioma: aparece quando a pessoa voltar a abrir a app">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5" title={NOME_IDIOMA[idioma] || idioma}>
      <Bandeira idioma={idioma as Idioma} className="w-[18px] h-[12px] shrink-0" />
      <span className="text-[12px] font-semibold uppercase text-[#111111]">{idioma}</span>
    </span>
  );
};

const Conteudo: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const [contas, setContas] = useState<ContaAdmin[] | null>(null);
  const [erro, setErro] = useState('');
  const [aCarregar, setACarregar] = useState(true);
  const [texto, setTexto] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const [visiveis, setVisiveis] = useState(POR_PAGINA);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro('');
    try { setContas((await fetchContasAdmin()).contas); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível carregar as contas.'); }
    finally { setACarregar(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setVisiveis(POR_PAGINA); }, [texto, ordem]);

  const lista = useMemo(() => {
    if (!contas) return [];
    // Várias palavras: todas têm de aparecer no nome ou no email (por exemplo "ana gmail").
    const palavras = semAcentos(texto.trim()).split(/\s+/).filter(Boolean);
    const filtradas = palavras.length
      ? contas.filter((c) => { const alvo = semAcentos(`${c.nome} ${c.email}`); return palavras.every((w) => alvo.includes(w)); })
      : contas.slice();
    if (ordem === 'recentes') filtradas.sort((a, b) => b.criado - a.criado);
    else if (ordem === 'acesso') filtradas.sort((a, b) => b.ultimoAcesso - a.ultimoAcesso);
    else filtradas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }));
    return filtradas;
  }, [contas, texto, ordem]);
  const mostradas = lista.slice(0, visiveis);

  return (
    <Folha aberta titulo="Contas criadas" onFechar={onFechar} largura="larga">
      <div className="space-y-3" data-teste="painel-contas">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Procurar por nome ou email"
              aria-label="Procurar por nome ou email"
              autoComplete="off"
              className="w-full h-11 pl-9 pr-9 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[14px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111]"
              data-teste="contas-pesquisa"
            />
            {texto && (
              <button type="button" onClick={() => setTexto('')} aria-label="Limpar pesquisa" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#6B6B6B] cursor-pointer">
                <X className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={aCarregar}
            aria-label="Atualizar a lista"
            className="shrink-0 w-11 h-11 rounded-[10px] inline-flex items-center justify-center bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[#111111] cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 stroke-[2.4] ${aCarregar ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div role="group" aria-label="Ordenar por" className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {ORDENS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOrdem(o.id)}
                aria-pressed={ordem === o.id}
                className={`shrink-0 h-9 px-3 rounded-full text-[13px] font-semibold cursor-pointer ${ordem === o.id ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] text-[#111111] hover:bg-[#E6E6E3]'}`}
              >
                {o.nome}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-[#6B6B6B] tabular-nums" aria-live="polite" data-teste="contas-contagem">
            {contas === null ? (aCarregar ? 'A carregar…' : '') : texto.trim() ? `${lista.length} de ${contas.length} contas` : `${contas.length} ${contas.length === 1 ? 'conta' : 'contas'}`}
          </p>
        </div>

        {erro && <p role="alert" className="rounded-[12px] border border-[#F2B8B2] bg-[#FDECEA] px-3 py-2.5 text-[14px] text-[#9F1D14]">{erro}</p>}

        {contas !== null && lista.length === 0 && !erro && (
          <p className="py-6 text-center text-[14px] text-[#6B6B6B]">{texto.trim() ? 'Nenhuma conta com esse nome ou email.' : 'Ainda não há contas.'}</p>
        )}

        {mostradas.length > 0 && (
          <>
            {/* Telemóvel: três linhas curtas por conta */}
            <ul className="sm:hidden divide-y divide-[#E6E6E3] border-y border-[#E6E6E3]" data-teste="contas-lista">
              {mostradas.map((c) => (
                <li key={c.email} className="py-2 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[14px] font-semibold text-[#111111] truncate">{c.nome || '—'}</span>
                    <Lingua idioma={c.idioma} />
                  </div>
                  <div className="text-[13px] text-[#4A4A4A] break-all leading-snug">{c.email}</div>
                  <div className="mt-0.5 text-[12px] text-[#6B6B6B] tabular-nums leading-snug">
                    Criada {dia(c.criado)} · Acesso {diaHora(c.ultimoAcesso)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Ecrã maior: tabela */}
            <div className="hidden sm:block overflow-x-auto border-y border-[#E6E6E3]">
              <table className="w-full border-collapse text-left text-[13px] tabular-nums" data-teste="contas-tabela">
                <thead>
                  <tr className="text-[12px] text-[#6B6B6B]">
                    <th scope="col" className="py-2 pr-3 font-semibold">Nome</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Email</th>
                    <th scope="col" className="py-2 pr-3 font-semibold whitespace-nowrap">Criada em</th>
                    <th scope="col" className="py-2 pr-3 font-semibold whitespace-nowrap">Último acesso</th>
                    <th scope="col" className="py-2 font-semibold">Idioma</th>
                  </tr>
                </thead>
                <tbody>
                  {mostradas.map((c) => (
                    <tr key={c.email} className="border-t border-[#E6E6E3] align-middle">
                      <td className="py-1.5 pr-3 font-semibold text-[#111111] max-w-[160px] truncate">{c.nome || '—'}</td>
                      <td className="py-1.5 pr-3 text-[#4A4A4A] break-all">{c.email}</td>
                      <td className="py-1.5 pr-3 text-[#4A4A4A] whitespace-nowrap">{dia(c.criado)}</td>
                      <td className="py-1.5 pr-3 text-[#4A4A4A] whitespace-nowrap">{diaHora(c.ultimoAcesso)}</td>
                      <td className="py-1.5"><Lingua idioma={c.idioma} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {lista.length > mostradas.length && (
              <button
                type="button"
                onClick={() => setVisiveis((n) => n + POR_PAGINA)}
                className="w-full h-11 rounded-[10px] border border-[#E6E6E3] bg-[#FFFFFF] text-[13.5px] font-semibold text-[#111111] hover:bg-[#F4F4F2] cursor-pointer"
              >
                Mostrar mais ({lista.length - mostradas.length})
              </button>
            )}
          </>
        )}

        <p className="text-[12px] leading-snug text-[#6B6B6B] pb-1">
          O idioma é o da app no último acesso; as contas mais antigas aparecem sem idioma (—) até a pessoa voltar a abrir a app. Datas e horas de Lisboa.
        </p>
      </div>
    </Folha>
  );
};
