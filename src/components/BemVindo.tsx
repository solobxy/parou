import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, CloudRain, Flame, MapPin, Pencil, Search, Star, ThumbsUp, TriangleAlert } from 'lucide-react';
import { idioma, mudarIdioma, t, type Idioma } from '../i18n';
import { Folha } from './Folha';
import { Bandeira } from './Bandeira';
import { Logo } from './Logo';
import { LineChip } from './LineChip';
import { Avatar } from './Avatar';
import { guardarBemVindoEmCurso, marcarBemVindoVisto } from '../utils/bemVindo';

// Boas-vindas em carrossel para quem abre a PAROU pela primeira vez: escolha de idioma e depois um passo por ideia
// (Perto, vários destinos, Horários, Alertas e notícias, Comunidade, Conta). Pouco texto, ilustrações desenhadas com as
// mesmas peças da app (por isso ficam bem nos três temas). Quando se escolhe outro idioma a página recarrega e o
// carrossel retoma no passo seguinte (ver utils/bemVindo.ts).

interface BemVindoProps {
  /** Ver as boas-vindas outra vez (painel de administração): não mexe no que está guardado */
  demo?: boolean;
  passoInicial?: number;
  temConta?: boolean;
  onFechar: () => void;
  onCriarConta?: () => void;
}

// O primeiro passo fala todos os idiomas ao mesmo tempo (nunca se traduz: cada pessoa reconhece o seu)
const OPCOES_IDIOMA: { id: Idioma; nome: string; convite: string; lang: string }[] = [
  { id: 'pt', nome: 'Português', convite: 'Clica aqui para português', lang: 'pt-PT' },
  { id: 'en', nome: 'English', convite: 'Click here for English', lang: 'en' },
  { id: 'fr', nome: 'Français', convite: 'Cliquez ici pour le français', lang: 'fr' },
  { id: 'de', nome: 'Deutsch', convite: 'Hier klicken für Deutsch', lang: 'de' },
];

const PASSOS = ['idioma', 'perto', 'destinos', 'horarios', 'alertas', 'comunidade', 'conta'] as const;
type Passo = (typeof PASSOS)[number];

const TEXTOS: Record<Exclude<Passo, 'idioma'>, { titulo: string; texto: string }> = {
  perto: {
    titulo: 'Vê o que passa perto de ti',
    texto: 'Autocarros, metro, comboios e barcos, com as próximas partidas em tempo real.',
  },
  destinos: {
    titulo: 'Vários destinos numa só viagem',
    texto: 'Junta paragens à rota e vê a que horas sais e chegas a cada uma.',
  },
  horarios: {
    titulo: 'Todas as linhas e horários',
    texto: 'Procura por linha, paragem ou operador e vê os horários de hoje.',
  },
  alertas: {
    titulo: 'Alertas e notícias',
    texto: 'Greves, atrasos, tempo, feriados e incêndios, tudo num só sítio.',
  },
  comunidade: {
    titulo: 'Fala com quem viaja contigo',
    texto: 'Pergunta, avisa e responde na Comunidade. Quem ajuda ganha pontos.',
  },
  conta: {
    titulo: 'Cria a tua conta, é grátis',
    texto: 'Guarda os teus favoritos, personaliza o avatar e ganha pontos.',
  },
};

// ---------------------------------------------------------------- ilustrações ----------------------------------------------------------------
// Só peças da app (cartões, linhas, avatares) e as cores da marca: o build troca-as sozinho nos temas Escuro e Âmbar.

const CARTAO = 'bg-[#FFFFFF] border border-[#E6E6E3] rounded-[12px] shadow-[0_2px_10px_rgba(17,17,17,0.06)]';

const Palco: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="relative flex-1 min-h-[208px] rounded-[16px] bg-[#F4F4F2] border border-[#E6E6E3] overflow-hidden flex items-center justify-center px-3"
    aria-hidden="true"
  >
    {children}
  </div>
);

/** Ponto laranja que pisca: tempo real */
const PontoDireto: React.FC = () => (
  <span className="relative flex w-2 h-2 shrink-0">
    <span className="absolute inline-flex h-full w-full rounded-full bg-[#FF6B1A] opacity-60 animate-ping" />
    <span className="relative inline-flex rounded-full w-2 h-2 bg-[#FF6B1A]" />
  </span>
);

