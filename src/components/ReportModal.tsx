import React, { useState, useMemo, useRef } from 'react';
import { 
  X, 
  AlertTriangle, 
  MapPin, 
  Building, 
  Train, 
  Car,
  Bus,
  Zap,
  Users,
  Wrench,
  CheckCircle2, 
  Upload, 
  FileText,
  AlertCircle,
  Award,
  Sparkles,
  Clock,
  Calendar,
  Camera,
  Image as ImageIcon,
  Trash2,
  Navigation
} from 'lucide-react';
import { Occurrence, OccurrenceType, SeverityLevel, UserProfile } from '../types';
import { 
  CIDADES_OPTIONS, 
  CONCELHOS_BY_CIDADE, 
  TRANSPORTES_OPTIONS,
  PORTUGAL_DISTRICTS 
} from '../data/mockData';
import {
  checkReportRateLimit,
  recordReportSubmission,
  detectDuplicateReport,
  detectSpamKeywords
} from '../services/firebase';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitReport: (newOccurrence: Occurrence) => Promise<string | void> | void;
  currentUser?: UserProfile | null;
  existingReports?: Occurrence[];
  onConfirmExisting?: (id: string) => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onSubmitReport,
  currentUser,
  existingReports,
  onConfirmExisting,
}) => {
  // Category & Severity
  const [type, setType] = useState<OccurrenceType>('ACIDENTE');
  const [severity, setSeverity] = useState<SeverityLevel>('Moderada');

  // Title & Description
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Location: District, Concelho, Detailed address & Map Pin
  const [district, setDistrict] = useState('Lisboa');
  const [concelho, setConcelho] = useState('Lisboa');
  const [locationDetails, setLocationDetails] = useState('');

  // Company / Operator
  const [companyOrService, setCompanyOrService] = useState('Metro de Lisboa');
  const [customCompany, setCustomCompany] = useState('');
  const [isCustomCompany, setIsCustomCompany] = useState(false);

  // Date and Time
  const [isRealtimeNow, setIsRealtimeNow] = useState(true);
  const [customDateTime, setCustomDateTime] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });

  // Photo
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Status & Validation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedDuplicate, setDetectedDuplicate] = useState<Occurrence | null>(null);
  const [ignoreDuplicateWarning, setIgnoreDuplicateWarning] = useState<boolean>(false);

  // Concelho options for current selected district
  const availableConcelhos = useMemo(() => {
    const list = CONCELHOS_BY_CIDADE[district];
    if (list && list.length > 0) {
      return list.filter((c) => c !== 'Todos');
    }
    return [district];
  }, [district]);

  // Update concelho when district changes
  const handleDistrictChange = (newDistrict: string) => {
    setDistrict(newDistrict);
    const concelhoList = CONCELHOS_BY_CIDADE[newDistrict];
    if (concelhoList && concelhoList.length > 0) {
      const firstValid = concelhoList.find((c) => c !== 'Todos') || newDistrict;
      setConcelho(firstValid);
    } else {
      setConcelho(newDistrict);
    }
  };

  // Image Upload handler with client-side canvas compression
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor seleciona um ficheiro de imagem válido (JPG, PNG, WebP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('O ficheiro é demasiado grande. O limite máximo é 10MB.');
      return;
    }

    setIsPhotoLoading(true);
    setErrorMsg('');

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 900;
          let { width, height } = img;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.8));
          } else {
            setPhotoDataUrl(event.target?.result as string);
          }
          setIsPhotoLoading(false);
        };
        img.onerror = () => {
          setIsPhotoLoading(false);
          setErrorMsg('Erro ao processar imagem.');
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } catch {
      setIsPhotoLoading(false);
      setErrorMsg('Não foi possível ler a imagem.');
    }
  };

  const handleRemovePhoto = () => {
    setPhotoDataUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  // Validate and submit form to Firestore
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 0. Anti-spam Rate limiting check
    const rateCheck = checkReportRateLimit();
    if (!rateCheck.allowed) {
      setErrorMsg(`Limite de envios atingido. Por favor aguarde ${rateCheck.remainingSeconds}s antes de submeter outro alerta.`);
      return;
    }

    // 1. Title validation
    if (!title.trim() || title.trim().length < 5) {
      setErrorMsg('O título deve ter pelo menos 5 caracteres.');
      return;
    }

    // 2. Description validation
    if (!description.trim() || description.trim().length < 10) {
      setErrorMsg('Por favor fornece uma descrição de pelo menos 10 caracteres.');
      return;
    }

    // 2.1 Anti-spam keywords detection
    const spamCheck = detectSpamKeywords(`${title} ${description} ${locationDetails}`);
    if (spamCheck.isSpam) {
      setErrorMsg(spamCheck.reason || 'O conteúdo do alerta foi detetado como spam ou publicidade.');
      return;
    }

    // 3. District validation
    if (!district || district === 'Todas') {
      setErrorMsg('Por favor seleciona um distrito de Portugal.');
      return;
    }

    // 3.1 Duplicate report detection
    if (existingReports && existingReports.length > 0 && !ignoreDuplicateWarning) {
      const dupCheck = detectDuplicateReport(
        { title, district, concelho, locationDetails, type },
        existingReports
      );
      if (dupCheck.isDuplicate && dupCheck.duplicateReport) {
        setDetectedDuplicate(dupCheck.duplicateReport);
        setErrorMsg('');
        return;
      }
    }

    // 4. Timestamp & relative time computation
    let reportTimestamp = Date.now();
    let reportedAtText = 'agora mesmo';

    if (!isRealtimeNow && customDateTime) {
      const parsedTime = new Date(customDateTime).getTime();
      if (!isNaN(parsedTime)) {
        reportTimestamp = parsedTime;
        const diffMinutes = Math.round((Date.now() - parsedTime) / (60 * 1000));
        if (diffMinutes < 2) reportedAtText = 'agora mesmo';
        else if (diffMinutes < 60) reportedAtText = `há ${diffMinutes} min`;
        else if (diffMinutes < 1440) reportedAtText = `há ${Math.floor(diffMinutes / 60)}h`;
        else reportedAtText = new Date(parsedTime).toLocaleDateString('pt-PT');
      }
    }

    // 5. Operator
    const finalOperator = isCustomCompany ? customCompany.trim() : (companyOrService !== 'Todos' ? companyOrService : '');

    const newOccurrence: Occurrence = {
      id: `user-report-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      description: description.trim(),
      type,
      severity,
      district,
      concelho: concelho.trim() || district,
      locationDetails: locationDetails.trim() || `${concelho || district}`,
      companyOrService: finalOperator || undefined,
      reportedAt: reportedAtText,
      timestamp: reportTimestamp,
      commentsCount: 0,
      imagesCount: photoDataUrl ? 1 : 0,
      imageUrl: photoDataUrl || undefined,
      status: 'Ativa',
      upvotes: 1,
      confirmationsCount: 1,
      unconfirmedCount: 0,
      confirmedBy: currentUser?.userId ? [currentUser.userId] : [],
      unconfirmedBy: [],
      isCommunityVerified: false,
      authorId: currentUser?.userId,
      authorName: currentUser?.displayName || (currentUser ? 'Colaborador Registado' : undefined),
    };

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      await onSubmitReport(newOccurrence);
      recordReportSubmission();
      setIsSubmitted(true);

      setTimeout(() => {
        setIsSubmitted(false);
        setIsSubmitting(false);
        // Reset form
        setTitle('');
        setDescription('');
        setLocationDetails('');
        setPhotoDataUrl('');
        onClose();
      }, 1800);
    } catch (err) {
      setIsSubmitting(false);
      setErrorMsg('Erro ao guardar a ocorrência no Firestore. Tenta novamente.');
    }
  };

  const categories: { type: OccurrenceType; label: string; Icon: React.FC<{ className?: string }>; color: string }[] = [
    { type: 'ACIDENTE', label: 'Acidente', Icon: Car, color: 'hover:border-red-500 hover:text-red-400' },
    { type: 'ATRASOS', label: 'Atrasos', Icon: Bus, color: 'hover:border-amber-500 hover:text-amber-400' },
    { type: 'AVARIA', label: 'Avaria', Icon: Zap, color: 'hover:border-yellow-500 hover:text-yellow-400' },
    { type: 'GREVE', label: 'Greve', Icon: Users, color: 'hover:border-blue-500 hover:text-blue-400' },
    { type: 'OBRAS', label: 'Obras', Icon: Wrench, color: 'hover:border-cyan-500 hover:text-cyan-400' },
    { type: 'CORTE', label: 'Corte', Icon: AlertCircle, color: 'hover:border-rose-500 hover:text-rose-400' },
    { type: 'SERVICO_PUBLICO', label: 'Serviço', Icon: Train, color: 'hover:border-purple-500 hover:text-purple-400' },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden bg-black/85 backdrop-blur-sm flex justify-center items-start sm:items-center p-0 sm:p-4 overscroll-contain">
      <div 
        className="relative w-full max-w-full sm:max-w-2xl min-h-screen sm:min-h-0 rounded-none sm:rounded-3xl bg-[#0b1220] border-0 sm:border border-slate-700/80 p-4 sm:p-7 shadow-2xl text-slate-100 my-0 sm:my-6 transition-all overflow-x-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 sm:right-4 sm:top-4 p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-xl bg-slate-900/60 hover:bg-slate-800 transition-colors cursor-pointer z-10"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        {isSubmitted ? (
          <div className="py-12 text-center flex flex-col items-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white">Ocorrência Publicada!</h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-2 max-w-md">
              A tua ocorrência foi guardada com sucesso no Firestore e já está visível em tempo real no mapa e nos feeds do <strong>PAROU.PT</strong>.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 w-full">
            {/* Header */}
            <div className="flex items-center gap-3 pr-10 sm:pr-0">
              <div className="p-2.5 sm:p-3 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 shrink-0">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-xl font-bold text-white truncate">Reportar Ocorrência</h3>
                <p className="text-xs text-slate-400 line-clamp-1 sm:line-clamp-none">
                  Comunica incidentes em tempo real para a comunidade
                </p>
              </div>
            </div>

            {/* Error Notification */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-800 text-xs text-red-200 flex items-center gap-2 animate-in fade-in w-full">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span className="flex-1 break-words">{errorMsg}</span>
              </div>
            )}

            {/* Duplicate Detection Warning Banner */}
            {detectedDuplicate && (
              <div className="p-3.5 rounded-2xl bg-amber-950/80 border border-amber-600 text-amber-100 text-xs space-y-2.5 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Possível Ocorrência Duplicada Detetada</span>
                </div>
                <p className="leading-relaxed">
                  Já existe um alerta semelhante registado recentemente:{' '}
                  <strong className="text-white">"{detectedDuplicate.title}"</strong> ({detectedDuplicate.district}
                  {detectedDuplicate.concelho ? ` • ${detectedDuplicate.concelho}` : ''}).
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {onConfirmExisting && (
                    <button
                      type="button"
                      onClick={() => {
                        onConfirmExisting(detectedDuplicate.id);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer transition-colors shadow-sm"
                    >
                      Confirmar Ocorrência Existente (+1)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIgnoreDuplicateWarning(true);
                      setDetectedDuplicate(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer transition-colors"
                  >
                    Publicar Novo Alerta Mesmo Assim
                  </button>
                </div>
              </div>
            )}

            {/* 1. Categoria (1 coluna no mobile, 4 colunas no desktop) */}
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                1. Categoria da Ocorrência *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full">
                {categories.map((c) => {
                  const Icon = c.Icon;
                  const isSelected = type === c.type;
                  return (
                    <button
                      key={c.type}
                      type="button"
                      onClick={() => setType(c.type)}
                      className={`w-full min-h-[44px] flex items-center gap-3 sm:gap-2 px-3.5 py-3 sm:py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-600/30'
                          : `bg-slate-900/90 border-slate-800 text-slate-300 ${c.color}`
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Gravidade (1 coluna no mobile, 3 colunas no desktop) */}
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                2. Nível de Gravidade *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                {[
                  { id: 'Informação' as SeverityLevel, label: 'Informação', desc: 'Aviso ligeiro / Tráfego lento', active: 'bg-blue-600 border-blue-400' },
                  { id: 'Moderada' as SeverityLevel, label: 'Moderada', desc: 'Atraso / Condicionamento significativo', active: 'bg-amber-600 border-amber-400' },
                  { id: 'Grave' as SeverityLevel, label: 'Grave', desc: 'Corte total de via / Perigo', active: 'bg-red-600 border-red-400' },
                ].map((s) => {
                  const isSelected = severity === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSeverity(s.id)}
                      className={`w-full min-h-[48px] p-3 sm:p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? `${s.active} text-white shadow-lg`
                          : `bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850`
                      }`}
                    >
                      <span className="block text-xs font-bold">{s.label}</span>
                      <span className={`block text-[11px] sm:text-[10px] mt-0.5 ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>
                        {s.desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Título */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  3. Título do Reporte *
                </label>
                <span className="text-[10px] text-slate-500">{title.length}/200</span>
              </div>
              <input
                type="text"
                required
                maxLength={200}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Ex: Metro de Lisboa parado na Linha Azul / Acidente na 2ª Circular"
                className="w-full min-h-[44px] px-3.5 py-3 sm:py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-sm sm:text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all box-border"
              />
            </div>

            {/* 4. Descrição */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  4. Descrição Detalhada *
                </label>
                <span className="text-[10px] text-slate-500">{description.length}/1000</span>
              </div>
              <textarea
                rows={3}
                required
                maxLength={1000}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="Explica o que está a acontecer, se há alternativas disponíveis ou viaturas de socorro no local..."
                className="w-full min-h-[80px] px-3.5 py-3 sm:py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-sm sm:text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none box-border"
              />
            </div>

            {/* 5. Localização no Mapa & Cidade/Concelho */}
            <div className="space-y-3 p-3.5 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800 w-full overflow-hidden">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                5. Localização no Mapa & Cidade / Concelho *
              </label>

              {/* Interactive Mini-Map District Picker */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 w-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>Fixar no mapa de Portugal:</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-900 shrink-0">
                    {district}
                  </span>
                </div>

                {/* District quick pin chips */}
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1 w-full">
                  {PORTUGAL_DISTRICTS.map((dist) => (
                    <button
                      key={dist.id}
                      type="button"
                      onClick={() => handleDistrictChange(dist.name)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-[10px] min-h-[32px] font-semibold transition-all cursor-pointer ${
                        district.toLowerCase() === dist.name.toLowerCase()
                          ? 'bg-blue-600 text-white font-bold shadow-sm'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                      }`}
                    >
                      {dist.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* District & Concelho Selectors: 1 col on mobile, 2 col on desktop */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                <div className="w-full">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Distrito (Cidade Principal) *
                  </label>
                  <select
                    value={district}
                    onChange={(e) => handleDistrictChange(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm sm:text-xs text-slate-200 focus:outline-none focus:border-blue-500 box-border"
                  >
                    {CIDADES_OPTIONS.filter((c) => c !== 'Todas').map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="w-full">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Concelho *
                  </label>
                  <select
                    value={concelho}
                    onChange={(e) => setConcelho(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm sm:text-xs text-slate-200 focus:outline-none focus:border-blue-500 box-border"
                  >
                    {availableConcelhos.map((conc) => (
                      <option key={conc} value={conc}>{conc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Specific Location (Street, Highway km, Station) */}
              <div className="w-full">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Via, rua, estação ou paragem específica
                </label>
                <input
                  type="text"
                  value={locationDetails}
                  onChange={(e) => setLocationDetails(e.target.value)}
                  placeholder="Ex: Marquês de Pombal sentido Baixa / A1 km 14 Norte-Sul"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm sm:text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 box-border"
                />
              </div>
            </div>

            {/* 6. Empresa / Serviço Afetado */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  6. Empresa ou Serviço Afetado
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomCompany(!isCustomCompany)}
                  className="text-xs sm:text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer underline py-1"
                >
                  {isCustomCompany ? 'Escolher da lista' : 'Outro operador'}
                </button>
              </div>

              {isCustomCompany ? (
                <input
                  type="text"
                  value={customCompany}
                  onChange={(e) => setCustomCompany(e.target.value)}
                  placeholder="Escreve o nome da empresa ou operador (ex: Rodoviária do Alentejo)"
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-sm sm:text-xs text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-500 box-border"
                />
              ) : (
                <select
                  value={companyOrService}
                  onChange={(e) => setCompanyOrService(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-sm sm:text-xs text-slate-200 focus:outline-none focus:border-blue-500 box-border"
                >
                  {TRANSPORTES_OPTIONS.filter((t) => t !== 'Todos').map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="Tráfego Rodoviário Geral">Tráfego Rodoviário Geral</option>
                  <option value="Infraestrutura Urbana">Infraestrutura Urbana</option>
                </select>
              )}
            </div>

            {/* 7. Data e Hora */}
            <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2.5 w-full">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                7. Data e Hora da Ocorrência *
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setIsRealtimeNow(true)}
                  className={`w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    isRealtimeNow
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>Agora mesmo (Em direto)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsRealtimeNow(false)}
                  className={`w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                    !isRealtimeNow
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>Especificar data/hora</span>
                </button>
              </div>

              {!isRealtimeNow && (
                <div className="pt-1 w-full">
                  <input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => setCustomDateTime(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm sm:text-xs text-slate-200 focus:outline-none focus:border-blue-500 box-border"
                  />
                </div>
              )}
            </div>

            {/* 8. Fotografia do Local */}
            <div className="w-full">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                8. Fotografia do Local (Opcional)
              </label>

              {photoDataUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900 max-h-52 w-full group">
                  <img
                    src={photoDataUrl}
                    alt="Pré-visualização da fotografia"
                    className="w-full h-44 sm:h-48 object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-500 transition-colors shadow-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Remover fotografia</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[88px] border-2 border-dashed border-slate-700 hover:border-blue-500/80 rounded-2xl p-4 text-center bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer transition-all box-border flex flex-col items-center justify-center"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  {isPhotoLoading ? (
                    <div className="text-xs text-blue-400 font-semibold py-2">
                      A processar fotografia...
                    </div>
                  ) : (
                    <>
                      <Camera className="w-6 h-6 mx-auto text-blue-400 mb-1" />
                      <p className="text-xs text-slate-200 font-semibold">
                        Clica para carregar ou tirar fotografia do local
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        JPG, PNG ou WebP até 10MB (Otimizada automaticamente)
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* User Attribution Banner */}
            <div className="w-full">
              {currentUser ? (
                <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs w-full">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-slate-300">
                      A reportar como <strong>{currentUser.displayName}</strong>
                    </span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-blue-600/40 text-blue-300 font-bold text-[11px] sm:text-[10px] font-mono border border-blue-500/40">
                    +20 pts reputação
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 text-xs text-slate-400 w-full">
                  <span>A reportar anonimamente</span>
                  <span className="text-blue-400 font-medium">Inicia sessão para acumular pontos</span>
                </div>
              )}
            </div>

            {/* Action Buttons: 1 col full width on mobile, inline on desktop */}
            <div className="pt-3 pb-4 sm:pb-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 border-t border-slate-800 w-full">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-[44px] px-5 py-3 sm:py-2.5 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-[48px] flex items-center justify-center gap-2 px-6 py-3.5 sm:py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold transition-all shadow-lg shadow-blue-600/30 active:scale-[0.99] cursor-pointer disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{isSubmitting ? 'A guardar no Firestore...' : 'Publicar Ocorrência'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
