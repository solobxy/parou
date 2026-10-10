import React, { useState } from 'react';
import { Flag, UserX, Trash2, Link2, ChevronRight } from 'lucide-react';
import { t } from '../../i18n';
import { Folha } from '../Folha';
import { denunciar, bloquearAutor, apagarConteudo, MotivoDenuncia } from '../../services/comunidade';
import { textoDeErro } from './pecas';

export interface AlvoAcoes {
  id: string;
  meu: boolean;
  denunciei: boolean;
  /** só as publicações têm ligação para copiar */
  ligacao?: string;
  /** o autor ainda existe (não se bloqueiam contas apagadas) */
  podeBloquear: boolean;
}

const MOTIVOS: Array<{ id: MotivoDenuncia; nome: string; ajuda: string }> = [
  { id: 'spam', nome: 'Spam ou publicidade', ajuda: 'Anúncios, links ou repetição' },
  { id: 'insulto', nome: 'Insultos ou ódio', ajuda: 'Ataques a pessoas ou grupos' },
  { id: 'dados-pessoais', nome: 'Dados pessoais', ajuda: 'Telefones, emails, descrições de pessoas' },
  { id: 'falso', nome: 'Informação falsa', ajuda: 'Algo que sabes que não é verdade' },
  { id: 'outro', nome: 'Outro motivo', ajuda: 'Não encaixa nos anteriores' },
];

interface Props {
  alvo: AlvoAcoes | null;
  onFechar: () => void;
  /** depois de uma ação que muda a lista (bloquear, apagar, denunciar) */
  onMudou: (o: 'denunciado' | 'bloqueado' | 'apagado') => void;
  /** pede para entrar (quando ainda não há sessão) */
  temSessao: boolean;
  onPedirLogin: () => void;
}

export const AcoesConteudo: React.FC<Props> = (props) => (props.alvo ? <Menu key={props.alvo.id} {...props} alvo={props.alvo} /> : null);