const IlustPerto: React.FC = () => (
  <Palco>
    {/* Anéis do radar: o que está perto */}
    <span className="absolute w-[300px] h-[300px] rounded-full border border-[#E6E6E3]" />
    <span className="absolute w-[200px] h-[200px] rounded-full border border-[#E6E6E3]" />
    <div className={`${CARTAO} relative w-full max-w-[290px] overflow-hidden`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#E6E6E3]">
        <span className="w-6 h-6 rounded-full bg-[#F4F4F2] flex items-center justify-center shrink-0">
          <MapPin className="w-3.5 h-3.5 text-[#111111] stroke-[2.2]" />
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-bold text-[#111111] truncate">Av. Aliados</span>
        <span className="text-[11px] font-semibold text-[#6B6B6B] tabular-nums">80 m</span>
      </div>
      {[
        { n: '500', cor: '#E2001A', destino: 'Hospital S. João', min: 3, direto: true },
        { n: '204', cor: '#0067B1', destino: 'Bolhão', min: 7, direto: true },
        { n: 'D', cor: '#FFD200', texto: '#111111', destino: 'Estádio do Dragão', min: 11, direto: false },
      ].map((l, i) => (
        <div key={l.n} className={`flex items-center gap-2.5 px-3 h-[42px] ${i > 0 ? 'border-t border-[#E6E6E3]' : ''}`}>
          <LineChip number={l.n} color={l.cor} textColor={l.texto} />
          <span className="flex-1 min-w-0 text-[13px] text-[#111111] truncate">{l.destino}</span>
          {l.direto && <PontoDireto />}
          <span className="font-condensada text-[17px] font-bold text-[#111111] tabular-nums w-[52px] text-right">{t('{n} min', { n: l.min })}</span>
        </div>
      ))}
    </div>
  </Palco>
);

const IlustDestinos: React.FC = () => (
  <Palco>
    <div className={`${CARTAO} w-full max-w-[290px] px-3 py-2.5`}>
      {/* Percurso: a tua posição, a paragem 1 e a paragem 2, ligadas por uma linha com o transporte de cada troço */}
      {[
        { marca: <span className="w-5 h-5 rounded-full bg-[#111111] flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-[#FFFFFF]" /></span>, nome: t('A tua localização'), hora: '09:12', chip: { n: '500', cor: '#E2001A' } },
        { marca: <span className="w-5 h-5 rounded-full bg-[#FF6B1A] text-[#111111] text-[11px] font-bold flex items-center justify-center">1</span>, nome: 'Hospital S. João', hora: '09:40', chip: { n: '204', cor: '#0067B1' } },
        { marca: <span className="w-5 h-5 rounded-full bg-[#FF6B1A] text-[#111111] text-[11px] font-bold flex items-center justify-center">2</span>, nome: 'Bolhão', hora: '10:25', chip: null },
      ].map((p, i) => (
        <div key={i}>
          <div className="flex items-center gap-2.5 h-7">
            <span className="w-5 flex justify-center shrink-0">{p.marca}</span>
            <span className="flex-1 min-w-0 text-[13px] font-semibold text-[#111111] truncate">{p.nome}</span>
            <span className="font-condensada text-[16px] font-bold text-[#111111] tabular-nums">{p.hora}</span>
          </div>
          {p.chip && (
            <div className="flex items-center gap-2.5 h-[22px]">
              <span className="w-5 flex justify-center shrink-0"><span className="block w-0.5 h-full bg-[#D9D9D6]" /></span>
              <LineChip number={p.chip.n} color={p.chip.cor} className="h-[18px]! min-w-[28px]! text-[12px]!" />
            </div>
          )}
        </div>
      ))}
      <div className="mt-1.5 h-8 rounded-[8px] border border-dashed border-[#C9C9C4] flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[#6B6B6B]">
        <span className="text-[16px] leading-none">+</span>{t('Adicionar paragem')}
      </div>
    </div>
  </Palco>
);

const IlustHorarios: React.FC = () => (
  <Palco>
    <div className="w-full max-w-[290px] space-y-2">
      <div className={`${CARTAO} h-9 px-2.5 flex items-center gap-2`}>
        <Search className="w-4 h-4 text-[#6B6B6B] stroke-[2] shrink-0" />
        <span className="text-[12.5px] text-[#6B6B6B] truncate">{t('Pesquisar número de linha ou destino...')}</span>
      </div>
      <div className="flex gap-1.5 overflow-hidden">
        {['Todos', 'Metro', 'Comboio', 'Autocarro'].map((m, i) => (
          <span key={m} className={`px-2.5 h-7 rounded-[8px] text-[11.5px] font-semibold whitespace-nowrap flex items-center ${i === 0 ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] border border-[#E6E6E3] text-[#6B6B6B]'}`}>{t(m)}</span>
        ))}
      </div>
      <div className={`${CARTAO} overflow-hidden`}>
        {[
          { n: '500', cor: '#E2001A', nome: 'Hospital S. João', op: 'STCP' },
          { n: 'D', cor: '#FFD200', texto: '#111111', nome: 'Estádio do Dragão', op: 'Metro do Porto' },
        ].map((l, i) => (
          <div key={l.n} className={`flex items-center gap-2.5 px-3 h-[44px] ${i > 0 ? 'border-t border-[#E6E6E3]' : ''}`}>
            <LineChip number={l.n} color={l.cor} textColor={l.texto} />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-semibold text-[#111111] truncate leading-tight">{l.nome}</span>
              <span className="block text-[11px] text-[#6B6B6B] truncate leading-tight">{l.op}</span>
            </span>
            <Star className="w-4 h-4 text-[#6B6B6B] stroke-[2] shrink-0" />
          </div>
        ))}
      </div>
    </div>
  </Palco>
);

const IlustAlertas: React.FC = () => (
  <Palco>
    <div className={`${CARTAO} w-full max-w-[290px] overflow-hidden`}>
      {[
        { icone: <TriangleAlert className="w-4 h-4 stroke-[2.2]" />, fundo: 'bg-[#FDECEA] text-[#D92D20]', titulo: `${t('Greve')} · CP`, sub: t('Amanhã') },
        { icone: <CloudRain className="w-4 h-4 stroke-[2.2]" />, fundo: 'bg-[#E8F0FE] text-[#1B4DB1]', titulo: t('Chuva'), sub: t('Hoje') },
        { icone: <Flame className="w-4 h-4 stroke-[2.2]" />, fundo: 'bg-[#FFF1E8] text-[#C2410C]', titulo: t('Incêndios perto'), sub: '2 km' },
      ].map((a, i) => (
        <div key={i} className={`flex items-center gap-3 px-3 h-[56px] ${i > 0 ? 'border-t border-[#E6E6E3]' : ''}`}>
          <span className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${a.fundo}`}>{a.icone}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-bold text-[#111111] truncate leading-tight">{a.titulo}</span>
            <span className="block text-[12px] text-[#6B6B6B] truncate leading-tight">{a.sub}</span>
          </span>
        </div>
      ))}
    </div>
  </Palco>
);

const IlustComunidade: React.FC = () => (
  <Palco>
    <div className="w-full max-w-[290px] space-y-2">
      <div className={`${CARTAO} p-3`}>
        <div className="flex items-start gap-2.5">
          <Avatar config={{ personagem: 'paro', cor: 'laranja', chapeu: 'boné' }} tamanho={32} />
          <p className="flex-1 min-w-0 text-[13.5px] font-semibold text-[#111111] leading-snug">{t('A linha 500 não passou esta manhã')}</p>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-[#6B6B6B] font-semibold">
          <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5 stroke-[2]" />8</span>
          <span>{t('{n} respostas', { n: 2 })}</span>
        </div>
      </div>
      <div className="flex items-end gap-2 pl-5">
        <Avatar config={{ personagem: 'gato', cor: 'grafite', chapeu: 'gorro' }} tamanho={26} />
        <p className="rounded-[12px] rounded-bl-[4px] bg-[#FFFFFF] border border-[#E6E6E3] px-3 py-1.5 text-[12.5px] text-[#111111] leading-snug">{t('Também não passou aqui.')}</p>
      </div>
    </div>
  </Palco>
);

const IlustConta: React.FC = () => (
  <Palco>
    <div className="w-full max-w-[290px] flex flex-col items-center gap-3">
      <div className="flex items-end justify-center gap-3">
        <Avatar config={{ personagem: 'gato', cor: 'grafite', chapeu: 'gorro' }} tamanho={46} className="opacity-90" />
        <span className="relative inline-flex">
          <Avatar config={{ personagem: 'paro', cor: 'laranja', chapeu: 'boné' }} tamanho={76} />
          <span className="absolute -right-1 -bottom-0.5 w-7 h-7 rounded-full bg-[#FF6B1A] text-[#111111] border-2 border-[#F4F4F2] flex items-center justify-center">
            <Pencil className="w-3.5 h-3.5 stroke-[2.4]" />
          </span>
        </span>
        <Avatar config={{ personagem: 'estrela', cor: 'amarelo', chapeu: 'nenhum' }} tamanho={46} className="opacity-90" />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#6B6B6B]">{t('Favoritos')}</span>
        {[{ n: '500', cor: '#E2001A' }, { n: '204', cor: '#0067B1' }].map((l) => (
          <span key={l.n} className="inline-flex items-center gap-1 h-7 pl-1.5 pr-2 rounded-full bg-[#FFFFFF] border border-[#E6E6E3]">
            <Star className="w-3.5 h-3.5 fill-[#111111] text-[#111111]" />
            <LineChip number={l.n} color={l.cor} className="h-[18px]! min-w-[28px]! text-[12px]!" />
          </span>
        ))}
      </div>
      <div className="w-[210px] flex items-center gap-2">
        <span className="text-[12px] font-semibold text-[#6B6B6B]">{t('Pontos')}</span>
        <span className="flex-1 h-2 rounded-full bg-[#E6E6E3] overflow-hidden"><span className="block h-full w-3/5 rounded-full bg-[#FF6B1A]" /></span>
      </div>
    </div>
  </Palco>
);

const ILUSTRACAO: Record<Exclude<Passo, 'idioma'>, React.FC> = {
  perto: IlustPerto,
  destinos: IlustDestinos,
  horarios: IlustHorarios,
  alertas: IlustAlertas,
  comunidade: IlustComunidade,
  conta: IlustConta,
};

// ---------------------------------------------------------------- carrossel ----------------------------------------------------------------

export const BemVindo: React.FC<BemVindoProps> = ({ demo = false, passoInicial = 0, temConta = false, onFechar, onCriarConta }) => {
  const total = PASSOS.length;
  const [passo, setPasso] = useState(() => Math.min(Math.max(0, passoInicial), total - 1));
  const toque = useRef<{ x: number; y: number } | null>(null);
  const ultimo = passo === total - 1;
  const raiz = useRef<HTMLDivElement>(null);
  const primeiraVez = useRef(true);

  // Ao mudar de passo o foco acompanha, para não ficar num botão de um passo escondido.
  // Quem usa o teclado (foco visível) vai para o botão principal (ou para o 1.º idioma, no primeiro passo);
  // quem toca fica com o foco na janela, sem anel à volta de um botão que ninguém escolheu.
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    const caixa = raiz.current?.closest<HTMLElement>('[role="dialog"]');
    let teclado = false;
    try { teclado = !!document.activeElement?.matches(':focus-visible'); } catch {}
    const alvo = !teclado
      ? caixa
      : passo === 0
        ? caixa?.querySelector<HTMLElement>('[data-primeiro-idioma]')
        : caixa?.querySelector<HTMLElement>('footer [data-avancar]');
    (alvo || caixa)?.focus({ preventScroll: true });
  }, [passo]);

  const ir = (n: number) => setPasso(Math.min(Math.max(0, n), total - 1));
  const fechar = () => {
    if (!demo) marcarBemVindoVisto();
    onFechar();
  };
  const escolherIdioma = (l: Idioma) => {
    if (l === idioma) { ir(1); return; }
    // Muda o idioma e a página recarrega: ao voltar, retoma no passo seguinte
    if (!demo) guardarBemVindoEmCurso(1);
    mudarIdioma(l);
  };

  const aoTocar = (e: React.TouchEvent) => { const p = e.touches[0]; toque.current = { x: p.clientX, y: p.clientY }; };
  const aoSoltar = (e: React.TouchEvent) => {
    const inicio = toque.current;
    toque.current = null;
    if (!inicio) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - inicio.x;
    const dy = p.clientY - inicio.y;
    if (Math.abs(dx) > 56 && Math.abs(dy) < 40) ir(passo + (dx < 0 ? 1 : -1));
  };
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); ir(passo + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(passo - 1); }
  };

  const rodape = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
        {PASSOS.map((p, i) => (
          <span key={p} className={`h-2 rounded-full transition-all duration-300 ${i === passo ? 'w-6 bg-[#111111]' : 'w-2 bg-[#D9D9D6]'}`} />
        ))}
      </div>
      {passo === 0 ? (
        <p className="min-h-[48px] flex items-center justify-center text-center text-[13px] text-[#6B6B6B]">
          Toca num idioma · Tap a language
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => ir(passo - 1)}
            aria-label={t('Anterior')}
            className="w-12 min-h-[48px] shrink-0 rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] hover:bg-[#F4F4F2] text-[#111111] flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.2]" />
          </button>
          {ultimo && !temConta && onCriarConta && (
            <button
              type="button"
              onClick={() => { fechar(); onCriarConta(); }}
              className="min-h-[48px] px-4 shrink-0 rounded-[12px] border border-[#111111] bg-[#FFFFFF] hover:bg-[#F4F4F2] text-[#111111] text-[15px] font-bold cursor-pointer"
            >
              {t('Criar conta')}
            </button>
          )}
          <button
            type="button"
            data-avancar
            onClick={() => (ultimo ? fechar() : ir(passo + 1))}
            className={`flex-1 min-h-[48px] rounded-[12px] text-[15px] font-bold cursor-pointer ${ultimo ? 'bg-[#FF6B1A] text-[#111111] brand-chamfer' : 'bg-[#111111] text-[#FFFFFF]'}`}
          >
            {ultimo ? t('Finalizar') : t('Seguinte')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Folha
      aberta
      titulo={passo === 0 ? 'Bem-vindo · Welcome' : t('Bem-vindo à PAROU')}
      onFechar={fechar}
      rodape={rodape}
    >
      <div ref={raiz} onTouchStart={aoTocar} onTouchEnd={aoSoltar} onKeyDown={aoTeclar} data-teste="bem-vindo">
        <div className="sr-only" aria-live="polite">{t('Passo {a} de {b}', { a: passo + 1, b: total })}</div>
        <div className="overflow-hidden">
          <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${passo * 100}%)` }}>
            {PASSOS.map((id, i) => {
              const ativo = i === passo;
              if (id === 'idioma') {
                return (
                  <section key={id} className="w-full shrink-0" aria-hidden={!ativo} aria-label="Idioma · Language" data-passo={id}>
                    <div className="flex flex-col items-center text-center pt-1">
                      <Logo size={32} className="text-[#111111]" />
                      <p className="mt-3 font-condensada text-[24px] leading-[1.1] font-bold text-[#111111]">
                        Bem-vindo · Welcome<br />Bienvenue · Willkommen
                      </p>
                    </div>
                    <div role="group" aria-label="Idioma · Language" className="mt-4 grid gap-2">
                      {OPCOES_IDIOMA.map((l, k) => {
                        const atual = l.id === idioma;
                        return (
                          <button
                            key={l.id}
                            type="button"
                            lang={l.lang}
                            tabIndex={ativo ? 0 : -1}
                            data-primeiro-idioma={k === 0 ? true : undefined}
                            data-teste={`bv-idioma-${l.id}`}
                            onClick={() => escolherIdioma(l.id)}
                            className={`w-full min-h-[60px] flex items-center gap-3.5 px-3.5 rounded-[14px] border-2 bg-[#FFFFFF] hover:bg-[#F4F4F2] text-left cursor-pointer ${atual ? 'border-[#111111]' : 'border-[#E6E6E3]'}`}
                          >
                            <Bandeira idioma={l.id} className="w-[36px] h-[24px]" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[16px] font-bold text-[#111111] leading-tight">{l.nome}</span>
                              <span className="block text-[13px] text-[#6B6B6B] leading-tight mt-0.5">{l.convite}</span>
                            </span>
                            {atual && <Check className="w-5 h-5 shrink-0 stroke-[3] text-[#111111]" aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              }
              const Ilustracao = ILUSTRACAO[id];
              const txt = TEXTOS[id];
              return (
                <section key={id} className="w-full shrink-0 flex flex-col" aria-hidden={!ativo} aria-label={t(txt.titulo)} data-passo={id}>
                  <Ilustracao />
                  <h3 className="mt-4 font-condensada text-[27px] leading-[1.05] font-bold tracking-tight text-[#111111] text-balance">{t(txt.titulo)}</h3>
                  <p className="mt-1.5 text-[15px] leading-snug text-[#6B6B6B]">{t(txt.texto)}</p>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </Folha>
  );
};

export default BemVindo;
