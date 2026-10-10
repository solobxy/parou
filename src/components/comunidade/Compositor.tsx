import React, { useState } from 'react';
import { MapPin, Check } from 'lucide-react';
import { t } from '../../i18n';
import { Folha } from '../Folha';
import { publicar, TIPOS_CONVERSA, TipoConversa } from '../../services/comunidade';
import { ROTULO_TIPO, OPERADORES_COMUNIDADE, textoDeErro } from './pecas';
import { posicaoAtual } from '../../utils/posicao';

const DICA_TIPO: Record<TipoConversa, string> = {
  queixa: 'Algo correu mal',
  pergunta: 'Preciso de ajuda',
  elogio: 'Algo correu bem',
  conversa: 'Falar de transportes',
};

interface CompositorProps {
  aberta: boolean;
  onFechar: () => void;
  onPublicado: (id: string) => void;
  operadorInicial?: string;
}

export const Compositor: React.FC<CompositorProps> = (props) => (props.aberta ? <Formulario {...props} /> : null);

const Formulario: React.FC<CompositorProps> = ({ onFechar, onPublicado, operadorInicial }) => {
  const [tipo, setTipo] = useState<TipoConversa>('conversa');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [operador, setOperador] = useState(operadorInicial || '');
  const [linha, setLinha] = useState('');
  const [zona, setZona] = useState<{ lat: number; lon: number } | null>(null);
  const [estadoZona, setEstadoZona] = useState<'' | 'a-obter' | 'ok' | 'erro'>('');
  const [erro, setErro] = useState('');
  const [aEnviar, setAEnviar] = useState(false);

  const alternarZona = async (ligar: boolean) => {
    if (!ligar) { setZona(null); setEstadoZona(''); return; }
    setEstadoZona('a-obter');
    try { setZona(await posicaoAtual()); setEstadoZona('ok'); } catch { setZona(null); setEstadoZona('erro'); }
  };

  const valido = titulo.trim().length >= 4;
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido || aEnviar) return;
    setAEnviar(true);
    setErro('');
    try {
      const id = await publicar({
        titulo: titulo.trim(),
        texto: texto.trim() || undefined,
        tipo,
        operador: operador || undefined,
        linha: operador && linha.trim() ? linha.trim() : undefined,
        ...(zona ? { lat: zona.lat, lon: zona.lon } : {}),
      });
      onPublicado(id);
    } catch (err: any) {
      setErro(err?.codigo === 'sem_sessao' ? t('Entra na tua conta para publicar.') : textoDeErro(err));
      setAEnviar(false);
    }
  };

  const campo = 'w-full px-3 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[10px] text-[16px] text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111]';

  return (
    <Folha
      aberta
      titulo={t('Nova publicação')}
      onFechar={onFechar}
      rodape={
        <div className="flex items-center gap-2">
          <button type="button" onClick={onFechar} className="h-12 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[15px] font-semibold text-[#111111] cursor-pointer">
            {t('Cancelar')}
          </button>
          <button
            type="submit"
            form="form-nova-publicacao"
            disabled={!valido || aEnviar}
            data-teste="publicar"
            className="flex-1 h-12 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[15px] font-bold brand-chamfer cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {aEnviar ? t('A publicar…') : t('Publicar')}
          </button>
        </div>
      }
    >
      <form id="form-nova-publicacao" onSubmit={enviar} className="space-y-4 pt-2">
        <fieldset>
          <legend className="text-[13px] font-semibold text-[#4A4A4A] mb-1.5">{t('Sobre o quê?')}</legend>
          <div role="radiogroup" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TIPOS_CONVERSA.map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={tipo === x}
                onClick={() => setTipo(x)}
                className={`min-h-[56px] rounded-[10px] border-2 px-2.5 py-1.5 text-left cursor-pointer ${tipo === x ? 'border-[#111111] bg-[#111111] text-[#FFFFFF]' : 'border-[#E6E6E3] bg-[#FFFFFF] text-[#111111] hover:border-[#C9C9C4]'}`}
              >
                <span className="block text-[14.5px] font-bold leading-tight">{t(ROTULO_TIPO[x])}</span>
                <span className={`block text-[12px] leading-tight mt-0.5 ${tipo === x ? 'text-[#D9D9D6]' : 'text-[#6B6B6B]'}`}>{t(DICA_TIPO[x])}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="pub-titulo" className="flex justify-between text-[13px] font-semibold text-[#4A4A4A] mb-1.5">
            <span>{t('Título')}</span><span className="font-normal text-[#6B6B6B] tabular-nums">{titulo.length}/120</span>
          </label>
          <input
            id="pub-titulo"
            data-foco
            value={titulo}
            maxLength={120}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={t('Ex.: A linha 500 não passou esta manhã')}
            autoComplete="off"
            className={`${campo} h-12`}
          />
        </div>

        <div>
          <label htmlFor="pub-texto" className="flex justify-between text-[13px] font-semibold text-[#4A4A4A] mb-1.5">
            <span>{t('Mais detalhes (opcional)')}</span><span className="font-normal text-[#6B6B6B] tabular-nums">{texto.length}/2000</span>
          </label>
          <textarea
            id="pub-texto"
            value={texto}
            maxLength={2000}
            rows={5}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t('Conta o que aconteceu, a que horas e onde.')}
            className={`${campo} py-2.5 resize-y min-h-[120px]`}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
          <div>
            <label htmlFor="pub-operador" className="block text-[13px] font-semibold text-[#4A4A4A] mb-1.5">{t('Operador (opcional)')}</label>
            <select id="pub-operador" value={operador} onChange={(e) => setOperador(e.target.value)} className={`${campo} h-12`}>
              <option value="">{t('Nenhum em especial')}</option>
              {OPERADORES_COMUNIDADE.map((o) => <option key={o} value={o}>{t(o)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="pub-linha" className="block text-[13px] font-semibold text-[#4A4A4A] mb-1.5">{t('Linha')}</label>
            <input id="pub-linha" value={linha} maxLength={20} disabled={!operador} onChange={(e) => setLinha(e.target.value)} placeholder="500" autoComplete="off" className={`${campo} h-12 disabled:opacity-50`} />
          </div>
        </div>

        <div className="rounded-[12px] border border-[#E6E6E3] p-3">
          <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={estadoZona === 'ok' || estadoZona === 'a-obter'}
              onChange={(e) => alternarZona(e.target.checked)}
              className="mt-1 w-5 h-5 accent-[#FF6B1A] shrink-0"
            />
            <span className="text-[14px] leading-snug text-[#111111]">
              <span className="font-semibold inline-flex items-center gap-1"><MapPin className="w-4 h-4 stroke-[2]" aria-hidden="true" />{t('Mostrar a quem está por perto')}</span>
              <span className="block text-[12.5px] text-[#6B6B6B] mt-0.5">{t('Guarda só a tua zona aproximada (cerca de 1 km), nunca o sítio exato.')}</span>
            </span>
          </label>
          <div role="status" aria-live="polite" className="text-[12.5px] mt-1 min-h-[18px] pl-8">
            {estadoZona === 'a-obter' && <span className="text-[#6B6B6B]">{t('A obter a tua zona…')}</span>}
            {estadoZona === 'ok' && <span className="text-[#14693A] inline-flex items-center gap-1 font-semibold"><Check className="w-3.5 h-3.5 stroke-[3]" aria-hidden="true" />{t('Zona aproximada guardada')}</span>}
            {estadoZona === 'erro' && <span className="text-[#9F1D14]">{t('Não foi possível obter a localização. Verifica a permissão no browser.')}</span>}
          </div>
        </div>

        <p className="text-[12.5px] text-[#4A4A4A] leading-snug bg-[#F4F4F2] rounded-[10px] p-3">
          {t('Sem links, telefones nem dados de pessoas. Não descrevas nem fotografes pessoas: fala do serviço, não de quem lá está.')}
        </p>

        {erro && <p role="alert" className="text-[13.5px] font-semibold text-[#9F1D14] bg-[#FDECEA] rounded-[10px] p-3">{erro}</p>}
      </form>
    </Folha>
  );
};
