import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, MessageCircle, RefreshCw, Share2, Undo2 } from 'lucide-react';
import { Folha } from './Folha';
import { eAdmin } from '../utils/admin';
import { utilizadorAutenticado } from '../services/conta';
import { CANAL_WHATSAPP } from '../config/ligacoes';
import { NOVIDADES, type NovidadeCanal } from '../config/novidades';
import { fetchCentralAlerts } from '../services/centralAlertsApi';
import { fetchAvisosCanal } from '../services/avisosCanal';
import type { CentralAlert } from '../types/alerts';
import { avisoDoCanal, avisosImportantes, categoriaDoPainel, chaveDoAviso, eDoCanal, ordenarAvisos, quandoDoAviso, RASCUNHOS, semRepetidos, textoDeNovidade, textoDoAviso, TipoNovidade } from '../utils/whatsapp';
import { CATEGORIAS_AVISO, imagemDaCategoria, nomeDaCategoria, type CategoriaAviso } from '../utils/imagemAviso';
import { partilharComImagens, podePartilharFicheiros } from '../utils/partilhaImagem';

// Painel só para o administrador. O WhatsApp não deixa programas publicarem em canais, por isso aqui
// ficam os textos prontos para copiar e colar. Os avisos já publicados ficam lembrados neste telemóvel.
const CHAVE_PUBLICADOS = 'parou_whatsapp_publicados';
type Publicados = Record<string, { titulo: string; em: number; chave?: string }>;

function lerPublicados(): Publicados {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_PUBLICADOS) || '{}') as Publicados;
    const limite = Date.now() - 45 * 864e5;
    const limpo: Publicados = {};
    for (const [k, v] of Object.entries(bruto)) if (v && typeof v.em === 'number' && v.em > limite) limpo[k] = v;
    return limpo;
  } catch { return {}; }
}
function guardarPublicados(p: Publicados) { try { localStorage.setItem(CHAVE_PUBLICADOS, JSON.stringify(p)); } catch { /* sem armazenamento: fica só nesta sessão */ } }

async function copiar(texto: string, alvo?: HTMLTextAreaElement | null): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* tenta o método antigo */ }
  try {
    if (!alvo) return false;
    alvo.focus(); alvo.select();
    return document.execCommand('copy');
  } catch { return false; }
}

const botao = 'h-11 px-4 rounded-[10px] text-[14.5px] font-bold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50';

interface Props { aberta: boolean; onFechar: () => void }

export const PainelWhatsApp: React.FC<Props> = ({ aberta, onFechar }) => {
  if (!aberta || !(eAdmin() || utilizadorAutenticado()?.admin)) return null;
  return <Conteudo onFechar={onFechar} />;
};

