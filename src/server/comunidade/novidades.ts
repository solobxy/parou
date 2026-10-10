// Publica sozinho, na Comunidade, as novidades da app que estão em src/config/novidades.ts.
// Cada novidade com texto para a Comunidade sai uma única vez, pela conta do Criador (PAROU_ADMIN_EMAILS).
// Várias novidades do mesmo dia saem juntas numa só publicação, para não encher o ecrã.
import crypto from 'crypto';
import { base, emTransacao } from './baseDados';
import { contaEAdmin } from './contas';
import { NOVIDADES, NovidadeCanal } from '../../config/novidades';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MAX_TITULO = 90;
const MAX_TEXTO = 1900;

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

function dataPorExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] || ''}`.trim();
}

function cortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max - 1).trimEnd()}…`;
}

/** Título e texto da publicação para um grupo de novidades do mesmo dia. */
export function comporPublicacao(grupo: NovidadeCanal[]): { titulo: string; texto: string } {
  if (grupo.length === 1) {
    const n = grupo[0];
    return { titulo: cortar(n.titulo, MAX_TITULO), texto: cortar(String(n.comunidade || ''), MAX_TEXTO) };
  }
  const titulo = `Novidades da PAROU · ${dataPorExtenso(grupo[0].data)}`;
  const linhas = grupo.map((n) => `• ${n.titulo}: ${n.comunidade}`);
  return { titulo: cortar(titulo, MAX_TITULO), texto: cortar(linhas.join('\n\n'), MAX_TEXTO) };
}

/** Novidades que já têm texto para a Comunidade e ainda não saíram, agrupadas por dia (mais antigo primeiro). */
export function novidadesPendentes(jaPublicadas: Set<string>): NovidadeCanal[][] {
  const porDia = new Map<string, NovidadeCanal[]>();
  for (const n of NOVIDADES) {
    if (!n.comunidade || jaPublicadas.has(n.id)) continue;
    const lista = porDia.get(n.data) || [];
    lista.push(n);
    porDia.set(n.data, lista);
  }
  return [...porDia.keys()].sort().map((dia) => porDia.get(dia) as NovidadeCanal[]);
}

/** Devolve quantas publicações criou. Não faz nada se ainda não existir a conta do Criador. */
export function publicarNovidadesDaApp(): number {
  const emails = String(process.env.PAROU_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return 0;
  garantirTabela();
  const b = base();

  const criador = emails
    .map((e) => b.prepare('SELECT id, email FROM utilizadores WHERE email = ? COLLATE NOCASE').get(e) as { id: string; email: string } | undefined)
    .find((c) => c && contaEAdmin(c));
  if (!criador) return 0;

  const feitas = new Set((b.prepare('SELECT id FROM novidades_publicadas').all() as { id: string }[]).map((l) => l.id));
  const grupos = novidadesPendentes(feitas);
  let criadas = 0;
  for (const grupo of grupos) {
    const { titulo, texto } = comporPublicacao(grupo);
    const agora = Date.now();
    const id = `pub-${agora.toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
    emTransacao(() => {
      b.prepare(`INSERT INTO publicacoes (id, autor_id, titulo, texto, tipo, criado) VALUES (?, ?, ?, ?, 'novidade', ?)`)
        .run(id, criador.id, titulo, texto, agora);
      const marca = b.prepare('INSERT OR IGNORE INTO novidades_publicadas (id, publicacao_id, criado) VALUES (?, ?, ?)');
      for (const n of grupo) marca.run(n.id, id, agora);
    });
    criadas++;
  }
  if (criadas) console.log(`[Comunidade] ${criadas} publicação(ões) de novidades da app.`);
  return criadas;
}

/** Primeira passagem pouco depois de arrancar e depois de hora a hora (apanha contas criadas entretanto). */
export function iniciarNovidadesAutomaticas() {
  const passo = () => { try { publicarNovidadesDaApp(); } catch (err) { console.error('[Comunidade] Novidades da app:', (err as any)?.message || err); } };
  setTimeout(passo, 20_000).unref?.();
  setInterval(passo, 3600_000).unref?.();
}
