import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { lerPreferenciaContagem, mudarPreferenciaContagem } from '../services/estatisticas';

export const CONTACTO = 'contacto@parou.pt';
export const TELEFONE = '913 488 258';
export const TELEFONE_LINK = '+351913488258';
export const ATUALIZADO = '10 de outubro de 2026';

export function Secao({ titulo, children, id }: { titulo: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-2 scroll-mt-20">
      <h2 className="text-[17px] font-bold text-[#111111] leading-snug">{titulo}</h2>
      <div className="text-[14.5px] text-[#2B2B2B] leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

/** Interruptor da contagem anónima de utilizadores (página de Privacidade). */
export function PreferenciaContagem() {
  const [contar, setContar] = useState<boolean | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  useEffect(() => { void lerPreferenciaContagem().then(setContar); }, []);
  if (contar === null) return null;
  const mudar = async () => {
    setAGuardar(true);
    const ok = await mudarPreferenciaContagem(!contar);
    if (ok) setContar(!contar);
    setAGuardar(false);
  };
  return (
    <button
      onClick={mudar}
      disabled={aGuardar}
      data-teste="preferencia-contagem"
      className="mt-1 h-10 px-4 rounded-[10px] border border-[#E6E6E3] bg-[#F4F4F2] text-[13.5px] font-semibold text-[#111111] cursor-pointer disabled:opacity-60"
    >
      {contar ? t('Não contar as minhas visitas') : t('Voltar a contar as minhas visitas')}
    </button>
  );
}

