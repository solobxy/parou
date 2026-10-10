import React, { useState, useMemo } from 'react';
import { 
  X, 
  CheckCircle2, 
  Trash2, 
  MapPin, 
  Search,
  Flag
} from 'lucide-react';
import { Occurrence, Complaint } from '../types';
import { 
  adminUpdateReportStatus, 
  adminUpdateComplaintStatus, 
  deleteReportDoc, 
  deleteComplaintDoc 
} from '../services/conta';

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

  const flaggedReportsCount = useMemo(
    () => reports.filter((r) => (r.reportsCount && r.reportsCount > 0) || r.status === 'Em análise').length,
    [reports]
  );
  const flaggedComplaintsCount = useMemo(
    () => complaints.filter((c) => (c.reportsCount && c.reportsCount > 0) || c.status === 'Em análise').length,
    [complaints]
  );

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
          (c.company ? c.company.toLowerCase().includes(q) : false);
        if (!matches) return false;
      }
      return true;
    });
  }, [complaints, filterMode, searchQuery]);

  if (!isOpen) return null;

  const handleApproveReport = async (report: Occurrence) => {
    setProcessingId(report.id);
    try {
      await adminUpdateReportStatus(report.id, 'Ativa', true);
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
    if (!window.confirm('Eliminar esta ocorrência?')) return;
    setProcessingId(report.id);
    try {
      await deleteReportDoc(report.id);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveComplaint = async (complaint: Complaint) => {
    setProcessingId(complaint.id);
    try {
      await adminUpdateComplaintStatus(complaint.id, 'Pública', true);
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
    if (!window.confirm('Eliminar esta reclamação?')) return;
    setProcessingId(complaint.id);
    try {
      await deleteComplaintDoc(complaint.id);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] shadow-lg flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#E6E6E3] bg-[#FFFFFF] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Moderação
            </h2>
            <p className="text-xs text-[#6B6B6B]">
              Revisão de conteúdo e denúncias.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-[6px] text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-4 pt-2.5 bg-[#FFFFFF] border-b border-[#E6E6E3] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('reports')}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'reports'
                  ? 'border-[#111111] text-[#111111]'
                  : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              <span>Reports ({flaggedReportsCount})</span>
            </button>

            <button
              onClick={() => setActiveTab('complaints')}
              className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'complaints'
                  ? 'border-[#111111] text-[#111111]'
                  : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              <span>Reclamações ({flaggedComplaintsCount})</span>
            </button>
          </div>

          {/* Filter Mode */}
          <div className="flex items-center gap-1 pb-2">
            {(['flagged', 'in_review', 'hidden', 'all'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-2 py-1 rounded-[6px] text-xs font-semibold cursor-pointer min-h-[32px] ${
                  filterMode === mode
                    ? 'bg-[#111111] text-[#FFFFFF]'
                    : 'text-[#6B6B6B] hover:text-[#111111]'
                }`}
              >
                {mode === 'flagged' ? 'Denúncias' : mode === 'in_review' ? 'Em análise' : mode === 'hidden' ? 'Ocultadas' : 'Todas'}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="p-3 bg-[#F4F4F2] border-b border-[#E6E6E3]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-1/2 -translate-y-1/2 stroke-[2]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] placeholder-[#6B6B6B] focus:outline-none min-h-[36px]"
            />
          </div>
        </div>

        {/* Content list: 1px dividing lines */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FFFFFF]">
          {activeTab === 'reports' ? (
            filteredReports.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B6B6B]">
                Sem registos pendentes.
              </div>
            ) : (
              <div className="border border-[#E6E6E3] rounded-[8px] divide-y divide-[#E6E6E3] overflow-hidden">
                {filteredReports.map((report) => (
                  <div key={report.id} className="p-3.5 space-y-2 hover:bg-[#F4F4F2] transition-colors">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        {report.reportsCount ? (
                          <span className="flex items-center gap-1 font-bold text-[#D92D20]">
                            <Flag className="w-3.5 h-3.5 stroke-[2]" />
                            <span>{report.reportsCount}</span>
                          </span>
                        ) : null}
                        <span className="font-semibold text-[#111111]">{report.status}</span>
                        <span className="text-[#6B6B6B]">· {report.type}</span>
                      </div>
                      <span className="font-condensada text-[#6B6B6B] tabular-nums">
                        {new Date(report.timestamp).toLocaleDateString('pt-PT')}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-[#111111]">{report.title}</h4>
                      {report.description && (
                        <p className="text-xs text-[#6B6B6B] mt-0.5">{report.description}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#E6E6E3]">
                      <span className="text-xs text-[#6B6B6B] flex items-center gap-1">
                        <MapPin className="w-3 h-3 stroke-[2]" />
                        <span>{report.district}</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleApproveReport(report)}
                          disabled={processingId === report.id}
                          className="px-2.5 py-1 bg-[#111111] text-[#FFFFFF] text-xs font-semibold rounded-[6px] min-h-[32px] cursor-pointer"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleHideReport(report)}
                          disabled={processingId === report.id}
                          className="px-2.5 py-1 bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] text-xs font-semibold rounded-[6px] min-h-[32px] cursor-pointer"
                        >
                          Ocultar
                        </button>
                        <button
                          onClick={() => handleDeleteReport(report)}
                          disabled={processingId === report.id}
                          className="p-1.5 text-[#D92D20] hover:bg-[#F4F4F2] rounded-[6px] min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 stroke-[2]" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            filteredComplaints.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B6B6B]">
                Sem registos pendentes.
              </div>
            ) : (
              <div className="border border-[#E6E6E3] rounded-[8px] divide-y divide-[#E6E6E3] overflow-hidden">
                {filteredComplaints.map((c) => (
                  <div key={c.id} className="p-3.5 space-y-2 hover:bg-[#F4F4F2] transition-colors">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#111111]">{c.status}</span>
                        <span className="text-[#6B6B6B]">· {c.company}</span>
                      </div>
                      <span className="font-condensada text-[#6B6B6B] tabular-nums">
                        {new Date(c.timestamp).toLocaleDateString('pt-PT')}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-[#111111]">{c.title}</h4>
                      <p className="text-xs text-[#6B6B6B] mt-0.5">{c.text}</p>
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-[#E6E6E3]">
                      <button
                        onClick={() => handleApproveComplaint(c)}
                        disabled={processingId === c.id}
                        className="px-2.5 py-1 bg-[#111111] text-[#FFFFFF] text-xs font-semibold rounded-[6px] min-h-[32px] cursor-pointer"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => handleHideComplaint(c)}
                        disabled={processingId === c.id}
                        className="px-2.5 py-1 bg-[#F4F4F2] border border-[#E6E6E3] text-[#111111] text-xs font-semibold rounded-[6px] min-h-[32px] cursor-pointer"
                      >
                        Ocultar
                      </button>
                      <button
                        onClick={() => handleDeleteComplaint(c)}
                        disabled={processingId === c.id}
                        className="p-1.5 text-[#D92D20] hover:bg-[#F4F4F2] rounded-[6px] min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 stroke-[2]" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
