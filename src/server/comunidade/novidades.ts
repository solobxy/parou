// Publica sozinho, na Comunidade, as novidades da app que têm texto para a Comunidade (src/config/novidades.ts).
// Cada novidade sai num post só dela, com as suas imagens, pela conta do Criador (PAROU_ADMIN_EMAILS), uma única vez.
// Para não encher o ecrã, sai no máximo um post por hora e só de dia (hora de Lisboa).
import crypto from 'crypto';
import { base, emTransacao } from './baseDados';
import { contaEAdmin } from './contas';
import { NOVIDADES, NovidadeCanal } from '../../config/novidades';

const MAX_TITULO = 90;
const MAX_TEXTO = 600;
const INTERVALO_ENTRE_POSTS_MS = 60 * 60_000;
const HORA_INICIO = 8; // não publica de madrugada
const HORA_FIM = 24; // até à meia-noite

let tabelaPronta = false;
function garantirTabela() {
  if (tabelaPronta) return;
  base().exec(`
    CREATE TABLE IF NOT EXISTS novidades_publicadas (
      id TEXT PRIMARY KEY,
      publicacao_id TEXT,
      criado INTEGER NOT NULL
    );
  `);
  tabelaPronta = true;
}

function cortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

/** Novidades com texto para a Comunidade que ainda não saíram, pela ordem do ficheiro. */
export function novidadesPendentes(jaPublicadas: Set<string>): NovidadeCanal[] {
  return NOVIDADES.filter((n) => n.comunidade && !jaPublicadas.has(n.id));
}

export function horaEmLisboa(agora = new Date()): number {
  return Number(new Intl.DateTimeFormat('pt-PT', { hour: 'numeric', hour12: false, timeZone: 'Europe/Lisbon' }).format(agora)) % 24;
}

/** Devolve quantas publicações criou (0 ou 1 por passagem). Não faz nada se ainda não existir a conta do Criador. */
export function publicarNovidadesDaApp(agoraMs = Date.now()): number {
  const emails = String(process.env.PAROU_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return 0;
  garantirTabela();
  const b = base();

  const feitas = new Set((b.prepare('SELECT id FROM novidades_publicadas').all() as { id: string }[]).map((l) => l.id));
  const proxima = novidadesPendentes(feitas)[0];
  if (!proxima) return 0;

  const hora = horaEmLisboa(new Date(agoraMs));
  if (hora < HORA_INICIO || hora >= HORA_FIM) return 0;
  const ultima = Number((b.prepare('SELECT MAX(criado) AS m FROM novidades_publicadas').get() as { m: number | null })?.m || 0);
  if (agoraMs - ultima < INTERVALO_ENTRE_POSTS_MS) return 0;

  const criador = emails
    .map((e) => b.prepare('SELECT id, email FROM utilizadores WHERE email = ? COLLATE NOCASE').get(e) as { id: string; email: string } | undefined)
    .find((c) => c && contaEAdmin(c));
  if (!criador) return 0;

  const id = `pub-${agoraMs.toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
  emTransacao(() => {
    b.prepare(`INSERT INTO publicacoes (id, autor_id, titulo, texto, tipo, imagens, criado) VALUES (?, ?, ?, ?, 'novidade', ?, ?)`)
      .run(id, criador.id, cortar(proxima.titulo, MAX_TITULO), cortar(String(proxima.comunidade), MAX_TEXTO), proxima.imagens?.length ? JSON.stringify(proxima.imagens) : null, agoraMs);
    b.prepare('INSERT OR IGNORE INTO novidades_publicadas (id, publicacao_id, criado) VALUES (?, ?, ?)').run(proxima.id, id, agoraMs);
  });
  console.log(`[Comunidade] Novidade da app publicada: ${proxima.id}`);
  return 1;
}

/** Primeira passagem pouco depois de arrancar e depois de 10 em 10 minutos (respeita o intervalo e as horas de descanso). */
export function iniciarNovidadesAutomaticas() {
  const passo = () => { try { publicarNovidadesDaApp(); } catch (err) { console.error('[Comunidade] Novidades da app:', (err as any)?.message || err); } };
  setTimeout(passo, 20_000).unref?.();
  setInterval(passo, 10 * 60_000).unref?.();
}
