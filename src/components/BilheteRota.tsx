import { Ticket, ArrowUpRight } from 'lucide-react';
import { t, LOCALE } from '../i18n';
import type { TarifaViagem } from '../types/perto';

/** Página oficial da app Anda (pagar a viagem com o telemóvel, no Andante) */
const PAGINA_ANDA = 'https://andante.pt/comprar/app-anda/';

/** "1,40 €" (ou "€1.40" em inglês) */
export function textoEuros(valor: number): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
}

/** "1 h", "1 h 15 min" */
function textoDuracao(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Preço curto no resumo da opção (como no Google Maps): só o valor, com o título para quem usa leitor de ecrã */
export function PrecoRota({ tarifa }: { tarifa: TarifaViagem }) {
  return (
    <span className="ml-auto pl-2 shrink-0 text-[13px] font-semibold text-[#6B6B6B] tabular-nums whitespace-nowrap" data-teste="preco-rota">
      <span className="sr-only">{t('Bilhete Andante Z{n}', { n: tarifa.zonas })}: </span>
      {textoEuros(tarifa.preco)}
    </span>
  );
}

/**
 * O bilhete da viagem, nos detalhes da opção: o título Andante e o preço oficial, quanto tempo vale, o cartão Azul para
 * quem não o tem, e as ligações oficiais (tarifário e app Anda). Só aparece quando o servidor tem a certeza.
 */
export function BilheteRota({ tarifa }: { tarifa: TarifaViagem }) {
  const ligacao = 'inline-flex items-center gap-0.5 min-h-[40px] text-[13px] font-semibold text-[#111111] underline underline-offset-2 decoration-[#6B6B6B] hover:decoration-[#111111] rounded-[4px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111111]';
  return (
    <div className="mt-3 grid grid-cols-[20px_minmax(0,1fr)] gap-x-2" data-teste="bilhete-rota">
      <Ticket className="w-5 h-5 mt-px text-[#111111] stroke-[2]" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-[#111111] leading-snug">
          {t('Andante Z{n}', { n: tarifa.zonas })}
          <span className="tabular-nums">{` · ${textoEuros(tarifa.preco)}`}</span>
        </p>
        <p className="mt-0.5 text-[12.5px] text-[#6B6B6B] leading-snug">
          {t('Viagem simples: vale {d} desde a 1.ª validação.', { d: textoDuracao(tarifa.duracaoMin) })}
          {tarifa.cartao ? ` ${t('Se ainda não tens cartão Andante Azul, custa mais {p}.', { p: textoEuros(tarifa.cartao) })}` : ''}
        </p>
        <p className="flex flex-wrap items-center gap-x-4">
          <a href={tarifa.fonte} target="_blank" rel="noopener noreferrer" className={ligacao} data-teste="bilhete-fonte">
            {t('Tarifário oficial')}
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.25]" aria-hidden="true" />
          </a>
          <a href={PAGINA_ANDA} target="_blank" rel="noopener noreferrer" className={ligacao}>
            {t('App Anda')}
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.25]" aria-hidden="true" />
          </a>
        </p>
      </div>
    </div>
  );
}
