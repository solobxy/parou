import { useEffect, useRef, useState } from 'react';
import { RespostaMapa } from '../types/mapa';

// Guarda a última resposta para o mapa aparecer logo ao voltar ao separador
let ultima: RespostaMapa | null = null;

/** Incêndios, avisos e perturbações atuais para o Mapa; atualiza a cada minuto enquanto se vê. */
export function usePontosMapa(ativo: boolean): RespostaMapa | null {
  const [dados, setDados] = useState<RespostaMapa | null>(ultima);
  const ultimoPedido = useRef(0);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    const carregar = async () => {
      if (document.visibilityState !== 'visible') return;
      ultimoPedido.current = Date.now();
      try {
        const r = await fetch('/api/mapa', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
        if (!r.ok) return;
        const j: RespostaMapa = await r.json();
        if (cancelado) return;
        ultima = j;
        setDados(j);
      } catch {}
    };
    carregar();
    const t = setInterval(carregar, 60_000);
    const aoVoltar = () => { if (Date.now() - ultimoPedido.current > 20_000) carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('online', aoVoltar);
    return () => {
      cancelado = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('online', aoVoltar);
    };
  }, [ativo]);

  return dados;
}
