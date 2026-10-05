import React, { useState, useMemo } from 'react';
import { 
  ShieldAlert, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  EyeOff, 
  Trash2, 
  Clock, 
  MapPin, 
  MessageSquare, 
  Filter, 
  Search,
  Flag,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { Occurrence, Complaint } from '../types';
import { 
  adminUpdateReportStatus, 
  adminUpdateComplaintStatus, 
  deleteReportDoc, 
  deleteComplaintDoc 
} from '../services/firebase';

interface AdminModerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: Occurrence[];
  complaints: Complaint[];
}

export const AdminModerationModal: React.FC<AdminModerationModalProps> = ({
  isOpen,
  onClose,
  reports,
  complaints,
}) => {
  const [activeTab, setActiveTab] = useState<'reports' | 'complaints'>('reports');
  const [filterMode, setFilterMode] = useState<'flagged' | 'in_review' | 'hidden' | 'all'>('flagged');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Compute counts for badge notifications
  const flaggedReportsCount = useMemo(
    () => reports.filter((r) => (r.reportsCount && r.reportsCount > 0) || r.status === 'Em análise').length,
    [reports]
  );
  const flaggedComplaintsCount = useMemo(
    () => complaints.filter((c) => (c.reportsCount && c.reportsCount > 0) || c.status === 'Em análise').length,
    [complaints]
  );

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (filterMode === 'flagged') {
        if (!r.reportsCount || r.reportsCount === 0) return false;
      } else if (filterMode === 'in_review') {
        if (r.status !== 'Em análise') return false;
      } else if (filterMode === 'hidden') {
        if (r.status !== 'Ocultada') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.district.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [reports, filterMode, searchQuery]);

  // Filtered complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (filterMode === 'flagged') {
        if (!c.reportsCount || c.reportsCount === 0) return false;
      } else if (filterMode === 'in_review') {
        if (c.status !== 'Em análise') return false;
      } else if (filterMode === 'hidden') {
        if (c.status !== 'Ocultada') return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          c.title.toLowerCase().includes(q) ||
          c.text.toLowerCase().includes(q) ||
          c.companyOrService.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [complaints, filterMode, searchQuery]);

  if (!isOpen) return null;

  // Actions for reports
  const handleApproveReport = async (report: Occurrence) => {
    setProcessingId(report.id);
    try {
      await adminUpdateReportStatus(report.id, 'Ativa', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSetReportInReview = async (report: Occurrence) => {
    setProcessingId(report.id);
    try {
      await adminUpdateReportStatus(report.id, 'Em análise');
    } finally {
      setProcessingId(null);
    }
  };

  const handleHideReport = async (report: Occurrence) => {
    setProcessingId(report.id);
    try {
      await adminUpdateReportStatus(report.id, 'Ocultada');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteReport = async (report: Occurrence) => {
    if (!window.confirm(`Tem a certeza que deseja eliminar permanentemente o report "${report.title}"?`)) return;
    setProcessingId(report.id);
    try {
      await deleteReportDoc(report.id);
    } finally {
      setProcessingId(null);
    }
  };

  // Actions for complaints
  const handleApproveComplaint = async (complaint: Complaint) => {
    setProcessingId(complaint.id);
    try {
      await adminUpdateComplaintStatus(complaint.id, 'Pública', true);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSetComplaintInReview = async (complaint: Complaint) => {
    setProcessingId(complaint.id);
    try {
      await adminUpdateComplaintStatus(complaint.id, 'Em análise');
    } finally {
      setProcessingId(null);
    }
  };

  const handleHideComplaint = async (complaint: Complaint) => {
    setProcessingId(complaint.id);
    try {
      await adminUpdateComplaintStatus(complaint.id, 'Ocultada');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteComplaint = async (complaint: Complaint) => {
    if (!window.confirm(`Tem a certeza que deseja eliminar permanentemente a reclamação "${complaint.title}"?`)) return;
    setProcessingId(complaint.id);
    try {
      await deleteComplaintDoc(complaint.id);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-[#0c1220] border border-slate-700/80 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-4">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#090e1a] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Painel de Moderação & Anti-Spam
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Admin
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Revisão de conteúdo denunciado, duplicados e controlo de qualidade comunitária
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection: Reports vs Reclamações */}
        <div className="px-4 sm:px-6 pt-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('reports')}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'reports'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Reports & Alertas</span>
              {flaggedReportsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-red-600 text-white font-bold">
                  {flaggedReportsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('complaints')}
              className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'complaints'
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Reclamações & Opiniões</span>
              {flaggedComplaintsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-red-600 text-white font-bold">
                  {flaggedComplaintsCount}
                </span>
              )}
            </button>
          </div>

          {/* Quick Filter chips */}
          <div className="flex items-center gap-1.5 pb-2 text-xs overflow-x-auto no-scrollbar">
            <button
              onClick={() => setFilterMode('flagged')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors text-[11px] cursor-pointer ${
                filterMode === 'flagged'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              Denunciados
            </button>
            <button
              onClick={() => setFilterMode('in_review')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors text-[11px] cursor-pointer ${
                filterMode === 'in_review'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              Em análise
            </button>
            <button
              onClick={() => setFilterMode('hidden')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors text-[11px] cursor-pointer ${
                filterMode === 'hidden'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              Ocultados
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors text-[11px] cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              Todos
            </button>
          </div>
        </div>

        {/* Search bar inside admin modal */}
        <div className="p-3 sm:px-6 bg-slate-950/60 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por título, texto ou localização..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-[#080c14]/50">
          {activeTab === 'reports' ? (
            filteredReports.length === 0 ? (
              <div className="p-10 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">
                  Nenhum report pendente nesta categoria
                </p>
                <p className="text-[11px] text-slate-500">
                  Todos os alertas comunitários estão operacionais e verificados.
                </p>
              </div>
            ) : (
              filteredReports.map((report) => {
                const isProcessing = processingId === report.id;
                const reportsCount = report.reportsCount || 0;

                return (
                  <div
                    key={report.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {reportsCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-md font-bold uppercase text-[10px] bg-red-950/80 text-red-300 border border-red-800/80 flex items-center gap-1">
                            <Flag className="w-3 h-3 text-red-400" />
                            {reportsCount} {reportsCount === 1 ? 'Denúncia' : 'Denúncias'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md font-bold uppercase text-[10px] bg-slate-800 text-slate-300">
                            Sem Denúncias
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] ${
                            report.status === 'Em análise'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                              : report.status === 'Ocultada'
                              ? 'bg-red-950/90 text-red-400 border border-red-900'
                              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          Estado: {report.status}
                        </span>

                        <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-slate-800 text-slate-300">
                          {report.type}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(report.timestamp).toLocaleString('pt-PT')}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-white text-sm">{report.title}</h4>
                      {report.description && (
                        <p className="text-slate-300 text-xs mt-1 leading-relaxed">
                          {report.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-xl">
                      <span className="flex items-center gap-1 text-slate-300">
                        <MapPin className="w-3 h-3 text-blue-400" />
                        {report.district} {report.concelho ? `• ${report.concelho}` : ''}
                      </span>
                      {report.authorName && (
                        <span>
                          Autor: <strong className="text-slate-200">{report.authorName}</strong>
                        </span>
                      )}
                      <span>
                        Votos: <strong>{report.upvotes || 0}</strong>
                      </span>
                    </div>

                    {/* Moderation actions bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Aprovar e limpar denúncias */}
                        <button
                          onClick={() => handleApproveReport(report)}
                          disabled={isProcessing}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aprovar / Ativar</span>
                        </button>

                        {/* Marcar em análise */}
                        {report.status !== 'Em análise' && (
                          <button
                            onClick={() => handleSetReportInReview(report)}
                            disabled={isProcessing}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Colocar Em Análise</span>
                          </button>
                        )}

                        {/* Ocultar soft-delete */}
                        {report.status !== 'Ocultada' && (
                          <button
                            onClick={() => handleHideReport(report)}
                            disabled={isProcessing}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                            <span>Ocultar</span>
                          </button>
                        )}
                      </div>

                      {/* Hard Delete */}
                      <button
                        onClick={() => handleDeleteReport(report)}
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 rounded-xl text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/50 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Eliminar fisicamente da base de dados"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            filteredComplaints.length === 0 ? (
              <div className="p-10 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">
                  Nenhuma reclamação pendente nesta categoria
                </p>
                <p className="text-[11px] text-slate-500">
                  Todas as opiniões e queixas comunitárias estão validadas.
                </p>
              </div>
            ) : (
              filteredComplaints.map((comp) => {
                const isProcessing = processingId === comp.id;
                const reportsCount = comp.reportsCount || 0;

                return (
                  <div
                    key={comp.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {reportsCount > 0 ? (
                          <span className="px-2 py-0.5 rounded-md font-bold uppercase text-[10px] bg-red-950/80 text-red-300 border border-red-800/80 flex items-center gap-1">
                            <Flag className="w-3 h-3 text-red-400" />
                            {reportsCount} {reportsCount === 1 ? 'Denúncia' : 'Denúncias'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md font-bold uppercase text-[10px] bg-slate-800 text-slate-300">
                            Sem Denúncias
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded-md font-bold uppercase text-[10px] ${
                            comp.status === 'Em análise'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                              : comp.status === 'Ocultada'
                              ? 'bg-red-950/90 text-red-400 border border-red-900'
                              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          Estado: {comp.status}
                        </span>

                        <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-purple-950/80 text-purple-300 border border-purple-800/60">
                          {comp.companyOrService}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(comp.timestamp).toLocaleString('pt-PT')}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-white text-sm">{comp.title}</h4>
                      <p className="text-slate-300 text-xs mt-1 leading-relaxed whitespace-pre-line">
                        {comp.text}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-xl">
                      <span className="flex items-center gap-1 text-slate-300">
                        <MapPin className="w-3 h-3 text-blue-400" />
                        {comp.district} {comp.concelho ? `• ${comp.concelho}` : ''}
                      </span>
                      <span>
                        Autor: <strong className="text-slate-200">{comp.authorName}</strong>
                      </span>
                      <span>
                        Apoios: <strong>{comp.upvotes || 0}</strong>
                      </span>
                      <span>
                        Comentários: <strong>{comp.commentsCount || 0}</strong>
                      </span>
                    </div>

                    {/* Moderation actions bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Aprovar e repor como Pública */}
                        <button
                          onClick={() => handleApproveComplaint(comp)}
                          disabled={isProcessing}
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aprovar / Pública</span>
                        </button>

                        {/* Marcar em análise */}
                        {comp.status !== 'Em análise' && (
                          <button
                            onClick={() => handleSetComplaintInReview(comp)}
                            disabled={isProcessing}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Colocar Em Análise</span>
                          </button>
                        )}

                        {/* Ocultar */}
                        {comp.status !== 'Ocultada' && (
                          <button
                            onClick={() => handleHideComplaint(comp)}
                            disabled={isProcessing}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                            <span>Ocultar</span>
                          </button>
                        )}
                      </div>

                      {/* Hard Delete */}
                      <button
                        onClick={() => handleDeleteComplaint(comp)}
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 rounded-xl text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/50 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Eliminar fisicamente da base de dados"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:px-6 bg-[#090e1a] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Total: {activeTab === 'reports' ? reports.length : complaints.length} itens monitorizados
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors cursor-pointer"
          >
            Fechar Painel
          </button>
        </div>
      </div>
    </div>
  );
};
