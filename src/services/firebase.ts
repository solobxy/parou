import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile, 
  onAuthStateChanged,
  deleteUser,
  reauthenticateWithPopup,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc,
  updateDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  limit,
  getDocFromServer,
  increment,
  writeBatch,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Occurrence, UserProfile, Complaint, ComplaintComment } from '../types';
import { calculateConfidence } from '../utils/confidenceUtils';
import { 
  INITIAL_FEATURED_OCCURRENCES, 
  INITIAL_IMPORTANT_OCCURRENCES, 
  INITIAL_RECENT_OCCURRENCES 
} from '../data/mockData';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Must pass firebaseConfig.firestoreDatabaseId as mandated by the Firebase Integration Skill
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

/** Avisa quando se entra ou sai da conta (usado pelo portão em ./nuvem.ts) */
export function observarSessao(cb: (u: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

// Provider for Google Login
const googleProvider = new GoogleAuthProvider();

// Error Handling per Firebase Integration Skill specification
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL CONSTRAINT: Validate Connection to Firestore on boot
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

// Badge calculation helper based on reputation points
export function calculateBadge(points: number): string {
  if (points >= 500) return 'Embaixador da Mobilidade';
  if (points >= 250) return 'Sentinela de Trânsito';
  if (points >= 100) return 'Colaborador Ativo';
  return 'Novo Observador';
}

// Ensure User Profile exists in Firestore and return it
export async function ensureUserProfile(user: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        userId: user.uid,
        displayName: data.displayName || user.displayName || user.email?.split('@')[0] || 'Utilizador',
        email: data.email || user.email || '',
        photoURL: data.photoURL || user.photoURL || undefined,
        reputationPoints: typeof data.reputationPoints === 'number' ? data.reputationPoints : 50,
        reportsCount: typeof data.reportsCount === 'number' ? data.reportsCount : 0,
        badge: data.badge || calculateBadge(data.reputationPoints || 50),
        createdAt: data.createdAt || Date.now(),
      };
    } else {
      // First-time registration welcome profile
      const newProfile: UserProfile = {
        userId: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'Utilizador PAROU',
        email: user.email || '',
        photoURL: user.photoURL || undefined,
        reputationPoints: 50, // Welcome points
        reportsCount: 0,
        badge: 'Novo Observador',
        createdAt: Date.now(),
      };
      await setDoc(userRef, newProfile);
      return newProfile;
    }
  } catch (err) {
    console.warn('Notice ensuring user profile:', err);
    return {
      userId: user.uid,
      displayName: user.displayName || user.email?.split('@')[0] || 'Utilizador',
      email: user.email || '',
      photoURL: user.photoURL || undefined,
      reputationPoints: 50,
      reportsCount: 0,
      badge: 'Novo Observador',
      createdAt: Date.now(),
    };
  }
}

// Subscribe to a user's real-time profile (points, badges, stats)
export function subscribeUserProfile(
  userId: string,
  onProfileUpdate: (profile: UserProfile | null) => void
): () => void {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(
    userRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const pts = typeof data.reputationPoints === 'number' ? data.reputationPoints : 50;
        onProfileUpdate({
          userId,
          displayName: data.displayName || 'Utilizador',
          email: data.email || '',
          photoURL: data.photoURL || undefined,
          reputationPoints: pts,
          reportsCount: typeof data.reportsCount === 'number' ? data.reportsCount : 0,
          badge: calculateBadge(pts),
          createdAt: data.createdAt || Date.now(),
        });
      } else {
        onProfileUpdate(null);
      }
    },
    (err) => {
      console.warn('User profile listener notice:', err);
    }
  );
}

// Fetch user profile from Firestore by userId
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.warn('Error fetching user profile:', error);
    return null;
  }
}

