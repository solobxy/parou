import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, EyeOff, Flag, MapPin, RefreshCw, Search, Trash2, UserX } from 'lucide-react';
import { Folha } from './Folha';
import { Occurrence, Complaint } from '../types';
import {
  adminUpdateReportStatus,
  adminUpdateComplaintStatus,
  deleteReportDoc,
  deleteComplaintDoc,
} from '../services/conta';
import { filaDeModeracao, moderar, suspenderAutor, type ItemModeracao, ErroServidor } from '../services/comunidade';

// Ecrã de moderação (só para a administração: conta do Criador ou chave de administração).
// Três filas: conversas da Comunidade (publicações e respostas), ocorrências e reclamações.

interface AdminModerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: Occurrence[];
  complaints: Complaint[];
  /** Avisa o resto da app de quantas conversas continuam por rever (para o número no menu) */
  onContagemConversas?: (n: number) => void;
}

type Fila = 'conversas' | 'ocorrencias' | 'reclamacoes';
type Filtro = 'flagged' | 'in_review' | 'hidden' | 'all';

const MOTIVOS: Record<string, string> = {
  spam: 'Spam',
  insulto: 'Insulto',
  'dados-pessoais': 'Dados pessoais',
  falso: 'Falso',
  outro: 'Outro',
};

const dataHora = (ms: number) =>
  new Date(ms).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const BTN = 'min-h-[44px] px-3 rounded-[10px] inline-flex items-center justify-center gap-1.5 text-[14px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default';
const BTN_PRIMARIO = `${BTN} bg-[#111111] text-[#FFFFFF]`;
const BTN_NEUTRO = `${BTN} bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[#111111]`;
const BTN_PERIGO = `${BTN} bg-[#FDECEA] border border-[#F2B8B2] text-[#9F1D14]`;

