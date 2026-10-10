/** Posição atual, uma só vez (para "Perto de ti" e para associar uma publicação à tua zona). */
export function posicaoAtual(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolver, rejeitar) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { rejeitar(new Error('indisponivel')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => rejeitar(e),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}
