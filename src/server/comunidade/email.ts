// Envio de emails (recuperar a palavra-passe). Usa o serviço Resend quando existe a chave
// RESEND_API_KEY (e MAIL_FROM, por exemplo "PAROU <suporte@parou.pt>"). Sem chave, não envia.
export const emailAtivo = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlPublico = () => (process.env.PUBLIC_URL || 'https://parou.pt').replace(/\/$/, '');

interface ModeloEmail {
  /** Texto curto que aparece na lista de emails, ao lado do assunto */
  previa: string;
  titulo: string;
  paragrafos: string[];
  botao?: { texto: string; url: string };
  /** Linhas pequenas no fim do cartão (ex.: "Se não foste tu…") */
  notas?: string[];
}

/**
 * Email com o logótipo da PAROU. Feito só com tabelas e estilos em linha, como os programas de email exigem.
 * O logótipo vem de /email-logo.png (as imagens SVG não aparecem na maioria dos programas de email).
 */
export function htmlDoEmail(m: ModeloEmail): string {
  const base = urlPublico();
  const fonte = "Arial, Helvetica, sans-serif";
  const paragrafos = m.paragrafos
    .map((p) => `<p style="margin:0 0 14px;font-family:${fonte};font-size:16px;line-height:1.5;color:#111111;">${esc(p)}</p>`)
    .join('');
  const botao = m.botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px;"><tr><td style="border-radius:10px;background:#111111;">
         <a href="${esc(m.botao.url)}" style="display:inline-block;padding:14px 24px;font-family:${fonte};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(m.botao.texto)}</a>
       </td></tr></table>
       <p style="margin:14px 0 0;font-family:${fonte};font-size:13px;line-height:1.5;color:#6B6B6B;">Se o botão não abrir, copia este endereço para o browser:<br><a href="${esc(m.botao.url)}" style="color:#6B6B6B;word-break:break-all;">${esc(m.botao.url)}</a></p>`
    : '';
  const notas = (m.notas || [])
    .map((n) => `<p style="margin:14px 0 0;font-family:${fonte};font-size:13px;line-height:1.5;color:#6B6B6B;">${esc(n)}</p>`)
    .join('');
  return `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(m.titulo)}</title></head>
<body style="margin:0;padding:0;background:#F4F4F2;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4F4F2;">${esc(m.previa)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle;"><a href="${base}"><img src="${base}/email-logo.png" width="44" height="44" alt="PAROU" style="display:block;border:0;border-radius:10px;"></a></td>
        <td style="vertical-align:middle;padding-left:12px;font-family:'Arial Narrow',Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;letter-spacing:1px;color:#111111;"><a href="${base}" style="color:#111111;text-decoration:none;">PAROU</a></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid #E6E6E3;border-radius:14px;padding:28px 24px;">
      <h1 style="margin:0 0 16px;font-family:${fonte};font-size:22px;line-height:1.25;color:#111111;">${esc(m.titulo)}</h1>
      ${paragrafos}${botao}${notas}
    </td></tr>
    <tr><td style="padding:16px 4px 0;font-family:${fonte};font-size:12px;line-height:1.5;color:#6B6B6B;">
      PAROU.PT · transportes públicos em Portugal, grátis e sem fins lucrativos.<br>
      Podes responder a este email: lemos tudo.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export async function enviarEmail(para: string, assunto: string, texto: string, html?: string): Promise<boolean> {
  if (!emailAtivo()) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [para], subject: assunto, text: texto, ...(html ? { html } : {}), reply_to: process.env.MAIL_REPLY_TO || 'contacto@parou.pt' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.warn('[Email] O serviço recusou o envio:', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (err: any) {
    console.warn('[Email] Erro ao enviar:', err?.message || err);
    return false;
  }
}