// Fetch a single report by ID from Firestore
export async function fetchReportById(reportId: string): Promise<Occurrence | null> {
  try {
    const reportRef = doc(db, 'reports', reportId);
    const snap = await getDoc(reportRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    const confCount = typeof data.confirmationsCount === 'number' ? data.confirmationsCount : (data.upvotes || 0);
    const unconfirmed = typeof data.unconfirmedCount === 'number' ? data.unconfirmedCount : 0;
    const confidenceEval = calculateConfidence({
      confirmationsCount: confCount,
      unconfirmedCount: unconfirmed,
      isCommunityVerified: !!data.isCommunityVerified || confCount >= 3,
      sourceName: data.sourceName,
      companyOrService: data.companyOrService,
      status: data.status,
      reportsCount: data.reportsCount,
      updatedAt: data.updatedAt || data.sourceFetchedAt || data.timestamp,
    });

    return {
      id: snap.id,
      title: data.title || '',
      description: data.description || '',
      type: data.type || 'AVARIA',
      severity: data.severity || 'Moderada',
      district: data.district || 'Lisboa',
      concelho: data.concelho || data.district || '',
      locationDetails: data.locationDetails || '',
      companyOrService: data.companyOrService || '',
      reportedAt: data.reportedAt || 'agora mesmo',
      timestamp: data.timestamp || Date.now(),
      updatedAt: data.updatedAt || data.sourceFetchedAt || data.timestamp || Date.now(),
      commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : 0,
      imagesCount: typeof data.imagesCount === 'number' ? data.imagesCount : 0,
      status: data.status || 'Ativa',
      verificationStatus: data.verificationStatus || confidenceEval.status,
      confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : confidenceEval.score,
      confidenceLevel: data.confidenceLevel || confidenceEval.level,
      upvotes: confCount,
      confirmationsCount: confCount,
      unconfirmedCount: unconfirmed,
      confirmedBy: Array.isArray(data.confirmedBy) ? data.confirmedBy : [],
      unconfirmedBy: Array.isArray(data.unconfirmedBy) ? data.unconfirmedBy : [],
      isCommunityVerified: !!data.isCommunityVerified || confCount >= 3,
      isBreaking: !!data.isBreaking,
      imageUrl: data.imageUrl || undefined,
      authorId: data.authorId || undefined,
      authorName: data.authorName || undefined,
      sourceName: data.sourceName || undefined,
      sourceType: data.sourceType || undefined,
      sourceUrl: data.sourceUrl || undefined,
      sourceFetchedAt: typeof data.sourceFetchedAt === 'number' ? data.sourceFetchedAt : undefined,
      externalId: data.externalId || undefined,
    };
  } catch (err) {
    console.warn('Error fetching single report:', err);
    return null;
  }
}

// Award points to a registered user
export async function awardReputation(userId: string, points: number, isNewReport = false): Promise<void> {
  const userRef = doc(db, 'users', userId);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const currentPts = snap.data().reputationPoints || 0;
      const newPts = currentPts + points;
      const newBadge = calculateBadge(newPts);

      const updates: Record<string, any> = {
        reputationPoints: increment(points),
        badge: newBadge,
      };
      if (isNewReport) {
        updates.reportsCount = increment(1);
      }
      await updateDoc(userRef, updates);
    }
  } catch (err) {
    console.warn('Notice awarding reputation points:', err);
  }
}

// Authentication Functions
export async function signInWithGoogle(): Promise<UserProfile> {
  const result = await signInWithPopup(auth, googleProvider);
  return await ensureUserProfile(result.user);
}

export async function registerWithEmail(email: string, pass: string, name: string): Promise<UserProfile> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (name.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
  }
  return await ensureUserProfile(result.user);
}

export async function loginWithEmail(email: string, pass: string): Promise<UserProfile> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  return await ensureUserProfile(result.user);
}

/**
 * Apaga a conta e os dados dela: favoritos sincronizados, perfil e o utilizador do Firebase.
 * As ocorrências já publicadas ficam (são públicas), mas sem ligação à conta.
 * Devolve 'reautenticar' se o Firebase pedir para entrar outra vez antes de apagar.
 */
