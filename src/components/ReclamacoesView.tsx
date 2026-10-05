import React, { useState, useEffect, useMemo } from 'react';
import { 
  MessageSquare, 
  Star, 
  Building, 
  MapPin, 
  Clock, 
  Calendar, 
  ThumbsUp, 
  Flag, 
  Plus, 
  Search, 
  Filter, 
  AlertCircle, 
  Send, 
  ChevronDown, 
  ChevronUp, 
  ShieldAlert, 
  Sparkles, 
  Check, 
  X,
  Info,
  Radio,
  Train,
  Bus,
  Car
} from 'lucide-react';
import { Complaint, ComplaintComment, UserProfile } from '../types';
import { 
  subscribeComplaints, 
  createComplaint, 
  voteComplaint, 
  reportComplaint,
  subscribeComplaintComments,
  addComplaintComment,
  seedComplaintsIfEmpty,
  getVoterId,
  checkReportRateLimit,
  recordReportSubmission,
  detectSpamKeywords
} from '../services/firebase';
import { CIDADES_OPTIONS } from '../data/mockData';

interface ReclamacoesViewProps {
  currentUser?: UserProfile | null;
  onOpenLoginModal?: () => void;
}

const COMMON_OPERATORS = [
  'CP - Comboios de Portugal',
  'Metro de Lisboa',
  'Metro do Porto',
  'Carris',
  'STCP',
  'Fertagus',
  'Carris Metropolitana',
  'Transtejo Soflusa',
  'Brisa / Autoestradas',
  'Rede Expressos',
  'FlixBus',
  'Outro',
];

const SERVICE_TYPES = [
  'Comboio',
  'Autocarro',
  'Metro',
  'Barco',
  'Elétrico',
  'Autoestrada',
  'Outro',
];