const Conteudo: React.FC<{ onFechar: () => void }> = ({ onFechar }) => {
  const [aba, setAba] = useState<'avisos' | 'novidades' | 'publicados'>('avisos');
  const [avisos, setAvisos] = useState<CentralAlert[] | null>(null);
  const [doCanal, setDoCanal] = useState<CentralAlert[]>([]);
  const [semCanal, setSemCanal] = useState(false);
  const [erro, setErro] = useState('');
  const [soImportantes, setSoImportantes] = useState(true);
  const [publicados, setPublicados] = useState<Publicados>(() => lerPublicados());
  const [editados, setEditados] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState('');
  const [aviso, setAviso] = useState('');
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // novidades escritas à mão
  const [tipo, setTipo] = useState<TipoNovidade>('novidade');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [imagemManual, setImagemManual] = useState<EscolhaImagem>('nenhuma');
  const partilhaManual = usePartilha();

  const carregar = useCallback(async () => {
    setErro('');
    setSemCanal(false);
    setAvisos(null);
    const [oficiais, canal] = await Promise.allSettled([
      Promise.all([fetchCentralAlerts({ status: 'Ativo' }), fetchCentralAlerts({ status: 'Futuro' })]),
      fetchAvisosCanal(),
    ]);
    if (canal.status === 'fulfilled') setDoCanal(canal.value.map((c) => avisoDoCanal(c)));
    else { setDoCanal([]); setSemCanal(true); }
    if (oficiais.status === 'fulfilled') {
      const [ativos, futuros] = oficiais.value;
      const vistos = new Set<string>();
      setAvisos([...(ativos.alerts || []), ...(futuros.alerts || [])].filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true))));
    } else {
      if (canal.status === 'rejected') setErro('Não consegui carregar os avisos. Tenta outra vez.');
      setAvisos([]);
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const lista = useMemo(() => {
    const chaves = new Set(Object.values(publicados).map((p) => p.chave).filter(Boolean));
    const porPublicar = (a: CentralAlert) => !publicados[a.id] && !chaves.has(chaveDoAviso(a));
    // Primeiro o que o servidor escolheu (greves, mau tempo grave, incêndios…), depois os avisos dos operadores
    const base = (avisos || []).filter(porPublicar);
    const escolhidos = semRepetidos(doCanal.filter(porPublicar));
    const resto = soImportantes ? avisosImportantes(base) : ordenarAvisos(semRepetidos(base));
    const vistos = new Set<string>();
    const juntos = [...escolhidos, ...resto].filter((a) => { const k = chaveDoAviso(a); if (vistos.has(k)) return false; vistos.add(k); return true; });
    return soImportantes ? juntos.slice(0, 5) : juntos;
  }, [avisos, doCanal, publicados, soImportantes]);

  const dizer = (s: string) => {
    setAviso(s);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(''), 3500);
  };

  const copiarTexto = async (id: string, valor: string, el: HTMLTextAreaElement | null) => {
    const ok = await copiar(valor, el);
    if (ok) { setCopiado(id); dizer('Copiado. Agora cola no canal.'); setTimeout(() => setCopiado((c) => (c === id ? '' : c)), 2500); }
    else dizer('Não consegui copiar. Carrega no texto, seleciona tudo e copia.');
  };

  const marcarPublicado = (a: CentralAlert) => {
    const novo = { ...publicados, [a.id]: { titulo: a['título'], em: Date.now(), chave: chaveDoAviso(a) } };
    setPublicados(novo); guardarPublicados(novo);
  };
  // Novidades da app já escritas (config/novidades.ts): ficam lembradas com o prefixo "nov:"
  const pendentesNov = useMemo(() => NOVIDADES.filter((n) => !publicados[`nov:${n.id}`]), [publicados]);
  const marcarNovidade = (n: NovidadeCanal) => {
    const novo = { ...publicados, [`nov:${n.id}`]: { titulo: n.titulo, em: Date.now() } };
    setPublicados(novo); guardarPublicados(novo);
  };
  const desfazer = (id: string) => {
    const novo = { ...publicados }; delete novo[id];
    setPublicados(novo); guardarPublicados(novo);
  };

  const escolherRascunho = (i: number) => { const r = RASCUNHOS[i]; setTipo(r.tipo); setTitulo(r.titulo); setTexto(r.texto); };
  const textoNovidade = textoDeNovidade(tipo, titulo, texto);
  const nPublicados = Object.keys(publicados).length;

  const abas: Array<{ id: typeof aba; nome: string; n?: number }> = [
    { id: 'avisos', nome: 'Avisos', n: avisos ? lista.length : undefined },
    { id: 'novidades', nome: 'Novidades', n: pendentesNov.length },
    { id: 'publicados', nome: 'Publicados', n: nPublicados },
  ];

  return (
    <Folha aberta titulo="Para o WhatsApp" onFechar={onFechar} largura="larga">
      <div data-teste="painel-whatsapp">
        <p className="text-[14.5px] text-[#4A4A4A] leading-snug">
          Só o que é importante. Escolhe um texto, carrega em <strong>Copiar</strong> e cola no canal. Podes mudar o texto antes de copiar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CANAL_WHATSAPP ? (
            <a href={CANAL_WHATSAPP} target="_blank" rel="noopener noreferrer" className={`${botao} bg-[#14693A] text-[#FFFFFF]`} data-teste="abrir-canal">
              <MessageCircle className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />Abrir o canal<ExternalLink className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-[13px] text-[#6B6B6B]">Ainda falta ligar o canal: quando tiveres o link, envia-o e fica aqui um botão para o abrir.</p>
          )}
        </div>

        <div role="tablist" aria-label="Secções" className="flex gap-1 min-[360px]:gap-1.5 sm:gap-2 mt-4 overflow-x-auto pb-1 [scrollbar-width:none]">
          {abas.map((x) => (
            <button
              key={x.id}
              role="tab"
              type="button"
              aria-selected={aba === x.id}
              onClick={() => setAba(x.id)}
              className={`shrink-0 h-11 px-2.5 min-[360px]:px-3 sm:px-4 rounded-full text-[14px] font-semibold cursor-pointer ${aba === x.id ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] text-[#111111] hover:bg-[#E6E6E3]'}`}
            >
              {x.nome}{x.n !== undefined ? <span className="ml-1.5 opacity-70 tabular-nums">{x.n}</span> : null}
            </button>
          ))}
        </div>

        <div role="status" aria-live="polite" className="min-h-[22px] mt-2 text-[13.5px] font-semibold text-[#14693A]">{aviso}</div>

        {aba === 'avisos' && (
          <div role="tabpanel">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button type="button" onClick={() => setSoImportantes(true)} aria-pressed={soImportantes} className={`h-11 px-4 rounded-full text-[14px] font-semibold cursor-pointer border-2 ${soImportantes ? 'border-[#111111] bg-[#F4F4F2]' : 'border-[#E6E6E3]'}`}>Só os importantes</button>
              <button type="button" onClick={() => setSoImportantes(false)} aria-pressed={!soImportantes} className={`h-11 px-4 rounded-full text-[14px] font-semibold cursor-pointer border-2 ${!soImportantes ? 'border-[#111111] bg-[#F4F4F2]' : 'border-[#E6E6E3]'}`}>Ver todos</button>
              <button type="button" onClick={() => void carregar()} className="h-11 w-11 rounded-full bg-[#F4F4F2] flex items-center justify-center cursor-pointer hover:bg-[#E6E6E3]" aria-label="Atualizar a lista"><RefreshCw className="w-4 h-4 stroke-[2.2]" aria-hidden="true" /></button>
            </div>
            {avisos === null && <p className="text-[14px] text-[#6B6B6B] py-6 text-center">A carregar…</p>}
            {erro && <p role="alert" className="text-[14px] font-semibold text-[#9F1D14] py-3">{erro}</p>}
            {avisos !== null && !erro && lista.length === 0 && (
              <div className="rounded-[12px] bg-[#F4F4F2] border border-[#E6E6E3] p-4 text-center">
                <p className="text-[15px] font-bold text-[#111111]">Nada importante neste momento</p>
                <p className="text-[13.5px] text-[#6B6B6B] mt-1">{soImportantes ? 'Quando houver uma greve, um incêndio, um acidente ou uma interrupção grave, aparece aqui.' : 'Não há avisos por publicar neste momento.'}</p>
              </div>
            )}
            {avisos !== null && semCanal && !erro && (
              <p role="alert" className="text-[13px] font-semibold text-[#8A4B00] mb-2">Não consegui verificar as greves, o mau tempo e os incêndios. Carrega em atualizar.</p>
            )}
            <ul className="space-y-3">
              {lista.map((a) => <CartaoAviso key={a.id} a={a} valor={editados[a.id] ?? textoDoAviso(a)} onMudar={(v) => setEditados((e) => ({ ...e, [a.id]: v }))} copiado={copiado === a.id} onCopiar={(el) => void copiarTexto(a.id, editados[a.id] ?? textoDoAviso(a), el)} onPublicado={() => marcarPublicado(a)} />)}
            </ul>
          </div>
        )}

        {aba === 'novidades' && (
          <div role="tabpanel" className="space-y-3">
            <div>
              <h3 className="text-[15px] font-bold text-[#111111]">Prontas a publicar</h3>
              <p className="text-[13px] text-[#6B6B6B] leading-snug mt-0.5">Escritas por mim a partir do que sai na app. Publica por ordem, uma ou duas por dia, e carrega em <strong>Já publiquei</strong> para saírem da lista.</p>
            </div>
            {pendentesNov.length === 0 ? (
              <div className="rounded-[12px] bg-[#F4F4F2] border border-[#E6E6E3] p-4 text-center">
                <p className="text-[15px] font-bold text-[#111111]">Tudo publicado</p>
                <p className="text-[13.5px] text-[#6B6B6B] mt-1">Quando sair algo novo na app, o texto aparece aqui.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {pendentesNov.map((n) => (
                  <CartaoNovidade
                    key={n.id}
                    n={n}
                    valor={editados[`nov:${n.id}`] ?? n.texto}
                    onMudar={(v) => setEditados((e) => ({ ...e, [`nov:${n.id}`]: v }))}
                    copiado={copiado === `nov:${n.id}`}
                    onCopiar={(el) => void copiarTexto(`nov:${n.id}`, editados[`nov:${n.id}`] ?? n.texto, el)}
                    onPublicado={() => marcarNovidade(n)}
                  />
                ))}
              </ul>
            )}
            <div className="pt-3 border-t border-[#E6E6E3]">
              <h3 className="text-[15px] font-bold text-[#111111]">Escrever à mão</h3>
              <p className="text-[13px] font-semibold text-[#6B6B6B] mt-2 mb-1.5">Começar de um rascunho</p>
              <div className="flex flex-wrap gap-2">
                {RASCUNHOS.map((r, i) => <button key={r.nome} type="button" onClick={() => escolherRascunho(i)} className="h-11 px-4 rounded-full bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[14px] font-semibold cursor-pointer">{r.nome}</button>)}
              </div>
            </div>
            <div role="radiogroup" aria-label="Tipo" className="flex flex-wrap gap-2">
              {([['novidade', 'Novidade'], ['aviso', 'Aviso'], ['dica', 'Dica']] as Array<[TipoNovidade, string]>).map(([id, nome]) => (
                <button key={id} type="button" role="radio" aria-checked={tipo === id} onClick={() => setTipo(id)} className={`h-11 px-4 rounded-full text-[14px] font-semibold cursor-pointer border-2 ${tipo === id ? 'border-[#111111] bg-[#F4F4F2]' : 'border-[#E6E6E3]'}`}>{nome}</button>
              ))}
            </div>
            <div>
              <label htmlFor="wa-titulo" className="block text-[13px] font-semibold text-[#111111] mb-1">Título</label>
              <input id="wa-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={90} className="w-full h-12 px-3 rounded-[10px] border-2 border-[#E6E6E3] text-[16px] text-[#111111] focus:border-[#111111] outline-none" />
            </div>
            <div>
              <label htmlFor="wa-texto" className="block text-[13px] font-semibold text-[#111111] mb-1">Texto</label>
              <textarea id="wa-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} maxLength={1200} className="w-full px-3 py-2 rounded-[10px] border-2 border-[#E6E6E3] text-[16px] leading-snug text-[#111111] focus:border-[#111111] outline-none resize-none" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#6B6B6B] mb-1">Assim fica no WhatsApp</p>
              <pre className="whitespace-pre-wrap break-words rounded-[12px] bg-[#E7F3E3] border border-[#D3E7CD] p-3 text-[14.5px] leading-snug text-[#111111] font-[inherit]" data-teste="pre-visualizacao">{textoNovidade}</pre>
            </div>
            <SeletorImagemAviso id="wa-img-manual" valor={imagemManual} onMudar={setImagemManual} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void copiarTexto('novidade', textoNovidade, null)} disabled={!titulo.trim() && !texto.trim()} className={`${botao} flex-1 min-w-[140px] bg-[#FF6B1A] text-[#111111] brand-chamfer`} data-teste="copiar-novidade">
                {copiado === 'novidade' ? <><Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />Copiado</> : <><Copy className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />Copiar</>}
              </button>
              {imagemManual !== 'nenhuma' && podePartilharFicheiros() && (
                <button type="button" onClick={() => void partilhaManual.partilhar(textoNovidade, [imagemDaCategoria(imagemManual)])} disabled={partilhaManual.aPartilhar || (!titulo.trim() && !texto.trim())} className={`${botao} bg-[#111111] text-[#FFFFFF] disabled:opacity-60`} data-teste="partilhar-manual">
                  <Share2 className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />{partilhaManual.aPartilhar ? 'A preparar…' : 'Partilhar com imagem'}
                </button>
              )}
            </div>
            {partilhaManual.falhouPartilha && <p role="alert" className="text-[13px] text-[#9F1D14]">Não deu para abrir a partilha. Guarda a imagem e copia o texto.</p>}
          </div>
        )}

        {aba === 'publicados' && (
          <div role="tabpanel">
            {nPublicados === 0 ? (
              <p className="text-[14px] text-[#6B6B6B] py-6 text-center">Ainda não marcaste nada como publicado.</p>
            ) : (
              <ul className="space-y-2">
                {Object.entries(publicados).sort((a, b) => b[1].em - a[1].em).map(([id, p]) => (
                  <li key={id} className="flex items-center gap-3 rounded-[12px] border border-[#E6E6E3] p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-semibold text-[#111111] leading-snug">{p.titulo}</p>
                      <p className="text-[12.5px] text-[#6B6B6B]">Publicado a {new Date(p.em).toLocaleDateString('pt-PT')}</p>
                    </div>
                    <button type="button" onClick={() => desfazer(id)} className="h-11 px-3 rounded-[10px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[13.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"><Undo2 className="w-4 h-4 stroke-[2.2]" aria-hidden="true" />Voltar à lista</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Folha>
  );
};

function usePartilha() {
  const [aPartilhar, setAPartilhar] = useState(false);
  const [falhouPartilha, setFalhouPartilha] = useState(false);
  const partilhar = async (texto: string, imagens: string[]) => {
    setFalhouPartilha(false); setAPartilhar(true);
    const r = await partilharComImagens(texto, imagens);
    if (r === 'falhou') setFalhouPartilha(true);
    setAPartilhar(false);
  };
  return { aPartilhar, falhouPartilha, partilhar };
}

type EscolhaImagem = CategoriaAviso | 'nenhuma';

// Imagem fixa do tipo de aviso: miniatura (toca para guardar) e lista para trocar de tipo ou tirar a imagem
const SeletorImagemAviso: React.FC<{ id: string; valor: EscolhaImagem; onMudar: (v: EscolhaImagem) => void }> = ({ id, valor, onMudar }) => (
  <div className="mb-2 flex items-center gap-3" data-teste="imagem-aviso">
    {valor !== 'nenhuma' ? (
      <a href={imagemDaCategoria(valor)} download className="shrink-0 block w-[88px] h-[88px] rounded-[12px] overflow-hidden border border-[#E6E6E3] bg-[#111111]" aria-label={`Guardar a imagem: ${nomeDaCategoria(valor)}`}>
        <img src={imagemDaCategoria(valor)} alt={`Imagem para o aviso: ${nomeDaCategoria(valor)}`} width={88} height={88} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      </a>
    ) : (
      <div className="shrink-0 w-[88px] h-[88px] rounded-[12px] border-2 border-dashed border-[#E6E6E3] flex items-center justify-center text-[12px] font-semibold text-[#6B6B6B] text-center px-2">Sem imagem</div>
    )}
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-[#6B6B6B] mb-1">Imagem</label>
      <select id={id} value={valor} onChange={(e) => onMudar(e.target.value as EscolhaImagem)} className="w-full h-11 rounded-[10px] border-2 border-[#E6E6E3] bg-[#FFFFFF] px-2 text-[16px] font-semibold text-[#111111]">
        {CATEGORIAS_AVISO.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        <option value="nenhuma">Sem imagem</option>
      </select>
      {valor !== 'nenhuma' && <p className="text-[12.5px] text-[#6B6B6B] mt-1">Toca na imagem para a guardar.</p>}
    </div>
  </div>
);

const CartaoNovidade: React.FC<{
  n: NovidadeCanal; valor: string; onMudar: (v: string) => void; copiado: boolean; onCopiar: (el: HTMLTextAreaElement | null) => void; onPublicado: () => void;
}> = ({ n, valor, onMudar, copiado, onCopiar, onPublicado }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const { aPartilhar, falhouPartilha, partilhar } = usePartilha();
  const temImagens = Boolean(n.imagens && n.imagens.length);
  const podePartilhar = temImagens && podePartilharFicheiros();
  const primeiro = n.etiqueta === 'Primeiro post';
  const dia = n.data.split('-').reverse().slice(0, 2).join('/');
  return (
    <li className="rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] p-3" data-teste="cartao-novidade">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className={`px-2 h-6 inline-flex items-center rounded-full text-[12px] font-bold ${primeiro ? 'bg-[#FF6B1A] text-[#111111]' : 'bg-[#E7F3E3] text-[#14693A]'}`}>{n.etiqueta}</span>
        <span className="text-[13.5px] font-semibold text-[#111111]">{n.titulo}</span>
        <span className="text-[12.5px] text-[#6B6B6B]">· {dia}</span>
      </div>
      {temImagens && (
        <div className="mb-2" data-teste="imagens-novidade">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(n.imagens || []).map((src, i) => (
              <a key={src} href={src} download className="shrink-0 block w-[132px] h-[132px] rounded-[12px] overflow-hidden border border-[#E6E6E3] bg-[#F4F4F2]" aria-label={`Guardar imagem ${i + 1} de ${n.titulo}`}>
                <img src={src} alt={`Imagem ${i + 1} para ${n.titulo}`} width={132} height={132} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
          <p className="text-[12.5px] text-[#6B6B6B] mt-1">Toca na imagem para a guardar e junta-a ao texto no WhatsApp.</p>
        </div>
      )}
      <label className="sr-only" htmlFor={`wa-nov-${n.id}`}>Texto para o WhatsApp: {n.titulo}</label>
      <textarea
        id={`wa-nov-${n.id}`}
        ref={ref}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        rows={Math.min(14, Math.max(5, valor.split('\n').length + Math.floor(valor.length / 46)))}
        className="w-full px-3 py-2 rounded-[10px] border-2 border-[#E6E6E3] bg-[#FAFAF8] text-[15px] leading-snug text-[#111111] focus:border-[#111111] outline-none resize-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onCopiar(ref.current)} className={`${botao} flex-1 min-w-[140px] bg-[#FF6B1A] text-[#111111] brand-chamfer`} data-teste="copiar-novidade-pronta">
          {copiado ? <><Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />Copiado</> : <><Copy className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />Copiar</>}
        </button>
        {podePartilhar && (
          <button type="button" onClick={() => void partilhar(valor, n.imagens || [])} disabled={aPartilhar} className={`${botao} bg-[#111111] text-[#FFFFFF] disabled:opacity-60`} data-teste="partilhar-novidade">
            <Share2 className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />{aPartilhar ? 'A preparar…' : 'Partilhar com imagem'}
          </button>
        )}
        <button type="button" onClick={onPublicado} className={`${botao} bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] border border-[#E6E6E3]`} data-teste="ja-publiquei-novidade">Já publiquei</button>
      </div>
      {falhouPartilha && <p role="alert" className="mt-1.5 text-[13px] text-[#9F1D14]">Não deu para abrir a partilha. Guarda a imagem e copia o texto.</p>}
    </li>
  );
};

const CartaoAviso: React.FC<{
  a: CentralAlert; valor: string; onMudar: (v: string) => void; copiado: boolean; onCopiar: (el: HTMLTextAreaElement | null) => void; onPublicado: () => void;
}> = ({ a, valor, onMudar, copiado, onCopiar, onPublicado }) => {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [imagem, setImagem] = useState<EscolhaImagem>(() => categoriaDoPainel(a));
  const { aPartilhar, falhouPartilha, partilhar } = usePartilha();
  const podePartilhar = imagem !== 'nenhuma' && podePartilharFicheiros();
  const cor = a.severity === 'Grave' ? 'bg-[#FDE8E6] text-[#9F1D14]' : a.severity === 'Moderada' ? 'bg-[#FFF1DC] text-[#8A4B00]' : 'bg-[#F4F4F2] text-[#4A4A4A]';
  return (
    <li className="rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] p-3" data-teste="cartao-aviso">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className={`px-2 h-6 inline-flex items-center rounded-full text-[12px] font-bold ${cor}`}>{eDoCanal(a) ? 'Importante' : (a.severity || 'Informativo')}</span>
        <span className="px-2 h-6 inline-flex items-center rounded-full bg-[#F4F4F2] text-[12px] font-semibold text-[#4A4A4A]">{eDoCanal(a) ? nomeDaCategoria(categoriaDoPainel(a)) : a.tipo}</span>
        {!eDoCanal(a) && <span className="text-[12.5px] text-[#6B6B6B]">{a.status === 'Futuro' ? 'Vai começar' : 'Ativo'}{quandoDoAviso(a) ? ` · ${quandoDoAviso(a)}` : ''}</span>}
      </div>
      <SeletorImagemAviso id={`wa-img-${a.id}`} valor={imagem} onMudar={setImagem} />
      <label className="sr-only" htmlFor={`wa-${a.id}`}>Texto para o WhatsApp: {a['título']}</label>
      <textarea
        id={`wa-${a.id}`}
        ref={ref}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        rows={Math.min(12, Math.max(5, valor.split('\n').length + Math.floor(valor.length / 46)))}
        className="w-full px-3 py-2 rounded-[10px] border-2 border-[#E6E6E3] bg-[#FAFAF8] text-[15px] leading-snug text-[#111111] focus:border-[#111111] outline-none resize-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => onCopiar(ref.current)} className={`${botao} flex-1 min-w-[140px] bg-[#FF6B1A] text-[#111111] brand-chamfer`} data-teste="copiar-aviso">
          {copiado ? <><Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />Copiado</> : <><Copy className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />Copiar</>}
        </button>
        {podePartilhar && (
          <button type="button" onClick={() => void partilhar(valor, [imagemDaCategoria(imagem as CategoriaAviso)])} disabled={aPartilhar} className={`${botao} bg-[#111111] text-[#FFFFFF] disabled:opacity-60`} data-teste="partilhar-aviso">
            <Share2 className="w-4 h-4 stroke-[2.4]" aria-hidden="true" />{aPartilhar ? 'A preparar…' : 'Partilhar com imagem'}
          </button>
        )}
        <button type="button" onClick={onPublicado} className={`${botao} bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] border border-[#E6E6E3]`} data-teste="ja-publiquei">Já publiquei</button>
        {a.source_url && <a href={a.source_url} target="_blank" rel="noopener noreferrer" className="h-11 px-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#4A4A4A] underline underline-offset-2">Ver fonte<ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /></a>}
      </div>
      {falhouPartilha && <p role="alert" className="mt-1.5 text-[13px] text-[#9F1D14]">Não deu para abrir a partilha. Guarda a imagem e copia o texto.</p>}
    </li>
  );
};
