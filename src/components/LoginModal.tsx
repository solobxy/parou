import React, { useState } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { loginWithEmail, registerWithEmail, pedirRecuperacao, redefinirPalavraPasse } from '../services/conta';
import { t } from '../i18n';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Código do link de recuperação (?redefinir=...), quando a pessoa chega pelo email */
  codigoRedefinir?: string | null;
}

type Modo = 'login' | 'register' | 'forgot' | 'reset';

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess, codigoRedefinir }) => {
  const [mode, setMode] = useState<Modo>(codigoRedefinir ? 'reset' : 'login');
  const [aviso, setAviso] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const mudarModo = (m: Modo) => { setMode(m); setErrorMsg(''); setAviso(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setAviso('');

    if (mode === 'forgot') {
      if (!email.trim()) { setErrorMsg('Escreve o teu email.'); return; }
      setLoading(true);
      try {
        const enviado = await pedirRecuperacao(email.trim());
        if (enviado) setAviso('Se existir uma conta com este email, enviámos um link para criares uma palavra-passe nova. Vê também o lixo eletrónico.');
        else setErrorMsg('A recuperação por email ainda não está ativa. Escreve para diniscash@gmail.com e ajudamos.');
      } catch (err: any) {
        setErrorMsg(err?.message || 'Não foi possível concluir. Tenta outra vez.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'reset') {
      if (password.length < 8) { setErrorMsg('A palavra-passe tem de ter pelo menos 8 caracteres.'); return; }
      setLoading(true);
      try {
        await redefinirPalavraPasse(codigoRedefinir || '', password);
        if (onSuccess) onSuccess();
        onClose();
      } catch (err: any) {
        setErrorMsg(err?.message || 'Não foi possível concluir. Tenta outra vez.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Preencha todos os campos.');
      return;
    }

    if (mode === 'register' && password.length < 8) {
      setErrorMsg('A palavra-passe tem de ter pelo menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        if (!name.trim()) {
          setErrorMsg('Insira o seu nome.');
          setLoading(false);
          return;
        }
        await registerWithEmail(email.trim(), password, name.trim());
      } else {
        await loginWithEmail(email.trim(), password);
      }
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      // O servidor já responde em português com uma mensagem clara
      setErrorMsg(err?.message || 'Não foi possível concluir. Tenta outra vez.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-sm rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] p-5 shadow-lg text-[#111111]"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-3.5 top-3.5 p-1 text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          aria-label={t('Fechar')}
        >
          <X className="w-5 h-5 stroke-[2]" />
        </button>

        <div className="pb-3 border-b border-[#E6E6E3]">
          <h3 className="text-lg font-bold text-[#111111]">
            {mode === 'login' ? t('Iniciar sessão') : mode === 'register' ? t('Criar conta') : mode === 'forgot' ? t('Recuperar palavra-passe') : t('Nova palavra-passe')}
          </h3>
        </div>

        {/* Mode Switcher */}
        {(mode === 'login' || mode === 'register') && (
          <div className="flex rounded-[8px] bg-[#F4F4F2] p-1 border border-[#E6E6E3] my-3.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => mudarModo('login')}
              className={`flex-1 py-1.5 rounded-[6px] transition-colors cursor-pointer min-h-[36px] ${
                mode === 'login' ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              {t('Iniciar sessão')}
            </button>
            <button
              type="button"
              onClick={() => mudarModo('register')}
              className={`flex-1 py-1.5 rounded-[6px] transition-colors cursor-pointer min-h-[36px] ${
                mode === 'register' ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              {t('Criar conta')}
            </button>
          </div>
        )}

        {mode === 'forgot' && (
          <p className="text-xs text-[#6B6B6B] my-3">{t('Escreve o email da tua conta e enviamos-te um link para criares uma palavra-passe nova.')}</p>
        )}
        {mode === 'reset' && (
          <p className="text-xs text-[#6B6B6B] my-3">{t('Escolhe uma palavra-passe nova para a tua conta.')}</p>
        )}

        {errorMsg && (
          <div role="alert" className="mb-3 p-2.5 rounded-[8px] bg-[#F4F4F2] border border-[#D92D20] text-xs text-[#D92D20] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 stroke-[2] shrink-0" />
            <span>{t(errorMsg)}</span>
          </div>
        )}
        {aviso && (
          <div role="status" className="mb-3 p-2.5 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-xs text-[#111111]">
            {t(aviso)}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-2.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                {t('Nome')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('O teu nome')}
                autoComplete="name"
                maxLength={60}
                className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                {t('Email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="exemplo@email.pt"
                autoComplete="email"
                inputMode="email"
                className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                {mode === 'reset' ? t('Palavra-passe nova') : t('Palavra-passe')}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'login' ? '' : t('Mínimo 8 caracteres')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
              />
            </div>
          )}

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => mudarModo('forgot')}
              className="text-[11px] font-semibold text-[#6B6B6B] underline cursor-pointer min-h-[32px]"
            >
              {t('Esqueci-me da palavra-passe')}
            </button>
          )}

          {/* Primary Action Button: Brand chamfer */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-2.5 px-4 rounded-[8px] brand-chamfer bg-[#FF6B1A] text-[#111111] text-xs font-bold min-h-[44px] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin stroke-[2]" />
                <span>{t('A processar...')}</span>
              </>
            ) : mode === 'login' ? (
              <span>{t('Entrar')}</span>
            ) : mode === 'register' ? (
              <span>{t('Criar conta')}</span>
            ) : mode === 'forgot' ? (
              <span>{t('Enviar link')}</span>
            ) : (
              <span>{t('Guardar palavra-passe')}</span>
            )}
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => mudarModo('login')}
              className="w-full text-[11px] font-semibold text-[#6B6B6B] underline cursor-pointer min-h-[36px]"
            >
              {t('Voltar a iniciar sessão')}
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
