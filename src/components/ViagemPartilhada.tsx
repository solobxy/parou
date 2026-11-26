import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { MapPin, CircleCheck } from 'lucide-react';
import { Logo } from './Logo';
import { LineChip } from './LineChip';
import { t, LOCALE } from '../i18n';

interface Vista {
  destino: { nome: string; lat: number; lon: number };
  chegada: number;
  trocos: Array<{ modo: string; linha: string; cor?: string; de: string; para: string; sai: string; chega: string }>;
  estado: 'a-caminho' | 'chegou' | 'terminada';
  expira: number;
  chegouEm?: number;
  pos?: { lat: number; lon: number; acc: number; t: number };
  atualizado?: number;
}

const hora = (ms: number) => new Intl.DateTimeFormat(LOCALE, { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).format(ms);
function haQuanto(ms: number, agora: number): string {
  const s = Math.max(0, Math.round((agora - ms) / 1000));
  if (s < 60) return t('há {n} s', { n: s });
  return t('há {n} min', { n: Math.round(s / 60) });
}

/** Página pública de uma viagem partilhada (parou.pt/v/<id>): destino, hora de chegada, transportes e a última posição */
export function ViagemPartilhada({ id }: { id: string }) {
  const [vista, setVista] = useState<Vista | null>(null);
  const [estado, setEstado] = useState<'a-carregar' | 'ok' | 'acabou' | 'erro'>('a-carregar');
  const [agora, setAgora] = useState(() => Date.now());
  const mapaRef = useRef<HTMLDivElement | null>(null);
  const mapa = useRef<L.Map | null>(null);
  const camadas = useRef<{ eu?: L.CircleMarker; raio?: L.Circle; destino?: L.CircleMarker }>({});
  const ajustado = useRef(false);

  useEffect(() => {
    let parado = false;
    const ler = async () => {
      try {
        const r = await fetch(`/api/partilha/${id}`, { cache: 'no-store' });
        if (parado) return;
        if (r.status === 404) { setEstado('acabou'); return; }
        if (!r.ok) { setEstado((e) => (e === 'ok' ? e : 'erro')); return; }
        setVista(await r.json());
        setEstado('ok');
      } catch {
        if (!parado) setEstado((e) => (e === 'ok' ? e : 'erro'));
      }
    };
    void ler();
    const i = setInterval(() => { if (document.visibilityState === 'visible') void ler(); }, 10_000);
    const j = setInterval(() => setAgora(Date.now()), 5_000);
    return () => { parado = true; clearInterval(i); clearInterval(j); };
  }, [id]);

  // Mapa: destino e a última posição
  useEffect(() => {
    if (!vista || !mapaRef.current) return;
    if (!mapa.current) {
      mapa.current = L.map(mapaRef.current, { zoomControl: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa.current);
    }
    const m = mapa.current;
    const c = camadas.current;
    const d: L.LatLngExpression = [vista.destino.lat, vista.destino.lon];
    if (!c.destino) c.destino = L.circleMarker(d, { radius: 7, color: '#111111', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(m);
    if (vista.pos) {
      const p: L.LatLngExpression = [vista.pos.lat, vista.pos.lon];
      if (!c.raio) c.raio = L.circle(p, { radius: vista.pos.acc, color: '#FF6B1A', weight: 1, fillColor: '#FF6B1A', fillOpacity: 0.12 }).addTo(m);
      else { c.raio.setLatLng(p); c.raio.setRadius(vista.pos.acc); }
      if (!c.eu) c.eu = L.circleMarker(p, { radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#FF6B1A', fillOpacity: 1 }).addTo(m);
      else c.eu.setLatLng(p);
    } else {
      c.eu?.remove(); c.raio?.remove(); c.eu = undefined; c.raio = undefined;
    }
    if (!ajustado.current) {
      ajustado.current = true;
      if (vista.pos) m.fitBounds(L.latLngBounds([d, [vista.pos.lat, vista.pos.lon]]).pad(0.3), { maxZoom: 16 });
      else m.setView(d, 15);
    }
  }, [vista]);

  useEffect(() => () => { mapa.current?.remove(); mapa.current = null; }, []);

  const centrar = () => {
    if (!vista || !mapa.current) return;
    mapa.current.setView(vista.pos ? [vista.pos.lat, vista.pos.lon] : [vista.destino.lat, vista.destino.lon], 16);
  };

  return (
    <div className="min-h-[100dvh] bg-[#FFFFFF] text-[#111111] flex flex-col">
      <header className="shrink-0 h-14 px-4 flex items-center border-b border-[#E6E6E3]">
        <a href="/" aria-label="PAROU"><Logo size={24} /></a>
      </header>

      {estado === 'a-carregar' && <p className="p-6 text-[14px] text-[#6B6B6B]">{t('A abrir a viagem…')}</p>}
      {estado === 'erro' && <p className="p-6 text-[14px] text-[#111111]">{t('Não foi possível abrir a viagem. Verifica a ligação à internet.')}</p>}
      {estado === 'acabou' && (
        <div className="p-6" data-teste="viagem-acabou">
          <h1 className="font-condensada text-[26px] font-bold leading-tight">{t('Esta partilha já acabou')}</h1>
          <p className="mt-2 text-[14px] text-[#6B6B6B] leading-snug">{t('A viagem terminou ou quem a partilhou parou a partilha. A posição não fica guardada.')}</p>
          <a href="/" className="mt-4 inline-flex items-center min-h-[44px] px-4 rounded-[12px] bg-[#FF6B1A] text-[#111111] font-bold text-[15px]">{t('Abrir a PAROU')}</a>
        </div>
      )}

      {estado === 'ok' && vista && (
        <main className="flex-1 flex flex-col lg:flex-row min-h-0" data-teste="viagem-partilhada">
          <section className="px-4 pt-4 pb-3 lg:w-[420px] lg:shrink-0 lg:border-r lg:border-[#E6E6E3] lg:overflow-y-auto">
            <p className="text-[13px] text-[#6B6B6B]">{t('Viagem até')}</p>
            <h1 className="font-condensada text-[26px] font-bold leading-tight break-words">{vista.destino.nome}</h1>
            {vista.estado === 'chegou' ? (
              <p className="mt-2 flex items-center gap-2 text-[17px] font-semibold" data-teste="viagem-chegou">
                <CircleCheck className="w-5 h-5 text-[#1F7A3A] stroke-[2.25]" aria-hidden="true" />
                {t('Chegou às {h}', { h: hora(vista.chegouEm || vista.atualizado || agora) })}
              </p>
            ) : (
              <p className="mt-2 text-[17px] font-semibold tabular-nums" data-teste="viagem-chegada">{t('Chegada prevista às {h}', { h: hora(vista.chegada) })}</p>
            )}
            <p className="mt-1 text-[12.5px] text-[#6B6B6B] leading-snug" data-teste="viagem-atualizado">
              {vista.estado === 'chegou'
                ? t('A partilha acaba sozinha daqui a pouco.')
                : vista.pos
                  ? t('Posição atualizada {q}.', { q: haQuanto(vista.pos.t, agora) })
                  : vista.atualizado
                    ? t('Sem posição nova {q}: a PAROU pode estar fechada no telemóvel de quem partilha.', { q: haQuanto(vista.atualizado, agora) })
                    : t('Ainda sem posição: aparece quando a PAROU estiver aberta no telemóvel de quem partilha.')}
            </p>

            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#6B6B6B]" aria-hidden="true">
              {vista.pos && vista.estado === 'a-caminho' && (
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#FF6B1A] border-2 border-[#FFFFFF] shadow-[0_0_0_1px_#E6E6E3]" />{t('Posição')}</span>
              )}
              <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#FFFFFF] border-[3px] border-[#111111]" />{t('Destino')}</span>
            </p>
            {vista.trocos.length > 0 && (
              <ol className="mt-4 space-y-2.5">
                {vista.trocos.map((x, i) => (
                  <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 items-start">
                    <LineChip number={x.linha || '—'} color={x.cor} />
                    <span className="text-[13px] leading-snug min-w-0">
                      <span className="font-semibold tabular-nums">{x.sai}</span> {x.de}
                      <span className="text-[#6B6B6B]"> → </span>
                      <span className="font-semibold tabular-nums">{x.chega}</span> {x.para}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="relative flex-1 min-h-[320px]">
            <div ref={mapaRef} className="absolute inset-0" aria-label={t('Mapa da viagem')} />
            <button
              type="button"
              onClick={centrar}
              className="absolute right-3 bottom-8 z-[500] inline-flex items-center gap-1.5 h-11 px-3.5 rounded-[12px] bg-[#FFFFFF] border border-[#E6E6E3] text-[13px] font-semibold text-[#111111] shadow-[0_4px_12px_rgba(17,17,17,0.12)] cursor-pointer"
            >
              <MapPin className="w-4 h-4 stroke-[2.25]" aria-hidden="true" />
              {vista.pos ? t('Ver a posição') : t('Ver o destino')}
            </button>
          </div>
        </main>
      )}
      <footer className="shrink-0 px-4 py-3 text-[12px] text-[#6B6B6B] border-t border-[#E6E6E3]">
        {t('Partilhado com a PAROU, transportes em tempo real.')} <a href="/" className="font-semibold text-[#111111] underline">parou.pt</a>
      </footer>
    </div>
  );
}
