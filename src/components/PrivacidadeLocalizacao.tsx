import React from 'react';
import { Lock, Server, Smartphone, MapPin, ChevronRight, ShieldCheck } from 'lucide-react';
import { Folha } from './Folha';
import { t } from '../i18n';

/**
 * Linha curta e visível sobre o que se faz com a localização. Toda a linha é um botão (alvo de toque ≥ 44 px)
 * que abre a janela com o detalhe.
 */
export const NotaLocalizacao: React.FC<{ onAbrir: () => void; className?: string; centrada?: boolean }> = ({ onAbrir, className = '', centrada = false }) => (
  <button
    type="button"
    onClick={onAbrir}
    data-teste="nota-localizacao"
    className={`group w-full min-h-[44px] flex items-center gap-2 ${centrada ? 'justify-center text-center' : 'text-left'} text-[12.5px] leading-snug text-[#6B6B6B] cursor-pointer ${className}`}
  >
    <Lock className="w-3.5 h-3.5 stroke-[2.25] shrink-0 text-[#6B6B6B]" aria-hidden="true" />
    <span className="min-w-0">
      {t('Só serve para mostrar o que passa perto de ti. Não fica guardada no servidor.')}{' '}
      <span className="font-semibold text-[#111111] underline underline-offset-2">{t('Saber mais')}</span>
    </span>
  </button>
);

interface FolhaLocalizacaoProps {
  aberta: boolean;
  onFechar: () => void;
  /** GPS ligado (não um local escolhido à mão): mostra o botão para desligar e apagar */
  ativa: boolean;
  onDesligar: () => void;
  onPrivacidade?: () => void;
}

const Linha: React.FC<{ icone: React.ReactNode; titulo: string; texto: string }> = ({ icone, titulo, texto }) => (
  <li className="flex items-start gap-3 py-3">
    <span className="shrink-0 mt-0.5 w-9 h-9 rounded-full bg-[#F4F4F2] text-[#111111] flex items-center justify-center" aria-hidden="true">{icone}</span>
    <span className="min-w-0">
      <span className="block text-[14.5px] font-semibold text-[#111111] leading-tight">{titulo}</span>
      <span className="block mt-0.5 text-[13.5px] text-[#6B6B6B] leading-snug">{texto}</span>
    </span>
  </li>
);

/** O que se faz (e o que não se faz) com a localização, e como a apagar */
export const FolhaLocalizacao: React.FC<FolhaLocalizacaoProps> = ({ aberta, onFechar, ativa, onDesligar, onPrivacidade }) => (
  <Folha
    aberta={aberta}
    titulo={t('A tua localização')}
    onFechar={onFechar}
    rodape={(
      <div className="flex flex-col gap-2">
        {ativa && (
          <button
            type="button"
            data-teste="desligar-localizacao"
            onClick={() => { onDesligar(); onFechar(); }}
            className="w-full h-12 rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] text-[14.5px] font-semibold text-[#111111] active:bg-[#F4F4F2] cursor-pointer"
          >
            {t('Desligar e apagar a posição guardada')}
          </button>
        )}
        {onPrivacidade && (
          <button
            type="button"
            onClick={() => { onFechar(); onPrivacidade(); }}
            className="w-full min-h-[44px] flex items-center justify-center gap-1 text-[13.5px] font-semibold text-[#111111] cursor-pointer"
          >
            {t('Ler a política de privacidade')}
            <ChevronRight className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />
          </button>
        )}
      </div>
    )}
  >
    <p data-foco tabIndex={-1} className="mt-1 text-[14px] text-[#111111] leading-snug outline-none">
      {t('Usamos a tua localização para uma coisa só: mostrar as paragens e os transportes perto de ti.')}
    </p>
    <ul className="mt-1 divide-y divide-[#E6E6E3]">
      <Linha
        icone={<Server className="w-[18px] h-[18px] stroke-[2]" />}
        titulo={t('No servidor')}
        texto={t('A posição segue para o nosso servidor só para calcular o que está perto, e não fica guardada lá.')}
      />
      <Linha
        icone={<Smartphone className="w-[18px] h-[18px] stroke-[2]" />}
        titulo={t('No teu telemóvel')}
        texto={t('Fica a última posição, até 12 horas, para a app abrir logo no sítio certo.')}
      />
      <Linha
        icone={<ShieldCheck className="w-[18px] h-[18px] stroke-[2]" />}
        titulo={t('Nunca')}
        texto={t('Não vendemos a tua localização nem a usamos para publicidade.')}
      />
      <Linha
        icone={<MapPin className="w-[18px] h-[18px] stroke-[2]" />}
        titulo={t('Sem localização também funciona')}
        texto={t('Podes escolher um local à mão e ver o que passa por lá.')}
      />
    </ul>
    <p className="mt-2 text-[12.5px] text-[#6B6B6B] leading-snug">
      {t('Para retirar a autorização ao browser, usa as definições do telemóvel ou do browser.')}
    </p>
  </Folha>
);