export const ReclamacoesView: React.FC<ReclamacoesViewProps> = ({
  currentUser,
  onOpenLoginModal,
}) => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedCommentsId, setExpandedCommentsId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentAuthorNames, setCommentAuthorNames] = useState<Record<string, string>>({});
  const [activeComments, setActiveComments] = useState<Record<string, ComplaintComment[]>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOperator, setFilterOperator] = useState('Todos');
  const [filterDistrict, setFilterDistrict] = useState('Todos');
  const [sortBy, setSortBy] = useState<'recentes' | 'apoios' | 'comentadas'>('recentes');

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formText, setFormText] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formServiceType, setFormServiceType] = useState('Comboio');
  const [formRating, setFormRating] = useState<number | null>(null);
  const [formDistrict, setFormDistrict] = useState('Lisboa');
  const [formConcelho, setFormConcelho] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formIncidentDate, setFormIncidentDate] = useState('Hoje');
  const [formAuthorName, setFormAuthorName] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Flag modal or feedback
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  const voterId = useMemo(() => getVoterId(currentUser?.userId), [currentUser]);

  // Subscribe to real-time complaints
  useEffect(() => {
    seedComplaintsIfEmpty();
    const unsub = subscribeComplaints(
      (list) => {
        setComplaints(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Real-time complaints sync warning:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Set default author name if logged in
  useEffect(() => {
    if (currentUser?.displayName) {
      setFormAuthorName(currentUser.displayName);
    }
  }, [currentUser]);

  // Subscribe to comments when a card is expanded
  useEffect(() => {
    if (!expandedCommentsId) return;
    const unsub = subscribeComplaintComments(expandedCommentsId, (comments) => {
      setActiveComments((prev) => ({ ...prev, [expandedCommentsId]: comments }));
    });
    return () => unsub();
  }, [expandedCommentsId]);

  // Handle voting
  const handleVote = async (comp: Complaint) => {
    const isNowVoted = await voteComplaint(comp.id, voterId);
    setVotedIds((prev) => {
      const next = new Set(prev);
      if (isNowVoted) next.add(comp.id);
      else next.delete(comp.id);
      return next;
    });
  };

  // Handle reporting/flagging
  const handleReport = async (comp: Complaint) => {
    if (flaggedIds.has(comp.id)) return;
    const confirmed = window.confirm(
      'Deseja denunciar esta publicação por spam, difamação, linguagem ofensiva ou desinformação?'
    );
    if (!confirmed) return;

    const res = await reportComplaint(comp.id, voterId);
    if (res.success) {
      setFlaggedIds((prev) => new Set(prev).add(comp.id));
      alert(
        res.status === 'Ocultada'
          ? 'A publicação atingiu o limite de denúncias comunitárias e foi ocultada para moderação.'
          : res.status === 'Em análise'
          ? 'A publicação foi colocada sob moderação ("Em análise") devido a denúncias comunitárias.'
          : 'Obrigado. A sua denúncia foi registada e será analisada pela moderação.'
      );
    }
  };

  // Handle comment submit
  const handleAddComment = async (comp: Complaint) => {
    const text = commentInputs[comp.id]?.trim();
    if (!text) return;

    const author =
      currentUser?.displayName ||
      commentAuthorNames[comp.id]?.trim() ||
      'Passageiro';

    setSubmittingComment(comp.id);
    try {
      await addComplaintComment(comp.id, text, author, currentUser?.userId);
      setCommentInputs((prev) => ({ ...prev, [comp.id]: '' }));
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setSubmittingComment(null);
    }
  };

  // Handle form submit
  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();

    // 0. Anti-spam Rate Limiting
    const rateCheck = checkReportRateLimit();
    if (!rateCheck.allowed) {
      setFormError(`Limite de envios atingido. Por favor aguarde ${rateCheck.remainingSeconds}s antes de submeter nova publicação.`);
      return;
    }

    if (!formTitle.trim()) {
      setFormError('Por favor insira um título para a reclamação.');
      return;
    }
    if (!formText.trim()) {
      setFormError('Por favor descreva a sua experiência ou reclamação.');
      return;
    }
    if (!formCompany.trim()) {
      setFormError('Por favor indique a empresa ou serviço visado.');
      return;
    }

    // 0.1 Anti-spam keywords detection
    const spamCheck = detectSpamKeywords(`${formTitle} ${formText} ${formCompany} ${formLocation}`);
    if (spamCheck.isSpam) {
      setFormError(spamCheck.reason || 'O conteúdo contém linguagem ou links não permitidos.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      await createComplaint({
        title: formTitle.trim(),
        text: formText.trim(),
        companyOrService: formCompany.trim(),
        serviceType: formServiceType,
        rating: formRating || undefined,
        district: formDistrict,
        concelho: formConcelho.trim() || undefined,
        locationDetails: formLocation.trim() || undefined,
        incidentDate: formIncidentDate.trim() || 'Hoje',
        timestamp: Date.now(),
        authorId: currentUser?.userId,
        authorName: formAuthorName.trim() || currentUser?.displayName || 'Passageiro Anónimo',
      });

      recordReportSubmission();

      // Reset form
      setFormTitle('');
      setFormText('');
      setFormCompany('');
      setFormRating(null);
      setFormLocation('');
      setFormConcelho('');
      setIsModalOpen(false);
    } catch (err) {
      setFormError('Erro ao submeter reclamação. Tente novamente.');
      console.error(err);
    } finally {
      setFormSubmitting(false);
    }
  };

  // Filter and sort complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      // Hide moderated items unless user is author
      if (c.status === 'Ocultada' && c.authorId !== currentUser?.userId) {
        return false;
      }

      if (filterOperator !== 'Todos') {
        if (!c.companyOrService.toLowerCase().includes(filterOperator.toLowerCase())) {
          return false;
        }
      }

      if (filterDistrict !== 'Todos') {
        if (c.district.toLowerCase() !== filterDistrict.toLowerCase()) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          c.title.toLowerCase().includes(q) ||
          c.text.toLowerCase().includes(q) ||
          c.companyOrService.toLowerCase().includes(q) ||
          c.district.toLowerCase().includes(q) ||
          (c.locationDetails && c.locationDetails.toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'apoios') return (b.upvotes || 0) - (a.upvotes || 0);
      if (sortBy === 'comentadas') return (b.commentsCount || 0) - (a.commentsCount || 0);
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }, [complaints, filterOperator, filterDistrict, searchQuery, sortBy, currentUser]);

  return (
    <div className="w-full space-y-5 pb-16">
      {/* 1. Header Banner & Clear Differentiation Notice */}
      <div className="rounded-2xl sm:rounded-3xl bg-[#090e1a]/95 border border-slate-800/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-purple-500/15 border border-purple-500/30 text-purple-300">
                <MessageSquare className="w-3 h-3 text-purple-400" />
                Voz do Passageiro • Opiniões
              </span>
              <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" />
                Firestore Ativo
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Portal de Reclamações e Experiências
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Espaço comunitário para partilhar queixas, sugestões e testemunhos sobre a qualidade do serviço prestado pelos operadores de transporte em Portugal.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-purple-600/25 border border-purple-400/30 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nova Reclamação</span>
            </button>
          </div>
        </div>

        {/* Clear Legal / Distinction Callout */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-start gap-3 bg-purple-950/20 border border-purple-900/30 p-3 rounded-xl text-xs text-purple-200/90">
          <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <p className="leading-snug">
            <strong>Distinção Importante:</strong> Esta secção reúne <em>opiniões, testemunhos e avaliações subjetivas</em> dos passageiros. Para alertas factuais imediatos (como cortes de vias, avarias mecânicas de tráfego e greves em curso), consulte o <span className="underline font-bold text-purple-300">Mapa</span> ou os <span className="underline font-bold text-purple-300">Reports em Direto</span>.
          </p>
        </div>
      </div>

      {/* 2. Filters & Search Strip */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-md">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por empresa, linha, estação ou queixa..."
            className="w-full pl-9 pr-3 py-2 bg-slate-950/80 border border-slate-800 focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        {/* Selects */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Operator Filter */}
          <select
            value={filterOperator}
            onChange={(e) => setFilterOperator(e.target.value)}
            className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="Todos">Todos os Operadores</option>
            {COMMON_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>

          {/* District Filter */}
          <select
            value={filterDistrict}
            onChange={(e) => setFilterDistrict(e.target.value)}
            className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="Todos">Todos os Distritos</option>
            {CIDADES_OPTIONS.filter((c) => c !== 'Todas').map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="recentes">Mais recentes</option>
            <option value="apoios">Mais apoiadas</option>
            <option value="comentadas">Mais comentadas</option>
          </select>
        </div>
      </div>

      {/* 3. Feed of Complaints */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          <p className="text-xs">A carregar reclamações do Firestore...</p>
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="p-10 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center space-y-3">
          <MessageSquare className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-white">Nenhuma reclamação encontrada</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Não foram encontradas reclamações com os filtros selecionados. Seja o primeiro a partilhar a sua experiência com os transportes.
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-500 transition-colors"
          >
            Criar Nova Reclamação
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredComplaints.map((comp) => {
            const isCommentsOpen = expandedCommentsId === comp.id;
            const commentsList = activeComments[comp.id] || [];
            const hasVoted = votedIds.has(comp.id) || (comp.upvotedBy && comp.upvotedBy.includes(voterId));
            const isFlagged = flaggedIds.has(comp.id) || (comp.reportedBy && comp.reportedBy.includes(voterId));

            return (
              <article
                key={comp.id}
                className="rounded-2xl sm:rounded-3xl bg-[#090e1a]/90 border border-slate-800/80 hover:border-slate-700/80 p-4 sm:p-5 shadow-lg transition-all"
              >
                {/* Post Top Metadata Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Explicit Opinion Badge */}
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      ★ OPINIÃO PESSOAL
                    </span>

                    {/* Em análise Badge */}
                    {comp.status === 'Em análise' && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                        Em análise
                      </span>
                    )}

                    {/* Operator Badge */}
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-800/90 text-slate-200 border border-slate-700/70 flex items-center gap-1.5">
                      <Building className="w-3 h-3 text-purple-400" />
                      {comp.companyOrService}
                    </span>

                    {/* Service Type */}
                    {comp.serviceType && (
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-900 text-slate-300 border border-slate-800">
                        {comp.serviceType}
                      </span>
                    )}

                    {/* Star Rating if present */}
                    {typeof comp.rating === 'number' && (
                      <div className="flex items-center gap-0.5 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`w-3 h-3 ${
                              star <= (comp.rating || 0)
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Date & Location */}
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {new Date(comp.timestamp).toLocaleDateString('pt-PT', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>

                {/* Complaint Title */}
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight mb-2">
                  {comp.title}
                </h3>

                {/* Complaint Narrative Body */}
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line mb-3.5">
                  {comp.text}
                </p>

                {/* Location & Details Strip */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mb-4 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>
                      {comp.district}
                      {comp.concelho ? ` • ${comp.concelho}` : ''}
                      {comp.locationDetails ? ` (${comp.locationDetails})` : ''}
                    </span>
                  </div>

                  {comp.incidentDate && (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Incidente: {comp.incidentDate}</span>
                    </div>
                  )}

                  <div className="ml-auto text-[11px] text-slate-400">
                    Publicado por: <strong className="text-slate-200">{comp.authorName}</strong>
                  </div>
                </div>

                {/* Card Interaction Actions Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/70 text-xs">
                  <div className="flex items-center gap-2">
                    {/* Upvote / Concordar */}
                    <button
                      onClick={() => handleVote(comp)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all ${
                        hasVoted
                          ? 'bg-purple-600/30 text-purple-300 border border-purple-500/50'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                      title="Concordar / Apoiar esta queixa"
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${hasVoted ? 'fill-purple-400 text-purple-400' : ''}`} />
                      <span>{comp.upvotes || 0}</span>
                      <span className="hidden sm:inline">Apoios</span>
                    </button>

                    {/* Toggle Comments Button */}
                    <button
                      onClick={() =>
                        setExpandedCommentsId(isCommentsOpen ? null : comp.id)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      <span>{comp.commentsCount || 0}</span>
                      <span className="hidden sm:inline">Comentários</span>
                      {isCommentsOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                      )}
                    </button>
                  </div>

                  {/* Denunciar Post */}
                  <button
                    onClick={() => handleReport(comp)}
                    disabled={isFlagged}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-colors ${
                      isFlagged
                        ? 'text-red-400 bg-red-950/30 border border-red-900/40 cursor-default'
                        : 'text-slate-500 hover:text-red-400 hover:bg-red-950/20'
                    }`}
                    title="Denunciar conteúdo abusivo ou falso"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span className="text-[11px]">
                      {isFlagged ? 'Denunciado' : 'Denunciar'}
                    </span>
                  </button>
                </div>

                {/* 4. Comments Accordion Panel */}
                {isCommentsOpen && (
                  <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3 bg-slate-950/40 p-3.5 rounded-2xl">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      Comentários da Comunidade ({commentsList.length})
                    </h4>

                    {/* Existing Comments List */}
                    {commentsList.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">
                        Ainda não existem comentários. Deixe a sua opinião ou experiência semelhante abaixo.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {commentsList.map((comm) => (
                          <div
                            key={comm.id}
                            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span className="font-bold text-slate-200">
                                {comm.authorName}
                              </span>
                              <span className="font-mono text-slate-500">
                                {new Date(comm.timestamp).toLocaleTimeString('pt-PT', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="text-slate-300 leading-snug">{comm.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New Comment Input */}
                    <div className="pt-2 space-y-2">
                      {!currentUser && (
                        <input
                          type="text"
                          value={commentAuthorNames[comp.id] || ''}
                          onChange={(e) =>
                            setCommentAuthorNames((prev) => ({
                              ...prev,
                              [comp.id]: e.target.value,
                            }))
                          }
                          placeholder="O seu nome (ex: Maria Santos)"
                          className="w-full sm:w-64 px-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-lg text-xs text-white placeholder-slate-500"
                        />
                      )}

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={commentInputs[comp.id] || ''}
                          onChange={(e) =>
                            setCommentInputs((prev) => ({
                              ...prev,
                              [comp.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddComment(comp);
                          }}
                          placeholder="Escreva um comentário ou testemunho..."
                          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 focus:border-purple-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                        <button
                          onClick={() => handleAddComment(comp)}
                          disabled={submittingComment === comp.id || !commentInputs[comp.id]?.trim()}
                          className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Comentar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* 5. Modal: Criar Nova Reclamação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl rounded-3xl bg-[#0d1322] border border-slate-700/80 p-5 sm:p-7 shadow-2xl space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    Publicar Reclamação / Opinião
                  </h2>
                  <p className="text-xs text-slate-400">
                    A sua experiência ficará pública no portal comunitário do PAROU.PT
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitComplaint} className="space-y-4 text-xs">
              {/* Operator & Service Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">
                    Empresa ou Operador <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCompany}
                    onChange={(e) => setFormCompany(e.target.value)}
                    placeholder="ex: Carris, CP, Metro do Porto..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                  {/* Quick Pill Suggestions */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {['CP', 'Carris', 'Metro Lisboa', 'STCP', 'Fertagus'].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setFormCompany(sug)}
                        className="px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Tipo de Transporte/Serviço</label>
                  <select
                    value={formServiceType}
                    onChange={(e) => setFormServiceType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  >
                    {SERVICE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">
                  Título Resumido <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="ex: Atrasos reiterados e sobrelotação na Linha Amarela"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Rating (Optional 1 to 5 stars) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold">
                    Avaliação do Serviço (Opcional)
                  </label>
                  {formRating && (
                    <button
                      type="button"
                      onClick={() => setFormRating(null)}
                      className="text-[11px] text-purple-400 hover:underline"
                    >
                      Remover avaliação
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 p-2 rounded-xl bg-slate-900 border border-slate-800 w-fit">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormRating(star)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-5 h-5 ${
                          formRating && star <= formRating
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-600 hover:text-amber-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-[11px] font-mono text-slate-400 ml-2">
                    {formRating ? `${formRating} / 5 estrelas` : 'Sem classificação'}
                  </span>
                </div>
              </div>

              {/* Location: District & Concelho */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">
                    Distrito <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formDistrict}
                    onChange={(e) => setFormDistrict(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  >
                    {CIDADES_OPTIONS.filter((c) => c !== 'Todas').map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Concelho / Zona</label>
                  <input
                    type="text"
                    value={formConcelho}
                    onChange={(e) => setFormConcelho(e.target.value)}
                    placeholder="ex: Cascais, Matosinhos, Braga..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Location details & Incident date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Estação, Linha ou Paragem</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="ex: Estação Oriente, Linha 758, Paragem Saldanha"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Quando ocorreu?</label>
                  <input
                    type="text"
                    value={formIncidentDate}
                    onChange={(e) => setFormIncidentDate(e.target.value)}
                    placeholder="ex: Hoje às 08:30, Ontem à tarde..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Text Description */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold">
                    Descrição Detalhada da Reclamação <span className="text-red-400">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500">{formText.length}/2000</span>
                </div>
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="Explique o que aconteceu, o impacto sofrido e que melhoria solicita ao operador..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500 resize-none"
                />
              </div>

              {/* Author name */}
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold">Nome a Exibir</label>
                <input
                  type="text"
                  value={formAuthorName}
                  onChange={(e) => setFormAuthorName(e.target.value)}
                  placeholder={currentUser?.displayName || 'O seu nome ou "Passageiro da Linha"'}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Clarity Notice */}
              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-900/40 text-[11px] text-purple-300">
                Esta publicação será classificada como <strong>Opinião / Reclamação</strong> no PAROU.PT, promovendo a transparência e a melhoria dos serviços públicos em Portugal.
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {formSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>A submeter...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Publicar Reclamação</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