export const AdminModerationModal: React.FC<AdminModerationModalProps> = ({ isOpen, onClose, reports, complaints, onContagemConversas }) => {
  const [fila, setFila] = useState<Fila>('conversas');
  const [filtro, setFiltro] = useState<Filtro>('flagged');
  const [pesquisa, setPesquisa] = useState('');
  const [aviso, setAviso] = useState('');
  const [aTratar, setATratar] = useState<string | null>(null);
  // Apagar e suspender pedem uma segunda pancada para confirmar (id + ação)
  const [confirmar, setConfirmar] = useState<string | null>(null);

  // ---------- conversas ----------
  const [conversas, setConversas] = useState<ItemModeracao[] | null>(null);
  const [erroConversas, setErroConversas] = useState('');
  const [aCarregar, setACarregar] = useState(false);

  const carregarConversas = useCallback(async () => {
    setACarregar(true);
    setErroConversas('');
    try {
      const itens = await filaDeModeracao();
      setConversas(itens);
      onContagemConversas?.(itens.filter((i) => i.estado !== 'oculta' || i.denuncias > 0).length);
    } catch (e) {
      setErroConversas(e instanceof Error ? e.message : 'Não foi possível carregar a fila.');
    } finally {
      setACarregar(false);
    }
  }, [onContagemConversas]);

  useEffect(() => { if (isOpen) void carregarConversas(); }, [isOpen, carregarConversas]);

  const sinalizadas = (x: { reportsCount?: number; status: string }) => (x.reportsCount && x.reportsCount > 0) || x.status === 'Em análise';
  const nOcorrencias = useMemo(() => reports.filter(sinalizadas).length, [reports]);
  const nReclamacoes = useMemo(() => complaints.filter(sinalizadas).length, [complaints]);

  const passa = (x: { reportsCount?: number; status: string }, texto: string) => {
    if (filtro === 'flagged' && !(x.reportsCount && x.reportsCount > 0)) return false;
    if (filtro === 'in_review' && x.status !== 'Em análise') return false;
    if (filtro === 'hidden' && x.status !== 'Ocultada') return false;
    const q = pesquisa.trim().toLowerCase();
    return !q || texto.toLowerCase().includes(q);
  };
  const ocorrenciasVisiveis = useMemo(
    () => reports.filter((r) => passa(r, `${r.title} ${r.description} ${r.district}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, filtro, pesquisa],
  );
  const reclamacoesVisiveis = useMemo(
    () => complaints.filter((c) => passa(c, `${c.title} ${c.text} ${c.company || ''}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [complaints, filtro, pesquisa],
  );

  const correr = async (id: string, f: () => Promise<void>, ok: string) => {
    setATratar(id);
    setConfirmar(null);
    setAviso('');
    try { await f(); setAviso(ok); }
    catch (e) { setAviso(e instanceof ErroServidor || e instanceof Error ? e.message : 'Não foi possível concluir.'); }
    finally { setATratar(null); }
  };

  const agirConversa = (item: ItemModeracao, acao: 'restaurar' | 'esconder' | 'apagar') =>
    correr(item.id, async () => {
      await moderar(item.id, acao);
      setConversas((l) => {
        const nova = (l || []).filter((x) => x.id !== item.id);
        onContagemConversas?.(nova.filter((i) => i.estado !== 'oculta' || i.denuncias > 0).length);
        return nova;
      });
    }, acao === 'restaurar' ? 'Mantida. Já não volta a esconder-se por denúncias.' : acao === 'esconder' ? 'Escondida da Comunidade.' : 'Apagada.');

  const suspender = (item: ItemModeracao) =>
    correr(`${item.id}:suspender`, async () => {
      if (!item.email) throw new Error('Esta conta já não existe.');
      await suspenderAutor(item.email, 7);
    }, 'Autor suspenso durante 7 dias.');

  if (!isOpen) return null;

  const nConversas = conversas ? conversas.length : 0;

  return (
    <Folha aberta titulo="Moderação" onFechar={onClose} largura="larga">
      <div className="space-y-3" data-teste="painel-moderacao">
        {/* Filas */}
        <div role="tablist" aria-label="Filas de moderação" className="grid grid-cols-3 gap-1.5">
          {([
            ['conversas', 'Conversas', nConversas],
            ['ocorrencias', 'Ocorrências', nOcorrencias],
            ['reclamacoes', 'Reclamações', nReclamacoes],
          ] as Array<[Fila, string, number]>).map(([id, nome, n]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={fila === id}
              onClick={() => { setFila(id); setAviso(''); setConfirmar(null); }}
              className={`min-w-0 min-h-[56px] rounded-[12px] flex flex-col items-center justify-center px-1 cursor-pointer border ${
                fila === id ? 'bg-[#111111] border-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] border-[#E6E6E3] text-[#111111] hover:bg-[#E6E6E3]'
              }`}
              data-teste={`fila-${id}`}
            >
              <span className="font-condensada text-[22px] leading-none font-bold tabular-nums">{n}</span>
              <span className="mt-1 text-[12.5px] leading-none font-semibold truncate max-w-full">{nome}</span>
            </button>
          ))}
        </div>

        <p role="status" aria-live="polite" className="min-h-[20px] text-[13.5px] font-semibold text-[#111111]">{aviso}</p>

        {/* ---------------- Conversas ---------------- */}
        {fila === 'conversas' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13.5px] text-[#6B6B6B]">
                Publicações e respostas denunciadas ou escondidas, à espera da tua decisão.
              </p>
              <button type="button" onClick={() => void carregarConversas()} disabled={aCarregar} className={`${BTN_NEUTRO} shrink-0`} data-teste="atualizar-fila">
                <RefreshCw className={`w-4 h-4 stroke-[2.4] ${aCarregar ? 'animate-spin' : ''}`} aria-hidden="true" />
                Atualizar
              </button>
            </div>
            {erroConversas && (
              <p role="alert" className="rounded-[12px] border border-[#F2B8B2] bg-[#FDECEA] px-3 py-2.5 text-[14px] text-[#9F1D14]">{erroConversas}</p>
            )}
            {conversas && conversas.length === 0 && !erroConversas && (
              <div className="rounded-[16px] border border-[#E6E6E3] bg-[#F4F4F2] px-4 py-8 text-center">
                <Check className="w-6 h-6 mx-auto text-[#1F7A3A] stroke-[2.6]" aria-hidden="true" />
                <p className="mt-2 text-[15px] font-semibold text-[#111111]">Nada por rever</p>
                <p className="mt-1 text-[13.5px] text-[#6B6B6B]">As denúncias novas aparecem aqui.</p>
              </div>
            )}
            <ul className="space-y-3">
              {(conversas || []).map((item) => {
                const ocupado = aTratar === item.id || aTratar === `${item.id}:suspender`;
                const contagem = new Map<string, number>();
                for (const m of item.motivos) contagem.set(m, (contagem.get(m) || 0) + 1);
                return (
                  <li key={item.id} className="rounded-[16px] border border-[#E6E6E3] bg-[#FFFFFF] p-3.5" data-teste="item-moderacao">
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
                      <span className="rounded-full bg-[#F4F4F2] border border-[#E6E6E3] px-2.5 py-1 text-[#111111]">{item.tipo === 'publicacao' ? 'Publicação' : 'Resposta'}</span>
                      {item.estado === 'oculta' && <span className="rounded-full bg-[#FDECEA] border border-[#F2B8B2] px-2.5 py-1 text-[#9F1D14]">Escondida</span>}
                      {item.denuncias > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FDECEA] border border-[#F2B8B2] px-2.5 py-1 text-[#9F1D14]">
                          <Flag className="w-3.5 h-3.5 stroke-[2.4]" aria-hidden="true" />
                          {item.denuncias} {item.denuncias === 1 ? 'denúncia' : 'denúncias'}
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-[12.5px] leading-snug text-[#6B6B6B] break-words">
                      <b className="font-semibold text-[#111111]">{item.nome || 'Conta apagada'}</b>
                      {item.email ? <> · <span className="break-all">{item.email}</span></> : null}
                      <br />
                      {dataHora(item.criado)}
                    </p>

                    {item.titulo ? <h3 className="mt-2 text-[16px] leading-snug font-bold text-[#111111] break-words">{item.titulo}</h3> : null}
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#111111] whitespace-pre-wrap break-words">{item.texto}</p>

                    {contagem.size > 0 && (
                      <p className="mt-2 text-[13px] text-[#6B6B6B]">
                        Motivos: {[...contagem].map(([m, n]) => `${MOTIVOS[m] || m}${n > 1 ? ` ×${n}` : ''}`).join(' · ')}
                      </p>
                    )}

                    {confirmar === item.id + ':apagar' || confirmar === item.id + ':suspender' ? (
                      <div className="mt-3 rounded-[12px] bg-[#FDECEA] border border-[#F2B8B2] p-3">
                        <p className="text-[14px] font-semibold text-[#9F1D14]">
                          {confirmar.endsWith(':apagar') ? 'Apagar de vez? Não dá para desfazer.' : 'Suspender o autor durante 7 dias? Não poderá publicar nem responder.'}
                        </p>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          <button type="button" className={BTN_NEUTRO} onClick={() => setConfirmar(null)}>Cancelar</button>
                          <button
                            type="button"
                            className={`${BTN} bg-[#D92D20] text-[#FFFFFF]`}
                            onClick={() => (confirmar.endsWith(':apagar') ? void agirConversa(item, 'apagar') : void suspender(item))}
                            data-teste="confirmar-acao"
                          >
                            {confirmar.endsWith(':apagar') ? 'Apagar' : 'Suspender'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button type="button" className={BTN_PRIMARIO} disabled={ocupado} onClick={() => void agirConversa(item, 'restaurar')} data-teste="moderar-manter">
                          <Check className="w-4 h-4 stroke-[2.6]" aria-hidden="true" /> Manter
                        </button>
                        <button type="button" className={BTN_NEUTRO} disabled={ocupado} onClick={() => void agirConversa(item, 'esconder')} data-teste="moderar-esconder">
                          <EyeOff className="w-4 h-4 stroke-[2.4]" aria-hidden="true" /> Esconder
                        </button>
                        <button type="button" className={BTN_PERIGO} disabled={ocupado} onClick={() => setConfirmar(item.id + ':apagar')} data-teste="moderar-apagar">
                          <Trash2 className="w-4 h-4 stroke-[2.4]" aria-hidden="true" /> Apagar
                        </button>
                        <button type="button" className={BTN_NEUTRO} disabled={ocupado || !item.email} onClick={() => setConfirmar(item.id + ':suspender')} data-teste="moderar-suspender">
                          <UserX className="w-4 h-4 stroke-[2.4]" aria-hidden="true" /> Suspender autor
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ---------------- Ocorrências e reclamações ---------------- */}
        {fila !== 'conversas' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtro">
              {(['flagged', 'in_review', 'hidden', 'all'] as const).map((modo) => (
                <button
                  key={modo}
                  type="button"
                  onClick={() => setFiltro(modo)}
                  aria-pressed={filtro === modo}
                  className={`min-h-[40px] px-3 rounded-full text-[13.5px] font-semibold cursor-pointer border ${
                    filtro === modo ? 'bg-[#111111] border-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] border-[#E6E6E3] text-[#111111] hover:bg-[#E6E6E3]'
                  }`}
                >
                  {modo === 'flagged' ? 'Denunciadas' : modo === 'in_review' ? 'Em análise' : modo === 'hidden' ? 'Ocultadas' : 'Todas'}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2 stroke-[2]" aria-hidden="true" />
              <input
                type="search"
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
                placeholder="Pesquisar…"
                aria-label="Pesquisar"
                className="w-full h-11 pl-9 pr-3 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[10px] text-[14px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111]"
              />
            </div>

            {(fila === 'ocorrencias' ? ocorrenciasVisiveis.length : reclamacoesVisiveis.length) === 0 && (
              <div className="rounded-[16px] border border-[#E6E6E3] bg-[#F4F4F2] px-4 py-8 text-center">
                <Check className="w-6 h-6 mx-auto text-[#1F7A3A] stroke-[2.6]" aria-hidden="true" />
                <p className="mt-2 text-[15px] font-semibold text-[#111111]">Nada por rever</p>
              </div>
            )}

            <ul className="space-y-3">
              {fila === 'ocorrencias' && ocorrenciasVisiveis.map((r) => (
                <li key={r.id} className="rounded-[16px] border border-[#E6E6E3] bg-[#FFFFFF] p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
                    <span className="rounded-full bg-[#F4F4F2] border border-[#E6E6E3] px-2.5 py-1 text-[#111111]">{r.status}</span>
                    {r.reportsCount ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FDECEA] border border-[#F2B8B2] px-2.5 py-1 text-[#9F1D14]">
                        <Flag className="w-3.5 h-3.5 stroke-[2.4]" aria-hidden="true" />
                        {r.reportsCount} {r.reportsCount === 1 ? 'denúncia' : 'denúncias'}
                      </span>
                    ) : null}
                    <span className="text-[#6B6B6B] font-medium">{r.type} · {new Date(r.timestamp).toLocaleDateString('pt-PT')}</span>
                  </div>
                  <h3 className="mt-2 text-[16px] leading-snug font-bold text-[#111111] break-words">{r.title}</h3>
                  {r.description && <p className="mt-1 text-[14.5px] leading-relaxed text-[#111111] whitespace-pre-wrap break-words">{r.description}</p>}
                  <p className="mt-1.5 text-[13px] text-[#6B6B6B] inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 stroke-[2]" aria-hidden="true" />{r.district}</p>
                  {confirmar === r.id + ':apagar' ? (
                    <Confirmacao texto="Apagar esta ocorrência de vez?" aoCancelar={() => setConfirmar(null)} aoConfirmar={() => void correr(r.id, () => deleteReportDoc(r.id), 'Ocorrência apagada.')} />
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" className={BTN_PRIMARIO} disabled={aTratar === r.id} onClick={() => void correr(r.id, () => adminUpdateReportStatus(r.id, 'Ativa', true), 'Aprovada.')}>
                        <Check className="w-4 h-4 stroke-[2.6]" aria-hidden="true" /> Aprovar
                      </button>
                      <button type="button" className={BTN_NEUTRO} disabled={aTratar === r.id || r.status === 'Ocultada'} onClick={() => void correr(r.id, () => adminUpdateReportStatus(r.id, 'Ocultada'), 'Ocultada.')}>
                        <EyeOff className="w-4 h-4 stroke-[2.4]" aria-hidden="true" /> Ocultar
                      </button>
                      <button type="button" className={BTN_PERIGO} disabled={aTratar === r.id} onClick={() => setConfirmar(r.id + ':apagar')}>
                        <Trash2 className="w-4 h-4 stroke-[2.4]" aria-hidden="true" /> Apagar
                      </button>
                    </div>
                  )}
                </li>
              ))}

              {fila === 'reclamacoes' && reclamacoesVisiveis.map((c) => (
                <li key={c.id} className="rounded-[16px] border border-[#E6E6E3] bg-[#FFFFFF] p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold">
                    <span className="rounded-full bg-[#F4F4F2] border border-[#E6E6E3] px-2.5 py-1 text-[#111111]">{c.status}</span>
                    {c.reportsCount ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FDECEA] border border-[#F2B8B2] px-2.5 py-1 text-[#9F1D14]">
                        <Flag className="w-3.5 h-3.5 stroke-[2.4]" aria-hidden="true" />
                        {c.reportsCount} {c.reportsCount === 1 ? 'denúncia' : 'denúncias'}
                      </span>
                    ) : null}
                    <span className="text-[#6B6B6B] font-medium">{c.company} · {new Date(c.timestamp).toLocaleDateString('pt-PT')}</span>
                  </div>
                  <h3 className="mt-2 text-[16px] leading-snug font-bold text-[#111111] break-words">{c.title}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-[#111111] whitespace-pre-wrap break-words">{c.text}</p>
                  {confirmar === c.id + ':apagar' ? (
                    <Confirmacao texto="Apagar esta reclamação de vez?" aoCancelar={() => setConfirmar(null)} aoConfirmar={() => void correr(c.id, () => deleteComplaintDoc(c.id), 'Reclamação apagada.')} />
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" className={BTN_PRIMARIO} disabled={aTratar === c.id} onClick={() => void correr(c.id, () => adminUpdateComplaintStatus(c.id, 'Pública', true), 'Aprovada.')}>
                        <Check className="w-4 h-4 stroke-[2.6]" aria-hidden="true" /> Aprovar
                      </button>
                      <button type="button" className={BTN_NEUTRO} disabled={aTratar === c.id || c.status === 'Ocultada'} onClick={() => void correr(c.id, () => adminUpdateComplaintStatus(c.id, 'Ocultada'), 'Ocultada.')}>
                        <EyeOff className="w-4 h-4 stroke-[2.4]" aria-hidden="true" /> Ocultar
                      </button>
                      <button type="button" className={BTN_PERIGO} disabled={aTratar === c.id} onClick={() => setConfirmar(c.id + ':apagar')}>
                        <Trash2 className="w-4 h-4 stroke-[2.4]" aria-hidden="true" /> Apagar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Folha>
  );
};

const Confirmacao: React.FC<{ texto: string; aoCancelar: () => void; aoConfirmar: () => void }> = ({ texto, aoCancelar, aoConfirmar }) => (
  <div className="mt-3 rounded-[12px] bg-[#FDECEA] border border-[#F2B8B2] p-3">
    <p className="text-[14px] font-semibold text-[#9F1D14]">{texto} Não dá para desfazer.</p>
    <div className="mt-2.5 grid grid-cols-2 gap-2">
      <button type="button" className={BTN_NEUTRO} onClick={aoCancelar}>Cancelar</button>
      <button type="button" className={`${BTN} bg-[#D92D20] text-[#FFFFFF]`} onClick={aoConfirmar} data-teste="confirmar-acao">Apagar</button>
    </div>
  </div>
);