export async function apagarConta(): Promise<'ok' | 'reautenticar' | 'erro'> {
  const user = auth.currentUser;
  if (!user) return 'erro';
  const apagarTudo = async () => {
    try {
      const favs = await getDocs(collection(db, 'users', user.uid, 'favorites'));
      for (const d of favs.docs) await deleteDoc(d.ref).catch(() => {});
    } catch {}
    try { await deleteDoc(doc(db, 'users', user.uid)); } catch {}
    await deleteUser(user);
  };
  try {
    await apagarTudo();
    return 'ok';
  } catch (err: any) {
    if (err?.code === 'auth/requires-recent-login') {
      try {
        if (user.providerData.some((p) => p.providerId === 'google.com')) {
          await reauthenticateWithPopup(user, googleProvider);
          await deleteUser(user);
          return 'ok';
        }
      } catch {}
      return 'reautenticar';
    }
    console.warn('[Conta] Erro ao apagar:', err);
    return 'erro';
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

// Clean all fictitious/mock reports previously created without real source
export async function cleanFictitiousReportsFromDb(): Promise<void> {
  const reportsRef = collection(db, 'reports');
  try {
    const snapshot = await getDocs(reportsRef);
    const batch = writeBatch(db);
    let count = 0;
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      const isFictitious = 
        id.startsWith('feat-') || 
        id.startsWith('imp-') || 
        id.startsWith('rec-') ||
        (id.startsWith('mock-'));

      if (isFictitious) {
        batch.delete(docSnap.ref);
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
      console.log(`[PAROU.PT Auditoria] Apagados ${count} relatos fictícios da base de dados.`);
    }
  } catch (error) {
    console.warn('Notice cleaning fictitious reports:', error);
  }
}

// Ensure no fake data is ever seeded
export async function seedReportsIfEmpty(): Promise<void> {
  await cleanFictitiousReportsFromDb();
}

// Client-side voter ID helper to prevent multiple votes from the same account/device
export function getVoterId(currentUserId?: string | null): string {
  if (currentUserId) return currentUserId;
  if (typeof window === 'undefined') return 'anon-user';
  let deviceId = localStorage.getItem('parou_voter_device_id');
  if (!deviceId) {
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('parou_voter_device_id', deviceId);
  }
  return deviceId;
}

// Subscribe to real-time reports from Firestore
export function subscribeReports(
  onReportsUpdate: (reports: Occurrence[]) => void,
  onError?: (err: Error) => void
): () => void {
  const reportsRef = collection(db, 'reports');
  // Só os últimos 30 dias e no máximo 400 (antes vinha a coleção inteira para cada telemóvel)
  const q = query(
    reportsRef,
    where('timestamp', '>=', Date.now() - 30 * 24 * 3600 * 1000),
    orderBy('timestamp', 'desc'),
    limit(400),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const reports: Occurrence[] = [];
      snapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        const confCount = typeof data.confirmationsCount === 'number' ? data.confirmationsCount : (data.upvotes || 0);
        const unconfirmed = typeof data.unconfirmedCount === 'number' ? data.unconfirmedCount : 0;
        const confidenceEval = calculateConfidence({
          confirmationsCount: confCount,
          unconfirmedCount: unconfirmed,
          isCommunityVerified: !!data.isCommunityVerified || confCount >= 3,
          sourceName: data.sourceName,
          companyOrService: data.companyOrService,
          status: data.status,
          reportsCount: data.reportsCount,
          updatedAt: data.updatedAt || data.sourceFetchedAt || data.timestamp,
        });

        reports.push({
          id: docSnapshot.id,
          title: data.title || '',
          description: data.description || '',
          type: data.type || 'AVARIA',
          severity: data.severity || 'Moderada',
          district: data.district || 'Lisboa',
          concelho: data.concelho || data.district || '',
          locationDetails: data.locationDetails || '',
          companyOrService: data.companyOrService || '',
          reportedAt: data.reportedAt || 'agora mesmo',
          timestamp: data.timestamp || Date.now(),
          updatedAt: data.updatedAt || data.sourceFetchedAt || data.timestamp || Date.now(),
          commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : 0,
          imagesCount: typeof data.imagesCount === 'number' ? data.imagesCount : 0,
          status: data.status || 'Ativa',
          verificationStatus: data.verificationStatus || confidenceEval.status,
          confidenceScore: typeof data.confidenceScore === 'number' ? data.confidenceScore : confidenceEval.score,
          confidenceLevel: data.confidenceLevel || confidenceEval.level,
          upvotes: confCount,
          confirmationsCount: confCount,
          unconfirmedCount: unconfirmed,
          confirmedBy: Array.isArray(data.confirmedBy) ? data.confirmedBy : [],
          unconfirmedBy: Array.isArray(data.unconfirmedBy) ? data.unconfirmedBy : [],
          isCommunityVerified: !!data.isCommunityVerified || confCount >= 3,
          isBreaking: !!data.isBreaking,
          imageUrl: data.imageUrl || undefined,
          authorId: data.authorId || undefined,
          authorName: data.authorName || undefined,
          sourceName: data.sourceName || undefined,
          sourceType: data.sourceType || undefined,
          sourceUrl: data.sourceUrl || undefined,
          sourceFetchedAt: typeof data.sourceFetchedAt === 'number' ? data.sourceFetchedAt : undefined,
          externalId: data.externalId || undefined,
        });
      });
      onReportsUpdate(reports);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'reports');
    }
  );
}

