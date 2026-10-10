import React from 'react';
import { ArrowBigUp, ArrowBigDown, BadgeCheck } from 'lucide-react';
import { t } from '../../i18n';
import { Avatar } from '../Avatar';
import { MedalhaPioneiro } from '../MedalhaPioneiro';
import { AutorConversa, TipoConversa } from '../../services/comunidade';
import { tempoRelativo } from '../../utils/tempo';

export const ROTULO_TIPO: Record<TipoConversa, string> = {
  queixa: 'Queixa', pergunta: 'Pergunta', elogio: 'Elogio', conversa: 'Conversa',
};
const COR_TIPO: Record<TipoConversa, string> = {
  queixa: 'bg-[#FDECEA] text-[#9F1D14]',
  pergunta: 'bg-[#E8F0FE] text-[#1B4DB1]',
  elogio: 'bg-[#E6F6EC] text-[#14693A]',
  conversa: 'bg-[#F4F4F2] text-[#4A4A4A]',
};

export const EtiquetaTipo: React.FC<{ tipo: TipoConversa }> = ({ tipo }) => (
  <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-[12px] font-bold ${COR_TIPO[tipo] || COR_TIPO.conversa}`}>
    {t(ROTULO_TIPO[tipo] || 'Conversa')}
  </span>
);

export const Etiqueta: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center h-[22px] px-2 rounded-full text-[12px] font-semibold bg-[#F4F4F2] text-[#4A4A4A] border border-[#E6E6E3] max-w-full truncate">
    {children}
  </span>
);

/** Quem escreveu: avatar, nome, medalhas e há quanto tempo. */
export const AutorLinha: React.FC<{
  autor: AutorConversa;
  momento: number;
  oficial?: string;
  extra?: React.ReactNode;
  tamanho?: number;
}> = ({ autor, momento, oficial, extra, tamanho = 40 }) => {
  const nome = autor.apagada ? t('Utilizador PAROU') : autor.nome;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar config={autor.avatar} tamanho={tamanho} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[14.5px] font-bold text-[#111111] truncate max-w-[180px] sm:max-w-[260px]">{nome}</span>
          {autor.pioneiro && <MedalhaPioneiro />}
          {(oficial || autor.operador) && (
            <span className="inline-flex items-center gap-1 h-[20px] pl-1 pr-2 rounded-full bg-[#FF6B1A] text-[#111111] text-[11px] font-bold">
              <BadgeCheck className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
              {oficial ? t('Resposta oficial · {nome}', { nome: oficial }) : t('Oficial · {nome}', { nome: autor.operador as string })}
            </span>
          )}
        </div>
        <div className="text-[12.5px] text-[#6B6B6B] mt-0.5 flex items-center gap-1.5 flex-wrap">
          {!autor.apagada && <span className="tabular-nums">{t('{n} pts', { n: autor.pontos })}</span>}
          {!autor.apagada && <span aria-hidden="true">·</span>}
          <span>{tempoRelativo(momento)}</span>
          {extra}
        </div>
      </div>
    </div>
  );
};

/** Subir/descer: o voto negativo só ajuda a ordenar (a contagem nunca fica abaixo de zero). */
export const VotoPilula: React.FC<{
  pontos: number;
  meuVoto: number;
  aoVotar: (valor: -1 | 0 | 1) => void;
  compacto?: boolean;
  desativado?: boolean;
}> = ({ pontos, meuVoto, aoVotar, compacto, desativado }) => {
  const lado = compacto ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div role="group" aria-label={t('Votos')} className="inline-flex items-center rounded-full bg-[#F4F4F2] border border-[#E6E6E3]">
      <button
        type="button"
        disabled={desativado}
        aria-pressed={meuVoto === 1}
        aria-label={t('Voto positivo')}
        onClick={(e) => { e.stopPropagation(); aoVotar(meuVoto === 1 ? 0 : 1); }}
        className={`${lado} rounded-full flex items-center justify-center cursor-pointer hover:bg-[#E6E6E3] ${meuVoto === 1 ? 'text-[#C2410C]' : 'text-[#4A4A4A]'} disabled:opacity-50`}
      >
        <ArrowBigUp className={`w-6 h-6 ${meuVoto === 1 ? 'fill-[#FF6B1A] stroke-[#C2410C]' : ''}`} />
      </button>
      <span className="min-w-[24px] text-center font-condensada text-[17px] font-bold tabular-nums text-[#111111]" aria-live="polite">{Math.max(0, pontos)}</span>
      <button
        type="button"
        disabled={desativado}
        aria-pressed={meuVoto === -1}
        aria-label={t('Voto negativo')}
        onClick={(e) => { e.stopPropagation(); aoVotar(meuVoto === -1 ? 0 : -1); }}
        className={`${lado} rounded-full flex items-center justify-center cursor-pointer hover:bg-[#E6E6E3] ${meuVoto === -1 ? 'text-[#111111]' : 'text-[#4A4A4A]'} disabled:opacity-50`}
      >
        <ArrowBigDown className={`w-6 h-6 ${meuVoto === -1 ? 'fill-[#111111]' : ''}`} />
      </button>
    </div>
  );
};

export const OPERADORES_COMUNIDADE = [
  'CP - Comboios de Portugal',
  'Metro de Lisboa',
  'Metro do Porto',
  'Carris',
  'STCP',
  'Fertagus',
  'Carris Metropolitana',
  'Transtejo Soflusa',
  'UNIR',
  'Outro',
];

/** Texto de erro do servidor: traduz se for uma frase que conhecemos, senão mostra tal como veio */
export const textoDeErro = (err: any, padrao = 'Não foi possível concluir. Tenta outra vez.') => t(String(err?.message || padrao));
