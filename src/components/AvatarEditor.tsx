import React, { useMemo, useRef, useState } from 'react';
import { Lock, Check, Undo2, Shuffle } from 'lucide-react';
import { t } from '../i18n';
import { Folha } from './Folha';
import { CATEGORIAS_AVATAR, CategoriaId, ConfigAvatar, avatarOuPadrao } from '../utils/avatarCatalogo';
import { urlDoAvatar, VistaAvatar } from '../utils/avatarSvg';
import { guardarAvatar } from '../services/comunidade';

const VISTA_DA_CATEGORIA: Record<CategoriaId, VistaAvatar> = {
  cor: 'cabeca', chapeu: 'chapeu', cara: 'cara', roupa: 'corpo', calcado: 'pes', mao: 'mao',
};

interface AvatarEditorProps {
  aberta: boolean;
  onFechar: () => void;
  avatar?: Partial<ConfigAvatar> | null;
  pontos: number;
  /** Quando a pessoa guarda (a app atualiza o perfil sozinha) */
  onGuardado?: (avatar: ConfigAvatar) => void;
}

export const AvatarEditor: React.FC<AvatarEditorProps> = ({ aberta, onFechar, avatar, pontos, onGuardado }) => {
  if (!aberta) return null;
  return <Conteudo onFechar={onFechar} avatar={avatar} pontos={pontos} onGuardado={onGuardado} />;
};

