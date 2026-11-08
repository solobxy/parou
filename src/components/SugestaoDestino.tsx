// Uma sugestão da pesquisa "Para onde vais?": ícone do tipo de local, nome, tipo traduzido, onde fica e a distância.
// Antes todas tinham o mesmo alfinete e o texto vinha só em português ("Paragem · STCP").
import React from 'react';
import {
  Plane, ShoppingBag, ShoppingCart, Hospital, GraduationCap, School, Trophy, Trees, Waves, Landmark, Castle, Church, Hotel,
  TrainFront, Bus, Ship, MapPin, Building2, Mountain, Drama, Film, Library, Shield, Mail, Fish, PawPrint, FerrisWheel,
  Binoculars, Tent, Anchor, Signpost, House, Store,
} from 'lucide-react';
import { t, LOCALE } from '../i18n';
import { textoMetros } from '../utils/distancia';
import type { DestinationSuggestion } from '../types/perto';

type Icone = React.ComponentType<{ className?: string }>;

const ICONE: Record<string, Icone> = {
  aeroporto: Plane, centro_comercial: ShoppingBag, grande_armazem: ShoppingBag, loja: Store, supermercado: ShoppingCart, mercado: ShoppingCart,
  hospital: Hospital, clinica: Hospital, centro_saude: Hospital, universidade: GraduationCap, faculdade: GraduationCap, escola: School,
  estadio: Trophy, pavilhao: Trophy, golfe: Trophy, parque: Trees, jardim: Trees, reserva: Trees, praia: Waves, parque_aquatico: Waves,
  museu: Landmark, monumento: Landmark, atracao: Landmark, cultura: Landmark, castelo: Castle, palacio: Castle, igreja: Church,
  hotel: Hotel, alojamento: Hotel, campismo: Tent, teatro: Drama, cinema: Film, biblioteca: Library, policia: Shield, bombeiros: Shield,
  tribunal: Building2, camara: Building2, servico_publico: Building2, embaixada: Building2, correios: Mail, aquario: Fish, zoo: PawPrint,
  parque_tematico: FerrisWheel, miradouro: Binoculars, pico: Mountain, cabo: Mountain, marina: Anchor, terminal_fluvial: Ship,
  terminal_autocarros: Bus, rua: Signpost, praca: Signpost, morada: House, cidade: Building2, vila: Building2, aldeia: House,
  bairro: House, localidade: House, ilha: Mountain,
};

/** Nome de cada tipo de local, em português (passa por t() para os outros idiomas) */
export const NOME_TIPO_LOCAL: Record<string, string> = {
  aeroporto: 'Aeroporto', centro_comercial: 'Centro comercial', grande_armazem: 'Grande armazém', loja: 'Loja', supermercado: 'Supermercado',
  hospital: 'Hospital', clinica: 'Clínica', centro_saude: 'Centro de saúde', universidade: 'Universidade', faculdade: 'Faculdade',
  escola: 'Escola', estadio: 'Estádio', pavilhao: 'Pavilhão', parque: 'Parque', jardim: 'Jardim', parque_aquatico: 'Parque aquático',
  marina: 'Marina', golfe: 'Golfe', reserva: 'Reserva natural', praia: 'Praia', pico: 'Pico', cabo: 'Cabo', zoo: 'Jardim zoológico',
  parque_tematico: 'Parque temático', aquario: 'Aquário', museu: 'Museu', cultura: 'Cultura', atracao: 'Atração', miradouro: 'Miradouro',
  hotel: 'Hotel', alojamento: 'Alojamento', campismo: 'Parque de campismo', castelo: 'Castelo', palacio: 'Palácio', monumento: 'Monumento',
  teatro: 'Teatro', cinema: 'Cinema', biblioteca: 'Biblioteca', mercado: 'Mercado', camara: 'Câmara municipal', tribunal: 'Tribunal',
  policia: 'Polícia', bombeiros: 'Bombeiros', correios: 'Correios', terminal_autocarros: 'Terminal de autocarros',
  terminal_fluvial: 'Terminal fluvial', embaixada: 'Embaixada', servico_publico: 'Serviço público', igreja: 'Igreja',
  cidade: 'Cidade', vila: 'Vila', aldeia: 'Aldeia', bairro: 'Bairro', localidade: 'Localidade', ilha: 'Ilha', praca: 'Praça', rua: 'Rua',
  estacao: 'Estação', paragem: 'Paragem', morada: 'Morada',
};

/** Ícone da sugestão: pelo tipo de local; nas estações, pelo meio de transporte que lá passa */
function iconeDe(s: DestinationSuggestion): Icone {
  if (s.category === 'estacao') {
    const ops = `${s.place || ''} ${s.subtitle || ''}`.toLowerCase();
    if (/barco|transtejo|ttsl|soflusa|fluvial|atlantic ferries/.test(ops)) return Ship;
    return TrainFront;
  }
  if (s.category === 'paragem') return Bus;
  return (s.category && ICONE[s.category]) || MapPin;
}

/** Segunda linha: tipo traduzido e onde fica (ou os operadores); as versões antigas do servidor só mandam o subtítulo */
export function subtituloSugestao(s: DestinationSuggestion): string {
  if (!s.category) return s.subtitle || '';
  const tipo = NOME_TIPO_LOCAL[s.category] ? t(NOME_TIPO_LOCAL[s.category]) : '';
  return [tipo, s.place].filter(Boolean).join(' · ') || s.subtitle || '';
}

function distanciaCurta(m: number): string {
  if (m < 950) return textoMetros(Math.round(m / 10) * 10);
  const km = m / 1000;
  return `${km.toLocaleString(LOCALE, { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

/** Conteúdo de uma linha da lista (vai dentro do botão de cada sugestão) */
export const ConteudoSugestao: React.FC<{ s: DestinationSuggestion; grande?: boolean }> = ({ s, grande }) => {
  const Ic = iconeDe(s);
  const sub = subtituloSugestao(s);
  return (
    <>
      <span className="shrink-0 w-8 h-8 rounded-full bg-[#F4F4F2] flex items-center justify-center" aria-hidden="true">
        <Ic className="w-4 h-4 text-[#111111] stroke-[2]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block ${grande ? 'text-[14px]' : 'text-[13px]'} font-semibold text-[#111111] truncate`}>{s.title}</span>
        {sub && <span className={`block ${grande ? 'text-[12px]' : 'text-[11px]'} text-[#6B6B6B] truncate`}>{sub}</span>}
      </span>
      {typeof s.distanceFromUserMeters === 'number' && Number.isFinite(s.distanceFromUserMeters) && (
        <span className="shrink-0 text-[11px] font-medium text-[#6B6B6B] tabular-nums pl-1">{distanciaCurta(s.distanceFromUserMeters)}</span>
      )}
    </>
  );
};
