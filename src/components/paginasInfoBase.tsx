import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { lerPreferenciaContagem, mudarPreferenciaContagem } from '../services/estatisticas';
import { apagarConta, observarSessao, utilizadorAutenticado } from '../services/conta';
import { Trash2 } from 'lucide-react';

export const CONTACTO = 'contacto@parou.pt';
export const TELEFONE = '913 488 258';
export const TELEFONE_LINK = '+351913488258';
export const ATUALIZADO = '11 de outubro de 2026';

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

/** Formulário para apagar a conta nesta página (só aparece com sessão iniciada). Partilhado com a versão inglesa. */
export function ApagarAqui() {
  const [conta, setConta] = React.useState(utilizadorAutenticado());
  const [palavra, setPalavra] = React.useState('');
  const [estado, setEstado] = React.useState<'repouso' | 'a-apagar' | 'apagada'>('repouso');
  const [erro, setErro] = React.useState('');
  React.useEffect(() => observarSessao(setConta), []);
  if (estado === 'apagada') {
    return (
      <div role="status" className="rounded-[14px] bg-[#F4F4F2] p-4 text-[14px] text-[#111111] leading-snug">
        <strong>{t('Conta apagada.')}</strong> {t('Já não tens conta na PAROU. Obrigado por teres usado.')}
      </div>
    );
  }
  if (!conta) return null;
  const apagar = async () => {
    setEstado('a-apagar');
    setErro('');
    const r = await apagarConta(palavra);
    if (r === 'ok') { setEstado('apagada'); return; }
    setEstado('repouso');
    setErro(r === 'palavra-errada' ? t('A palavra-passe não está certa.') : t('Não foi possível apagar agora. Tenta outra vez ou escreve para contacto@parou.pt.'));
  };
  return (
    <div className="rounded-[14px] border border-[#F3C5C1] bg-[#FDF2F1] p-4 space-y-3" data-teste="apagar-aqui">
      <p className="text-[14px] text-[#111111] leading-snug">
        {t('Tens a sessão iniciada como')} <strong className="break-all">{conta.email || conta.displayName}</strong>. {t('Escreve a palavra-passe para apagares já esta conta. Não se pode desfazer.')}
      </p>
      <label className="block">
        <span className="text-[12.5px] font-semibold text-[#111111]">{t('Palavra-passe')}</span>
        <input
          type="password"
          value={palavra}
          onChange={(e) => setPalavra(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full px-3 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-[16px] text-[#111111] min-h-[48px] focus:outline-none focus:border-[#111111]"
        />
      </label>
      {erro && <p role="alert" className="text-[13px] text-[#D92D20]">{erro}</p>}
      <button
        onClick={apagar}
        disabled={estado === 'a-apagar' || palavra.length === 0}
        className="h-12 px-5 rounded-[12px] bg-[#D92D20] text-[#FFFFFF] text-[15px] font-semibold cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
      >
        <Trash2 className="w-4 h-4" /> {estado === 'a-apagar' ? t('A apagar…') : t('Sim, apagar a conta')}
      </button>
    </div>
  );
}