// Create a new report in Firestore (supports both registered and anonymous reports)
export async function createReport(reportData: Omit<Occurrence, 'id'> | Occurrence): Promise<string> {
  const reportId = 'id' in reportData && reportData.id && !reportData.id.startsWith('user-report-')
    ? reportData.id
    : `report-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  const reportDoc = doc(db, 'reports', reportId);
  const initialConfirmedBy = reportData.authorId ? [reportData.authorId] : [];
  const payload: Record<string, any> = {
    title: reportData.title,
    description: reportData.description || '',
    type: reportData.type,
    severity: reportData.severity,
    district: reportData.district,
    concelho: reportData.concelho || reportData.district,
    locationDetails: reportData.locationDetails || '',
    companyOrService: reportData.companyOrService || '',
    reportedAt: reportData.reportedAt || 'agora mesmo',
    timestamp: reportData.timestamp || Date.now(),
    commentsCount: reportData.commentsCount || 0,
    imagesCount: reportData.imagesCount || 0,
    status: reportData.status || 'Ativa',
    upvotes: 1,
    confirmationsCount: 1,
    unconfirmedCount: 0,
    confirmedBy: initialConfirmedBy,
    unconfirmedBy: [],
    isCommunityVerified: reportData.isCommunityVerified || false,
    isBreaking: reportData.isBreaking || false,
    imageUrl: reportData.imageUrl || '',
  };

  const initialEval = calculateConfidence({
    confirmationsCount: 1,
    unconfirmedCount: 0,
    sourceName: reportData.sourceName,
    companyOrService: reportData.companyOrService,
    status: reportData.status || 'Ativa',
    isCommunityVerified: reportData.isCommunityVerified || false,
    authorId: reportData.authorId,
    authorName: reportData.authorName,
  });

  payload.verificationStatus = reportData.verificationStatus || initialEval.status;
  payload.confidenceScore = typeof reportData.confidenceScore === 'number' ? reportData.confidenceScore : initialEval.score;
  payload.confidenceLevel = reportData.confidenceLevel || initialEval.level;
  payload.updatedAt = Date.now();

  // If created by a registered user, attach credentials
  if (reportData.authorId) {
    payload.authorId = reportData.authorId;
    if (reportData.authorName) {
      payload.authorName = reportData.authorName;
    }
  }

  // If created via Public Source ingestion, attach source provenance
  if (reportData.sourceName) payload.sourceName = reportData.sourceName;
  if (reportData.sourceType) payload.sourceType = reportData.sourceType;
  if (reportData.sourceUrl) payload.sourceUrl = reportData.sourceUrl;
  if (reportData.sourceFetchedAt) payload.sourceFetchedAt = reportData.sourceFetchedAt;
  if (reportData.externalId) payload.externalId = reportData.externalId;

  try {
    await setDoc(reportDoc, payload);

    // Award +20 points ONLY for registered users
    if (reportData.authorId) {
      await awardReputation(reportData.authorId, 20, true);
    }

    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reports/${reportId}`);
    return reportId;
  }
}

