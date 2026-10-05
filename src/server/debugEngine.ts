import { StopsEngine, UnifiedStop } from './stopsEngine';
import { DepartureEngine, DepartureResult } from './departureEngine';
import { DateTime } from 'luxon';

export interface DebugDepartureItem {
  feed: string;
  trip_id: string;
  route: string;
  headsign: string;
  operator: string;
  scheduled_time: string;
  realtime_time: string | null;
  state: 'TEMPO REAL' | 'PROGRAMADO' | 'SUPRIMIDO';
  reason: string;
  day_label: string;
  display_text: string;
}

export interface DebugStopResponse {
  stop: {
    id: string;
    name: string;
    operators: string[];
    modes: string[];
    member_stop_ids: string[];
  };
  simulated_time_lisbon: string;
  status_notice?: string;
  total_departures: number;
  departures: DebugDepartureItem[];
}

export class DebugEngine {
  /**
   * Generates detailed debug report for a stop at a given reference time
   */
  public static async getDebugStopData(
    stopIdOrName: string,
    timeParam?: string
  ): Promise<DebugStopResponse> {
    // Determine reference time in Europe/Lisbon
    let refDateTime = DateTime.now().setZone('Europe/Lisbon');

    if (timeParam) {
      if (timeParam.includes(':') && !timeParam.includes('T')) {
        // e.g. "04:00" or "09:00"
        const [h, m] = timeParam.split(':').map((v) => parseInt(v, 10));
        refDateTime = refDateTime.set({ hour: h || 0, minute: m || 0, second: 0, millisecond: 0 });
      } else {
        const parsed = DateTime.fromISO(timeParam, { zone: 'Europe/Lisbon' });
        if (parsed.isValid) {
          refDateTime = parsed;
        }
      }
    }

    // Resolve stop
    const stop = await StopsEngine.getUnifiedStopById(stopIdOrName);
    const stopToQuery = stop || stopIdOrName;

    // Run Departure Engine
    const result: DepartureResult = await DepartureEngine.nextDepartures(
      stopToQuery,
      refDateTime.toJSDate(),
      30
    );

    const debugDepartures: DebugDepartureItem[] = result.departures.map((d) => ({
      feed: d.feed_id,
      trip_id: d.trip_id,
      route: `${d.route_short_name} (${d.route_long_name || d.route_id})`,
      headsign: d.headsign,
      operator: d.operator_name,
      scheduled_time: d.scheduled_time,
      realtime_time: d.realtime_time || null,
      state: d.state,
      reason: d.state_reason,
      day_label: d.day_label || 'hoje',
      display_text: d.display_text,
    }));

    return {
      stop: result.stop,
      simulated_time_lisbon: refDateTime.toFormat('yyyy-LL-dd HH:mm:ss ZZZZ'),
      status_notice: result.status_notice,
      total_departures: debugDepartures.length,
      departures: debugDepartures,
    };
  }

