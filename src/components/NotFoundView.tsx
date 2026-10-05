import React from 'react';
import { Compass, MapPin, AlertTriangle, Clock, ArrowLeft, Search } from 'lucide-react';

interface NotFoundViewProps {
  onNavigateHome: () => void;
  onNavigateTab: (tab: 'mapa' | 'reports' | 'perto' | 'horarios' | 'favoritos' | 'catalogo' | 'reclamacoes' | 'alertas') => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ onNavigateHome, onNavigateTab }) => {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12 text-center" role="main">
      <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-3xl p-8 backdrop-blur-xl shadow-2xl animate-in fade-in duration-200">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
          <Compass className="w-8 h-8 animate-spin-slow" />
        </div>

        <span className="font-mono text-xs font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">
          Erro 404
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-4 tracking-tight">
          Página não encontrada
        </h1>

        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          O endereço que procurou não existe ou foi alterado. Use os atalhos abaixo para voltar a acompanhar os transportes e trânsito em Portugal.
        </p>

        {/* Action Shortcuts */}
        <div className="mt-8 space-y-2.5">
          <button
            onClick={onNavigateHome}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all shadow-lg shadow-blue-600/30 cursor-pointer"
          >
            <MapPin className="w-4 h-4" />
            <span>Voltar ao Mapa em Direto</span>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => onNavigateTab('reports')}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Ocorrências</span>
            </button>

            <button
              onClick={() => onNavigateTab('horarios')}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Transportes</span>
            </button>
          </div>
        </div>

        {/* Canonical Link */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 text-xs text-slate-500 flex items-center justify-center gap-1">
          <ArrowLeft className="w-3 h-3" />
          <a href="/" onClick={(e) => { e.preventDefault(); onNavigateHome(); }} className="hover:text-blue-400 transition-colors">
            Ir para a página principal (parou.pt)
          </a>
        </div>
      </div>
    </main>
  );
};
