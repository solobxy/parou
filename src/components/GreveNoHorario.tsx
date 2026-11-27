// Greve por cima de uma lista de partidas (paragem aberta e horário do dia): o que o operador avisou que funciona, com que
// frequência, ou a que horas acaba o serviço na véspera. Cada partida leva a sua marca (sem serviço, pode não se realizar,
// serviço reduzido). Os dados vêm do servidor (grevesPartidas.ts), lidos dos avisos oficiais e atualizados sozinhos.
import React from 'react';
import { TriangleAlert, ArrowUpRight } from 'lucide-react';
import { t } from '../i18n';
import { proximosDias } from './HorarioDoDia';

export type EstadoGreve = 'sem-servico' | 'incerta' | 'reduzido' | 'garantido' | 'desvio';

export interface ResumoGreve {
  titulo: string;
  url: string;
  operador: string;
  noticia?: boolean;
  dia: string;
  vespera?: boolean;
  fimVespera?: string;
  funciona?: string[];
  frequencia?: string;
  /** CP: há lista dos comboios dos serviços mínimos */
  minimos?: boolean;
  plenario?: { das: string; as: string };
  /** Aviso do operador para algumas linhas (não é greve): supressão ou desvio */
  aviso?: 'suprimido' | 'desvio';
}

/** Títulos dos avisos escritos todos em maiúsculas («SUPRESSÃO DA LINHA - …») ficam em letra normal */
const semGritar = (s: string): string => {
  const letras = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras.length < 8 || letras !== letras.toUpperCase()) return s;
  const m = s.toLocaleLowerCase('pt-PT');
  return m.charAt(0).toLocaleUpperCase('pt-PT') + m.slice(1);
};

/** «Hoje», «Amanhã», «Sex 27» ou a data */
function rotuloDia(data: string): string {
  return proximosDias(8).find((d) => d.data === data)?.rotulo || data.split('-').reverse().slice(0, 2).join('/');
}

const juntarComE = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} ${t('e')} ${l[l.length - 1]}` : l[0] || '');

export const AvisosGreve: React.FC<{ greves?: ResumoGreve[]; className?: string }> = ({ greves, className = '' }) => {
  if (!greves?.length) return null;
  return (
    <div className={`space-y-2 ${className}`} data-teste="greve-horario">
      {greves.map((g) => {
        const titulo = g.aviso
          ? `${t('Aviso da {o}', { o: g.operador })} · ${rotuloDia(g.dia)}`
          : g.plenario
          ? `${t('Plenário na {o}', { o: g.operador })} · ${rotuloDia(g.dia)}`
          : g.vespera
          ? t('Véspera da greve na {o}', { o: g.operador })
          : `${t('Greve na {o}', { o: g.operador })} · ${rotuloDia(g.dia)}`;
        const texto = g.aviso
          ? `${semGritar(g.titulo)}. ${g.aviso === 'desvio' ? t('O percurso está alterado: algumas paragens podem não ser servidas.') : t('Algumas viagens desta linha podem não se realizar.')}`
          : g.plenario
          ? t('Preveem-se constrangimentos entre as {a} e as {b}: algumas viagens podem não se realizar.', { a: g.plenario.das, b: g.plenario.as })
          : g.vespera
          ? (g.fimVespera ? t('O serviço acaba por volta das {h}: depois disso já não há viagens.', { h: g.fimVespera }) : t('O serviço acaba mais cedo.'))
          : g.funciona?.length
            ? `${t('Só funciona: {t}', { t: juntarComE(g.funciona) })}${g.frequencia ? `, ${t('com uma viagem a cada {f}', { f: g.frequencia })}` : ''}. ${t('Fora disso não há viagens.')}`
            : g.minimos
              ? t('Só os comboios dos serviços mínimos estão garantidos. Os outros podem não se realizar.')
              : t('Algumas viagens podem não se realizar.');
        return (
          <div key={`${g.titulo}-${g.vespera ? 'v' : 'g'}`} className="flex items-start gap-2 text-[13px] leading-snug text-[#111111]">
            <TriangleAlert className={`w-4 h-4 mt-px shrink-0 stroke-[2.25] ${g.aviso === 'desvio' ? 'text-[#111111]' : 'text-[#D92D20]'}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">{titulo}</p>
              <p className="mt-0.5 text-[#111111]">{texto}</p>
              {g.url && (
                <a
                  href={g.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 min-h-[40px] -mb-2 font-semibold underline underline-offset-2 decoration-[#6B6B6B] hover:decoration-[#111111] rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]"
                >
                  {g.noticia ? t('Ver notícia') : t('Aviso oficial')}
                  <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.25]" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Texto curto da marca de uma partida */
/** Texto de uma partida na greve; quando a viagem só faz parte do percurso, diz até onde não vai */
export function textoGreveDaPartida(e: EstadoGreve, ate?: string, destinoDeSempre?: string): string {
  if (e === 'reduzido' && ate) return destinoDeSempre ? t('Não vai até {d} (greve)', { d: destinoDeSempre }) : t('Só até {e} (greve)', { e: String(ate).trim() });
  return textoGreve(e);
}

/**
 * Etiqueta da greve numa partida: bem à vista (as mesmas cores dos avisos do topo, com o triângulo), por baixo do destino.
 * 27/11/2026: em letra cinzenta pequena ao lado da hora «quase nem se percebia».
 */
export function EtiquetaGreve({ estado, ate, destinoDeSempre, className = '' }: { estado: EstadoGreve; ate?: string; destinoDeSempre?: string; className?: string }) {
  return (
    <span
      data-teste="greve-partida"
      className={`inline-flex items-center gap-1 max-w-full rounded-[6px] bg-[#FFF7ED] border border-[#FFEDD5] px-1.5 py-0.5 text-[12px] font-semibold leading-tight text-[#9A3412] ${className}`}
    >
      <TriangleAlert className="w-3.5 h-3.5 shrink-0 stroke-[2] text-[#C2410C]" aria-hidden="true" />
      <span className="truncate">{textoGreveDaPartida(estado, ate, destinoDeSempre)}</span>
    </span>
  );
}

/**
 * No lugar da hora, numa greve com serviço de N em N minutos: as horas do horário normal não valem
 * (27/11/2026: Metro do Porto de 15 em 15 min e a app mostrava metros a cada 2–3 min).
 */
export function HoraDeNEmN({ cada, className = '' }: { cada: number; className?: string }) {
  return (
    <div className={`flex flex-col items-end text-right ${className}`} data-teste="greve-de-n-em-n">
      <span className="font-condensada text-[20px] font-bold tabular-nums leading-none text-[#111111] whitespace-nowrap">{t('de {n} em {n} min', { n: cada })}</span>
      <span className="text-xs text-[#6B6B6B] mt-0.5 whitespace-nowrap">{t('sem hora certa')}</span>
    </div>
  );
}

/** Destino a mostrar numa partida em greve: onde a viagem acaba de facto (ex.: Senhora da Hora em vez de Fórum Maia) */
export function destinoNaGreve(estado: EstadoGreve | undefined, ate: string | undefined, destino: string): string {
  return estado === 'reduzido' && ate ? ate : destino;
}

export function textoGreve(e: EstadoGreve): string {
  return e === 'sem-servico' ? t('Sem serviço (greve)') : e === 'incerta' ? t('Pode não se realizar') : e === 'garantido' ? t('Serviço mínimo (greve)') : e === 'desvio' ? t('Percurso alterado') : t('Serviço reduzido');
}
