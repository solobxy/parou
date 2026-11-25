import { t } from '../i18n';

/**
 * Partida de metro que, no horário oficial, tem a mesma hora que outra linha no mesmo sentido (Metro do Porto: A e F no troço
 * comum). Só passa um metro a essa hora; o outro passa minutos depois. Ver marcarMesmaHora (server/departureEngine.ts).
 */
export function AvisoMesmaHora({ linha }: { linha?: string }) {
  if (!linha) return null;
  return (
    <div className="mt-0.5 text-[11.5px] leading-snug text-[#6B6B6B]" data-teste="aviso-mesma-hora">
      {t('Mesma hora que a {l} no horário oficial; só passa um dos dois', { l: linha })}
    </div>
  );
}
