import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  MapPin,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  Megaphone,
  TrainFront,
  TrafficCone,
  Construction,
  Newspaper,
  Users,
  ExternalLink,
  RefreshCw,
  TriangleAlert,
  CheckCircle2,
  Flame,
  Truck,
  Plane,
  Bell,
  X,
} from 'lucide-react';
import type { NotificationPreferences } from '../types';
import {
  getStoredNotificationPreferences,
  saveStoredNotificationPreferences,
  requestNotificationPermission,
  sincronizarPush,
  pushSuportado,
} from '../services/notifications';
import { CIDADES_OPTIONS } from '../data/mockData';
import { Occurrence } from '../types';
import { ultimaPosicaoConhecida } from '../hooks/useUserLocation';

// ---------------------------------------------------------------------------------
// Tipos da resposta de /api/alertas
// ---------------------------------------------------------------------------------
type Icone = 'sol' | 'lua' | 'sol-nuvens' | 'lua-nuvens' | 'nuvens' | 'nevoeiro' | 'chuvisco' | 'chuva' | 'aguaceiros' | 'neve' | 'trovoada';

interface RespostaAlertas {
  atualizado: string;
  local: { distrito: string; area: string; regiao: string; lat: number; lon: number; porGps: boolean };
  distritos: Array<{ area: string; nome: string }>;
  tempo: {
    agora: { temperatura: number; sensacao?: number; descricao: string; icone: Icone; vento?: number; dia: boolean } | null;
    dias: Array<{ data: string; rotulo: string; tMin: number; tMax: number; descricao: string; icone: Icone; probChuva: number }>;
  };
  avisosMeteo: Array<{ nivel: 'yellow' | 'orange' | 'red'; tipo: string; texto: string; inicio: string; fim: string; distrito: string; local: boolean; ativo: boolean }>;
  feriados: Array<{ data: string; nome: string; ambito: 'nacional' | 'regional' | 'municipal' | 'tolerancia'; local?: string; diaSemana: string; emDias: number }>;
  ocorrencias: Array<{
    id: string;
    categoria: 'greve' | 'rede' | 'obras';
    tipo: string;
    titulo: string;
    resumo: string;
    operador: string;
    inicio: string;
    fim: string | null;
    estado: 'Ativo' | 'Futuro';
    url: string;
    gravidade: string;
    linhas: string[];
    local: boolean;
  }>;
  noticias: Array<{ id: string; titulo: string; resumo?: string; fonte: string; url: string; data: string; categoria: 'greve' | 'transportes' | 'transito' | 'tempo' | 'obras' | 'incendio'; local: boolean }>;
  incendios?: { atualizado: string | null; total: number; perto: number; lista: IncidentePC[] };
  protecaoCivil?: IncidentePC[];
}

interface IncidentePC {
  id: string;
  tipo: 'incendio' | 'acidente' | 'inundacao' | 'outro';
  natureza: string;
  local: string;
  concelho: string;
  distrito: string;
  lat: number;
  lon: number;
  estado: string;
  corEstado: string;
  meios: { humanos: number; terrestres: number; aereos: number };
  inicio: string | null;
  importante: boolean;
  aAcalmar: boolean;
  distanciaKm: number;
  perto: boolean;
}

type Filtro = 'tudo' | 'incendios' | 'greves' | 'rede' | 'transito' | 'tempo' | 'obras';

interface ItemDestaque {
  id: string;
  filtro: Exclude<Filtro, 'tudo'>;
  etiqueta: string;
  cor: string;
  titulo: string;
  resumo?: string;
  meta: string;
  quando: number;
  url?: string;
  onClick?: () => void;
  peso: number;
  linhas?: string[];
}

interface AlertasViewProps {
  ocorrenciasComunidade?: Occurrence[];
  onAbrirOcorrencia?: (o: Occurrence) => void;
  onVerMapa?: () => void;
  /** As notificações foram ligadas a partir daqui (para a app atualizar o estado) */
  onAvisosLigados?: (prefs: NotificationPreferences) => void;
}

const CHAVE_CONVITE_AVISOS = 'parou_convite_avisos_fechado';

function semAcentosTxt(s: string) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Nome do distrito do IPMA -> opção do ecrã das notificações (ex.: Funchal -> "Funchal (Madeira)") */
function opcaoDistrito(nome: string): string {
  const n = semAcentosTxt(nome);
  const op = CIDADES_OPTIONS.find((o) => o !== 'Todas' && semAcentosTxt(o).replace(/\s*\(.*\)/, '') === n);
  if (op) return op;
  if (/angra|horta|acores/.test(n)) return 'Ponta Delgada (Açores)';
  if (/porto santo|madeira/.test(n)) return 'Funchal (Madeira)';
  return nome;
}

