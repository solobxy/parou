import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  ThumbsUp, 
  MessageSquare, 
  MapPin, 
  X,
  ChevronDown,
  ChevronUp,
  Send
} from 'lucide-react';
import { Complaint, ComplaintComment, UserProfile } from '../types';
import { 
  subscribeComplaints, 
  createComplaint, 
  voteComplaint, 
  subscribeComplaintComments,
  addComplaintComment,
  getVoterId,
  checkReportRateLimit,
  recordReportSubmission
} from '../services/conta';
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
  'Outro',
];

export const ReclamacoesView: React.FC<ReclamacoesViewProps> = ({
  currentUser,
}) => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedCommentsId, setExpandedCommentsId] = useState<string | null>(null);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [activeComments, setActiveComments] = useState<Record<string, ComplaintComment[]>>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterOperator, setFilterOperator] = useState('Todos');

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formText, setFormText] = useState('');
  const [formCompany, setFormCompany] = useState(COMMON_OPERATORS[0]);
  const [formDistrict, setFormDistrict] = useState('Lisboa');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeComplaints((list) => {
      setComplaints(list);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const voterId = useMemo(() => getVoterId(), []);

  const handleVote = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await voteComplaint(id, voterId);
  };

  const handleToggleComments = (id: string) => {
    if (expandedCommentsId === id) {
      setExpandedCommentsId(null);
    } else {
      setExpandedCommentsId(id);
      subscribeComplaintComments(id, (comments) => {
        setActiveComments((prev) => ({ ...prev, [id]: comments }));
      });
    }
  };

  const handleAddComment = async (e: React.FormEvent, complaintId: string) => {
    e.preventDefault();
    const text = (commentInputs[complaintId] || '').trim();
    if (!text) return;

    setSubmittingComment(complaintId);
    try {
      await addComplaintComment(
        complaintId,
        text,
        currentUser?.displayName || 'Anónimo',
        currentUser?.uid || 'anonimo'
      );
      setCommentInputs((prev) => ({ ...prev, [complaintId]: '' }));
    } finally {
      setSubmittingComment(null);
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formText.trim()) {
      setFormError('Preencha o título e a descrição.');
      return;
    }

    if (!checkReportRateLimit()) {
      setFormError('Aguarde alguns minutos antes de submeter novamente.');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      await createComplaint({
        title: formTitle.trim(),
        text: formText.trim(),
        companyOrService: formCompany,
        company: formCompany,
        serviceType: 'Transportes',
        district: formDistrict,
        concelho: formDistrict,
        authorName: currentUser?.displayName || 'Anónimo',
        authorId: currentUser?.uid || 'anonimo',
        timestamp: Date.now(),
      });

      recordReportSubmission();
      setIsModalOpen(false);
      setFormTitle('');
      setFormText('');
    } catch (err: any) {
      setFormError(err.message || 'Erro ao submeter reclamação.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      const companyName = c.company || c.companyOrService || '';
      if (filterOperator !== 'Todos' && companyName !== filterOperator) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.text.toLowerCase().includes(q) ||
          companyName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [complaints, filterOperator, searchQuery]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto py-2 px-3 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6E6E3] pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Reclamações
          </h1>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Partilha e consulta experiências com os operadores.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#FF6B1A] text-[#111111] font-bold text-xs rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nova Reclamação</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="p-3 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B6B6B] stroke-[2]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por assunto ou operador..."
            className="w-full pl-9 pr-3 py-2 bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['Todos', ...COMMON_OPERATORS].map((op) => (
            <button
              key={op}
              onClick={() => setFilterOperator(op)}
              className={`px-3 py-1.5 rounded-[8px] text-xs font-semibold whitespace-nowrap min-h-[36px] transition-colors cursor-pointer ${
                filterOperator === op
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'bg-[#FFFFFF] text-[#6B6B6B] hover:text-[#111111] border border-[#E6E6E3]'
              }`}
            >
              {op}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="border border-[#E6E6E3] rounded-[8px] bg-[#FFFFFF] divide-y divide-[#E6E6E3] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-[#6B6B6B]">
            A carregar reclamações...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#6B6B6B]">
            Sem reclamações registadas.
          </div>
        ) : (
          filtered.map((item) => {
            const isExpanded = expandedCommentsId === item.id;
            const comments = activeComments[item.id] || [];
            const hasVoted = item.upvoters?.includes(voterId);

            return (
              <div key={item.id} className="p-4 hover:bg-[#F4F4F2]/50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-[#6B6B6B]">
                      <strong className="text-[#111111]">{item.company}</strong>
                      <span>·</span>
                      <span>{item.district}</span>
                      <span>·</span>
                      <span className="font-condensada tabular-nums">
                        {new Date(item.timestamp).toLocaleDateString('pt-PT')}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-[#111111] leading-snug">
                      {item.title}
                    </h3>

                    <p className="text-sm text-[#6B6B6B] leading-relaxed">
                      {item.text}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => handleVote(e, item.id)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-xs font-semibold min-h-[36px] transition-colors cursor-pointer ${
                        hasVoted
                          ? 'bg-[#111111] text-[#FFFFFF]'
                          : 'bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111]'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5 stroke-[2]" />
                      <span className="font-condensada tabular-nums">{item.upvotes || 0}</span>
                    </button>

                    <button
                      onClick={() => handleToggleComments(item.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] bg-[#F4F4F2] hover:bg-[#E6E6E3] text-[#111111] text-xs font-semibold min-h-[36px] cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 stroke-[2]" />
                      <span className="font-condensada tabular-nums">{item.commentsCount || 0}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Comments */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-[#E6E6E3] space-y-2.5 pl-2">
                    {comments.length > 0 && (
                      <div className="space-y-1.5 divide-y divide-[#E6E6E3]">
                        {comments.map((com) => (
                          <div key={com.id} className="pt-1.5 text-xs">
                            <div className="flex items-center gap-2 text-[#6B6B6B]">
                              <strong className="text-[#111111]">{com.authorName}</strong>
                              <span className="font-condensada tabular-nums">
                                {new Date(com.timestamp).toLocaleTimeString('pt-PT')}
                              </span>
                            </div>
                            <p className="text-[#111111] mt-0.5">{com.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New comment input */}
                    <form onSubmit={(e) => handleAddComment(e, item.id)} className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={commentInputs[item.id] || ''}
                        onChange={(e) => setCommentInputs({ ...commentInputs, [item.id]: e.target.value })}
                        placeholder="Escrever comentário..."
                        className="flex-1 px-3 py-1.5 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[6px] text-xs text-[#111111] min-h-[36px]"
                      />
                      <button
                        type="submit"
                        disabled={submittingComment === item.id}
                        className="p-2 bg-[#111111] text-[#FFFFFF] rounded-[6px] cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                      >
                        <Send className="w-3.5 h-3.5 stroke-[2]" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* New Complaint Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] max-w-lg w-full p-4 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E6E6E3] pb-2">
              <h2 className="text-base font-bold text-[#111111]">Nova Reclamação</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-[#6B6B6B] hover:text-[#111111]"
              >
                <X className="w-5 h-5 stroke-[2]" />
              </button>
            </div>

            {formError && <p className="text-xs text-[#D92D20]">{formError}</p>}

            <form onSubmit={handleSubmitComplaint} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#6B6B6B] font-semibold mb-1">Operador</label>
                <select
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  className="w-full p-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-[#111111] min-h-[44px]"
                >
                  {COMMON_OPERATORS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#6B6B6B] font-semibold mb-1">Título</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Supressão de comboio sem aviso"
                  className="w-full p-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-[#6B6B6B] font-semibold mb-1">Descrição</label>
                <textarea
                  rows={4}
                  required
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder="Explique o que aconteceu..."
                  className="w-full p-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] min-h-[80px]"
                />
              </div>

              <div>
                <label className="block text-[#6B6B6B] font-semibold mb-1">Distrito</label>
                <select
                  value={formDistrict}
                  onChange={(e) => setFormDistrict(e.target.value)}
                  className="w-full p-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-[#111111] min-h-[44px]"
                >
                  {CIDADES_OPTIONS.filter((c) => c !== 'Todas').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="w-full py-2.5 bg-[#FF6B1A] text-[#111111] font-bold text-sm rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer"
                >
                  {formSubmitting ? 'A submeter...' : 'Submeter Reclamação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
