import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Train, 
  Bus, 
  Car, 
  Zap, 
  Users, 
  Wrench, 
  AlertCircle, 
  Clock, 
  Calendar,
  ThumbsUp, 
  ThumbsDown, 
  Share2, 
  CheckCircle2, 
  ShieldCheck, 
  Award, 
  Camera, 
  Building, 
  Sparkles,
  ExternalLink,
  Info,
  Flag
} from 'lucide-react';
import { Occurrence, OccurrenceType, SeverityLevel, UserProfile } from '../types';
import { fetchUserProfile, flagReportOccurrence } from '../services/firebase';
import { ConfidenceMeter } from './ConfidenceMeter';
import { FavoriteButton } from './FavoriteButton';

interface ReportDetailPageProps {
  occurrence: Occurrence;
  onBack: () => void;
  voterId: string;
  onVote: (id: string, action: 'confirm' | 'unconfirm') => void;
  onSelectOccurrence: (occ: Occurrence) => void;
  relatedOccurrences: Occurrence[];
}

export const ReportDetailPage: React.FC<ReportDetailPageProps> = ({
  occurrence,
  onBack,
  voterId,
  onVote,
  onSelectOccurrence,
  relatedOccurrences,
}) => {
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuthor, setIsLoadingAuthor] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [voteFeedback, setVoteFeedback] = useState<string | null>(null);
  const [isFlagged, setIsFlagged] = useState(false);
  const [flagSuccessMsg, setFlagSuccessMsg] = useState('');

  // Fetch author profile if occurrence was submitted by a registered user
  useEffect(() => {
    let isMounted = true;
    if (occurrence.authorId) {
      setIsLoadingAuthor(true);
      fetchUserProfile(occurrence.authorId)
        .then((profile) => {
          if (isMounted) {
            setAuthorProfile(profile);
            setIsLoadingAuthor(false);
          }
        })
        .catch(() => {
          if (isMounted) setIsLoadingAuthor(false);
        });
    } else {
      setAuthorProfile(null);
    }
    return () => {
      isMounted = false;
    };
  }, [occurrence.authorId]);

  const confirmations = occurrence.confirmationsCount !== undefined ? occurrence.confirmationsCount : (occurrence.upvotes || 0);
  const unconfirmed = occurrence.unconfirmedCount || 0;
  const hasConfirmed = occurrence.confirmedBy?.includes(voterId) || false;
  const hasUnconfirmed = occurrence.unconfirmedBy?.includes(voterId) || false;
  const isCommunityVerified = occurrence.isCommunityVerified || confirmations >= 3;

  const handleVoteClick = (action: 'confirm' | 'unconfirm') => {
    if (action === 'confirm' && hasConfirmed) {
      setVoteFeedback('Esta conta já confirmou este report.');
      setTimeout(() => setVoteFeedback(null), 2500);
      return;
    }
    if (action === 'unconfirm' && hasUnconfirmed) {
      setVoteFeedback('Já marcaste este report como não confirmado.');
      setTimeout(() => setVoteFeedback(null), 2500);
      return;
    }

    onVote(occurrence.id, action);
    setVoteFeedback(action === 'confirm' ? 'Obrigado por confirmares! Reputação atribuída ao autor.' : 'Voto de não confirmação registado.');
    setTimeout(() => setVoteFeedback(null), 3000);
  };

  const handleFlagReport = async () => {
    if (isFlagged || occurrence.reportedBy?.includes(voterId)) return;
    const confirmed = window.confirm(
      'Deseja denunciar este alerta por conter informação falsa, spam, trote ou linguagem abusiva?'
    );
    if (!confirmed) return;

    const res = await flagReportOccurrence(occurrence.id, voterId);
    if (res.success) {
      setIsFlagged(true);
      setFlagSuccessMsg(
        res.status === 'Ocultada'
          ? 'O alerta atingiu o limite de denúncias comunitárias e foi ocultado para moderação.'
          : res.status === 'Em análise'
          ? 'O alerta foi colocado sob moderação ("Em análise") devido a denúncias da comunidade.'
          : 'Obrigado. A sua denúncia foi registada e enviada para a equipa de moderação.'
      );
    }
  };

  const handleShare = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('reportId', occurrence.id);
    navigator.clipboard?.writeText(url.toString());
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Format exact date and time in Portuguese
  const formattedDateTime = (() => {
    try {
      const d = new Date(occurrence.timestamp || Date.now());
      return d.toLocaleDateString('pt-PT', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return occurrence.reportedAt;
    }
  })();

  const getCategoryIcon = (type: OccurrenceType) => {
    switch (type) {
      case 'ACIDENTE':
        return { Icon: Car, label: 'Acidente de Trânsito', color: 'text-red-400 bg-red-500/20 border-red-500/40' };
      case 'ATRASOS':
        return { Icon: Bus, label: 'Atrasos / Circulação Lenta', color: 'text-amber-400 bg-amber-500/20 border-amber-500/40' };
      case 'AVARIA':
        return { Icon: Zap, label: 'Avaria Técnica / Falha', color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/40' };
      case 'GREVE':
        return { Icon: Users, label: 'Perturbação / Greve', color: 'text-blue-400 bg-blue-500/20 border-blue-500/40' };
      case 'OBRAS':
        return { Icon: Wrench, label: 'Obras na Via', color: 'text-cyan-400 bg-cyan-500/20 border-cyan-500/40' };
      case 'CORTE':
        return { Icon: AlertCircle, label: 'Corte de Via / Trânsito', color: 'text-rose-400 bg-rose-500/20 border-rose-500/40' };
      case 'SERVICO_PUBLICO':
        return { Icon: Train, label: 'Transporte Público', color: 'text-purple-400 bg-purple-500/20 border-purple-500/40' };
      default:
        return { Icon: AlertCircle, label: 'Ocorrência', color: 'text-slate-300 bg-slate-800 border-slate-700' };
    }
  };

  const getSeverityStyle = (sev: SeverityLevel) => {
    switch (sev) {
      case 'Grave':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'Moderada':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Informação':
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  };

  const getStatusStyle = (status: Occurrence['status']) => {
    switch (status) {
      case 'Ativa':
        return { label: 'Ocorrência Ativa', classes: 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300', dot: 'bg-emerald-400 animate-ping' };
      case 'Em resolução':
        return { label: 'Em Resolução', classes: 'bg-amber-950/80 border-amber-700/80 text-amber-300', dot: 'bg-amber-400' };
      case 'Em análise':
        return { label: 'Sob Moderação / Em Análise', classes: 'bg-amber-950/80 border-amber-500/80 text-amber-200', dot: 'bg-amber-400 animate-pulse' };
      case 'Ocultada':
        return { label: 'Ocultada para Moderação', classes: 'bg-red-950/80 border-red-700/80 text-red-300', dot: 'bg-red-500' };
      case 'Resolvida':
      default:
        return { label: 'Resolvida', classes: 'bg-slate-800 border-slate-700 text-slate-300', dot: 'bg-slate-500' };
    }
  };

  const cat = getCategoryIcon(occurrence.type);
  const CatIcon = cat.Icon;
  const statusConfig = getStatusStyle(occurrence.status);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-16 animate-in fade-in duration-200">
      {/* Top Back Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white text-xs sm:text-sm font-semibold transition-all shadow-sm cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Voltar às ocorrências</span>
        </button>

        <div className="flex items-center gap-2">
          {isCommunityVerified && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/50">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Verificado pela Comunidade</span>
            </span>
          )}

          <FavoriteButton
            item={{
              id: `occ-${occurrence.id}`,
              type: occurrence.companyOrService ? 'operador' : 'local',
              category: occurrence.companyOrService ? 'transportes' : 'locais',
              title: occurrence.title,
              subtitle: `${occurrence.companyOrService || occurrence.type} • ${occurrence.concelho}, ${occurrence.district}`,
              locality: occurrence.concelho,
              district: occurrence.district,
            }}
            size="sm"
            showLabel
          />

          <button
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            title="Copiar link do report"
          >
            <Share2 className="w-3.5 h-3.5 text-blue-400" />
            <span>{copiedLink ? 'Link copiado!' : 'Partilhar'}</span>
          </button>

          <button
            onClick={handleFlagReport}
            disabled={isFlagged || occurrence.reportedBy?.includes(voterId)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              isFlagged || occurrence.reportedBy?.includes(voterId)
                ? 'bg-red-950/40 text-red-400 border-red-800/60 cursor-default'
                : 'bg-slate-900/90 hover:bg-red-950/20 text-slate-400 hover:text-red-400 border-slate-700/80'
            }`}
            title="Denunciar este alerta por falsidade ou spam"
          >
            <Flag className="w-3.5 h-3.5 text-red-400" />
            <span>{isFlagged || occurrence.reportedBy?.includes(voterId) ? 'Denunciado' : 'Denunciar'}</span>
          </button>
        </div>
      </div>

      {flagSuccessMsg && (
        <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-600/70 text-amber-200 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{flagSuccessMsg}</span>
        </div>
      )}

      {/* Detailed Confidence and Verification Status Meter */}
      <ConfidenceMeter occurrence={occurrence} variant="detailed" />

      {/* Main Report Card */}
      <div className="rounded-3xl bg-[#0a0f1d] border border-slate-800/90 shadow-2xl overflow-hidden">
        {/* Main Photo (if available) */}
        {occurrence.imageUrl && (
          <div className="relative h-64 sm:h-80 md:h-96 w-full bg-slate-950 overflow-hidden">
            <img
              src={occurrence.imageUrl}
              alt={occurrence.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1d] via-transparent to-black/40" />
            <div className="absolute bottom-4 left-4 sm:left-6 flex items-center gap-2 text-xs text-white/90 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
              <Camera className="w-3.5 h-3.5 text-blue-400" />
              <span>Fotografia reportada no local</span>
            </div>
          </div>
        )}

        <div className="p-5 sm:p-8 space-y-6">
          {/* Header Badges Row: Category, Severity, Operational Status, Date/Time */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Category */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${cat.color}`}>
              <CatIcon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
            </div>

            {/* Severity */}
            <span className={`px-3 py-1 rounded-xl text-xs font-bold uppercase tracking-wider border ${getSeverityStyle(occurrence.severity)}`}>
              Gravidade: {occurrence.severity}
            </span>

            {/* Operational Status */}
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border ${statusConfig.classes}`}>
              <span className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
              <span>{statusConfig.label}</span>
            </div>

            {/* Time / Date */}
            <div className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{occurrence.reportedAt} ({formattedDateTime})</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            {occurrence.title}
          </h1>

          {/* Location & Service Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 rounded-2xl bg-[#0e1628] border border-slate-800">
            {/* Location (District & Concelho) */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Localização
                </span>
                <span className="text-sm font-bold text-slate-100 block">
                  {occurrence.district} {occurrence.concelho && occurrence.concelho !== occurrence.district ? `· ${occurrence.concelho}` : ''}
                </span>
                {occurrence.locationDetails && (
                  <span className="text-xs text-slate-300 block truncate mt-0.5">
                    {occurrence.locationDetails}
                  </span>
                )}
              </div>
            </div>

            {/* Company / Service */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Building className="w-4 h-4 text-amber-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Empresa / Operador
                </span>
                <span className="text-sm font-bold text-slate-100 block">
                  {occurrence.companyOrService || 'Tráfego / Infraestrutura Geral'}
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  Rede Nacional de Portugal
                </span>
              </div>
            </div>

            {/* Timestamp & Origin */}
            <div className="flex items-start gap-3 sm:col-span-2 lg:col-span-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Calendar className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Hora do Registo
                </span>
                <span className="text-sm font-bold text-slate-100 block">
                  {occurrence.reportedAt}
                </span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  {formattedDateTime}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              Descrição do Evento
            </h3>
            <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 text-sm sm:text-base text-slate-200 leading-relaxed whitespace-pre-wrap">
              {occurrence.description || 'Sem descrição adicional fornecida.'}
            </div>
          </div>

          {/* Author & Reputation Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0d1527] border border-slate-800/90">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
              Origem do Report & Reputação do Autor
            </span>

            {occurrence.authorId ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  {authorProfile?.photoURL ? (
                    <img
                      src={authorProfile.photoURL}
                      alt={occurrence.authorName || 'Autor'}
                      className="w-12 h-12 rounded-full border border-blue-500/40 object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-lg flex items-center justify-center border border-blue-400/30 shadow-md shadow-blue-600/20">
                      {(occurrence.authorName || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white">
                        {occurrence.authorName || authorProfile?.displayName || 'Colaborador Registado'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold">
                        ★ Membro Verificado
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1 text-amber-300 font-semibold">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        <span>{authorProfile?.badge || 'Colaborador Ativo'}</span>
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">
                        {authorProfile?.reputationPoints ?? 50} pts de reputação
                      </span>
                      <span>
                        • {authorProfile?.reportsCount ?? 1} reports submetidos
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 sm:text-right bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 block font-semibold">Impacto Comunitário</span>
                  <span>Confirmar este report atribui +5 pts ao autor</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/50 border border-slate-800/80">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Info className="w-4 h-4 text-blue-400" />
                  <span>Reportado de forma anónima pela comunidade de passageiros.</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  Report Anónimo
                </span>
              </div>
            )}
          </div>

          {/* Community Confirmation Voting Box */}
          <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-[#0c1424] via-slate-900 to-[#0c1424] border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Confirmação Comunitária</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Estás no local ou tens informação direta? Ajuda os outros cidadãos validando este report.
                </p>
              </div>

              {/* Counts display */}
              <div className="flex items-center gap-3 text-right">
                <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-700/60 text-xs font-mono font-bold text-emerald-300">
                  {confirmations} {confirmations === 1 ? 'confirmação' : 'confirmações'}
                </div>
                {unconfirmed > 0 && (
                  <div className="px-3 py-1.5 rounded-xl bg-rose-950/80 border border-rose-800/60 text-xs font-mono font-bold text-rose-300">
                    {unconfirmed} {unconfirmed === 1 ? 'não confirmado' : 'não confirmados'}
                  </div>
                )}
              </div>
            </div>

            {/* Voting Feedback alert */}
            {voteFeedback && (
              <div className="p-3 rounded-xl bg-blue-950/80 border border-blue-800 text-xs text-blue-200 text-center font-medium animate-in fade-in">
                {voteFeedback}
              </div>
            )}

            {/* Action Buttons: "Confirmar" e "Não confirmado" */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={() => handleVoteClick('confirm')}
                className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                  hasConfirmed
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                    : 'bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-700/60 text-emerald-300 hover:text-white'
                }`}
              >
                <ThumbsUp className={`w-4 h-4 ${hasConfirmed ? 'fill-white' : 'text-emerald-400'}`} />
                <span>Confirmar Ocorrência ({confirmations})</span>
                {hasConfirmed && <CheckCircle2 className="w-4 h-4 ml-1 text-white" />}
              </button>

              <button
                onClick={() => handleVoteClick('unconfirm')}
                className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                  hasUnconfirmed
                    ? 'bg-rose-900 border-rose-600 text-white shadow-lg shadow-rose-900/30 ring-2 ring-rose-500/50'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-rose-700/50'
                }`}
              >
                <ThumbsDown className={`w-4 h-4 ${hasUnconfirmed ? 'fill-white' : 'text-rose-400'}`} />
                <span>Não confirmado ({unconfirmed})</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              Sistema de prevenção de votos duplicados por conta e dispositivo ativo.
            </p>
          </div>
        </div>
      </div>

      {/* Related Occurrences in the same district/operator */}
      {relatedOccurrences.length > 0 && (
        <div className="space-y-3 pt-4">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Outras Ocorrências em {occurrence.district}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {relatedOccurrences.slice(0, 4).map((rel) => {
              const relCat = getCategoryIcon(rel.type);
              const RelIcon = relCat.Icon;
              const relConfs = rel.confirmationsCount !== undefined ? rel.confirmationsCount : (rel.upvotes || 0);

              return (
                <div
                  key={rel.id}
                  onClick={() => onSelectOccurrence(rel)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-[#090e1a]/90 hover:bg-slate-800/60 border border-slate-800 hover:border-slate-700 p-3 transition-all cursor-pointer gap-3 group"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-slate-700 bg-slate-800 group-hover:scale-105 transition-transform">
                    <RelIcon className="w-4 h-4 text-blue-400" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs sm:text-sm font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate">
                      {rel.title}
                    </h4>
                    <span className="text-[11px] text-slate-400 block truncate">
                      {rel.reportedAt} · {rel.locationDetails || rel.district}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[11px] text-emerald-400 font-bold shrink-0">
                    <ThumbsUp className="w-3 h-3 text-emerald-400" />
                    <span>{relConfs}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
