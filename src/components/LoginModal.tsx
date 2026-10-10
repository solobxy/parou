import React, { useState } from 'react';
import { X, AlertCircle, Loader2 } from 'lucide-react';
import { signInWithGoogle, loginWithEmail, registerWithEmail } from '../services/firebase';
import { t } from '../i18n';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await signInWithGoogle();
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao autenticar com a Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Preencha todos os campos.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('A palavra-passe deve ter pelo menos 6 caracteres.');
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
      const MENSAGENS: Record<string, string> = {
        'auth/invalid-credential': 'Email ou palavra-passe incorretos.',
        'auth/user-not-found': 'Email ou palavra-passe incorretos.',
        'auth/wrong-password': 'Email ou palavra-passe incorretos.',
        'auth/email-already-in-use': 'Este email já tem conta. Escolhe "Iniciar sessão".',
        'auth/invalid-email': 'Esse email não parece válido.',
        'auth/weak-password': 'Palavra-passe fraca: usa pelo menos 6 caracteres.',
        'auth/too-many-requests': 'Demasiadas tentativas. Espera uns minutos e tenta outra vez.',
        'auth/network-request-failed': 'Sem ligação à internet. Verifica a rede e tenta outra vez.',
        'auth/operation-not-allowed': 'Criar conta com email está temporariamente indisponível. Usa "Continuar com o Google".',
        'auth/user-disabled': 'Esta conta foi desativada.',
      };
      const message = MENSAGENS[err?.code] || `Não foi possível concluir (${err?.code || 'erro desconhecido'}). Tenta outra vez.`;
      setErrorMsg(message);
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
            {mode === 'login' ? t('Iniciar sessão') : t('Criar conta')}
          </h3>
        </div>

        {/* Mode Switcher */}
        <div className="flex rounded-[8px] bg-[#F4F4F2] p-1 border border-[#E6E6E3] my-3.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(''); }}
            className={`flex-1 py-1.5 rounded-[6px] transition-colors cursor-pointer min-h-[36px] ${
              mode === 'login' ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            {t('Iniciar sessão')}
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(''); }}
            className={`flex-1 py-1.5 rounded-[6px] transition-colors cursor-pointer min-h-[36px] ${
              mode === 'register' ? 'bg-[#111111] text-[#FFFFFF]' : 'text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            {t('Criar conta')}
          </button>
        </div>

        {/* Google Auth */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          type="button"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-[8px] bg-[#F4F4F2] hover:bg-[#E6E6E3] border border-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[44px] cursor-pointer disabled:opacity-50"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{t('Continuar com o Google')}</span>
        </button>

        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-[#E6E6E3]" />
          <span className="text-[11px] text-[#6B6B6B]">{t('ou')}</span>
          <div className="flex-1 h-px bg-[#E6E6E3]" />
        </div>

        {errorMsg && (
          <div className="mb-3 p-2.5 rounded-[8px] bg-[#F4F4F2] border border-[#D92D20] text-xs text-[#D92D20] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 stroke-[2] shrink-0" />
            <span>{errorMsg}</span>
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
                className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              {t('Email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@email.pt"
              className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
              {t('Palavra-passe')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('Mínimo 6 caracteres')}
              className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[44px]"
            />
          </div>

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
            ) : (
              <span>{t('Criar conta')}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
