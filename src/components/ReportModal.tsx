import React, { useState, useMemo, useRef } from 'react';
import { 
  X, 
  AlertTriangle, 
  MapPin, 
  CheckCircle2, 
  Camera, 
  Trash2,
  Clock
} from 'lucide-react';
import { Occurrence, OccurrenceType, SeverityLevel, UserProfile } from '../types';
import { 
  PORTUGAL_DISTRICTS,
  CONCELHOS_BY_CIDADE
} from '../data/mockData';
import {
  checkReportRateLimit,
  recordReportSubmission,
  detectDuplicateReport,
  detectSpamKeywords
} from '../services/firebase';

// "Outro" fica como SERVICO_PUBLICO (é um dos tipos aceites pelas regras do Firestore)
const CATEGORIAS: Array<[OccurrenceType, string]> = [
  ['ACIDENTE', 'Acidente'],
  ['ATRASOS', 'Atrasos'],
  ['AVARIA', 'Avaria'],
  ['GREVE', 'Greve'],
  ['OBRAS', 'Obras'],
  ['CORTE', 'Via cortada'],
  ['SERVICO_PUBLICO', 'Outro'],
];

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
  const [type, setType] = useState<OccurrenceType>('ACIDENTE');
  const [severity, setSeverity] = useState<SeverityLevel>('Moderada');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [district, setDistrict] = useState('Lisboa');
  const [concelho, setConcelho] = useState('Lisboa');
  const [locationDetails, setLocationDetails] = useState('');

  const [companyOrService, setCompanyOrService] = useState('Metro de Lisboa');

  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedDuplicate, setDetectedDuplicate] = useState<Occurrence | null>(null);

  const availableConcelhos = useMemo(() => {
    const list = CONCELHOS_BY_CIDADE[district];
    if (list && list.length > 0) {
      return list.filter((c) => c !== 'Todos');
    }
    return [district];
  }, [district]);

  const handleDistrictChange = (newDistrict: string) => {
    setDistrict(newDistrict);
    const concs = CONCELHOS_BY_CIDADE[newDistrict];
    if (concs && concs.length > 0) {
      const firstValid = concs.find((c) => c !== 'Todos') || concs[0];
      setConcelho(firstValid);
    } else {
      setConcelho(newDistrict);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecione um ficheiro de imagem válido.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('A imagem é demasiado grande (máximo 10MB).');
      return;
    }

    setIsPhotoLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          setPhotoDataUrl(compressed);
        }
        setIsPhotoLoading(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg('Preencha o título e a descrição.');
      return;
    }

    if (!checkReportRateLimit()) {
      setErrorMsg('Limite atingido. Aguarde alguns minutos antes de reportar novamente.');
      return;
    }

    if (detectSpamKeywords(title) || detectSpamKeywords(description)) {
      setErrorMsg('O conteúdo contém termos não permitidos.');
      return;
    }

    if (existingReports && existingReports.length > 0 && !detectedDuplicate) {
      const dup = detectDuplicateReport({ title, district, concelho }, existingReports);
      if (dup.isDuplicate && dup.duplicateReport) {
        setDetectedDuplicate(dup.duplicateReport);
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const now = new Date();
      const reportedAtStr = 'há instantes';

      const newOcc: Occurrence = {
        id: `report-${Date.now()}`,
        title: title.trim(),
        description: description.trim(),
        type,
        severity,
        district,
        concelho,
        locationDetails: locationDetails.trim() || `${concelho}, ${district}`,
        transporte: companyOrService,
        timestamp: Date.now(),
        reportedAt: reportedAtStr,
        commentsCount: 0,
        imagesCount: photoDataUrl ? 1 : 0,
        upvotes: 1,
        confirmationsCount: 1,
        unconfirmedCount: 0,
        confirmedBy: currentUser?.uid ? [currentUser.uid] : [],
        unconfirmedBy: [],
        // Sem conta não há autor (as regras do Firestore só aceitam o próprio uid)
        authorId: currentUser?.uid || undefined,
        authorName: currentUser?.displayName || 'Anónimo',
        isCommunityVerified: false,
        status: 'Ativa',
        verificationStatus: 'Reportado',
        imageUrl: photoDataUrl || undefined,
      };

      await onSubmitReport(newOcc);
      recordReportSubmission();
      setIsSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao publicar ocorrência.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#E6E6E3] rounded-[8px] max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#E6E6E3] flex items-center justify-between gap-3 bg-[#FFFFFF]">
          <h2 className="text-base font-bold text-[#111111]">
            Reportar ocorrência
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[#6B6B6B] hover:text-[#111111] rounded-[6px] min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5 stroke-[2]" />
          </button>
        </div>

        {/* Form Body */}
        {isSubmitted ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-[#111111] mx-auto stroke-[2]" />
            <h3 className="text-base font-bold text-[#111111]">Ocorrência registada</h3>
            <p className="text-xs text-[#6B6B6B]">
              A ocorrência foi publicada e já está visível para a comunidade.
            </p>
            <button
              onClick={() => {
                setIsSubmitted(false);
                onClose();
              }}
              className="mt-4 px-4 py-2 bg-[#FF6B1A] text-[#111111] font-bold text-xs rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer"
            >
              Concluir
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-[8px] bg-[#F4F4F2] border border-[#D92D20] text-xs text-[#D92D20]">
                {errorMsg}
              </div>
            )}

            {/* Categoria */}
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1.5">
                Categoria
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIAS.map(([cat, nome]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setType(cat)}
                    aria-pressed={type === cat}
                    className={`h-9 px-3.5 text-[13px] font-semibold rounded-[8px] transition-colors cursor-pointer ${
                      type === cat
                        ? 'bg-[#111111] text-[#FFFFFF]'
                        : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
                    }`}
                  >
                    {nome}
                  </button>
                ))}
              </div>
            </div>

            {/* Gravidade */}
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1.5">
                Gravidade
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Informação', 'Moderada', 'Grave'] as SeverityLevel[]).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    className={`py-2 px-2 text-xs font-semibold rounded-[8px] min-h-[36px] transition-colors cursor-pointer ${
                      severity === sev
                        ? sev === 'Grave' ? 'bg-[#D92D20] text-[#FFFFFF]' : 'bg-[#111111] text-[#FFFFFF]'
                        : 'bg-[#F4F4F2] text-[#6B6B6B] hover:text-[#111111]'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Título */}
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                Título
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Atraso no Metro Linha Azul"
                className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                Descrição
              </label>
              <textarea
                rows={3}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes sobre o que está a acontecer..."
                className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[80px]"
              />
            </div>

            {/* Localização */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                  Distrito
                </label>
                <select
                  value={district}
                  onChange={(e) => handleDistrictChange(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] min-h-[44px]"
                >
                  {PORTUGAL_DISTRICTS.map((d) => (
                    <option key={d.id} value={d.name}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                  Concelho
                </label>
                <select
                  value={concelho}
                  onChange={(e) => setConcelho(e.target.value)}
                  className="w-full px-2.5 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-xs text-[#111111] min-h-[44px]"
                >
                  {availableConcelhos.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Local específico */}
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                Local / Rua
              </label>
              <input
                type="text"
                value={locationDetails}
                onChange={(e) => setLocationDetails(e.target.value)}
                placeholder="Ex: Estação Marquês de Pombal"
                className="w-full px-3 py-2 bg-[#F4F4F2] border border-[#E6E6E3] rounded-[8px] text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:border-[#111111] min-h-[44px]"
              />
            </div>

            {/* Fotografia opcional */}
            <div>
              <label className="block text-xs font-semibold text-[#6B6B6B] mb-1">
                Fotografia (opcional)
              </label>
              {photoDataUrl ? (
                <div className="relative rounded-[8px] overflow-hidden border border-[#E6E6E3]">
                  <img src={photoDataUrl} alt="Foto" className="w-full h-36 object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoDataUrl('')}
                    className="absolute top-2 right-2 p-1.5 bg-[#FFFFFF] rounded-[4px] text-[#111111] hover:text-[#D92D20] cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 stroke-[2]" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 border border-dashed border-[#E6E6E3] hover:border-[#111111] rounded-[8px] text-xs font-semibold text-[#6B6B6B] hover:text-[#111111] flex items-center justify-center gap-1.5 min-h-[44px] cursor-pointer"
                >
                  <Camera className="w-4 h-4 stroke-[2]" />
                  <span>{isPhotoLoading ? 'A processar...' : 'Carregar foto'}</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>

            {/* Submit Primary Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-[#FF6B1A] text-[#111111] font-bold text-sm rounded-[8px] brand-chamfer min-h-[44px] cursor-pointer transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? 'A publicar…' : 'Publicar ocorrência'}
              </button>
              <p className="text-[11.5px] text-[#6B6B6B] text-center mt-2 leading-snug">
                Fica visível para todos durante 24 horas. Não incluas dados pessoais (nomes, matrículas, contactos).
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