  /**
   * Generates clean HTML view for browser debugging
   */
  public static renderDebugHtml(data: DebugStopResponse): string {
    const rowsHtml = data.departures
      .map((d) => {
        const stateColor =
          d.state === 'TEMPO REAL'
            ? 'background: #064e3b; color: #34d399;'
            : d.state === 'SUPRIMIDO'
            ? 'background: #7f1d1d; color: #f87171;'
            : 'background: #1e293b; color: #94a3b8;';

        const rtDisplay = d.realtime_time
          ? `<strong style="color: #10b981;">${d.realtime_time}</strong>`
          : '<span style="color: #64748b;">—</span>';

        return `
          <tr style="border-bottom: 1px solid #334155;">
            <td style="padding: 10px; font-weight: bold; color: #f8fafc;">${d.feed}</td>
            <td style="padding: 10px; color: #cbd5e1;">${d.operator}</td>
            <td style="padding: 10px; font-family: monospace; color: #38bdf8;">${d.route}</td>
            <td style="padding: 10px; color: #e2e8f0;">${d.headsign}</td>
            <td style="padding: 10px; font-family: monospace;">${d.scheduled_time}</td>
            <td style="padding: 10px; font-family: monospace;">${rtDisplay}</td>
            <td style="padding: 10px;">
              <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; ${stateColor}">
                ${d.state}
              </span>
            </td>
            <td style="padding: 10px; font-size: 12px; color: #94a3b8;">${d.reason}</td>
            <td style="padding: 10px; font-size: 11px; font-family: monospace; color: #64748b;">${d.trip_id}</td>
          </tr>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="pt-PT">
      <head>
        <meta charset="utf-8" />
        <title>Debug Paragem: ${data.stop.name} | PAROU.PT</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #0b0f19; color: #f1f5f9; padding: 24px; }
          .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; text-align: left; }
          th { padding: 10px; background: #0f172a; color: #94a3b8; font-size: 12px; text-transform: uppercase; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #1e293b; color: #38bdf8; font-size: 12px; margin-right: 6px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 style="margin: 0 0 10px 0; font-size: 24px; color: #38bdf8;">PAROU.PT · Motor de Partidas (Debug / Inspeção)</h1>
          <p style="margin: 4px 0; color: #94a3b8;">
            <strong>Paragem:</strong> ${data.stop.name} (${data.stop.id}) · 
            <strong>Operadores:</strong> ${data.stop.operators.join(', ') || 'N/A'} · 
            <strong>Modos:</strong> ${data.stop.modes.join(', ') || 'N/A'}
          </p>
          <p style="margin: 4px 0; color: #cbd5e1;">
            <strong>Hora simulada (Europe/Lisbon):</strong> ${data.simulated_time_lisbon}
          </p>
          ${
            data.status_notice
              ? `<div style="margin-top: 12px; padding: 10px 14px; background: #1e1b4b; border: 1px solid #4338ca; border-radius: 6px; color: #c7d2fe; font-weight: 500;">
                  📢 ${data.status_notice}
                </div>`
              : ''
          }
        </div>

        <div class="card" style="padding: 0; overflow-x: auto;">
          <table>
            <thead>
              <tr>
                <th>Feed</th>
                <th>Operador</th>
                <th>Linha</th>
                <th>Destino</th>
                <th>Programado</th>
                <th>Tempo Real</th>
                <th>Estado</th>
                <th>Motivo do Estado</th>
                <th>Trip ID</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="9" style="padding: 24px; text-align: center; color: #64748b;">Nenhuma partida encontrada nos próximos 7 dias.</td></tr>'}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;
  }

  public static async getDebugNearbyData(lat: number, lon: number, r?: number) {
    return StopsEngine.diagnoseNearby(lat, lon, r);
  }

  public static renderDebugNearbyHtml(data: any): string {
    const feedsRows = (data.feeds || [])
      .map(
        (f: any) => `
        <tr>
          <td><strong>${f.operator_name}</strong> <span style="font-size: 10px; color: #94a3b8;">(${f.feed_id})</span></td>
          <td><span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; background: #1e293b;">${f.mode}</span></td>
          <td><span style="padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px; background: ${f.status_in_coverage === 'OK' ? '#065f46; color: #6ee7b7;' : '#881337; color: #fda4af;'}">${f.status_in_coverage}</span></td>
          <td style="text-align: right; font-family: monospace;">${f.raw_db_stops_in_radius}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold; color: #38bdf8;">${f.stops_left_after_merge}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold; color: #4ade80;">${f.stops_sent_to_ui}</td>
          <td style="text-align: right; font-family: monospace; color: ${f.dropped_stops_count > 0 ? '#f87171' : '#64748b'};">${f.dropped_stops_count}</td>
        </tr>
      `
      )
      .join('');

    const sentRows = (data.sent_stops || [])
      .map(
        (s: any) => `
        <tr>
          <td><strong>${s.name}</strong> <span style="font-size: 10px; color: #94a3b8;">(${s.id})</span></td>
          <td>${s.modes?.join(', ') || ''}</td>
          <td>${s.operators?.join(', ') || ''}</td>
          <td style="text-align: right; font-family: monospace; color: #38bdf8;">${s.distance_meters} m</td>
          <td style="text-align: right; font-family: monospace;">${s.lines_count}</td>
        </tr>
      `
      )
      .join('');

    const droppedRows = (data.dropped_stops_sample || [])
      .map(
        (d: any) => `
        <tr>
          <td>${d.stop_name} <span style="font-size: 10px; color: #94a3b8;">(${d.stop_id})</span></td>
          <td>${d.feed_id}</td>
          <td style="text-align: right; font-family: monospace;">${d.distance_meters >= 0 ? `${d.distance_meters} m` : 'N/A'}</td>
          <td style="color: #fca5a5;">${d.reason}</td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="pt-PT">
      <head>
        <meta charset="utf-8" />
        <title>PAROU.PT · Diagnóstico Perto / Nearby</title>
        <style>
          body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: #030712; color: #e2e8f0; margin: 0; padding: 24px; }
          .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3); }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #1e293b; color: #94a3b8; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 1px solid #334155; }
          td { padding: 10px 12px; border-bottom: 1px solid #1e293b; }
          tr:hover { background: #1e293b/40; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 style="margin: 0 0 8px 0; font-size: 22px; color: #38bdf8;">PAROU.PT · Diagnóstico de Paragens Próximas (/debug/nearby)</h1>
          <p style="margin: 4px 0; color: #94a3b8; font-size: 13px;">
            <strong>Coordenadas:</strong> ${data.query.lat}, ${data.query.lon} · 
            <strong>Raio pedido:</strong> ${data.query.requested_radius_meters}m · 
            <strong>Raio efetivo aplicado:</strong> ${data.query.effective_radius_meters}m
          </p>
          <p style="margin: 4px 0; color: #cbd5e1; font-size: 13px;">
            <strong>Fonte da Consulta:</strong> <span style="color: #4ade80;">${data.query.source}</span>
          </p>
          <div style="margin-top: 14px; display: flex; gap: 16px; flex-wrap: wrap;">
            <div style="background: #1e293b; padding: 8px 14px; border-radius: 8px;">
              <div style="font-size: 11px; color: #94a3b8;">Paragens no Raio (DB)</div>
              <div style="font-size: 18px; font-weight: bold; color: white;">${data.summary.raw_db_stops_in_radius}</div>
            </div>
            <div style="background: #1e293b; padding: 8px 14px; border-radius: 8px;">
              <div style="font-size: 11px; color: #94a3b8;">Paragens enviadas à UI</div>
              <div style="font-size: 18px; font-weight: bold; color: #38bdf8;">${data.summary.stops_sent_to_ui}</div>
            </div>
            <div style="background: #1e293b; padding: 8px 14px; border-radius: 8px;">
              <div style="font-size: 11px; color: #94a3b8;">Paragens descartadas/mescladas</div>
              <div style="font-size: 18px; font-weight: bold; color: #f87171;">${data.summary.dropped_stops_count}</div>
            </div>
          </div>
        </div>

        <div class="card" style="padding: 0; overflow-x: auto;">
          <div style="padding: 12px 16px; font-size: 14px; font-weight: bold; color: #f8fafc; border-bottom: 1px solid #1e293b;">
            1. Análise por Feed / Operador
          </div>
          <table>
            <thead>
              <tr>
                <th>Operador / Feed</th>
                <th>Modo</th>
                <th>Estado em /coverage</th>
                <th style="text-align: right;">Paragens no Raio (SQL)</th>
                <th style="text-align: right;">Após Merge</th>
                <th style="text-align: right;">Enviadas à UI</th>
                <th style="text-align: right;">Descartadas</th>
              </tr>
            </thead>
            <tbody>
              ${feedsRows || '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #64748b;">Nenhum feed no raio.</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="card" style="padding: 0; overflow-x: auto;">
          <div style="padding: 12px 16px; font-size: 14px; font-weight: bold; color: #f8fafc; border-bottom: 1px solid #1e293b;">
            2. Paragens Enviadas à Interface (${data.sent_stops?.length || 0})
          </div>
          <table>
            <thead>
              <tr>
                <th>Nome da Paragem</th>
                <th>Modo(s)</th>
                <th>Operador(es)</th>
                <th style="text-align: right;">Distância</th>
                <th style="text-align: right;">Linhas</th>
              </tr>
            </thead>
            <tbody>
              ${sentRows || '<tr><td colspan="5" style="padding: 20px; text-align: center; color: #64748b;">Nenhuma paragem enviada.</td></tr>'}
            </tbody>
          </table>
        </div>

        ${
          droppedRows
            ? `
        <div class="card" style="padding: 0; overflow-x: auto;">
          <div style="padding: 12px 16px; font-size: 14px; font-weight: bold; color: #f8fafc; border-bottom: 1px solid #1e293b;">
            3. Amostra de Paragens Descartadas e Motivos (Merge / Raio / Feed / Coordenadas)
          </div>
          <table>
            <thead>
              <tr>
                <th>Paragem</th>
                <th>Feed</th>
                <th style="text-align: right;">Distância</th>
                <th>Motivo de Descarte</th>
              </tr>
            </thead>
            <tbody>
              ${droppedRows}
            </tbody>
          </table>
        </div>`
            : ''
        }
      </body>
      </html>
    `;
  }
}