const Conteudo: React.FC<Omit<AvatarEditorProps, 'aberta'>> = ({ onFechar, avatar, pontos, onGuardado }) => {
  const inicial = useMemo(() => avatarOuPadrao(avatar), [avatar]);
  const [cfg, setCfg] = useState<ConfigAvatar>(inicial);
  const [historico, setHistorico] = useState<ConfigAvatar[]>([]);
  const [aba, setAba] = useState<CategoriaId>('chapeu');
  const [aviso, setAviso] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const temporizadorAviso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const categoria = CATEGORIAS_AVATAR.find((c) => c.id === aba)!;
  const alterado = JSON.stringify(cfg) !== JSON.stringify(inicial);

  // Próxima peça por abrir (a mais barata)
  const proxima = useMemo(() => {
    let melhor: { nome: string; rep: number } | null = null;
    for (const c of CATEGORIAS_AVATAR) for (const i of c.itens) {
      if ((i.rep || 0) > pontos && (!melhor || (i.rep as number) < melhor.rep)) melhor = { nome: i.nome, rep: i.rep as number };
    }
    return melhor;
  }, [pontos]);
  const progresso = proxima ? Math.max(4, Math.min(100, Math.round((pontos / proxima.rep) * 100))) : 100;

  const mostrarAviso = (texto: string) => {
    setAviso(texto);
    clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = setTimeout(() => setAviso(''), 3500);
  };

  const escolher = (cat: CategoriaId, id: string, rep?: number) => {
    if ((rep || 0) > pontos) {
      mostrarAviso(t('Faltam {n} pontos de reputação para desbloquear esta peça.', { n: (rep as number) - pontos }));
      return;
    }
    if (cfg[cat] === id) return;
    setHistorico((h) => [...h.slice(-20), cfg]);
    setCfg({ ...cfg, [cat]: id });
  };

  const desfazer = () => {
    setHistorico((h) => {
      if (h.length === 0) return h;
      setCfg(h[h.length - 1]);
      return h.slice(0, -1);
    });
  };

  const aoAcaso = () => {
    const novo: ConfigAvatar = { ...cfg };
    for (const c of CATEGORIAS_AVATAR) {
      const livres = c.itens.filter((i) => (i.rep || 0) <= pontos);
      novo[c.id] = livres[Math.floor(Math.random() * livres.length)].id;
    }
    setHistorico((h) => [...h.slice(-20), cfg]);
    setCfg(novo);
  };

  const guardar = async () => {
    setAGuardar(true);
    try {
      const r = await guardarAvatar(cfg);
      onGuardado?.(r);
      onFechar();
    } catch (err: any) {
      mostrarAviso(t(err?.message || 'Não foi possível guardar. Tenta outra vez.'));
      setAGuardar(false);
    }
  };

  return (
    <Folha
      aberta
      titulo={t('O teu avatar')}
      onFechar={onFechar}
      largura="larga"
      rodape={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="h-12 px-4 rounded-[10px] bg-[#F4F4F2] border border-[#E6E6E3] text-[15px] font-semibold text-[#111111] cursor-pointer"
          >
            {t('Cancelar')}
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!alterado || aGuardar}
            data-teste="guardar-avatar"
            className="flex-1 h-12 rounded-[10px] bg-[#FF6B1A] text-[#111111] text-[15px] font-bold brand-chamfer cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {aGuardar ? t('A guardar…') : t('Guardar avatar')}
          </button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
        {/* Palco com a mascote */}
        <div className="md:sticky md:top-0 md:self-start">
          <div className="relative rounded-[16px] bg-[#111111] overflow-hidden h-[210px] md:h-[330px] flex items-end justify-center">
            <div aria-hidden="true" className="absolute left-1/2 bottom-[-30px] -translate-x-1/2 w-[260px] h-[90px] rounded-[50%] bg-[#FF6B1A] opacity-35 blur-2xl" />
            <img
              src={urlDoAvatar(cfg, 'completa')}
              alt={t('A tua mascote com as peças escolhidas')}
              className="relative h-[196px] md:h-[316px] w-auto select-none"
              draggable={false}
              data-teste="palco-avatar"
            />
            <div className="absolute top-2 right-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={desfazer}
                disabled={historico.length === 0}
                aria-label={t('Desfazer')}
                className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer disabled:opacity-35 hover:bg-white/25"
              >
                <Undo2 className="w-5 h-5 stroke-[2]" />
              </button>
              <button
                type="button"
                onClick={aoAcaso}
                aria-label={t('Escolher peças ao acaso')}
                className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer hover:bg-white/25"
              >
                <Shuffle className="w-5 h-5 stroke-[2]" />
              </button>
            </div>
          </div>
          <div role="status" aria-live="polite" className="min-h-[22px] mt-2 text-[13px] text-[#111111] font-semibold">
            {aviso}
          </div>

          {/* Reputação e próxima peça */}
          <div className="rounded-[12px] bg-[#F4F4F2] border border-[#E6E6E3] p-3 mt-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-[#111111]">{t('Reputação')}</span>
              <span className="font-condensada text-[24px] leading-none font-bold tabular-nums text-[#111111]">{pontos} <span className="text-[14px] text-[#6B6B6B]">{t('pts')}</span></span>
            </div>
            <div className="h-2 rounded-full bg-[#E6E6E3] mt-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso} aria-label={t('Progresso para a próxima peça')}>
              <div className="h-full rounded-full bg-[#FF6B1A]" style={{ width: `${progresso}%` }} />
            </div>
            <p className="text-[12.5px] text-[#4A4A4A] leading-snug mt-2">
              {proxima
                ? t('Faltam {n} pontos para desbloquear: {nome}.', { n: proxima.rep - pontos, nome: t(proxima.nome) })
                : t('Já tens todas as peças desbloqueadas. Vêm aí mais.')}
              {' '}{t('Ganhas pontos ao reportar ocorrências, publicar, responder e quando confirmam o que escreves.')}
            </p>
          </div>
        </div>

        {/* Peças */}
        <div className="min-w-0">
          <div role="tablist" aria-label={t('Tipo de peça')} className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 [scrollbar-width:none]">
            {CATEGORIAS_AVATAR.map((c) => (
              <button
                key={c.id}
                role="tab"
                type="button"
                aria-selected={aba === c.id}
                onClick={() => setAba(c.id)}
                className={`shrink-0 h-11 px-4 rounded-full text-[14px] font-semibold cursor-pointer ${aba === c.id ? 'bg-[#111111] text-[#FFFFFF]' : 'bg-[#F4F4F2] text-[#111111] hover:bg-[#E6E6E3]'}`}
              >
                {t(c.nome)}
              </button>
            ))}
          </div>

          <div role="tabpanel" className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 mt-2">
            {categoria.itens.map((item) => {
              const bloqueado = (item.rep || 0) > pontos;
              const escolhido = cfg[categoria.id] === item.id;
              const miniatura = { ...cfg, [categoria.id]: item.id };
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => escolher(categoria.id, item.id, item.rep)}
                  aria-pressed={escolhido}
                  aria-label={bloqueado ? t('{nome} (bloqueado: {n} pontos)', { nome: t(item.nome), n: item.rep as number }) : t(item.nome)}
                  data-teste={`peca-${categoria.id}-${item.id}`}
                  className={`relative flex flex-col items-center rounded-[12px] border-2 p-1.5 pb-2 cursor-pointer text-left transition-colors ${
                    escolhido ? 'border-[#FF6B1A] bg-[#FFF4EC]' : 'border-[#E6E6E3] bg-[#F4F4F2] hover:border-[#C9C9C4]'
                  }`}
                >
                  <img
                    src={urlDoAvatar(miniatura, VISTA_DA_CATEGORIA[categoria.id])}
                    alt=""
                    aria-hidden="true"
                    className={`w-full aspect-[4/3] object-contain select-none ${bloqueado ? 'opacity-40 grayscale' : ''}`}
                    draggable={false}
                    loading="lazy"
                  />
                  <span className="text-[12.5px] leading-tight font-semibold text-[#111111] text-center mt-1 min-h-[30px] flex items-center">{t(item.nome)}</span>
                  {bloqueado && (
                    <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 h-[22px] px-1.5 rounded-full bg-[#111111] text-[#FFFFFF] text-[11px] font-bold">
                      <Lock className="w-3 h-3 stroke-[2.5]" />{item.rep}
                    </span>
                  )}
                  {escolhido && (
                    <span className="absolute top-1.5 right-1.5 w-[22px] h-[22px] rounded-full bg-[#FF6B1A] text-[#111111] flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Folha>
  );
};

