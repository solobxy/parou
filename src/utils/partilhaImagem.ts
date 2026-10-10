// Abre a folha de partilha do telemóvel com o texto e as imagens juntos (escolhe-se o WhatsApp lá).
// Só funciona em telemóveis que deixam partilhar ficheiros; nos outros fica o botão de guardar a imagem.

export function podePartilharFicheiros(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

/** 'ok' partilhou, 'cancelado' a pessoa fechou a folha, 'falhou' não deu para partilhar. */
export async function partilharComImagens(texto: string, imagens: string[]): Promise<'ok' | 'cancelado' | 'falhou'> {
  try {
    const ficheiros = await Promise.all(imagens.map(async (src) => {
      const r = await fetch(src);
      if (!r.ok) throw new Error('imagem');
      const blob = await r.blob();
      return new File([blob], src.split('/').pop() || 'imagem.jpg', { type: blob.type || 'image/jpeg' });
    }));
    const dados = { text: texto, files: ficheiros };
    if (!navigator.canShare(dados)) return 'falhou';
    await navigator.share(dados);
    return 'ok';
  } catch (err) {
    return (err as { name?: string })?.name === 'AbortError' ? 'cancelado' : 'falhou';
  }
}