/** Convite para receber os avisos no telemóvel (só se o browser o permitir e ainda não estiverem ligados) */
const ConviteAvisos: React.FC<{ distrito: string; onLigados?: (p: NotificationPreferences) => void }> = ({ distrito, onLigados }) => {
  const [estado, setEstado] = useState<'oculto' | 'convite' | 'a-ligar' | 'ligado' | 'bloqueado'>(() => {
    try {
      if (localStorage.getItem(CHAVE_CONVITE_AVISOS) === '1') return 'oculto';
      if (getStoredNotificationPreferences().enabled) return 'oculto';
      if (!pushSuportado()) return 'oculto';
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'oculto';
      return 'convite';
    } catch {
      return 'oculto';
    }
  });
  if (estado === 'oculto') return null;

  const fechar = () => {
    setEstado('oculto');
    try { localStorage.setItem(CHAVE_CONVITE_AVISOS, '1'); } catch {}
  };

  const ligar = async () => {
    setEstado('a-ligar');
    const r = await requestNotificationPermission();
    if (r.permission !== 'granted') { setEstado('bloqueado'); return; }
    const atuais = getStoredNotificationPreferences();
    const distritos = atuais.districts && atuais.districts.length > 0 ? atuais.districts : [opcaoDistrito(distrito)];
    const prefs: NotificationPreferences = { ...atuais, enabled: true, districts: distritos };
    saveStoredNotificationPreferences(prefs);
    onLigados?.(prefs);
    await sincronizarPush(prefs);
    setEstado('ligado');
    try { localStorage.setItem(CHAVE_CONVITE_AVISOS, '1'); } catch {}
  };

  return (
    <div className="rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] p-3.5 flex items-start gap-3" data-teste="convite-avisos">
      <div className="w-9 h-9 rounded-full bg-[#FFF1E8] text-[#FF6B1A] flex items-center justify-center shrink-0">
        <Bell className="w-4.5 h-4.5 stroke-[2]" />
      </div>
      <div className="min-w-0 flex-1">
        {estado === 'ligado' ? (
          <>
            <div className="text-[14px] font-semibold text-[#111111] leading-snug">Avisos ligados</div>
            <div className="text-[12.5px] text-[#6B6B6B] leading-snug mt-0.5">
              Vais receber greves, mau tempo e perturbações graves. Para mudar os distritos, toca no sino lá em cima.
            </div>
          </>
        ) : estado === 'bloqueado' ? (
          <>
            <div className="text-[14px] font-semibold text-[#111111] leading-snug">As notificações estão bloqueadas</div>
            <div className="text-[12.5px] text-[#6B6B6B] leading-snug mt-0.5">
              Permite-as nas definições do browser (cadeado ao lado do endereço) ou do telemóvel e tenta outra vez.
            </div>
          </>
        ) : (
          <>
            <div className="text-[14px] font-semibold text-[#111111] leading-snug">Recebe estes avisos no telemóvel</div>
            <div className="text-[12.5px] text-[#6B6B6B] leading-snug mt-0.5">
              Greves, mau tempo e perturbações graves em {distrito}, mesmo com a app fechada.
            </div>
            <button
              onClick={ligar}
              disabled={estado === 'a-ligar'}
              className="mt-2.5 h-9 px-3.5 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              data-teste="ligar-avisos"
            >
              <Bell className="w-4 h-4" /> {estado === 'a-ligar' ? 'A ligar…' : 'Ligar avisos'}
            </button>
          </>
        )}
      </div>
      <button onClick={fechar} className="shrink-0 w-8 h-8 -mr-1 -mt-1 rounded-full text-[#6B6B6B] flex items-center justify-center cursor-pointer" aria-label="Fechar">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// Cache ao nível do módulo: ao voltar ao separador a página aparece logo
let ultimaResposta: RespostaAlertas | null = null;

const NOMES_NIVEL: Record<string, string> = { yellow: 'amarelo', orange: 'laranja', red: 'vermelho' };
const CORES_NIVEL: Record<string, { fundo: string; texto: string }> = {
  yellow: { fundo: '#FACC15', texto: '#111111' },
  orange: { fundo: '#FF6B1A', texto: '#111111' },
  red: { fundo: '#D92D20', texto: '#FFFFFF' },
};

function IconeTempo({ icone, className }: { icone: Icone; className?: string }) {
  const props = { className, strokeWidth: 1.75 };
  switch (icone) {
    case 'sol': return <Sun {...props} />;
    case 'lua': return <Moon {...props} />;
    case 'sol-nuvens': return <CloudSun {...props} />;
    case 'lua-nuvens': return <CloudMoon {...props} />;
    case 'nevoeiro': return <CloudFog {...props} />;
    case 'chuvisco': return <CloudDrizzle {...props} />;
    case 'chuva':
    case 'aguaceiros': return <CloudRain {...props} />;
    case 'neve': return <CloudSnow {...props} />;
    case 'trovoada': return <CloudLightning {...props} />;
    default: return <Cloud {...props} />;
  }
}

function horaLisboa(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short' }).replace('.', '');
}

function mesmoDia(a: Date, b: Date): boolean {
  const f = (d: Date) => d.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' });
  return f(a) === f(b);
}

function quandoTermina(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const agora = new Date();
  const amanha = new Date(agora.getTime() + 86400000);
  if (mesmoDia(d, agora)) return `até às ${horaLisboa(iso)}`;
  if (mesmoDia(d, amanha)) return `até amanhã às ${horaLisboa(iso)}`;
  return `até ${dataCurta(iso)}, ${horaLisboa(iso)}`;
}

function haQuanto(ms: number): string {
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

function dataFeriado(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${d} de ${meses[(m || 1) - 1]}${a !== new Date().getFullYear() ? ` de ${a}` : ''}`;
}

function filtroDaComunidade(o: Occurrence): Exclude<Filtro, 'tudo'> {
  switch (o.type) {
    case 'GREVE': return 'greves';
    case 'OBRAS': return 'obras';
    case 'ACIDENTE':
    case 'CORTE': return 'transito';
    default: return 'rede';
  }
}

const ROTULOS_COMUNIDADE: Record<string, string> = {
  ACIDENTE: 'Acidente',
  ATRASOS: 'Atrasos',
  AVARIA: 'Avaria',
  GREVE: 'Greve',
  OBRAS: 'Obras',
  CORTE: 'Corte',
  SERVICO_PUBLICO: 'Serviço',
};

const ROTULOS_TIPO: Record<string, string> = {
  'outros alertas oficiais': 'Aviso',
  'atraso significativo': 'Atrasos',
  'alteração de horário': 'Novo horário',
  'alteração de percurso': 'Desvio',
  'paragem encerrada': 'Paragem fechada',
  'linha suspensa': 'Linha suspensa',
  'reforço de serviço': 'Reforço',
  'novo horário': 'Novo horário',
};

const CATEGORIAS_NOTICIA: Record<string, { rotulo: string; filtro: Exclude<Filtro, 'tudo'> }> = {
  greve: { rotulo: 'Greve', filtro: 'greves' },
  transportes: { rotulo: 'Transportes', filtro: 'rede' },
  transito: { rotulo: 'Trânsito', filtro: 'transito' },
  tempo: { rotulo: 'Tempo', filtro: 'tempo' },
  obras: { rotulo: 'Obras', filtro: 'obras' },
  incendio: { rotulo: 'Incêndios', filtro: 'incendios' },
};

const FILTROS: Array<{ id: Filtro; rotulo: string; icone: React.ElementType }> = [
  { id: 'tudo', rotulo: 'Tudo', icone: Megaphone },
  { id: 'incendios', rotulo: 'Incêndios', icone: Flame },
  { id: 'greves', rotulo: 'Greves', icone: Megaphone },
  { id: 'rede', rotulo: 'Rede', icone: TrainFront },
  { id: 'transito', rotulo: 'Trânsito', icone: TrafficCone },
  { id: 'tempo', rotulo: 'Tempo', icone: CloudRain },
  { id: 'obras', rotulo: 'Obras', icone: Construction },
];

// Alertas já vistos neste telemóvel: os que aparecerem depois levam a etiqueta "Novo"
const CHAVE_VISTOS = 'parou_alertas_vistos';
function lerVistos(): Record<string, number> | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_VISTOS) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}
function gravarVistos(v: Record<string, number>) {
  try {
    // Guarda só os últimos 400
    const entradas = Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 400);
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify(Object.fromEntries(entradas)));
  } catch {}
}

function meiosTexto(m: IncidentePC['meios']): string {
  return [
    m.humanos ? `${m.humanos} operacionais` : '',
    m.terrestres ? `${m.terrestres} veículos` : '',
    m.aereos ? `${m.aereos} ${m.aereos === 1 ? 'meio aéreo' : 'meios aéreos'}` : '',
  ].filter(Boolean).join(' · ');
}

function CartaoIncendio({ f, novo }: { f: IncidentePC; novo: boolean }) {
  const cor = f.importante ? '#D92D20' : f.aAcalmar ? '#A16207' : '#FF6B1A';
  return (
    <div className="flex">
      <div className="w-1 shrink-0" style={{ backgroundColor: cor }} />
      <div className="p-3.5 min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] flex items-center gap-1" style={{ color: cor }}>
            <Flame className="w-3.5 h-3.5 stroke-[2.25]" />
            {f.estado}
            {f.importante && <span className="text-[#D92D20]"> · importante</span>}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {novo && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 h-[18px] inline-flex items-center rounded-full bg-[#FF6B1A] text-[#111111]">Novo</span>}
            <span className="font-condensada text-[13px] font-bold text-[#6B6B6B] tabular-nums">{f.distanciaKm.toLocaleString('pt-PT')} km</span>
          </span>
        </div>
        <div className="text-[15px] font-semibold text-[#111111] leading-snug mt-1">
          {[f.local, f.concelho].filter((x, k, arr) => x && arr.indexOf(x) === k).join(', ') || f.natureza}
        </div>
        <div className="text-[12.5px] text-[#6B6B6B] mt-0.5">{[f.distrito, f.natureza].filter(Boolean).join(' · ')}</div>
        <div className="flex items-center gap-3 mt-2 text-[12px] text-[#111111] font-medium flex-wrap">
          <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5 text-[#6B6B6B]" /> {f.meios.humanos}</span>
          <span className="inline-flex items-center gap-1"><Truck className="w-3.5 h-3.5 text-[#6B6B6B]" /> {f.meios.terrestres}</span>
          {f.meios.aereos > 0 && <span className="inline-flex items-center gap-1"><Plane className="w-3.5 h-3.5 text-[#6B6B6B]" /> {f.meios.aereos}</span>}
          {f.inicio && <span className="text-[#6B6B6B] font-normal">começou {haQuanto(Date.parse(f.inicio))}</span>}
        </div>
      </div>
    </div>
  );
}

function lerArea(): string {
  try { return localStorage.getItem('parou_alertas_area') || ''; } catch { return ''; }
}

export const AlertasView: React.FC<AlertasViewProps> = ({ ocorrenciasComunidade = [], onAbrirOcorrencia, onVerMapa, onAvisosLigados }) => {
  const [dados, setDados] = useState<RespostaAlertas | null>(ultimaResposta);
  const [aCarregar, setACarregar] = useState<boolean>(!ultimaResposta);
  const [erro, setErro] = useState<boolean>(false);
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [area, setArea] = useState<string>(lerArea);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(() => {
    const p = ultimaPosicaoConhecida();
    return p ? { lat: p.latitude, lon: p.longitude } : null;
  });
  const [verMaisDestaques, setVerMaisDestaques] = useState(false);
  const [verMaisNoticias, setVerMaisNoticias] = useState(false);
  // O tempo aparece completo por defeito; quem quiser encurta no botão (e a escolha fica guardada)
  const [tempoRecolhido, setTempoRecolhido] = useState<boolean>(() => {
    try { return localStorage.getItem('parou_tempo_recolhido') === '1'; } catch { return false; }
  });
  const alternarTempo = () => {
    const novo = !tempoRecolhido;
    setTempoRecolhido(novo);
    try { localStorage.setItem('parou_tempo_recolhido', novo ? '1' : '0'); } catch {}
  };

  // Usa o GPS só se já estiver autorizado (sem pedir nada neste separador)
  useEffect(() => {
    if (area || coords || typeof navigator === 'undefined' || !('geolocation' in navigator) || !('permissions' in navigator)) return;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((r) => {
        if (r.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(
          (p) => setCoords({ lat: p.coords.latitude, lon: p.coords.longitude }),
          () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60_000 },
        );
      })
      .catch(() => {});
  }, [area]);

  const carregar = useCallback(async () => {
    const qs = area ? `area=${encodeURIComponent(area)}` : coords ? `lat=${coords.lat.toFixed(4)}&lon=${coords.lon.toFixed(4)}` : '';
    try {
      const r = await fetch(`/api/alertas${qs ? `?${qs}` : ''}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(String(r.status));
      const bruto: any = await r.json();
      // Resposta incompleta (ex.: servidor a arrancar) não pode partir o ecrã: listas vazias por defeito
      if (!bruto || typeof bruto !== 'object' || !bruto.local) throw new Error('resposta incompleta');
      const j: RespostaAlertas = {
        ...bruto,
        ocorrencias: bruto.ocorrencias || [],
        protecaoCivil: bruto.protecaoCivil || [],
        avisosMeteo: bruto.avisosMeteo || [],
        noticias: bruto.noticias || [],
        feriados: bruto.feriados || [],
        distritos: bruto.distritos || [],
      };
      ultimaResposta = j;
      setDados(j);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setACarregar(false);
    }
  }, [area, coords]);

  // Sempre atualizado: a cada minuto com a página aberta, ao voltar à app e ao voltar a
  // ter rede. O servidor mantém as fontes frescas, por isso cada pedido é rápido.
  const ultimoPedidoRef = React.useRef<number>(0);
  useEffect(() => {
    const atualizarSePreciso = (minimoMs: number) => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - ultimoPedidoRef.current < minimoMs) return;
      ultimoPedidoRef.current = Date.now();
      carregar();
    };
    ultimoPedidoRef.current = Date.now();
    carregar();
    const t = setInterval(() => atualizarSePreciso(55_000), 60_000);
    const aoVoltar = () => atualizarSePreciso(20_000);
    const comRede = () => atualizarSePreciso(0);
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('online', comRede);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
      window.removeEventListener('online', comRede);
    };
  }, [carregar]);

  // O relógio da página: o que acaba entretanto sai sozinho (ex.: aviso que terminou)
  const [agoraMs, setAgoraMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // "Novo": o que apareceu desde a última vez que a pessoa viu os alertas
  const [vistosAntes] = useState<Record<string, number> | null>(() => lerVistos());

  const escolherArea = (nova: string) => {
    try {
      if (nova) localStorage.setItem('parou_alertas_area', nova);
      else localStorage.removeItem('parou_alertas_area');
    } catch {}
    setArea(nova);
    setACarregar(true);
  };

  // ---------------------------------------------------------------------------
  // Em destaque: perturbações oficiais, avisos IPMA noutros distritos e comunidade
  // ---------------------------------------------------------------------------
  const destaques = useMemo<ItemDestaque[]>(() => {
    if (!dados) return [];
    const itens: ItemDestaque[] = [];
    for (const o of dados.ocorrencias) {
      if (o.fim && Date.parse(o.fim) < agoraMs) continue; // já acabou
      const filtroItem: ItemDestaque['filtro'] = o.categoria === 'greve' ? 'greves' : o.categoria === 'obras' ? 'obras' : 'rede';
      const futuro = o.estado === 'Futuro';
      const etiqueta = o.categoria === 'greve'
        ? (futuro ? `Greve · ${dataCurta(o.inicio)}` : 'Greve · a decorrer')
        : o.categoria === 'obras'
          ? 'Obras'
          : (ROTULOS_TIPO[o.tipo] || (o.tipo ? o.tipo.charAt(0).toUpperCase() + o.tipo.slice(1) : 'Perturbação'));
      itens.push({
        id: `o:${o.id}`,
        filtro: filtroItem,
        etiqueta,
        cor: o.categoria === 'greve' ? '#D92D20' : o.gravidade === 'Grave' ? '#D92D20' : '#FF6B1A',
        titulo: o.titulo,
        resumo: o.resumo,
        meta: [o.operador, o.fim ? quandoTermina(o.fim) : futuro ? `a partir de ${dataCurta(o.inicio)}` : ''].filter(Boolean).join(' · '),
        quando: Date.parse(o.inicio) || 0,
        url: o.url || undefined,
        peso: (o.local ? 4 : 0) + (o.categoria === 'greve' ? 3 : 0) + (o.estado === 'Ativo' ? 1 : 0) + (o.gravidade === 'Grave' ? 1 : 0),
        linhas: o.linhas,
      });
    }
    for (const i of dados.protecaoCivil || []) {
      itens.push({
        id: `pc:${i.id}`,
        filtro: i.tipo === 'acidente' ? 'transito' : i.tipo === 'inundacao' ? 'tempo' : 'rede',
        etiqueta: `${i.natureza.split(/[-/]/)[0].trim() || 'Ocorrência'} · Proteção Civil`,
        cor: i.importante ? '#D92D20' : '#FF6B1A',
        titulo: [i.local, i.concelho].filter((x, k, arr) => x && arr.indexOf(x) === k).join(', ') || i.natureza,
        resumo: `${i.estado}${meiosTexto(i.meios) ? ` · ${meiosTexto(i.meios)}` : ''}`,
        meta: [`a ${i.distanciaKm.toLocaleString('pt-PT')} km`, i.inicio ? haQuanto(Date.parse(i.inicio)) : '', 'Fogos.pt'].filter(Boolean).join(' · '),
        quando: i.inicio ? Date.parse(i.inicio) : 0,
        url: 'https://fogos.pt',
        peso: 5 + (i.importante ? 2 : 0),
      });
    }
    for (const a of dados.avisosMeteo.filter((x) => !x.local)) {
      if (a.fim && Date.parse(a.fim) < agoraMs) continue;
      itens.push({
        id: `m:${a.distrito}:${a.tipo}:${a.inicio}`,
        filtro: 'tempo',
        etiqueta: `Aviso ${NOMES_NIVEL[a.nivel]}`,
        cor: CORES_NIVEL[a.nivel].fundo,
        titulo: `${a.tipo} · ${a.distrito}`,
        resumo: a.texto || undefined,
        meta: `IPMA · ${a.ativo ? quandoTermina(a.fim) : `a partir de ${dataCurta(a.inicio)}, ${horaLisboa(a.inicio)}`}`,
        quando: Date.parse(a.inicio) || 0,
        url: 'https://www.ipma.pt/pt/otempo/prev-sam/',
        peso: a.nivel === 'red' ? 5 : 3,
      });
    }
    const umDia = agoraMs - 24 * 3600_000;
    const doDistrito = (o: Occurrence) => dados.local.distrito && String(o.district || '').toLowerCase() === dados.local.distrito.toLowerCase();
    for (const o of ocorrenciasComunidade) {
      if (!o || o.status === 'Resolvida' || o.status === 'Ocultada' || (o.timestamp || 0) < umDia) continue;
      itens.push({
        id: `c:${o.id}`,
        filtro: filtroDaComunidade(o),
        etiqueta: `${ROTULOS_COMUNIDADE[o.type] || 'Ocorrência'} · comunidade`,
        cor: o.severity === 'Grave' ? '#D92D20' : '#111111',
        titulo: o.title,
        resumo: [o.locationDetails, o.concelho].filter(Boolean).join(', ') || undefined,
        meta: [o.companyOrService || o.transporte, haQuanto(o.timestamp)].filter(Boolean).join(' · '),
        quando: o.timestamp || 0,
        onClick: onAbrirOcorrencia ? () => onAbrirOcorrencia(o) : undefined,
        peso: (doDistrito(o) ? 4 : 0) + (o.severity === 'Grave' ? 2 : 1),
      });
    }
    return itens.sort((a, b) => b.peso - a.peso || b.quando - a.quando);
  }, [dados, ocorrenciasComunidade, onAbrirOcorrencia, agoraMs]);

  // Marca como vistos (ao fim de uns segundos na página) os alertas que estão a aparecer
  useEffect(() => {
    if (!dados) return;
    const t = setTimeout(() => {
      const atual = lerVistos() || {};
      const agora = Date.now();
      for (const d of destaques) if (!atual[d.id]) atual[d.id] = agora;
      for (const n of dados.noticias || []) if (!atual[n.id]) atual[n.id] = agora;
      for (const f of dados.incendios?.lista || []) if (!atual[`f:${f.id}`]) atual[`f:${f.id}`] = agora;
      gravarVistos(atual);
    }, 4000);
    return () => clearTimeout(t);
  }, [dados, destaques]);
  // Primeira vez que abre os Alertas: nada é "novo" (senão era tudo)
  const eNovo = (id: string) => Boolean(vistosAntes) && !vistosAntes![id];

  const incendios = dados?.incendios;
  const listaIncendios = incendios?.lista || [];
  const incendiosPerto = listaIncendios.filter((f) => f.perto);

  const noticias = useMemo(() => dados?.noticias || [], [dados]);

  const destaquesFiltrados = filtro === 'tudo' ? destaques : destaques.filter((d) => d.filtro === filtro);
  const noticiasFiltradas = filtro === 'tudo' ? noticias : noticias.filter((n) => CATEGORIAS_NOTICIA[n.categoria]?.filtro === filtro);
  const contagem = (f: Filtro) =>
    f === 'tudo' ? 0 : f === 'incendios' ? (incendios?.total || 0) : destaques.filter((d) => d.filtro === f).length + noticias.filter((n) => CATEGORIAS_NOTICIA[n.categoria]?.filtro === f).length;

  const avisosLocais = (dados?.avisosMeteo || []).filter((a) => a.local && !(a.fim && Date.parse(a.fim) < agoraMs));
  const feriado = dados?.feriados?.[0];
  const outrosFeriados = (dados?.feriados || []).slice(1, 3);
  const agora = dados?.tempo?.agora || null;
  const dias = dados?.tempo?.dias || [];
  const hoje = dias[0];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-8 space-y-4">
      {/* Cabeçalho */}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-none font-bold tracking-tight text-[#111111]">Alertas</h1>
          <p className="text-[13px] text-[#6B6B6B] mt-1.5 leading-snug">Greves, tempo, trânsito e feriados que mexem com as tuas viagens.</p>
        </div>
        <button
          onClick={() => { setACarregar(true); carregar(); }}
          className="shrink-0 w-10 h-10 rounded-full bg-[#F4F4F2] text-[#111111] flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
          aria-label="Atualizar alertas"
        >
          <RefreshCw className={`w-4 h-4 stroke-[2] ${aCarregar ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Zona */}
      <div className="flex items-center justify-between gap-2 text-xs text-[#6B6B6B]">
        <label className="relative inline-flex items-center gap-1.5 pl-2.5 pr-2 h-9 rounded-full border border-[#E6E6E3] bg-[#FFFFFF] text-[13px] font-semibold text-[#111111] cursor-pointer">
          <MapPin className="w-3.5 h-3.5 stroke-[2] text-[#FF6B1A]" />
          <span>{dados?.local.distrito || 'A localizar…'}</span>
          {dados?.local.porGps && !area && <span className="font-normal text-[#6B6B6B]">· perto de ti</span>}
          <ChevronDown className="w-3.5 h-3.5 stroke-[2] text-[#6B6B6B]" />
          <select
            value={area}
            onChange={(e) => escolherArea(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Escolher distrito"
          >
            <option value="">{coords ? 'Perto de mim (GPS)' : 'Automático'}</option>
            {(dados?.distritos || []).map((d) => (
              <option key={d.area} value={d.area}>{d.nome}</option>
            ))}
          </select>
        </label>
        {dados && <span className="tabular-nums">Atualizado às {horaLisboa(dados.atualizado)}</span>}
      </div>

      {dados && <ConviteAvisos distrito={dados.local.distrito} onLigados={onAvisosLigados} />}

      {erro && !dados && (
        <div className="rounded-[14px] border border-[#E6E6E3] p-5 text-center text-sm text-[#6B6B6B]">
          Não foi possível carregar os alertas.{' '}
          <button onClick={() => carregar()} className="font-semibold text-[#111111] underline cursor-pointer">Tentar outra vez</button>
        </div>
      )}

      {/* Tempo */}
      {!dados && aCarregar ? (
        <div className="rounded-[16px] bg-[#F4F4F2] h-[188px] animate-pulse" />
      ) : dados && (agora || hoje) && avisosLocais.length === 0 && tempoRecolhido ? (
        /* Encurtado por escolha da pessoa (só sem avisos): uma linha, toca para voltar ao completo */
        <section className="rounded-[14px] bg-[#111111] text-[#FFFFFF] overflow-hidden" data-teste="tempo-compacto">
          <button
            type="button"
            onClick={alternarTempo}
            aria-expanded={false}
            aria-label="Mostrar o tempo completo"
            className="w-full min-h-[56px] px-3.5 py-2.5 flex items-center gap-3 text-left cursor-pointer"
          >
            <IconeTempo icone={agora?.icone || hoje?.icone || 'nuvens'} className="w-8 h-8 text-[#FF6B1A] shrink-0" />
            <span className="font-condensada text-[34px] leading-none font-bold tabular-nums shrink-0">
              {agora ? `${agora.temperatura}°` : `${hoje?.tMax}°`}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight truncate">
                {agora?.descricao || hoje?.descricao} · {dados.local.distrito}
              </span>
              <span className="block text-[12px] text-white/70 leading-tight mt-0.5 truncate">
                {hoje ? `${hoje.tMin}° / ${hoje.tMax}° · ` : ''}Sem avisos meteorológicos
              </span>
            </span>
            <ChevronDown className="w-5 h-5 shrink-0 text-white/70" aria-hidden="true" />
          </button>
        </section>
      ) : dados && (agora || hoje) ? (
        <section className="rounded-[16px] bg-[#111111] text-[#FFFFFF] overflow-hidden shadow-[0_8px_24px_rgba(17,17,17,0.18)]">
          <div className="p-4 pb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.12em] text-white/60 font-semibold">
                {agora ? 'Tempo agora' : 'Hoje'} · {dados.local.distrito}
              </div>
              <div className="flex items-end gap-2 mt-1">
                {agora ? (
                  <>
                    <span className="font-condensada text-[64px] leading-[0.85] font-bold tabular-nums">{agora.temperatura}°</span>
                    {hoje && (
                      <span className="font-condensada text-[15px] text-white/70 tabular-nums pb-1">
                        {hoje.tMin}° / {hoje.tMax}°
                      </span>
                    )}
                  </>
                ) : hoje ? (
                  <span className="font-condensada text-[52px] leading-[0.85] font-bold tabular-nums">
                    {hoje.tMin}°<span className="text-white/40"> / </span>{hoje.tMax}°
                  </span>
                ) : null}
              </div>
              <div className="text-[15px] font-semibold mt-2 truncate">{agora?.descricao || hoje?.descricao}</div>
              <div className="text-xs text-white/60 mt-0.5 flex items-center gap-2">
                {agora?.sensacao !== undefined && <span>Sensação {agora.sensacao}°</span>}
                {agora?.vento !== undefined && (
                  <span className="inline-flex items-center gap-1"><Wind className="w-3 h-3" /> {agora.vento} km/h</span>
                )}
                {hoje && hoje.probChuva > 0 && <span>Chuva {hoje.probChuva}%</span>}
              </div>
            </div>
            <IconeTempo icone={agora?.icone || hoje?.icone || 'nuvens'} className="w-16 h-16 text-[#FF6B1A] shrink-0" />
          </div>

          {dias.length > 1 && (
            <div className="grid grid-cols-3 border-t border-white/10">
              {dias.slice(0, 3).map((d) => (
                <div key={d.data} className="px-3 py-2.5 flex items-center gap-2 border-r border-white/10 last:border-r-0 min-w-0">
                  <IconeTempo icone={d.icone} className="w-5 h-5 text-white/80 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-white/60 capitalize truncate">{d.rotulo}</div>
                    <div className="font-condensada text-[15px] font-bold tabular-nums leading-tight">
                      {d.tMin}°<span className="text-white/40"> / </span>{d.tMax}°
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {avisosLocais.map((a, i) => (
            <div
              key={`${a.tipo}-${i}`}
              className="px-4 py-2.5 flex items-center gap-2 text-[13px] font-semibold"
              style={{ backgroundColor: CORES_NIVEL[a.nivel].fundo, color: CORES_NIVEL[a.nivel].texto }}
            >
              <TriangleAlert className="w-4 h-4 shrink-0 stroke-[2.25]" />
              <span className="truncate">
                Aviso {NOMES_NIVEL[a.nivel]} · {a.tipo} · {a.ativo ? quandoTermina(a.fim) : `a partir de ${dataCurta(a.inicio)}, ${horaLisboa(a.inicio)}`}
              </span>
            </div>
          ))}
          {avisosLocais.length === 0 && (
            <div className="pl-4 pr-1.5 text-[11px] text-white/60 border-t border-white/10 flex items-center justify-between gap-2">
              <span className="py-2 flex items-center gap-1.5 min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Sem avisos meteorológicos no distrito · IPMA, Open-Meteo</span>
              </span>
              <button
                type="button"
                onClick={alternarTempo}
                aria-expanded={true}
                className="shrink-0 h-9 px-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-white/80 cursor-pointer"
              >
                Encurtar <ChevronUp className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      ) : null}

      {/* Feriados */}
      {feriado && (
        <section className={`rounded-[16px] border p-4 ${feriado.emDias === 0 ? 'bg-[#FF6B1A] border-[#FF6B1A] text-[#111111]' : 'bg-[#FFFFFF] border-[#E6E6E3]'}`}>
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-[12px] flex flex-col items-center justify-center shrink-0 ${feriado.emDias === 0 ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] text-[#111111]'}`}>
              <span className="font-condensada text-[18px] font-bold leading-none tabular-nums">{Number(feriado.data.slice(8, 10))}</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
                {['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(feriado.data.slice(5, 7)) - 1]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-[11px] uppercase tracking-[0.12em] font-semibold ${feriado.emDias === 0 ? 'text-[#111111]/85' : 'text-[#6B6B6B]'}`}>
                {feriado.emDias === 0 ? 'Hoje é feriado' : feriado.ambito === 'tolerancia' ? 'Próxima tolerância' : 'Próximo feriado'}
                {feriado.ambito === 'municipal' && feriado.local ? ` · ${feriado.local}` : ''}
                {feriado.ambito === 'regional' && feriado.local ? ` · ${feriado.local}` : ''}
              </div>
              <div className="text-[17px] font-bold leading-tight mt-0.5">{feriado.nome}</div>
              <div className={`text-[13px] mt-0.5 ${feriado.emDias === 0 ? 'text-[#111111]/80' : 'text-[#6B6B6B]'}`}>
                {feriado.emDias === 0
                  ? 'Os transportes fazem, em regra, o horário de domingos e feriados.'
                  : `${feriado.diaSemana}, ${dataFeriado(feriado.data)} · ${feriado.emDias === 1 ? 'amanhã' : `daqui a ${feriado.emDias} dias`}`}
              </div>
              {feriado.ambito === 'tolerancia' && (
                <div className="text-[12px] text-[#6B6B6B] mt-1">Não é feriado obrigatório, mas costuma haver tolerância de ponto.</div>
              )}
            </div>
          </div>
          {outrosFeriados.length > 0 && feriado.emDias !== 0 && (
            <div className="mt-3 pt-3 border-t border-[#E6E6E3] space-y-1.5">
              {outrosFeriados.map((f) => (
                <div key={f.data + f.nome} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-[#111111] truncate">
                    <CalendarDays className="w-3.5 h-3.5 inline -mt-0.5 mr-1.5 text-[#6B6B6B]" />
                    {f.nome}
                    {f.ambito === 'municipal' && f.local ? <span className="text-[#6B6B6B]"> · {f.local}</span> : null}
                  </span>
                  <span className="text-[#6B6B6B] shrink-0 tabular-nums">{dataFeriado(f.data)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Filtros */}
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filtrar alertas">
        {FILTROS.map((f) => {
          const ativo = filtro === f.id;
          const n = contagem(f.id);
          return (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                ativo ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] text-[#111111]'
              }`}
            >
              {f.rotulo}
              {n > 0 && (
                <span className={`font-condensada text-[12px] tabular-nums ${ativo ? 'text-white/70' : 'text-[#6B6B6B]'}`}>{n}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Incêndios (Fogos.pt / ANEPC) */}
      {dados && (filtro === 'incendios' || (filtro === 'tudo' && incendiosPerto.length > 0)) && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-condensada text-[19px] leading-tight font-bold text-[#111111] flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[#FF6B1A]" />
              {filtro === 'incendios' ? 'Incêndios ativos' : 'Incêndios perto'}
              <span className="font-condensada text-[13px] text-[#6B6B6B] tabular-nums">
                {filtro === 'incendios' ? incendios?.total || 0 : incendiosPerto.length}
              </span>
            </h2>
            {onVerMapa && listaIncendios.length > 0 && (
              <button onClick={onVerMapa} className="text-[13px] font-semibold text-[#6B6B6B] cursor-pointer">Ver no mapa</button>
            )}
          </div>
          {listaIncendios.length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-[#E6E6E3] px-4 py-5 text-[13px] text-[#6B6B6B] flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>{incendios?.atualizado ? 'Sem incêndios ativos em Portugal neste momento.' : 'A obter os incêndios ativos…'}</span>
            </div>
          ) : (
            <div className="rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
              {(filtro === 'incendios' ? listaIncendios : incendiosPerto.slice(0, 3)).map((f) => (
                <a key={f.id} href="https://fogos.pt" target="_blank" rel="noopener noreferrer" className="block active:bg-[#F4F4F2] transition-colors">
                  <CartaoIncendio f={f} novo={eNovo(`f:${f.id}`)} />
                </a>
              ))}
            </div>
          )}
          {filtro === 'tudo' && (incendios?.total || 0) > Math.min(3, incendiosPerto.length) && (
            <button
              onClick={() => setFiltro('incendios')}
              className="w-full h-11 rounded-[12px] bg-[#F4F4F2] text-[13px] font-semibold text-[#111111] cursor-pointer"
            >
              Ver todos os incêndios ativos ({incendios?.total})
            </button>
          )}
          <p className="text-[11px] text-[#6B6B6B]">
            Fonte: <a href="https://fogos.pt" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#111111] underline">Fogos.pt</a> (dados da ANEPC)
            {incendios?.atualizado ? ` · atualizado ${haQuanto(Date.parse(incendios.atualizado))}` : ''}
          </p>
        </section>
      )}

      {/* Em destaque */}
      {filtro !== 'incendios' && (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-condensada text-[19px] leading-tight font-bold text-[#111111]">Na rede e na estrada</h2>
          {onVerMapa && (
            <button onClick={onVerMapa} className="text-[13px] font-semibold text-[#6B6B6B] cursor-pointer">Ver no mapa</button>
          )}
        </div>
        {!dados && aCarregar ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-[86px] rounded-[14px] bg-[#F4F4F2] animate-pulse" />)}
          </div>
        ) : destaquesFiltrados.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-[#E6E6E3] px-4 py-5 text-[13px] text-[#6B6B6B] flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
            <span>
              {filtro === 'greves' ? 'Sem greves anunciadas.' : filtro === 'tempo' ? 'Sem avisos meteorológicos relevantes.' : 'Nada a assinalar por agora.'}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {(verMaisDestaques ? destaquesFiltrados : destaquesFiltrados.slice(0, 6)).map((d) => {
              const Wrapper: React.ElementType = d.onClick ? 'button' : d.url ? 'a' : 'div';
              const wrapperProps: Record<string, unknown> = d.onClick
                ? { onClick: d.onClick, type: 'button' }
                : d.url
                  ? { href: d.url, target: '_blank', rel: 'noopener noreferrer' }
                  : {};
              return (
                <Wrapper
                  key={d.id}
                  {...wrapperProps}
                  className="block w-full text-left rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] overflow-hidden active:bg-[#F4F4F2] transition-colors"
                >
                  <div className="flex">
                    <div className="w-1 shrink-0" style={{ backgroundColor: d.cor }} />
                    <div className="p-3.5 min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: d.cor === '#FACC15' ? '#A16207' : d.cor === '#111111' ? '#6B6B6B' : d.cor }}>
                          {d.etiqueta}
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          {eNovo(d.id) && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 h-[18px] inline-flex items-center rounded-full bg-[#FF6B1A] text-[#111111]">Novo</span>}
                          {d.url && <ExternalLink className="w-3.5 h-3.5 text-[#6B6B6B] shrink-0" />}
                          {d.onClick && <Users className="w-3.5 h-3.5 text-[#6B6B6B] shrink-0" />}
                        </span>
                      </div>
                      <div className="text-[15px] font-semibold text-[#111111] leading-snug mt-1 line-clamp-2">{d.titulo}</div>
                      {d.resumo && <div className="text-[13px] text-[#6B6B6B] leading-snug mt-1 line-clamp-2">{d.resumo}</div>}
                      {(d.meta || (d.linhas && d.linhas.length > 0)) && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {d.linhas?.slice(0, 4).map((l) => (
                            <span key={l} className="font-condensada text-[12px] font-bold px-1.5 h-5 inline-flex items-center rounded-[4px] bg-[#F4F4F2] text-[#111111]">{l}</span>
                          ))}
                          {d.meta && <span className="text-[12px] text-[#6B6B6B]">{d.meta}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </Wrapper>
              );
            })}
            {destaquesFiltrados.length > 6 && (
              <button
                onClick={() => setVerMaisDestaques((v) => !v)}
                className="w-full h-11 rounded-[12px] bg-[#F4F4F2] text-[13px] font-semibold text-[#111111] cursor-pointer"
              >
                {verMaisDestaques ? 'Mostrar menos' : `Mostrar mais ${destaquesFiltrados.length - 6}`}
              </button>
            )}
          </div>
        )}
      </section>

      )}

      {/* Notícias */}
      <section className="space-y-2">
        <h2 className="font-condensada text-[19px] leading-tight font-bold text-[#111111] flex items-center gap-1.5">
          <Newspaper className="w-4 h-4" /> Notícias
        </h2>
        {!dados && aCarregar ? (
          <div className="h-[160px] rounded-[14px] bg-[#F4F4F2] animate-pulse" />
        ) : noticiasFiltradas.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-[#E6E6E3] px-4 py-5 text-[13px] text-[#6B6B6B]">
            Sem notícias recentes sobre este tema.
          </div>
        ) : (
          <div className="rounded-[14px] border border-[#E6E6E3] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
            {(verMaisNoticias ? noticiasFiltradas : noticiasFiltradas.slice(0, 8)).map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3.5 py-3 active:bg-[#F4F4F2] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B6B6B]">
                  <span className={n.categoria === 'greve' || n.categoria === 'incendio' ? 'text-[#D92D20]' : n.categoria === 'tempo' ? 'text-[#A16207]' : 'text-[#C2410C]'}>
                    {CATEGORIAS_NOTICIA[n.categoria]?.rotulo}
                  </span>
                  {n.local && <span className="text-[#111111]">· {dados?.local.distrito}</span>}
                  {eNovo(n.id) && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide px-1.5 h-[18px] inline-flex items-center rounded-full bg-[#FF6B1A] text-[#111111]">Novo</span>}
                </div>
                <div className="text-[15px] font-semibold text-[#111111] leading-snug mt-0.5 line-clamp-2">{n.titulo}</div>
                <div className="text-[12px] text-[#6B6B6B] mt-1 flex items-center gap-1">
                  {n.fonte} · {haQuanto(Date.parse(n.data))}
                  <ExternalLink className="w-3 h-3 ml-0.5" />
                </div>
              </a>
            ))}
          </div>
        )}
        {noticiasFiltradas.length > 8 && (
          <button
            onClick={() => setVerMaisNoticias((v) => !v)}
            className="w-full h-11 rounded-[12px] bg-[#F4F4F2] text-[13px] font-semibold text-[#111111] cursor-pointer"
          >
            {verMaisNoticias ? 'Mostrar menos' : `Mostrar mais ${noticiasFiltradas.length - 8}`}
          </button>
        )}
      </section>

      <p className="text-[11px] text-[#6B6B6B] leading-relaxed pt-2">
        Fontes: IPMA e Open-Meteo (tempo), Fogos.pt com dados da ANEPC (incêndios e Proteção Civil), operadores de transportes (perturbações), RTP, Público, Observador, Correio da Manhã, Diário de Notícias e SAPO 24 (notícias) e a comunidade PAROU.
        As notícias abrem no site de origem.
      </p>
    </div>
  );
};
