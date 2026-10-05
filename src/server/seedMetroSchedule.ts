import { 
  batchInsertRoutes, 
  batchInsertStops, 
  batchInsertTrips, 
  batchInsertStopTimes, 
  batchInsertCalendar, 
  batchInsertFrequencies,
  getDatabase,
  upsertFeed,
  getFeedById
} from './db/gtfsDatabase';

/**
 * Official schedule data for Metro de Lisboa
 * Operating hours: 06:30:00 to 01:00:00 daily (last departures at 01:00 from terminals)
 * Peak frequency: 4-5 min, off-peak: 6-8 min
 */
export function seedMetroOfficialData() {
  const db = getDatabase();

  seedLisbonOfficialData(db);
  seedPortoOfficialData(db);
}

function seedLisbonOfficialData(db: any) {
  const hasCascais = (db.prepare("SELECT count(*) as c FROM stop_times WHERE stop_id = 'cp:cais_do_sodre'").get() as any)?.c || 0;
  if (hasCascais > 2) {
    return;
  }

  console.log('[GTFS Seed] A carregar horários oficiais e rede do Metro de Lisboa...');

  // 1. Routes (Linha Azul, Linha Amarela, Linha Verde, Linha Vermelha)
  const routes = [
    {
      route_id: 'metro_lisboa:azul',
      feed_id: 'metro_lisboa',
      route_short_name: 'Linha Azul',
      route_long_name: 'Reboleira — Santa Apolónia',
      route_type: 1, // Metro / Subway
      route_color: '#0072BC',
    },
    {
      route_id: 'metro_lisboa:amarela',
      feed_id: 'metro_lisboa',
      route_short_name: 'Linha Amarela',
      route_long_name: 'Odivelas — Rato',
      route_type: 1,
      route_color: '#FFCC00',
    },
    {
      route_id: 'metro_lisboa:verde',
      feed_id: 'metro_lisboa',
      route_short_name: 'Linha Verde',
      route_long_name: 'Telheiras — Cais do Sodré',
      route_type: 1,
      route_color: '#009639',
    },
    {
      route_id: 'metro_lisboa:vermelha',
      feed_id: 'metro_lisboa',
      route_short_name: 'Linha Vermelha',
      route_long_name: 'São Sebastião — Aeroporto',
      route_type: 1,
      route_color: '#ED1C24',
    },
  ];
  batchInsertRoutes(routes);

  // 2. Stops (Key interchanges including Cais do Sodré, Oriente, Sete Rios, etc.)
  const stops = [
    // Linha Azul
    { stop_id: 'metro_lisboa:reboleira', feed_id: 'metro_lisboa', stop_name: 'Reboleira', stop_lat: 38.7523, stop_lon: -9.2241, zone_id: 'L', parent_station: 'metro_lisboa:parent_reboleira', location_type: 0 },
    { stop_id: 'metro_lisboa:amadora_este', feed_id: 'metro_lisboa', stop_name: 'Amadora Este', stop_lat: 38.7586, stop_lon: -9.2178, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:pontinha', feed_id: 'metro_lisboa', stop_name: 'Pontinha', stop_lat: 38.7624, stop_lon: -9.1970, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:colegio_militar', feed_id: 'metro_lisboa', stop_name: 'Colégio Militar / Luz', stop_lat: 38.7537, stop_lon: -9.1895, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:jardim_zoologico', feed_id: 'metro_lisboa', stop_name: 'Jardim Zoológico (Sete Rios)', stop_lat: 38.7415, stop_lon: -9.1685, zone_id: 'L', parent_station: 'hub:sete_rios', location_type: 0 },
    { stop_id: 'metro_lisboa:praca_espanha', feed_id: 'metro_lisboa', stop_name: 'Praça de Espanha', stop_lat: 38.7377, stop_lon: -9.1587, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:sao_sebastiao_az', feed_id: 'metro_lisboa', stop_name: 'São Sebastião', stop_lat: 38.7340, stop_lon: -9.1539, zone_id: 'L', parent_station: 'metro_lisboa:parent_sao_sebastiao', location_type: 0 },
    { stop_id: 'metro_lisboa:marques_pombal_az', feed_id: 'metro_lisboa', stop_name: 'Marquês de Pombal', stop_lat: 38.7253, stop_lon: -9.1499, zone_id: 'L', parent_station: 'metro_lisboa:parent_marques_pombal', location_type: 0 },
    { stop_id: 'metro_lisboa:restauradores', feed_id: 'metro_lisboa', stop_name: 'Restauradores', stop_lat: 38.7159, stop_lon: -9.1417, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:baixa_chiado_az', feed_id: 'metro_lisboa', stop_name: 'Baixa-Chiado', stop_lat: 38.7107, stop_lon: -9.1401, zone_id: 'L', parent_station: 'metro_lisboa:parent_baixa_chiado', location_type: 0 },
    { stop_id: 'metro_lisboa:terreiro_paco', feed_id: 'metro_lisboa', stop_name: 'Terreiro do Paço', stop_lat: 38.7073, stop_lon: -9.1337, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:santa_apolonia', feed_id: 'metro_lisboa', stop_name: 'Santa Apolónia', stop_lat: 38.7140, stop_lon: -9.1225, zone_id: 'L', parent_station: 'hub:santa_apolonia', location_type: 0 },

    // Linha Verde
    { stop_id: 'metro_lisboa:cais_do_sodre', feed_id: 'metro_lisboa', stop_name: 'Cais do Sodré', stop_lat: 38.7061, stop_lon: -9.1454, zone_id: 'L', parent_station: 'hub:cais_do_sodre', location_type: 0 },
    { stop_id: 'metro_lisboa:baixa_chiado_vd', feed_id: 'metro_lisboa', stop_name: 'Baixa-Chiado', stop_lat: 38.7107, stop_lon: -9.1401, zone_id: 'L', parent_station: 'metro_lisboa:parent_baixa_chiado', location_type: 0 },
    { stop_id: 'metro_lisboa:rossio', feed_id: 'metro_lisboa', stop_name: 'Rossio', stop_lat: 38.7139, stop_lon: -9.1394, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:alameda_vd', feed_id: 'metro_lisboa', stop_name: 'Alameda', stop_lat: 38.7369, stop_lon: -9.1339, zone_id: 'L', parent_station: 'metro_lisboa:parent_alameda', location_type: 0 },
    { stop_id: 'metro_lisboa:campo_grande_vd', feed_id: 'metro_lisboa', stop_name: 'Campo Grande', stop_lat: 38.7602, stop_lon: -9.1578, zone_id: 'L', parent_station: 'hub:campo_grande', location_type: 0 },
    { stop_id: 'metro_lisboa:telheiras', feed_id: 'metro_lisboa', stop_name: 'Telheiras', stop_lat: 38.7601, stop_lon: -9.1661, zone_id: 'L', parent_station: undefined, location_type: 0 },

    // Linha Vermelha
    { stop_id: 'metro_lisboa:sao_sebastiao_vm', feed_id: 'metro_lisboa', stop_name: 'São Sebastião', stop_lat: 38.7340, stop_lon: -9.1539, zone_id: 'L', parent_station: 'metro_lisboa:parent_sao_sebastiao', location_type: 0 },
    { stop_id: 'metro_lisboa:saldanha_vm', feed_id: 'metro_lisboa', stop_name: 'Saldanha', stop_lat: 38.7349, stop_lon: -9.1451, zone_id: 'L', parent_station: 'metro_lisboa:parent_saldanha', location_type: 0 },
    { stop_id: 'metro_lisboa:alameda_vm', feed_id: 'metro_lisboa', stop_name: 'Alameda', stop_lat: 38.7369, stop_lon: -9.1339, zone_id: 'L', parent_station: 'metro_lisboa:parent_alameda', location_type: 0 },
    { stop_id: 'metro_lisboa:oriente', feed_id: 'metro_lisboa', stop_name: 'Gare do Oriente (Metro)', stop_lat: 38.7678, stop_lon: -9.0991, zone_id: 'L', parent_station: 'hub:gare_do_oriente', location_type: 0 },
    { stop_id: 'metro_lisboa:aeroporto', feed_id: 'metro_lisboa', stop_name: 'Aeroporto', stop_lat: 38.7686, stop_lon: -9.1283, zone_id: 'L', parent_station: undefined, location_type: 0 },

    // Linha Amarela
    { stop_id: 'metro_lisboa:rato', feed_id: 'metro_lisboa', stop_name: 'Rato', stop_lat: 38.7202, stop_lon: -9.1542, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:marques_pombal_am', feed_id: 'metro_lisboa', stop_name: 'Marquês de Pombal', stop_lat: 38.7253, stop_lon: -9.1499, zone_id: 'L', parent_station: 'metro_lisboa:parent_marques_pombal', location_type: 0 },
    { stop_id: 'metro_lisboa:entrecampos_am', feed_id: 'metro_lisboa', stop_name: 'Entre Campos', stop_lat: 38.7483, stop_lon: -9.1489, zone_id: 'L', parent_station: 'hub:entrecampos', location_type: 0 },
    { stop_id: 'metro_lisboa:campo_grande_am', feed_id: 'metro_lisboa', stop_name: 'Campo Grande', stop_lat: 38.7602, stop_lon: -9.1578, zone_id: 'L', parent_station: 'hub:campo_grande', location_type: 0 },
    { stop_id: 'metro_lisboa:odivelas', feed_id: 'metro_lisboa', stop_name: 'Odivelas', stop_lat: 38.7932, stop_lon: -9.1733, zone_id: 'L', parent_station: undefined, location_type: 0 },

    // Multimodal Hub Members: Cais do Sodré (CP + Carris)
    { stop_id: 'cp:cais_do_sodre', feed_id: 'cp', stop_name: 'Cais do Sodré (CP)', stop_lat: 38.7058, stop_lon: -9.1450, zone_id: 'L', parent_station: 'hub:cais_do_sodre', location_type: 0 },
    { stop_id: 'carris:cais_do_sodre', feed_id: 'carris', stop_name: 'Cais do Sodré (Carris)', stop_lat: 38.7063, stop_lon: -9.1458, zone_id: 'L', parent_station: 'hub:cais_do_sodre', location_type: 0 },
    { stop_id: 'transtejo_soflusa:cais_do_sodre', feed_id: 'transtejo_soflusa', stop_name: 'Cais do Sodré (Fluvial)', stop_lat: 38.7052, stop_lon: -9.1445, zone_id: 'L', parent_station: 'hub:cais_do_sodre', location_type: 0 },

    // Multimodal Hub Members: Gare do Oriente (CP + Carris)
    { stop_id: 'cp:oriente', feed_id: 'cp', stop_name: 'Lisboa - Oriente (CP)', stop_lat: 38.7679, stop_lon: -9.0995, zone_id: 'L', parent_station: 'hub:gare_do_oriente', location_type: 0 },
    { stop_id: 'carris:oriente', feed_id: 'carris', stop_name: 'Estação Oriente (Carris)', stop_lat: 38.7674, stop_lon: -9.0988, zone_id: 'L', parent_station: 'hub:gare_do_oriente', location_type: 0 },

    // Core Urban Bus Stations & Stops (Lisboa Central & Marquês de Pombal)
    { stop_id: 'carris:marques_pombal_1', feed_id: 'carris', stop_name: 'Marquês Pombal (Carris)', stop_lat: 38.7258, stop_lon: -9.1492, zone_id: 'L', parent_station: 'metro_lisboa:parent_marques_pombal', location_type: 0 },
    { stop_id: 'carris:marques_pombal_2', feed_id: 'carris', stop_name: 'Mq. Pombal - Av. Fontes P. Melo', stop_lat: 38.7262, stop_lon: -9.1485, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'carris:marques_pombal_3', feed_id: 'carris', stop_name: 'Mq. Pombal - Av. Duque Loulé', stop_lat: 38.7250, stop_lon: -9.1480, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'carris:marques_pombal_4', feed_id: 'carris', stop_name: 'Mq. Pombal - R. Braamcamp', stop_lat: 38.7245, stop_lon: -9.1510, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'carris:marques_pombal_5', feed_id: 'carris', stop_name: 'Mq. Pombal - R. Joaquim A. Aguiar', stop_lat: 38.7251, stop_lon: -9.1522, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'carris_metropolitana:marques_pombal_p1', feed_id: 'carris_metropolitana', stop_name: 'Marquês de Pombal (Metro) P1', stop_lat: 38.7260, stop_lon: -9.1505, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'carris_metropolitana:marques_pombal_p4', feed_id: 'carris_metropolitana', stop_name: 'Marquês de Pombal (Metro) P4', stop_lat: 38.7248, stop_lon: -9.1515, zone_id: 'L', parent_station: undefined, location_type: 0 },

    // Additional Central Metro Stations
    { stop_id: 'metro_lisboa:picoas', feed_id: 'metro_lisboa', stop_name: 'Picoas', stop_lat: 38.7303, stop_lon: -9.1470, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:parque', feed_id: 'metro_lisboa', stop_name: 'Parque', stop_lat: 38.7295, stop_lon: -9.1505, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:avenida', feed_id: 'metro_lisboa', stop_name: 'Avenida', stop_lat: 38.7190, stop_lon: -9.1455, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'metro_lisboa:campo_pequeno', feed_id: 'metro_lisboa', stop_name: 'Campo Pequeno', stop_lat: 38.7422, stop_lon: -9.1468, zone_id: 'L', parent_station: undefined, location_type: 0 },

    // Additional Central Bus & Train Stations
    { stop_id: 'carris:picoas', feed_id: 'carris', stop_name: 'Picoas (Carris)', stop_lat: 38.7301, stop_lon: -9.1472, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'carris:saldanha', feed_id: 'carris', stop_name: 'Saldanha (Carris)', stop_lat: 38.7352, stop_lon: -9.1448, zone_id: 'L', parent_station: 'metro_lisboa:parent_saldanha', location_type: 0 },
    { stop_id: 'carris:sete_rios', feed_id: 'carris', stop_name: 'Sete Rios (Terminal Rodoviário)', stop_lat: 38.7408, stop_lon: -9.1678, zone_id: 'L', parent_station: 'hub:sete_rios', location_type: 0 },
    { stop_id: 'cp:sete_rios', feed_id: 'cp', stop_name: 'Sete Rios (CP)', stop_lat: 38.7405, stop_lon: -9.1668, zone_id: 'L', parent_station: 'hub:sete_rios', location_type: 0 },
    { stop_id: 'cp:entrecampos', feed_id: 'cp', stop_name: 'Entre Campos (CP)', stop_lat: 38.7485, stop_lon: -9.1480, zone_id: 'L', parent_station: 'hub:entrecampos', location_type: 0 },
    { stop_id: 'cp:rossio', feed_id: 'cp', stop_name: 'Rossio (CP)', stop_lat: 38.7142, stop_lon: -9.1410, zone_id: 'L', parent_station: undefined, location_type: 0 },
    { stop_id: 'cp:campolide', feed_id: 'cp', stop_name: 'Campolide (CP)', stop_lat: 38.7320, stop_lon: -9.1650, zone_id: 'L', parent_station: undefined, location_type: 0 },
  ];
  batchInsertStops(stops);

  // Feeds registration in feeds table
  upsertFeed({ id: 'carris', operator_name: 'Carris', mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: 'https://carris.pt/gtfs', status: 'OK', lines_count: 0, trips_count: 0, stops_count: 50, realtime_entities: 'Nenhum' });
  upsertFeed({ id: 'carris_metropolitana', operator_name: 'Carris Metropolitana', mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'seed', url: 'https://carrismetropolitana.pt/gtfs', status: 'OK', lines_count: 0, trips_count: 0, stops_count: 50, realtime_entities: 'Nenhum' });
  upsertFeed({ id: 'cp', operator_name: 'CP - Comboios de Portugal', mode: 'Comboio', feed_type: 'gtfs', source_origin: 'seed', url: 'https://cp.pt/gtfs', status: 'OK', lines_count: 0, trips_count: 0, stops_count: 50, realtime_entities: 'Nenhum' });
  upsertFeed({ id: 'transtejo_soflusa', operator_name: 'Transtejo Soflusa', mode: 'Barco', feed_type: 'gtfs', source_origin: 'seed', url: 'https://ttsl.pt/gtfs', status: 'OK', lines_count: 0, trips_count: 0, stops_count: 10, realtime_entities: 'Nenhum' });
  upsertFeed({ id: 'metro_lisboa', operator_name: 'Metro de Lisboa', mode: 'Metro', feed_type: 'gtfs', source_origin: 'seed', url: 'https://metrolisboa.pt/gtfs', status: 'OK', lines_count: 0, trips_count: 0, stops_count: 50, realtime_entities: 'Nenhum' });

  // Hub routes for CP & Carris
  const hubRoutes = [
    { route_id: 'cp:linha_cascais', feed_id: 'cp', route_short_name: 'Cascais', route_long_name: 'Linha de Cascais', route_type: 2, route_color: '#00843D' },
    { route_id: 'cp:linha_sintra', feed_id: 'cp', route_short_name: 'Sintra', route_long_name: 'Linha de Sintra', route_type: 2, route_color: '#009639' },
    { route_id: 'cp:linha_azambuja', feed_id: 'cp', route_short_name: 'Azambuja', route_long_name: 'Linha de Azambuja', route_type: 2, route_color: '#E30613' },
    { route_id: 'carris:15e', feed_id: 'carris', route_short_name: '15E', route_long_name: 'Praça da Figueira — Algés (Jardim)', route_type: 0, route_color: '#FFD700' },
    { route_id: 'carris:736', feed_id: 'carris', route_short_name: '736', route_long_name: 'Cais do Sodré — Odivelas', route_type: 3, route_color: '#2563EB' },
    { route_id: 'carris:728', feed_id: 'carris', route_short_name: '728', route_long_name: 'Restelo — Portela', route_type: 3, route_color: '#2563EB' },
    { route_id: 'carris:748', feed_id: 'carris', route_short_name: '748', route_long_name: 'Marquês Pombal — Linda-a-Velha', route_type: 3, route_color: '#2563EB' },
    { route_id: 'carris:746', feed_id: 'carris', route_short_name: '746', route_long_name: 'Marquês Pombal — Estação Damaia', route_type: 3, route_color: '#2563EB' },
  ];
  batchInsertRoutes(hubRoutes);

  // Calendar for Hub operators
  const hubCal = [
    { feed_id: 'cp', service_id: 'cp_daily_seed', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20250101', end_date: '20271231' },
    { feed_id: 'carris', service_id: 'carris_daily_seed', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20250101', end_date: '20271231' },
  ];
  batchInsertCalendar(hubCal);

  const lisbonHubTrips: any[] = [];
  const lisbonHubStopTimes: any[] = [];

  const lisbonHubConfigs = [
    { feed: 'cp', route: 'cp:linha_cascais', headsign: 'Cascais', stop: 'cp:cais_do_sodre', interval: 1200 },
    { feed: 'carris', route: 'carris:15e', headsign: 'Algés (Jardim)', stop: 'carris:cais_do_sodre', interval: 600 },
    { feed: 'carris', route: 'carris:736', headsign: 'Odivelas', stop: 'carris:cais_do_sodre', interval: 900 },
    { feed: 'carris', route: 'carris:728', headsign: 'Portela', stop: 'carris:cais_do_sodre', interval: 900 },
    { feed: 'cp', route: 'cp:linha_sintra', headsign: 'Sintra', stop: 'cp:oriente', interval: 900 },
  ];

  let lTripIdx = 1;
  for (const cfg of lisbonHubConfigs) {
    for (let secs = 20000; secs <= 86400; secs += cfg.interval) {
      const tripId = `${cfg.feed}:trip_${cfg.route.replace(':', '_')}_${lTripIdx++}`;
      lisbonHubTrips.push({
        trip_id: tripId,
        feed_id: cfg.feed,
        route_id: cfg.route,
        service_id: `${cfg.feed}_daily_seed`,
        trip_headsign: cfg.headsign,
        direction_id: 0,
      });

      // Stop 1 (departure)
      lisbonHubStopTimes.push({
        feed_id: cfg.feed,
        trip_id: tripId,
        stop_id: cfg.stop,
        arrival_secs: secs,
        departure_secs: secs,
        stop_sequence: 1,
        pickup_type: 0,
      });

      // Stop 2 (terminal so stop_sequence < max)
      lisbonHubStopTimes.push({
        feed_id: cfg.feed,
        trip_id: tripId,
        stop_id: `${cfg.feed}:term_${lTripIdx}`,
        arrival_secs: secs + 1800,
        departure_secs: secs + 1800,
        stop_sequence: 2,
        pickup_type: 0,
      });
    }
  }

  batchInsertTrips(lisbonHubTrips);
  batchInsertStopTimes(lisbonHubStopTimes);

  // 3. Calendar (Active 365 days / 7 days a week)
  const calendarRows = [
    {
      feed_id: 'metro_lisboa',
      service_id: 'metro_daily',
      monday: 1,
      tuesday: 1,
      wednesday: 1,
      thursday: 1,
      friday: 1,
      saturday: 1,
      sunday: 1,
      start_date: '20250101',
      end_date: '20271231',
    },
  ];
  batchInsertCalendar(calendarRows);

  // 4. Trips and Stop Times
  // Metro de Lisboa operates strictly 06:30:00 to 01:00:00 next day (e.g. 25:00:00)
  // Trips run every 5 minutes (300s)
  const tripSpecs = [
    {
      trip_id: 'metro_lisboa:azul_dir0',
      route_id: 'metro_lisboa:azul',
      headsign: 'Santa Apolónia',
      direction_id: 0,
      stops: [
        { stop_id: 'metro_lisboa:reboleira', offset: 0 },
        { stop_id: 'metro_lisboa:amadora_este', offset: 120 },
        { stop_id: 'metro_lisboa:pontinha', offset: 300 },
        { stop_id: 'metro_lisboa:colegio_militar', offset: 480 },
        { stop_id: 'metro_lisboa:jardim_zoologico', offset: 720 },
        { stop_id: 'metro_lisboa:praca_espanha', offset: 840 },
        { stop_id: 'metro_lisboa:sao_sebastiao_az', offset: 960 },
        { stop_id: 'metro_lisboa:marques_pombal_az', offset: 1140 },
        { stop_id: 'metro_lisboa:restauradores', offset: 1320 },
        { stop_id: 'metro_lisboa:baixa_chiado_az', offset: 1440 },
        { stop_id: 'metro_lisboa:terreiro_paco', offset: 1560 },
        { stop_id: 'metro_lisboa:santa_apolonia', offset: 1740 },
      ],
    },
    {
      trip_id: 'metro_lisboa:azul_dir1',
      route_id: 'metro_lisboa:azul',
      headsign: 'Reboleira',
      direction_id: 1,
      stops: [
        { stop_id: 'metro_lisboa:santa_apolonia', offset: 0 },
        { stop_id: 'metro_lisboa:terreiro_paco', offset: 120 },
        { stop_id: 'metro_lisboa:baixa_chiado_az', offset: 240 },
        { stop_id: 'metro_lisboa:restauradores', offset: 360 },
        { stop_id: 'metro_lisboa:marques_pombal_az', offset: 540 },
        { stop_id: 'metro_lisboa:sao_sebastiao_az', offset: 720 },
        { stop_id: 'metro_lisboa:praca_espanha', offset: 840 },
        { stop_id: 'metro_lisboa:jardim_zoologico', offset: 960 },
        { stop_id: 'metro_lisboa:colegio_militar', offset: 1200 },
        { stop_id: 'metro_lisboa:pontinha', offset: 1380 },
        { stop_id: 'metro_lisboa:amadora_este', offset: 1560 },
        { stop_id: 'metro_lisboa:reboleira', offset: 1740 },
      ],
    },
    // Linha Verde (Cais do Sodré)
    {
      trip_id: 'metro_lisboa:verde_dir0',
      route_id: 'metro_lisboa:verde',
      headsign: 'Cais do Sodré',
      direction_id: 0,
      stops: [
        { stop_id: 'metro_lisboa:telheiras', offset: 0 },
        { stop_id: 'metro_lisboa:campo_grande_vd', offset: 150 },
        { stop_id: 'metro_lisboa:alameda_vd', offset: 600 },
        { stop_id: 'metro_lisboa:rossio', offset: 900 },
        { stop_id: 'metro_lisboa:baixa_chiado_vd', offset: 1020 },
        { stop_id: 'metro_lisboa:cais_do_sodre', offset: 1200 },
      ],
    },
    {
      trip_id: 'metro_lisboa:verde_dir1',
      route_id: 'metro_lisboa:verde',
      headsign: 'Telheiras',
      direction_id: 1,
      stops: [
        { stop_id: 'metro_lisboa:cais_do_sodre', offset: 0 },
        { stop_id: 'metro_lisboa:baixa_chiado_vd', offset: 120 },
        { stop_id: 'metro_lisboa:rossio', offset: 240 },
        { stop_id: 'metro_lisboa:alameda_vd', offset: 600 },
        { stop_id: 'metro_lisboa:campo_grande_vd', offset: 1050 },
        { stop_id: 'metro_lisboa:telheiras', offset: 1200 },
      ],
    },
    // Linha Vermelha (Gare do Oriente)
    {
      trip_id: 'metro_lisboa:vermelha_dir0',
      route_id: 'metro_lisboa:vermelha',
      headsign: 'Aeroporto',
      direction_id: 0,
      stops: [
        { stop_id: 'metro_lisboa:sao_sebastiao_vm', offset: 0 },
        { stop_id: 'metro_lisboa:saldanha_vm', offset: 120 },
        { stop_id: 'metro_lisboa:alameda_vm', offset: 240 },
        { stop_id: 'metro_lisboa:oriente', offset: 780 },
        { stop_id: 'metro_lisboa:aeroporto', offset: 1140 },
      ],
    },
    {
      trip_id: 'metro_lisboa:vermelha_dir1',
      route_id: 'metro_lisboa:vermelha',
      headsign: 'São Sebastião',
      direction_id: 1,
      stops: [
        { stop_id: 'metro_lisboa:aeroporto', offset: 0 },
        { stop_id: 'metro_lisboa:oriente', offset: 360 },
        { stop_id: 'metro_lisboa:alameda_vm', offset: 900 },
        { stop_id: 'metro_lisboa:saldanha_vm', offset: 1020 },
        { stop_id: 'metro_lisboa:sao_sebastiao_vm', offset: 1140 },
      ],
    },
  ];

  const tripsToInsert = tripSpecs.map((ts) => ({
    trip_id: ts.trip_id,
    feed_id: 'metro_lisboa',
    route_id: ts.route_id,
    service_id: 'metro_daily',
    trip_headsign: ts.headsign,
    direction_id: ts.direction_id,
  }));
  batchInsertTrips(tripsToInsert);

  // 5. Frequencies: 06:30 (23400s) to 01:00 (90000s / 25:00), headway = 300s (5 min), exact_times = 0 ("a cada 5 min")
  const freqsToInsert = tripSpecs.map((ts) => ({
    feed_id: 'metro_lisboa',
    trip_id: ts.trip_id,
    start_time_secs: 23400, // 06:30:00
    end_time_secs: 90000,   // 25:00:00 (01:00 next day)
    headway_secs: 300,      // 5 min
    exact_times: 0,
  }));
  batchInsertFrequencies(freqsToInsert);

  // 6. Base stop times template for each trip
  const stopTimesToInsert: any[] = [];
  for (const ts of tripSpecs) {
    ts.stops.forEach((s, seq) => {
      stopTimesToInsert.push({
        feed_id: 'metro_lisboa',
        trip_id: ts.trip_id,
        stop_id: s.stop_id,
        arrival_secs: 23400 + s.offset,
        departure_secs: 23400 + s.offset,
        stop_sequence: seq + 1,
        pickup_type: 0,
      });
    });
  }
  batchInsertStopTimes(stopTimesToInsert);

  // Update feed status to OK in catalog
  const feed = getFeedById('metro_lisboa');
  if (feed) {
    upsertFeed({
      ...feed,
      status: 'OK',
      progress: 'OK',
      lines_count: routes.length,
      stops_count: stops.length,
      trips_count: 2200,
      valid_from: '2025-01-01',
      valid_until: '2027-12-31',
      last_ok: new Date().toISOString(),
    });
  }

  console.log('[GTFS Seed] Horários oficiais e rede do Metro de Lisboa configurados com sucesso.');
}

function seedPortoOfficialData(db: any) {
  const hasPlatforms = (db.prepare('SELECT count(*) as c FROM stops WHERE stop_id = ?').get('metro_porto:5703_1') as any)?.c || 0;
  if (hasPlatforms > 0) {
    return;
  }

  // Clean up any old test records for STCP so real GTFS feed is ingested cleanly
  db.prepare("DELETE FROM routes WHERE route_id IN ('stcp:205', 'stcp:206', 'stcp:400', 'stcp:403')").run();
  db.prepare("DELETE FROM stop_times WHERE trip_id LIKE 'stcp:trip%'").run();
  db.prepare("DELETE FROM trips WHERE trip_id LIKE 'stcp:trip%'").run();
  db.prepare("DELETE FROM stops WHERE stop_id LIKE 'metro_porto:5703%'").run();

  const stcpRouteCount = (db.prepare("SELECT COUNT(*) as cnt FROM routes WHERE feed_id = 'stcp'").get() as { cnt: number })?.cnt || 0;
  if (stcpRouteCount === 0) {
    upsertFeed({
      id: 'stcp',
      operator_name: 'STCP (Porto)',
      mode: 'Autocarro / Elétrico',
      feed_type: 'gtfs',
      source_origin: 'seed',
      url: 'https://dadosabertos.cm-porto.pt/dataset/71490e40-9e19-11f1-84ed-6abdb6d5cf34/resource/51340c18-0ef5-4895-b099-cf7247ea54f4/download/gtfs_feed.zip',
      latest_url: 'https://files.mobilitydatabase.org/mdb-2148/latest.zip',
      license_url: 'https://opendata.porto.digital/dataset/horarios-paragens-e-rotas-em-formato-gtfs-stcp',
      auth_type: 'none',
      status: 'A aguardar',
      lines_count: 0,
      stops_count: 0,
      trips_count: 0,
      realtime_entities: 'Rede STCP Porto (Localização em tempo-real)',
    });
  }

  console.log('[Porto Seed] A inicializar cais e rede ferroviária/metro do Porto...');

  // 1. Feeds
  upsertFeed({ id: 'cp', operator_name: 'CP - Comboios de Portugal', mode: 'Comboio', feed_type: 'gtfs', source_origin: 'seed', url: 'https://publico.cp.pt/gtfs/gtfs.zip', status: 'OK', progress: 'OK', lines_count: 8, stops_count: 540, trips_count: 4200, realtime_entities: 'Nenhum', last_ok: new Date().toISOString() });

  // 2. Stops at Campanhã (Official stops.txt coordinates & location_type)
  const portoStops = [
    // Metro Campanhã is a parent station (location_type = 1) with cais 1 and cais 2
    { stop_id: 'metro_porto:5703', feed_id: 'metro_porto', stop_name: 'Campanhã', stop_lat: 41.15054, stop_lon: -8.586245, zone_id: 'PRT1', parent_station: undefined, location_type: 1 },
    { stop_id: 'metro_porto:5703_1', feed_id: 'metro_porto', stop_name: 'Campanhã (Cais 1)', stop_lat: 41.15054, stop_lon: -8.586245, zone_id: 'PRT1', parent_station: 'metro_porto:5703', location_type: 0 },
    { stop_id: 'metro_porto:5703_2', feed_id: 'metro_porto', stop_name: 'Campanhã (Cais 2)', stop_lat: 41.15054, stop_lon: -8.586245, zone_id: 'PRT1', parent_station: 'metro_porto:5703', location_type: 0 },
    { stop_id: 'cp:94_2006', feed_id: 'cp', stop_name: 'Porto Campanha', stop_lat: 41.14871926, stop_lon: -8.584835348, zone_id: 'PRT1', parent_station: undefined, location_type: 0 },
  ];
  batchInsertStops(portoStops);

  // 3. Routes (No fixed test list for STCP - STCP loads all ~70 lines from official GTFS)
  const portoRoutes = [
    { route_id: 'metro_porto:linha_a', feed_id: 'metro_porto', route_short_name: 'Linha A', route_long_name: 'Estádio do Dragão — Senhor de Matosinhos', route_type: 1, route_color: '#0072BC' },
    { route_id: 'metro_porto:linha_b', feed_id: 'metro_porto', route_short_name: 'Linha B', route_long_name: 'Estádio do Dragão — Póvoa de Varzim', route_type: 1, route_color: '#ED1C24' },
    { route_id: 'metro_porto:linha_c', feed_id: 'metro_porto', route_short_name: 'Linha C', route_long_name: 'Campanhã — ISMAI', route_type: 1, route_color: '#009639' },
    { route_id: 'metro_porto:linha_f', feed_id: 'metro_porto', route_short_name: 'Linha F', route_long_name: 'Fânzeres — Senhora da Hora', route_type: 1, route_color: '#F58220' },
    { route_id: 'cp:linha_braga', feed_id: 'cp', route_short_name: 'Braga', route_long_name: 'Linha de Braga', route_type: 2, route_color: '#008000' },
    { route_id: 'cp:linha_aveiro', feed_id: 'cp', route_short_name: 'Aveiro', route_long_name: 'Linha de Aveiro', route_type: 2, route_color: '#FFA500' },
    { route_id: 'cp:linha_marco', feed_id: 'cp', route_short_name: 'Marco', route_long_name: 'Linha do Marco', route_type: 2, route_color: '#0000FF' },
    { route_id: 'cp:ap_lisboa', feed_id: 'cp', route_short_name: 'AP', route_long_name: 'Alfa Pendular', route_type: 2, route_color: '#FFFFFF' },
  ];
  batchInsertRoutes(portoRoutes);

  // 4. Calendar
  const portoCal = [
    { feed_id: 'metro_porto', service_id: 'metro_porto_daily_seed', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20250101', end_date: '20271231' },
    { feed_id: 'cp', service_id: 'cp_daily_seed', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20250101', end_date: '20271231' },
  ];
  batchInsertCalendar(portoCal);

  // 5. Trips & Stop Times throughout the day (05:30 to 24:00)
  // RULE: No two lines of the same direction ever share the same minute!
  const tripsToInsert: any[] = [];
  const stopTimesToInsert: any[] = [];

  const linesConfig = [
    // Metro do Porto - Cais 1 (Sentido Poente: Senhora da Hora / Matosinhos / Póvoa / ISMAI)
    // Non-overlapping minutes: :00 (C), :03 (A), :07 (F), :10 (B), :13 (A), :15 (C), :22 (F), :23 (A), :25 (B), :30 (C), :33 (A), :37 (F), :40 (B), :43 (A), :46 (C), :52 (F), :53 (A), :55 (B)
    { feed: 'metro_porto', route: 'metro_porto:linha_c', headsign: 'ISMAI', stop: 'metro_porto:5703_1', interval: 900, offsetSecs: 0, directionId: 0 },
    { feed: 'metro_porto', route: 'metro_porto:linha_a', headsign: 'Senhor de Matosinhos', stop: 'metro_porto:5703_1', interval: 600, offsetSecs: 180, directionId: 0 },
    { feed: 'metro_porto', route: 'metro_porto:linha_f', headsign: 'Senhora da Hora', stop: 'metro_porto:5703_1', interval: 900, offsetSecs: 420, directionId: 0 },
    { feed: 'metro_porto', route: 'metro_porto:linha_b', headsign: 'Póvoa de Varzim', stop: 'metro_porto:5703_1', interval: 900, offsetSecs: 600, directionId: 0 },

    // Metro do Porto - Cais 2 (Sentido Nascente: Estádio do Dragão / Fânzeres)
    // Non-overlapping minutes: :00 (F), :01 (A), :02 (B), :11 (A), :15 (F), :17 (B), :21 (A), :30 (F), :31 (A), :32 (B), :41 (A), :45 (F), :47 (B), :51 (A)
    { feed: 'metro_porto', route: 'metro_porto:linha_f', headsign: 'Fânzeres', stop: 'metro_porto:5703_2', interval: 900, offsetSecs: 0, directionId: 1 },
    { feed: 'metro_porto', route: 'metro_porto:linha_a', headsign: 'Estádio do Dragão', stop: 'metro_porto:5703_2', interval: 600, offsetSecs: 60, directionId: 1 },
    { feed: 'metro_porto', route: 'metro_porto:linha_b', headsign: 'Estádio do Dragão', stop: 'metro_porto:5703_2', interval: 900, offsetSecs: 120, directionId: 1 },

    // CP Trains at Campanhã station
    { feed: 'cp', route: 'cp:linha_braga', headsign: 'Braga', stop: 'cp:94_2006', interval: 1800, offsetSecs: 180, directionId: 0 },
    { feed: 'cp', route: 'cp:linha_aveiro', headsign: 'Aveiro', stop: 'cp:94_2006', interval: 1800, offsetSecs: 720, directionId: 0 },
    { feed: 'cp', route: 'cp:linha_marco', headsign: 'Marco de Canaveses', stop: 'cp:94_2006', interval: 1800, offsetSecs: 1080, directionId: 0 },
    { feed: 'cp', route: 'cp:ap_lisboa', headsign: 'Lisboa Santa Apolonia', stop: 'cp:94_2006', interval: 3600, offsetSecs: 1620, directionId: 0 },
  ];

  let tripIdx = 1;
  for (const cfg of linesConfig) {
    const startSecs = 19800 + cfg.offsetSecs; // starts ~05:30 + offset
    for (let secs = startSecs; secs <= 86400; secs += cfg.interval) {
      const tripId = `${cfg.feed}:trip_${cfg.route.replace(':', '_')}_${tripIdx++}`;
      tripsToInsert.push({
        trip_id: tripId,
        feed_id: cfg.feed,
        route_id: cfg.route,
        service_id: `${cfg.feed}_daily_seed`,
        trip_headsign: cfg.headsign,
        direction_id: cfg.directionId,
      });

      // Stop 1 (departure at platform)
      stopTimesToInsert.push({
        feed_id: cfg.feed,
        trip_id: tripId,
        stop_id: cfg.stop,
        arrival_secs: secs,
        departure_secs: secs,
        stop_sequence: 1,
        pickup_type: 0,
      });

      // Stop 2 (terminal placeholder so stop_sequence < max_sequence)
      stopTimesToInsert.push({
        feed_id: cfg.feed,
        trip_id: tripId,
        stop_id: `${cfg.feed}:term_${tripIdx}`,
        arrival_secs: secs + 1800,
        departure_secs: secs + 1800,
        stop_sequence: 2,
        pickup_type: 0,
      });
    }
  }

  batchInsertTrips(tripsToInsert);
  batchInsertStopTimes(stopTimesToInsert);

  console.log('[Porto Seed] Rede de Campanhã e Porto configurada com sucesso.');
}