const Menu: React.FC<Props & { alvo: AlvoAcoes }> = ({ alvo, onFechar, onMudou, temSessao, onPedirLogin }) => {
  const [vista, setVista] = useState<'menu' | 'denunciar' | 'bloquear' | 'apagar'>('menu');
  const [motivo, setMotivo] = useState<MotivoDenuncia>('spam');
  const [aTrabalhar, setATrabalhar] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const executar = async (f: () => Promise<void>, depois: 'denunciado' | 'bloqueado' | 'apagado') => {
    setATrabalhar(true);
    setErro('');
    try { await f(); onMudou(depois); onFechar(); }
    catch (err: any) { setErro(textoDeErro(err)); setATrabalhar(false); }
  };

  const linha = 'w-full min-h-[56px] flex items-center gap-3 px-3 rounded-[12px] text-left cursor-pointer hover:bg-[#F4F4F2] text-[15.5px] font-semibold text-[#111111]';
  const entrar = () => { onFechar(); onPedirLogin(); };

  const titulo = vista === 'denunciar' ? t('Denunciar') : vista === 'bloquear' ? t('Bloquear utilizador') : vista === 'apagar' ? t('Apagar') : t('Mais opções');

  return (
    <Folha aberta titulo={titulo} onFechar={onFechar}>
      {vista === 'menu' && (
        <div className="pt-1 space-y-1">
          {alvo.ligacao && (
            <button type="button" className={linha} data-foco onClick={async () => {
              try { await navigator.clipboard.writeText(alvo.ligacao as string); setAviso(t('Ligação copiada.')); } catch { setAviso(alvo.ligacao as string); }
            }}>
              <Link2 className="w-5 h-5 stroke-[2]" aria-hidden="true" /><span className="flex-1">{t('Copiar ligação')}</span>
            </button>
          )}
          {aviso && <p role="status" className="px-3 text-[13px] text-[#14693A] font-semibold break-all">{aviso}</p>}
          {!alvo.meu && (
            <button type="button" className={linha} onClick={() => (temSessao ? setVista('denunciar') : entrar())} disabled={alvo.denunciei}>
              <Flag className="w-5 h-5 stroke-[2]" aria-hidden="true" />
              <span className="flex-1">{alvo.denunciei ? t('Já denunciaste isto') : t('Denunciar')}</span>
              {!alvo.denunciei && <ChevronRight className="w-4 h-4 text-[#6B6B6B]" aria-hidden="true" />}
            </button>
          )}
          {!alvo.meu && alvo.podeBloquear && (
            <button type="button" className={linha} onClick={() => (temSessao ? setVista('bloquear') : entrar())}>
              <UserX className="w-5 h-5 stroke-[2]" aria-hidden="true" /><span className="flex-1">{t('Bloquear este utilizador')}</span>
              <ChevronRight className="w-4 h-4 text-[#6B6B6B]" aria-hidden="true" />
            </button>
          )}
          {alvo.meu && (
            <button type="button" className={`${linha} text-[#9F1D14]`} onClick={() => setVista('apagar')}>
              <Trash2 className="w-5 h-5 stroke-[2]" aria-hidden="true" /><span className="flex-1">{t('Apagar')}</span>
            </button>
          )}
        </div>
      )}

      {vista === 'denunciar' && (
        <div className="pt-1">
          <p className="text-[14px] text-[#4A4A4A] mb-3">{t('Porque queres denunciar? A denúncia é anónima. Com 3 denúncias de contas diferentes, fica escondido até ser revisto.')}</p>
          <div role="radiogroup" className="space-y-1.5">
            {MOTIVOS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={motivo === m.id}
                onClick={() => setMotivo(m.id)}
                className={`w-full min-h-[56px] rounded-[12px] border-2 px-3 py-2 text-left cursor-pointer ${motivo === m.id ? 'border-[#111111] bg-[#F4F4F2]' : 'border-[#E6E6E3]'}`}
              >
                <span className="block text-[15px] font-bold text-[#111111]">{t(m.nome)}</span>
                <span className="block text-[12.5px] text-[#6B6B6B]">{t(m.ajuda)}</span>
              </button>
            ))}
          </div>
          {erro && <p role="alert" className="mt-3 text-[13.5px] font-semibold text-[#9F1D14]">{erro}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setVista('menu')} className="h-12 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[15px] font-semibold cursor-pointer">{t('Voltar')}</button>
            <button type="button" disabled={aTrabalhar} onClick={() => executar(() => denunciar(alvo.id, motivo).then(() => undefined), 'denunciado')} className="flex-1 h-12 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[15px] font-bold cursor-pointer disabled:opacity-50">
              {aTrabalhar ? t('A enviar…') : t('Enviar denúncia')}
            </button>
          </div>
        </div>
      )}

      {vista === 'bloquear' && (
        <div className="pt-1">
          <p className="text-[14.5px] text-[#111111] leading-snug">{t('Deixas de ver as publicações e respostas desta pessoa. Ela não sabe que a bloqueaste. Podes desbloquear no teu perfil.')}</p>
          {erro && <p role="alert" className="mt-3 text-[13.5px] font-semibold text-[#9F1D14]">{erro}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setVista('menu')} className="h-12 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[15px] font-semibold cursor-pointer">{t('Voltar')}</button>
            <button type="button" disabled={aTrabalhar} onClick={() => executar(() => bloquearAutor(alvo.id), 'bloqueado')} className="flex-1 h-12 rounded-[10px] bg-[#111111] text-[#FFFFFF] text-[15px] font-bold cursor-pointer disabled:opacity-50">
              {aTrabalhar ? t('A bloquear…') : t('Bloquear')}
            </button>
          </div>
        </div>
      )}

      {vista === 'apagar' && (
        <div className="pt-1">
          <p className="text-[14.5px] text-[#111111] leading-snug">{t('O texto desaparece para toda a gente. As respostas dos outros ficam. Isto não se pode desfazer.')}</p>
          {erro && <p role="alert" className="mt-3 text-[13.5px] font-semibold text-[#9F1D14]">{erro}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => setVista('menu')} className="h-12 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[15px] font-semibold cursor-pointer">{t('Voltar')}</button>
            <button type="button" disabled={aTrabalhar} onClick={() => executar(() => apagarConteudo(alvo.id), 'apagado')} className="flex-1 h-12 rounded-[10px] bg-[#D92D20] text-[#FFFFFF] text-[15px] font-bold cursor-pointer disabled:opacity-50">
              {aTrabalhar ? t('A apagar…') : t('Sim, apagar')}
            </button>
          </div>
        </div>
      )}
    </Folha>
  );
};
