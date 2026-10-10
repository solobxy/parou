import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  MapPin
} from 'lucide-react';
import { Occurrence, PublicSourceConfig } from '../types';
import { fetchPublicSourcesList, syncPublicSourcesNow } from '../services/publicSourcesClient';
import { quandoAconteceu } from '../utils/quando';
import { eAdmin } from '../utils/admin';

interface PublicSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOccurrence: (occurrence: Occurrence) => void;
  allOccurrences: Occurrence[];
  onOpenCoverage?: () => void;
}

export const PublicSourcesModal: React.FC<PublicSourcesModalProps> = ({
  isOpen,
  onClose,
  onSelectOccurrence,
  allOccurrences,
}) => {
  const [sources, setSources] = useState<PublicSourceConfig[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'sources' | 'items'>('sources');
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchPublicSourcesList().then(setSources);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const publicOccurrences = allOccurrences.filter((o) => o.isPublicSource);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await syncPublicSourcesNow();
      const updatedSources = await fetchPublicSourcesList();
      setSources(updatedSources);
      setSyncFeedback(
        res.success
          ? `Sincronização concluída: ${res.addedCount} novas ocorrências.`
          : 'Erro na sincronização.'
      );
    } catch {
      setSyncFeedback('Erro ao sincronizar fontes.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 overflow-y-auto"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3] overflow-hidden text-[#111111]">
        {/* Header */}
        <div className="p-4 border-b border-[#E6E6E3] flex flex-wrap items-center justify-between gap-3 bg-[#FFFFFF]">
          <div>
            <h2 className="text-base font-bold text-[#111111]">
              Fontes oficiais
            </h2>
            <p className="text-xs text-[#6B6B6B]">
              APIs, feeds GTFS e portais em tempo real.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Action Button: Brand chamfer */}
            {eAdmin() && <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-4 py-2 rounded-[8px] brand-chamfer bg-[#FF6B1A] text-[#111111] font-bold text-xs flex items-center gap-2 min-h-[44px] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 stroke-[2] ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'A sincronizar...' : 'Atualizar fontes'}</span>
            </button>}

            <button
              onClick={onClose}
              className="p-1 text-[#6B6B6B] hover:text-[#111111] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <X className="w-5 h-5 stroke-[2]" />
            </button>
          </div>
        </div>

        {/* Feedback message */}
        {syncFeedback && (
          <div className="mx-4 mt-3 p-2.5 rounded-[8px] bg-[#F4F4F2] border border-[#E6E6E3] text-xs text-[#111111]">
            {syncFeedback}
          </div>
        )}

        {/* Stats Strip */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-[#F4F4F2] border-b border-[#E6E6E3] text-xs">
          <div className="p-2.5 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B] block">Fontes registadas</span>
            <strong className="font-['Barlow_Condensed'] text-lg font-bold text-[#111111] tabular-nums">
              {sources.length} canais
            </strong>
          </div>

          <div className="p-2.5 rounded-[8px] bg-[#FFFFFF] border border-[#E6E6E3]">
            <span className="text-[11px] text-[#6B6B6B] block">Alertas ativos no sistema</span>
            <strong className="font-['Barlow_Condensed'] text-lg font-bold text-[#111111] tabular-nums">
              {publicOccurrences.length} ocorrências
            </strong>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#E6E6E3] px-4 bg-[#FFFFFF]">
          <button
            onClick={() => setActiveTab('sources')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'sources'
                ? 'border-[#111111] text-[#111111]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            Fontes ({sources.length})
          </button>

          <button
            onClick={() => setActiveTab('items')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'items'
                ? 'border-[#111111] text-[#111111]'
                : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            <span>Ocorrências</span>
            <span className="font-['Barlow_Condensed'] font-bold text-xs tabular-nums text-[#6B6B6B]">
              ({publicOccurrences.length})
            </span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-[#FFFFFF]">
          {activeTab === 'sources' ? (
            <div className="border border-[#E6E6E3] rounded-[8px] divide-y divide-[#E6E6E3] overflow-hidden">
              {sources.map((src) => (
                <div key={src.id} className="p-3 hover:bg-[#F4F4F2] transition-colors flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#111111] truncate">{src.name}</span>
                      <span className="text-[#6B6B6B]">· {src.type}</span>
                    </div>
                    <div className="text-[#6B6B6B] mt-0.5 truncate">
                      {src.endpointUrl || src.officialPortalUrl}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 text-right">
                    <span className="text-xs font-semibold text-[#111111] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[2]" />
                      <span>{src.status || 'Ativo'}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            publicOccurrences.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6B6B6B]">
                Sem ocorrências importadas.
              </div>
            ) : (
              <div className="border border-[#E6E6E3] rounded-[8px] divide-y divide-[#E6E6E3] overflow-hidden">
                {publicOccurrences.map((occ) => (
                  <div
                    key={occ.id}
                    onClick={() => {
                      onClose();
                      onSelectOccurrence(occ);
                    }}
                    className="p-3 hover:bg-[#F4F4F2] transition-colors cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#111111] truncate">{occ.title}</span>
                      <span className="font-['Barlow_Condensed'] text-[#6B6B6B] tabular-nums shrink-0">
                        {quandoAconteceu(occ)}
                      </span>
                    </div>
                    <div className="text-xs text-[#6B6B6B] line-clamp-1">{occ.description}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E6E6E3] bg-[#FFFFFF] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold rounded-[8px] min-h-[44px] cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
