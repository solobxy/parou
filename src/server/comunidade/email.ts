// Envio de emails (recuperar a palavra-passe). Usa o serviço Resend quando existe a chave
// RESEND_API_KEY (e MAIL_FROM, por exemplo "PAROU <nao-responder@parou.pt>"). Sem chave, não envia.
export const emailAtivo = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

export async function enviarEmail(para: string, assunto: string, texto: string): Promise<boolean> {
  if (!emailAtivo()) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [para], subject: assunto, text: texto }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.warn('[Email] O serviço recusou o envio:', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (err: any) {
    console.warn('[Email] Erro ao enviar:', err?.message || err);
    return false;
  }
}
