import React, { useMemo, useState } from 'react';
import { Check, MapPin, Search, ChevronRight } from 'lucide-react';
import { Folha } from './Folha';
import { CIDADES } from '../data/cidades';
import { MAX_CIDADES, listaDeCidades } from '../utils/cidades';
import { t, tn } from '../i18n';

const semAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Janela para escolher as cidades (até MAX_CIDADES). Cada toque aplica logo. */
export const SeletorCidades: React.FC<{
  aberto: boolean;
  onFechar: () => void;
  escolhidas: string[];
  onMudar: (lista: string[]) => void;
}> = ({ aberto, onFechar, escolhidas, onMudar }) => {
  const [filtro, setFiltro] = useState('');
  const lista = useMemo(() => {
    const f = semAcentos(filtro.trim());
    return CIDADES.filter((c) => !f || semAcentos(c.nome).includes(f));
  }, [filtro]);
  const cheio = escolhidas.length >= MAX_CIDADES;

  const alternar = (slug: string) => {
    if (escolhidas.includes(slug)) onMudar(escolhidas.filter((s) => s !== slug));
    else if (!cheio) onMudar([...escolhidas, slug]);
  };

  return (
    <Folha
      aberta={aberto}
      titulo={t('As minhas cidades')}
      onFechar={() => { setFiltro(''); onFechar(); }}
      rodape={(
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-teste="cidades-limpar"
            onClick={() => onMudar([])}
            disabled={escolhidas.length === 0}
            className="h-12 px-4 rounded-[12px] border border-[#E6E6E3] bg-[#FFFFFF] text-[14px] font-semibold text-[#111111] disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            {t('Ver todas')}
          </button>
          <button
            type="button"
            data-teste="cidades-concluido"
            onClick={() => { setFiltro(''); onFechar(); }}
            className="flex-1 h-12 rounded-[12px] brand-chamfer bg-[#FF6B1A] text-[#111111] font-bold text-[15px] cursor-pointer"
          >
            {t('Concluído')}
          </button>
        </div>
      )}
    >
      <p className="text-[13.5px] text-[#6B6B6B] leading-snug">
        {t('Escolhe as cidades onde viajas. Nos Horários só vês as linhas que passam nelas, sem o resto do país.')}
      </p>
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2] pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder={t('Procurar cidade')}
          aria-label={t('Procurar cidade')}
          autoComplete="off"
          className="w-full h-11 pl-9 pr-3 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[10px] text-[14px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111]"
        />
      </div>
      <p className="mt-2 text-[12.5px] text-[#6B6B6B]" aria-live="polite">
        {escolhidas.length === 0
          ? t('Nenhuma escolhida: vês as linhas de todo o país.')
          : cheio
            ? tn(escolhidas.length, '{n} cidade escolhida (o máximo).', '{n} cidades escolhidas (o máximo).')
            : tn(escolhidas.length, '{n} cidade escolhida.', '{n} cidades escolhidas.')}
      </p>
      <ul className="mt-1 divide-y divide-[#E6E6E3]" data-teste="lista-cidades">
        {lista.map((c) => {
          const ativa = escolhidas.includes(c.slug);
          const bloqueada = !ativa && cheio;
          return (
            <li key={c.slug}>
              <button
                type="button"
                role="checkbox"
                aria-checked={ativa}
                disabled={bloqueada}
                data-teste="cidade"
                data-cidade={c.slug}
                onClick={() => alternar(c.slug)}
                className={`w-full min-h-[48px] flex items-center justify-between gap-3 text-left cursor-pointer disabled:cursor-default ${bloqueada ? 'opacity-40' : 'active:bg-[#F4F4F2]'}`}
              >
                <span className="text-[15px] font-medium text-[#111111]">{c.nome}</span>
                <span
                  className={`shrink-0 w-6 h-6 rounded-[7px] border-2 flex items-center justify-center ${ativa ? 'bg-[#111111] border-[#111111] text-[#FFFFFF]' : 'bg-[#FFFFFF] border-[#D4D4D0] text-transparent'}`}
                  aria-hidden="true"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                </span>
              </button>
            </li>
          );
        })}
        {lista.length === 0 && <li className="py-6 text-center text-[13.5px] text-[#6B6B6B]">{t('Nenhuma cidade com esse nome.')}</li>}
      </ul>
    </Folha>
  );
};

/** Botão-resumo ("As minhas cidades: Porto e Braga") que abre o seletor */
export const BotaoCidades: React.FC<{ escolhidas: string[]; onAbrir: () => void; className?: string }> = ({ escolhidas, onAbrir, className = '' }) => (
  <button
    type="button"
    onClick={onAbrir}
    data-teste="botao-cidades"
    className={`min-h-[44px] max-w-full inline-flex items-center gap-2 pl-3 pr-2.5 rounded-[10px] text-[13px] font-semibold cursor-pointer ${escolhidas.length ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] text-[#111111]'} ${className}`}
  >
    <MapPin className="w-4 h-4 stroke-[2.25] shrink-0" aria-hidden="true" />
    <span className="truncate">{escolhidas.length ? listaDeCidades(escolhidas, t('e')) : t('Cidades: todas')}</span>
    <ChevronRight className="w-4 h-4 stroke-[2.25] shrink-0 opacity-70" aria-hidden="true" />
  </button>
);
