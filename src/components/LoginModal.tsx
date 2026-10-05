import React, { useState } from 'react';
import { X, Lock, Shield, Award, Sparkles, Check, AlertCircle, Loader2 } from 'lucide-react';
import { signInWithGoogle, loginWithEmail, registerWithEmail } from '../services/firebase';

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
      console.error('Google Sign In error:', err);
      setErrorMsg(err.message || 'Falha ao autenticar com a Google. Tenta novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Por favor preenche todos os campos.');
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
          setErrorMsg('Por favor insere o teu nome.');
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
      console.error('Auth error:', err);
      let message = 'Ocorreu um erro ao processar o pedido.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        message = 'Email ou palavra-passe incorretos.';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'Este email já se encontra associado a uma conta.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'Formato de email inválido.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        message = 'A janela de autenticação foi fechada.';
      }
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className="relative w-full max-w-md rounded-3xl bg-[#0b1220] border border-slate-700/80 p-5 sm:p-7 shadow-2xl text-slate-100 my-8 animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Kicker */}
        <div className="text-center pb-2">
          <div className="inline-flex p-3 rounded-2xl bg-blue-600/15 text-blue-400 border border-blue-500/30 mb-3 shadow-lg shadow-blue-500/10">
            <Award className="w-6 h-6 text-blue-400" />
          </div>

          <h3 className="text-xl font-bold text-white tracking-tight">
            {mode === 'login' ? 'Entrar no PAROU.PT' : 'Criar Conta de Colaborador'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            {mode === 'login'
              ? 'Acede ao teu perfil, histórico e pontos de reputação.'
              : 'Ganha 50 pontos de boas-vindas e badges ao reportar ocorrências.'}
          </p>
        </div>

        {/* Segmented Mode Switcher */}
        <div className="flex rounded-xl bg-slate-900/90 p-1 border border-slate-800 my-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(''); }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              mode === 'login' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Iniciar Sessão
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(''); }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              mode === 'register' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Criar Conta (+50 pts)
          </button>
        </div>

        {/* Google One-Click Auth */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          type="button"
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm disabled:opacity-60 cursor-pointer"
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
          <span>Continuar com o Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">ou com email</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Error message banner */}
        {errorMsg && (
          <div className="mb-3.5 p-2.5 rounded-xl bg-red-950/70 border border-red-800/80 text-xs text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Nome completo ou de exibição
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Ferreira"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Endereço de email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="exemplo@email.pt"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Palavra-passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 focus:border-blue-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold transition-all shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>A processar...</span>
              </>
            ) : mode === 'login' ? (
              <span>Iniciar Sessão</span>
            ) : (
              <span>Criar Conta e Ganhar 50 Pts</span>
            )}
          </button>
        </form>

        {/* Reputation Perks Banner */}
        <div className="mt-4 p-3 rounded-2xl bg-blue-950/40 border border-blue-900/40 text-[11px] text-slate-300 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-blue-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Vantagens de Utilizador Registado</span>
          </div>
          <p className="text-slate-400">
            Acumula <strong>+20 pts</strong> por cada report criado e <strong>+5 pts</strong> quando outros passageiros confirmam a tua ocorrência. Desbloqueia badges oficiais de colaborador.
          </p>
        </div>

        {/* Anonymous Disclaimer */}
        <div className="text-center mt-3 pt-2 text-[11px] text-slate-500">
          Reports anónimos continuam sempre permitidos sem necessidade de conta.
        </div>
      </div>
    </div>
  );
};
