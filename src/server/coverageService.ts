import { CoverageReport, NetworkChecklistItem, FeedItem } from '../types/coverage';
import { getAllFeeds } from './db/gtfsDatabase';
import { EXPECTED_NETWORKS } from './gtfsSeedRegistry';

export function getCoverageReport(): CoverageReport {
  const rawFeeds = getAllFeeds();
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const feeds: FeedItem[] = rawFeeds.map((f) => {
    let status = f.status;
    let progress = f.progress || '';
    let lastError = f.last_error;

    // Check if real-time feed
    if (f.feed_type === 'gtfs_rt' || (f.feed_type as string) === 'siri' || f.id.endsWith('_rt')) {
      status = 'TEMPO REAL' as any;
      if (!progress || progress.startsWith('OK')) {
        progress = 'Feed GTFS-RT de telemetria ativo';
      }
    } else {
      // Check expiration first: valid_until no passado assinala mas não exclui
      const isExpired = f.status === 'horário expirado' || Boolean(f.valid_until && f.valid_until.replace(/-/g, '') < todayStr);
      if (isExpired) {
        status = 'horário expirado' as any;
        progress = progress || 'Horário possivelmente desatualizado';
      } else if (f.lines_count > 0 && f.stops_count > 0) {
        status = 'OK';
      } else {
        // Feed without data or still pending
        if (f.status === 'A aguardar' || f.status === 'queued' || f.status === 'downloading' || f.status === 'parsing') {
          status = f.status;
        } else if (f.lines_count === 0 && f.status !== 'ERROR') {
          status = 'SEM DADOS' as any;
          progress = progress || 'Ficheiro GTFS estático sem rotas carregadas na base de dados';
          if (!lastError) {
            lastError = 'Ficheiro GTFS estático sem rotas carregadas na base de dados';
          }
        }
      }
    }

    return {
      ...f,
      status,
      progress,
      last_error: lastError,
    };
  });

  const okFeeds = feeds.filter((f) => f.status === 'OK');
  const expiredFeeds = feeds.filter((f) => (f.status as string) === 'horário expirado');
  const realtimeFeeds = feeds.filter((f) => (f.status as string) === 'TEMPO REAL');
  const errorFeeds = feeds.filter((f) => f.status === 'ERROR');

  const totals = {
    totalFeeds: feeds.length,
    totalLines: feeds.reduce((acc, f) => acc + (f.lines_count || 0), 0),
    totalStops: feeds.reduce((acc, f) => acc + (f.stops_count || 0), 0),
    totalTrips: feeds.reduce((acc, f) => acc + (f.trips_count || 0), 0),
    activeRealtimeCount: realtimeFeeds.length,
    errorCount: errorFeeds.length,
    expiredCount: expiredFeeds.length,
    okCount: okFeeds.length,
  };

  // Map of feeds by normalized name or id for checklist matching
  const feedMapByName = new Map<string, FeedItem>();
  for (const f of feeds) {
    feedMapByName.set(f.operator_name.toLowerCase(), f);
    feedMapByName.set(f.id.toLowerCase(), f);
  }

  // Build Expected Networks Checklist
  const checklist: NetworkChecklistItem[] = [];

  for (const exp of EXPECTED_NETWORKS) {
    let matched = feedMapByName.get(exp.name.toLowerCase()) || feedMapByName.get(exp.defaultSeedId.toLowerCase());
    if (!matched) {
      for (const [key, f] of feedMapByName.entries()) {
        if (key.includes(exp.name.toLowerCase()) || exp.name.toLowerCase().includes(key)) {
          matched = f;
          break;
        }
      }
    }

    const isCovered = Boolean(matched && (matched.status === 'OK' || (matched.status as string) === 'horário expirado') && (matched.lines_count > 0 || matched.stops_count > 0));
    let details = 'Pendente de integração oficial ou feed NAP/IMT';
    if (matched) {
      if ((matched.status as string) === 'horário expirado') {
        details = `Horário possivelmente desatualizado (${matched.valid_until || 'data ultrapassada'}) — ${matched.lines_count} carreiras e ${matched.stops_count} paragens`;
      } else if (matched.status === 'OK') {
        details = `Ativo com ${matched.lines_count} carreiras e ${matched.stops_count} paragens carregadas`;
      } else {
        details = matched.last_error || matched.progress || 'Feed a carregar ou sem rotas carregadas';
      }
    }

    checklist.push({
      name: exp.name,
      mode: exp.mode,
      isCovered,
      status: matched ? matched.status : 'NOT_CONFIGURED',
      feedId: matched?.id,
      details,
    });
  }

  return {
    totals,
    feeds,
    checklist,
    lastSync: new Date().toISOString(),
  };
}