// Batch import real public occurrences into Firestore (avoiding duplicates by externalId)
export async function batchImportPublicReports(
  publicOccurrences: Occurrence[]
): Promise<{ added: number; updated: number }> {
  if (!publicOccurrences || publicOccurrences.length === 0) {
    return { added: 0, updated: 0 };
  }

  try {
    // 1. Fetch current reports to identify existing externalIds
    const reportsRef = collection(db, 'reports');
    const existingSnap = await getDocs(reportsRef);
    const existingExternalIds = new Map<string, string>();
    const existingTitles = new Map<string, string>();

    existingSnap.forEach((d) => {
      const data = d.data();
      if (data.externalId) {
        existingExternalIds.set(data.externalId, d.id);
      }
      if (data.title) {
        existingTitles.set(data.title.toLowerCase().trim(), d.id);
      }
    });

    let added = 0;
    let updated = 0;
    const batch = writeBatch(db);
    let batchCount = 0;

    for (const occ of publicOccurrences) {
      const extId = occ.externalId || occ.id;
      const existingDocId = existingExternalIds.get(extId) || existingTitles.get(occ.title.toLowerCase().trim());

      if (existingDocId) {
        // Update existing record with latest status & fetch timestamp
        const docRef = doc(db, 'reports', existingDocId);
        batch.update(docRef, {
          status: occ.status || 'Ativa',
          sourceFetchedAt: occ.sourceFetchedAt || Date.now(),
          reportedAt: occ.reportedAt || 'agora mesmo',
          severity: occ.severity,
          verificationStatus: 'Confirmado',
          confidenceScore: 95,
          confidenceLevel: 'Alta',
          updatedAt: Date.now(),
        });
        updated++;
        batchCount++;
      } else {
        // Create new record
        const newDocId = `pub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const docRef = doc(db, 'reports', newDocId);
        const payload: Record<string, any> = {
          title: occ.title.slice(0, 200),
          description: (occ.description || '').slice(0, 1000),
          type: occ.type,
          severity: occ.severity,
          district: occ.district,
          concelho: occ.concelho || occ.district,
          locationDetails: (occ.locationDetails || '').slice(0, 250),
          companyOrService: (occ.companyOrService || '').slice(0, 100),
          reportedAt: occ.reportedAt || 'agora mesmo',
          timestamp: occ.timestamp || Date.now(),
          updatedAt: Date.now(),
          commentsCount: 0,
          imagesCount: 0,
          status: occ.status || 'Ativa',
          verificationStatus: 'Confirmado',
          confidenceScore: 95,
          confidenceLevel: 'Alta',
          upvotes: 1,
          confirmationsCount: 1,
          unconfirmedCount: 0,
          confirmedBy: ['fonte-oficial'],
          unconfirmedBy: [],
          isCommunityVerified: true,
          isBreaking: occ.isBreaking || occ.severity === 'Grave',
          authorName: occ.authorName || occ.sourceName || 'Fonte Oficial',
          sourceName: occ.sourceName || 'Fonte Oficial',
          sourceType: occ.sourceType || 'API',
          sourceUrl: occ.sourceUrl || '',
          sourceFetchedAt: occ.sourceFetchedAt || Date.now(),
          externalId: extId,
        };

        batch.set(docRef, payload);
        existingExternalIds.set(extId, newDocId);
        added++;
        batchCount++;
      }

      if (batchCount >= 400) break;
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    return { added, updated };
  } catch (error) {
    console.warn('Notice importing public reports batch:', error);
    return { added: 0, updated: 0 };
  }
}

// Community Confirmation & Voting System
export async function voteOccurrence(
  reportId: string,
  action: 'confirm' | 'unconfirm',
  voterId: string,
  registeredUserId?: string | null
): Promise<{ success: boolean; status: 'confirmed' | 'unconfirmed' | 'already_voted' }> {
  const reportDoc = doc(db, 'reports', reportId);
  try {
    const snap = await getDoc(reportDoc);
    if (!snap.exists()) {
      return { success: false, status: 'already_voted' };
    }

    const data = snap.data();
    const confirmedBy: string[] = Array.isArray(data.confirmedBy) ? [...data.confirmedBy] : [];
    const unconfirmedBy: string[] = Array.isArray(data.unconfirmedBy) ? [...data.unconfirmedBy] : [];
    let confirmations = typeof data.confirmationsCount === 'number' ? data.confirmationsCount : (data.upvotes || 0);
    let unconfirmed = typeof data.unconfirmedCount === 'number' ? data.unconfirmedCount : 0;

    const hasConfirmed = confirmedBy.includes(voterId);
    const hasUnconfirmed = unconfirmedBy.includes(voterId);

    if (action === 'confirm') {
      if (hasConfirmed) {
        return { success: false, status: 'already_voted' };
      }
      if (hasUnconfirmed) {
        const idx = unconfirmedBy.indexOf(voterId);
        if (idx > -1) unconfirmedBy.splice(idx, 1);
        unconfirmed = Math.max(0, unconfirmed - 1);
      }
      confirmedBy.push(voterId);
      confirmations += 1;

      // Aumentar reputação quando um report é confirmado (+5 pts ao autor se registado)
      if (data.authorId) {
        await awardReputation(data.authorId, 5, false);
      }
      // Se quem confirma for utilizador registado, ganha +2 pts por participação
      if (registeredUserId && registeredUserId !== data.authorId) {
        await awardReputation(registeredUserId, 2, false);
      }
    } else {
      if (hasUnconfirmed) {
        return { success: false, status: 'already_voted' };
      }
      if (hasConfirmed) {
        const idx = confirmedBy.indexOf(voterId);
        if (idx > -1) confirmedBy.splice(idx, 1);
        confirmations = Math.max(0, confirmations - 1);
      }
      unconfirmedBy.push(voterId);
      unconfirmed += 1;
    }

    const isCommunityVerified = confirmations >= 3;

    // Recalculate verification status and confidence level automatically
    const confidenceEval = calculateConfidence({
      confirmationsCount: confirmations,
      unconfirmedCount: unconfirmed,
      isCommunityVerified,
      sourceName: data.sourceName,
      companyOrService: data.companyOrService,
      status: data.status,
      reportsCount: data.reportsCount,
    });

    await updateDoc(reportDoc, {
      confirmationsCount: confirmations,
      unconfirmedCount: unconfirmed,
      confirmedBy,
      unconfirmedBy,
      isCommunityVerified,
      upvotes: confirmations,
      verificationStatus: confidenceEval.status,
      confidenceScore: confidenceEval.score,
      confidenceLevel: confidenceEval.level,
      updatedAt: Date.now(),
    });

    return { success: true, status: action === 'confirm' ? 'confirmed' : 'unconfirmed' };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    return { success: false, status: 'already_voted' };
  }
}

// Update an existing report in Firestore (e.g. status transition)
export async function updateReport(reportId: string, updates: Partial<Occurrence>): Promise<void> {
  const reportDoc = doc(db, 'reports', reportId);
  try {
    await updateDoc(reportDoc, updates as any);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

// Backward compatible upvoteReport delegating to voteOccurrence
export async function upvoteReport(reportId: string, voterId?: string, registeredUserId?: string | null): Promise<void> {
  const finalVoterId = voterId || getVoterId(registeredUserId);
  await voteOccurrence(reportId, 'confirm', finalVoterId, registeredUserId);
}

// ==========================================
// RECLAMAÇÕES & OPINIÕES COMUNITÁRIAS (FIRESTORE)
// ==========================================

export const INITIAL_MOCK_COMPLAINTS: Complaint[] = [
  {
    id: 'comp-seed-001',
    title: 'Supressões constantes e falta de ar condicionado na Linha de Sintra',
    text: 'Todas as manhãs entre as 07h30 e as 08h30 há comboios suprimidos em Agualva-Cacém sem qualquer aviso sonoro prévio. As carruagens que circulam vêm sobrelotadas e com a climatização avariada. Exige-se maior pontualidade e respeito pelos passes pagos mensalmente.',
    companyOrService: 'CP - Comboios de Portugal',
    serviceType: 'Comboio',
    rating: 1,
    district: 'Lisboa',
    concelho: 'Sintra',
    locationDetails: 'Estação Agualva-Cacém',
    incidentDate: 'Hoje, hora de ponta matinal',
    timestamp: Date.now() - 3 * 3600 * 1000,
    authorName: 'Rui M. (Passageiro Frequente)',
    status: 'Pública',
    commentsCount: 4,
    upvotes: 28,
    upvotedBy: [],
    reportsCount: 0,
    reportedBy: [],
    isOpinion: true,
  },
  {
    id: 'comp-seed-002',
    title: 'Atrasos crónicos nos autocarros 205 da STCP na Areosa',
    text: 'O tempo de espera indicado nos painéis digitais salta de 5 para 20 minutos repetidamente. Já foram feitas queixas na empresa sem resolução. Os motoristas são prestáveis mas a frequência é manifestamente insuficiente para os estudantes do Polo Universitário.',
    companyOrService: 'STCP',
    serviceType: 'Autocarro',
    rating: 2,
    district: 'Porto',
    concelho: 'Porto',
    locationDetails: 'Nó da Areosa',
    incidentDate: 'Ontem às 18:00',
    timestamp: Date.now() - 14 * 3600 * 1000,
    authorName: 'Beatriz Costa',
    status: 'Pública',
    commentsCount: 2,
    upvotes: 19,
    upvotedBy: [],
    reportsCount: 0,
    reportedBy: [],
    isOpinion: true,
  },
  {
    id: 'comp-seed-003',
    title: 'Validadores e máquinas de bilhetes fora de serviço na Trindade',
    text: 'Apenas 2 das 6 máquinas de recarregamento Andante estavam a aceitar cartão Multibanco, criando filas enormes de turistas e trabalhadores no nó central.',
    companyOrService: 'Metro do Porto',
    serviceType: 'Metro',
    rating: 2,
    district: 'Porto',
    concelho: 'Porto',
    locationDetails: 'Estação da Trindade',
    incidentDate: 'Esta semana',
    timestamp: Date.now() - 28 * 3600 * 1000,
    authorName: 'Tiago Neves',
    status: 'Pública',
    commentsCount: 1,
    upvotes: 12,
    upvotedBy: [],
    reportsCount: 0,
    reportedBy: [],
    isOpinion: true,
  },
];

// Seed initial complaints if empty in Firestore
export async function seedComplaintsIfEmpty(): Promise<void> {
  const complaintsRef = collection(db, 'complaints');
  try {
    const snap = await getDocs(complaintsRef);
    if (snap.empty) {
      const batch = writeBatch(db);
      for (const comp of INITIAL_MOCK_COMPLAINTS) {
        const docRef = doc(db, 'complaints', comp.id);
        batch.set(docRef, comp);
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn('Notice seeding complaints:', err);
  }
}

// Subscribe to real-time complaints
export function subscribeComplaints(
  onUpdate: (complaints: Complaint[]) => void,
  onError?: (err: Error) => void
): () => void {
  const complaintsRef = collection(db, 'complaints');
  const q = query(complaintsRef, orderBy('timestamp', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Complaint[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          title: data.title || '',
          text: data.text || '',
          companyOrService: data.companyOrService || '',
          serviceType: data.serviceType || 'Outro',
          rating: typeof data.rating === 'number' ? data.rating : undefined,
          district: data.district || 'Lisboa',
          concelho: data.concelho || '',
          locationDetails: data.locationDetails || '',
          incidentDate: data.incidentDate || '',
          timestamp: data.timestamp || Date.now(),
          authorId: data.authorId || undefined,
          authorName: data.authorName || 'Utilizador Anónimo',
          status: data.status || 'Pública',
          commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : 0,
          upvotes: typeof data.upvotes === 'number' ? data.upvotes : 0,
          upvotedBy: Array.isArray(data.upvotedBy) ? data.upvotedBy : [],
          reportsCount: typeof data.reportsCount === 'number' ? data.reportsCount : 0,
          reportedBy: Array.isArray(data.reportedBy) ? data.reportedBy : [],
          isOpinion: true,
        });
      });
      onUpdate(list);
    },
    (err) => {
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.GET, 'complaints');
    }
  );
}

// Create a new complaint post
export async function createComplaint(
  data: Omit<Complaint, 'id' | 'status' | 'commentsCount' | 'upvotes' | 'reportsCount' | 'isOpinion'>
): Promise<string> {
  const id = `comp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const complaintDoc = doc(db, 'complaints', id);

  const payload: Complaint = {
    ...data,
    id,
    status: 'Pública',
    commentsCount: 0,
    upvotes: 0,
    upvotedBy: [],
    reportsCount: 0,
    reportedBy: [],
    isOpinion: true,
  };

  try {
    await setDoc(complaintDoc, payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${id}`);
    return id;
  }
}

// Upvote / Concordar com uma reclamação
export async function voteComplaint(complaintId: string, voterId: string): Promise<boolean> {
  const complaintRef = doc(db, 'complaints', complaintId);
  try {
    const snap = await getDoc(complaintRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    const upvotedBy: string[] = Array.isArray(data.upvotedBy) ? [...data.upvotedBy] : [];
    let upvotes = typeof data.upvotes === 'number' ? data.upvotes : 0;

    const alreadyVoted = upvotedBy.includes(voterId);
    if (alreadyVoted) {
      // Toggle off
      const idx = upvotedBy.indexOf(voterId);
      if (idx > -1) upvotedBy.splice(idx, 1);
      upvotes = Math.max(0, upvotes - 1);
    } else {
      upvotedBy.push(voterId);
      upvotes += 1;
    }

    await updateDoc(complaintRef, { upvotes, upvotedBy });
    return !alreadyVoted;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${complaintId}`);
    return false;
  }
}

// Denunciar uma reclamação por spam, linguagem inapropriada ou falsidade
export async function reportComplaint(
  complaintId: string,
  reporterId: string
): Promise<{ success: boolean; status: 'Pública' | 'Em análise' | 'Ocultada' }> {
  const complaintRef = doc(db, 'complaints', complaintId);
  try {
    const snap = await getDoc(complaintRef);
    if (!snap.exists()) return { success: false, status: 'Pública' };
    const data = snap.data();
    const reportedBy: string[] = Array.isArray(data.reportedBy) ? [...data.reportedBy] : [];
    let reportsCount = typeof data.reportsCount === 'number' ? data.reportsCount : 0;

    if (reportedBy.includes(reporterId)) {
      return { success: false, status: data.status || 'Pública' };
    }

    reportedBy.push(reporterId);
    reportsCount += 1;

    // Moderação escalonada: 2 denúncias = Em análise; 4 ou mais = Ocultada
    let newStatus: 'Pública' | 'Em análise' | 'Ocultada' = data.status || 'Pública';
    if (reportsCount >= 4) {
      newStatus = 'Ocultada';
    } else if (reportsCount >= 2) {
      newStatus = 'Em análise';
    }

    const updates: Record<string, any> = {
      reportsCount,
      reportedBy,
      status: newStatus,
    };

    await updateDoc(complaintRef, updates);
    return { success: true, status: newStatus };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${complaintId}`);
    return { success: false, status: 'Pública' };
  }
}

// Denunciar um Report / Ocorrência de trânsito
export async function flagReportOccurrence(
  reportId: string,
  reporterId: string,
  reason?: string
): Promise<{ success: boolean; status: 'Ativa' | 'Em análise' | 'Ocultada' }> {
  const reportRef = doc(db, 'reports', reportId);
  try {
    const snap = await getDoc(reportRef);
    if (!snap.exists()) return { success: false, status: 'Ativa' };
    const data = snap.data();
    const reportedBy: string[] = Array.isArray(data.reportedBy) ? [...data.reportedBy] : [];
    let reportsCount = typeof data.reportsCount === 'number' ? data.reportsCount : 0;

    if (reportedBy.includes(reporterId)) {
      return { success: false, status: data.status || 'Ativa' };
    }

    reportedBy.push(reporterId);
    reportsCount += 1;

    let newStatus: 'Ativa' | 'Em análise' | 'Ocultada' = data.status || 'Ativa';
    if (reportsCount >= 4) {
      newStatus = 'Ocultada';
    } else if (reportsCount >= 2) {
      newStatus = 'Em análise';
    }

    await updateDoc(reportRef, {
      reportsCount,
      reportedBy,
      status: newStatus,
    });

    return { success: true, status: newStatus };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
    return { success: false, status: 'Ativa' };
  }
}

// Atualizar estado de moderação de um Report pelo Admin
export async function adminUpdateReportStatus(
  reportId: string,
  status: 'Ativa' | 'Em resolução' | 'Resolvida' | 'Em análise' | 'Ocultada',
  resetReportsCount = false
): Promise<void> {
  const reportRef = doc(db, 'reports', reportId);
  const updates: Record<string, any> = { status };
  if (resetReportsCount) {
    updates.reportsCount = 0;
    updates.reportedBy = [];
  }
  await updateDoc(reportRef, updates);
}

// Atualizar estado de moderação de uma Reclamação pelo Admin
export async function adminUpdateComplaintStatus(
  complaintId: string,
  status: 'Pública' | 'Respondida' | 'Em análise' | 'Ocultada',
  resetReportsCount = false
): Promise<void> {
  const complaintRef = doc(db, 'complaints', complaintId);
  const updates: Record<string, any> = { status };
  if (resetReportsCount) {
    updates.reportsCount = 0;
    updates.reportedBy = [];
  }
  await updateDoc(complaintRef, updates);
}

// Remover fisicamente documento de Report pelo Admin
export async function deleteReportDoc(reportId: string): Promise<void> {
  const reportRef = doc(db, 'reports', reportId);
  await deleteDoc(reportRef);
}

// Remover fisicamente documento de Reclamação pelo Admin
export async function deleteComplaintDoc(complaintId: string): Promise<void> {
  const complaintRef = doc(db, 'complaints', complaintId);
  await deleteDoc(complaintRef);
}

// ==========================================
// UTILITÁRIOS ANTI-SPAM & DETEÇÃO DE DUPLICADOS
// ==========================================

const RATE_LIMIT_SECONDS = 45;
const STORAGE_KEY_LAST_REPORT = 'parou_last_report_ts';

export function checkReportRateLimit(): { allowed: boolean; remainingSeconds: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LAST_REPORT);
    if (!raw) return { allowed: true, remainingSeconds: 0 };
    const lastTime = parseInt(raw, 10);
    const elapsedSeconds = Math.floor((Date.now() - lastTime) / 1000);
    if (elapsedSeconds < RATE_LIMIT_SECONDS) {
      return { allowed: false, remainingSeconds: RATE_LIMIT_SECONDS - elapsedSeconds };
    }
    return { allowed: true, remainingSeconds: 0 };
  } catch {
    return { allowed: true, remainingSeconds: 0 };
  }
}

export function recordReportSubmission(): void {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_REPORT, Date.now().toString());
  } catch {
    // safe fallback
  }
}

// Deteção heurística de duplicados recentes no mesmo concelho/distrito
export function detectDuplicateReport(
  candidate: { title: string; district: string; concelho?: string; locationDetails?: string; type?: string },
  existingReports: Occurrence[]
): { isDuplicate: boolean; duplicateReport?: Occurrence } {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  const cTitle = candidate.title.toLowerCase().trim();
  const cLoc = (candidate.locationDetails || '').toLowerCase().trim();
  const cDist = candidate.district.toLowerCase().trim();
  const cConc = (candidate.concelho || '').toLowerCase().trim();

  for (const existing of existingReports) {
    if (existing.status === 'Ocultada' || existing.status === 'Resolvida') continue;
    // Só verifica ocorrências criadas na última 1 hora
    if (now - existing.timestamp > ONE_HOUR) continue;

    const eDist = existing.district.toLowerCase().trim();
    const eConc = (existing.concelho || '').toLowerCase().trim();
    if (eDist !== cDist) continue;

    // Se no mesmo concelho ou mesma via
    const eTitle = existing.title.toLowerCase().trim();
    const eLoc = (existing.locationDetails || '').toLowerCase().trim();

    // Verificação de similaridade de texto
    const titleMatch =
      cTitle === eTitle ||
      (cTitle.length > 8 && eTitle.includes(cTitle)) ||
      (eTitle.length > 8 && cTitle.includes(eTitle));

    const locationMatch =
      cLoc.length > 5 && (cLoc === eLoc || eLoc.includes(cLoc) || cLoc.includes(eLoc));

    if ((titleMatch && (cConc === eConc || !cConc)) || (locationMatch && existing.type === candidate.type)) {
      return { isDuplicate: true, duplicateReport: existing };
    }
  }

  return { isDuplicate: false };
}

// Filtro heurístico de palavras-chave de spam/fraude
const SPAM_PATTERNS = [
  /casino/i,
  /cripto/i,
  /crypto/i,
  /bitcoin/i,
  /telegram\s*@/i,
  /whatsapp\s*\+?[0-9]{8,}/i,
  /bit\.ly/i,
  /t\.me\//i,
  /viagra/i,
  /bet365/i,
  /(.)\1{7,}/, // 8+ caracteres repetidos idênticos (ex: aaaaaaaa)
];

export function detectSpamKeywords(text: string): { isSpam: boolean; reason?: string } {
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(text)) {
      return { isSpam: true, reason: 'Conteúdo contém padrões suspeitos ou links não permitidos.' };
    }
  }
  return { isSpam: false };
}


// Subscribe to real-time comments on a specific complaint
export function subscribeComplaintComments(
  complaintId: string,
  onUpdate: (comments: ComplaintComment[]) => void
): () => void {
  const commentsRef = collection(db, 'complaints', complaintId, 'comments');
  const q = query(commentsRef, orderBy('timestamp', 'asc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ComplaintComment[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          complaintId,
          text: data.text || '',
          authorId: data.authorId || undefined,
          authorName: data.authorName || 'Comentador',
          timestamp: data.timestamp || Date.now(),
        });
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Complaint comments listener notice:', err);
    }
  );
}

// Add a comment to a complaint
export async function addComplaintComment(
  complaintId: string,
  text: string,
  authorName: string,
  authorId?: string
): Promise<string> {
  const commentsRef = collection(db, 'complaints', complaintId, 'comments');
  const complaintRef = doc(db, 'complaints', complaintId);
  const commentId = `comm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const commentDoc = doc(commentsRef, commentId);

  const payload: ComplaintComment = {
    id: commentId,
    complaintId,
    text,
    authorName,
    authorId: authorId || undefined,
    timestamp: Date.now(),
  };

  try {
    await setDoc(commentDoc, payload);
    await updateDoc(complaintRef, { commentsCount: increment(1) });
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `complaints/${complaintId}/comments/${commentId}`);
    return commentId;
  }
}

