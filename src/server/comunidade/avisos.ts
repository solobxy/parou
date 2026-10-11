// Publica sozinho, na Comunidade e em nome do Criador, os avisos que as pessoas realmente precisam de ver:
// incêndios gravíssimos e avisos vermelhos do IPMA (com dicas de segurança), greves e feriados nacionais.
// Cada post leva uma imagem da PAROU (public/avisos). A decisão está em avisosDecisao.ts; aqui só se lê o estado e se escreve.
import crypto from 'crypto';
import { base, emTransacao } from './baseDados';
import { contaDoCriador, horaEmLisboa } from './novidades';
import { candidatosPush, feriadosNacionaisProximos } from '../alertasEngine';
import { obterIncidentes } from '../fogosEngine';
import { decidirAvisos, EstadoAvisos, Proposta } from './avisosDecisao';

let tabelaPronta = false;
function garantirTabela() {
  if (tabelaPronta) return;
  base().exec(`
    CREATE TABLE IF NOT EXISTS avisos_publicados (
      id TEXT PRIMARY KEY,
      grupo TEXT,
      publicacao_id TEXT,
      tipo TEXT,
      urgente INTEGER NOT NULL DEFAULT 0,
      criado INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_avisos_publicados_criado ON avisos_publicados (criado);
  `);
  tabelaPronta = true;
}

function lerEstado(agoraMs: number): EstadoAvisos {
  const b = base();
  const dia = agoraMs - 24 * 3600_000;
  const q = (sql: string, ...args: unknown[]) => b.prepare(sql).get(...(args as any[])) as Record<string, number | null>;
  const ultimoPorGrupo = new Map<string, number>();
  for (const l of b.prepare('SELECT grupo, MAX(criado) AS m FROM avisos_publicados WHERE grupo IS NOT NULL GROUP BY grupo').all() as Array<{ grupo: string; m: number }>) ultimoPorGrupo.set(l.grupo, l.m);
  return {
    agoraMs,
    hora: horaEmLisboa(new Date(agoraMs)),
    jaPublicados: new Set((b.prepare('SELECT id FROM avisos_publicados').all() as Array<{ id: string }>).map((l) => l.id)),
    ultimoPorGrupo,
    naoUrgentes24h: Number(q('SELECT COUNT(DISTINCT publicacao_id) AS n FROM avisos_publicados WHERE urgente = 0 AND criado > ?', dia).n || 0),
    ultimoNaoUrgenteMs: Number(q('SELECT MAX(criado) AS m FROM avisos_publicados WHERE urgente = 0').m || 0),
    fogos24h: Number(q("SELECT COUNT(DISTINCT publicacao_id) AS n FROM avisos_publicados WHERE tipo = 'fogo' AND criado > ?", dia).n || 0),
    ultimoFogoMs: Number(q("SELECT MAX(criado) AS m FROM avisos_publicados WHERE tipo = 'fogo'").m || 0),
  };
}

function publicar(autorId: string, p: Proposta, agoraMs: number): string {
  const b = base();
  const id = `pub-${agoraMs.toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
  emTransacao(() => {
    b.prepare(`INSERT INTO publicacoes (id, autor_id, titulo, texto, tipo, imagens, criado) VALUES (?, ?, ?, ?, 'aviso', ?, ?)`)
      .run(id, autorId, p.post.titulo, p.post.texto, JSON.stringify([p.post.imagem]), agoraMs);
    const ins = b.prepare('INSERT OR IGNORE INTO avisos_publicados (id, grupo, publicacao_id, tipo, urgente, criado) VALUES (?, ?, ?, ?, ?, ?)');
    for (const x of p.ids) ins.run(x.id, x.grupo, id, p.tipo, p.urgente ? 1 : 0, agoraMs);
  });
  return id;
}

let aCorrer = false;

/** Devolve quantas publicações criou. Não faz nada se ainda não existir a conta do Criador. */
export async function publicarAvisosDaComunidade(agoraMs = Date.now()): Promise<number> {
  if (aCorrer) return 0;
  aCorrer = true;
  try {
    garantirTabela();
    const criador = contaDoCriador();
    if (!criador) return 0;
    const candidatos = await candidatosPush({ canal: true }).catch(() => []);
    const propostas = decidirAvisos(
      { candidatos, incidentes: obterIncidentes().incidentes, feriados: feriadosNacionaisProximos(2) },
      lerEstado(agoraMs),
    );
    for (const p of propostas) {
      const id = publicar(criador.id, p, agoraMs);
      console.log(`[Comunidade] Aviso publicado (${p.tipo}): ${p.post.titulo} → ${id}`);
    }
    return propostas.length;
  } finally {
    aCorrer = false;
  }
}

/** Primeira passagem pouco depois de arrancar e depois de 5 em 5 minutos. */
export function iniciarAvisosAutomaticos() {
  const passo = () => { publicarAvisosDaComunidade().catch((err) => console.error('[Comunidade] Avisos automáticos:', err?.message || err)); };
  setTimeout(passo, 90_000).unref?.();
  setInterval(passo, 5 * 60_000).unref?.();
}
