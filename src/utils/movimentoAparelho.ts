// Movimento do telemóvel (acelerómetro): diz se o aparelho está quieto ou a ser levado a andar.
// Serve ao filtro do GPS: dentro de casa o GPS dá posições "por rede" que saltam dezenas de metros mesmo com a pessoa parada,
// e só com o GPS não se distingue isso de uma pessoa a andar devagar. Com o telemóvel quieto, o filtro fica mais teimoso.
// Sem sensor, ou sem licença (iPhone), o estado fica "null" e nada muda: o filtro funciona como antes.
//
// Como: tira-se a gravidade (média lenta) à intensidade da aceleração e mede-se a energia do que sobra.
// Telemóvel numa mesa ≈ 0,02 m/s²; na mão a ler ≈ 0,05–0,3; a andar (mão ou bolso) ≈ 1,5–5 (limiares: estimativa, não foram
// calibrados em aparelhos reais).

export type EstadoAparelho = 'parado' | 'a-andar' | null;

const LIMIAR_PARADO = 0.45; // m/s² (rms em ~4 s)
const LIMIAR_ANDAR = 0.9; // m/s² (rms em ~2 s)
const PARADO_DESDE_MS = 3000; // tem de estar quieto este tempo seguido
const SEM_EVENTOS_MS = 4000; // sem eventos há mais do que isto: estado desconhecido

let aOuvir = false;
let ultimoEvento = 0;
let ultimoT = 0;
let gravidade = 0;
let e2Lento = 0; // energia média em ~4 s
let e2Rapido = 0; // energia média em ~2 s
let quietoDesde = 0;
let andarAte = 0;
let amostras = 0;
let ligacoes = 0;

function aoMexer(e: Event) {
  const ev = e as DeviceMotionEvent;
  const g = ev.accelerationIncludingGravity;
  let x = g?.x, y = g?.y, z = g?.z;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    // Alguns aparelhos só dão a aceleração sem gravidade
    const a = ev.acceleration;
    x = a?.x ?? undefined; y = a?.y ?? undefined; z = a?.z ?? undefined;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return;
  }
  const agora = Date.now();
  const dt = ultimoT ? Math.min(0.5, Math.max(0.002, (agora - ultimoT) / 1000)) : 0.016;
  ultimoT = agora;
  ultimoEvento = agora;
  const mag = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(mag)) return;
  if (amostras === 0) gravidade = mag;
  amostras++;
  // Média lenta (≈ 0,6 s) = gravidade (+ aceleração constante); o resto é movimento
  gravidade += (mag - gravidade) * (1 - Math.exp(-dt / 0.6));
  const hp = mag - gravidade;
  const e2 = hp * hp;
  e2Lento += (e2 - e2Lento) * (1 - Math.exp(-dt / 4));
  e2Rapido += (e2 - e2Rapido) * (1 - Math.exp(-dt / 2));
  if (amostras < 20) return; // arranque: ainda sem média
  if (Math.sqrt(e2Rapido) >= LIMIAR_ANDAR) { andarAte = agora; quietoDesde = 0; }
  if (Math.sqrt(e2Lento) < LIMIAR_PARADO) { if (!quietoDesde) quietoDesde = agora; } else { quietoDesde = 0; }
}

/** Começa a ouvir o acelerómetro (não pede nada: onde falta licença, como no iPhone, simplesmente não chegam eventos). Devolve a função que para. */
export function ligarMovimento(): () => void {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return () => {};
  ligacoes++;
  if (!aOuvir) {
    aOuvir = true;
    ultimoT = 0; amostras = 0; e2Lento = 0; e2Rapido = 0; quietoDesde = 0; andarAte = 0;
    window.addEventListener('devicemotion', aoMexer, { passive: true } as AddEventListenerOptions);
  }
  let ativo = true;
  return () => {
    if (!ativo) return;
    ativo = false;
    ligacoes--;
    if (ligacoes <= 0) {
      ligacoes = 0;
      aOuvir = false;
      window.removeEventListener('devicemotion', aoMexer);
    }
  };
}

/** 'parado': quieto há mais de 3 s · 'a-andar': movimento sustentado de quem anda · null: não se sabe */
export function estadoAparelho(agora: number = Date.now()): EstadoAparelho {
  if (!aOuvir || agora - ultimoEvento > SEM_EVENTOS_MS) return null;
  if (agora - andarAte < 3000) return 'a-andar';
  if (quietoDesde && agora - quietoDesde >= PARADO_DESDE_MS) return 'parado';
  return null;
}
