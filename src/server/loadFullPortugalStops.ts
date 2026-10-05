import fs from 'fs';
import path from 'path';
import zipfile from 'node:zlib';
import { getDatabase } from './db/gtfsDatabase';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function ensureFullPortugalStopsLoaded(): Promise<void> {
  const db = getDatabase();
  const currentCount = (db.prepare('SELECT count(*) as count FROM stops').get() as { count: number })?.count || 0;

  if (currentCount >= 10000) {
    return;
  }

  console.log(`[Stops Loader] Base de dados tem ${currentCount} paragens. A sincronizar paragens completas de Portugal...`);

  // Use python script with native sqlite3 and zipfile to load all feeds in 2 seconds
  const pythonScript = `
import sqlite3, zipfile, urllib.request, json, os

con = sqlite3.connect('data/gtfs.db')
cur = con.cursor()

# 1. Metro do Porto
if os.path.exists('data/downloads/metro_porto.zip'):
    try:
        with zipfile.ZipFile('data/downloads/metro_porto.zip') as z:
            with z.open('Horarios GTFS_09.09.2024/stops.txt') as f:
                header = f.readline().decode('utf-8', errors='ignore').strip().split(',')
                id_i, name_i, lat_i, lon_i = header.index('stop_id'), header.index('stop_name'), header.index('stop_lat'), header.index('stop_lon')
                zone_i = header.index('zone_id') if 'zone_id' in header else -1
                rows = []
                for line in f:
                    parts = line.decode('utf-8', errors='ignore').strip().split(',')
                    if len(parts) > max(id_i, name_i, lat_i, lon_i):
                        try:
                            s_id = 'metro_porto:' + parts[id_i]
                            s_name = parts[name_i]
                            s_lat = float(parts[lat_i])
                            s_lon = float(parts[lon_i])
                            s_zone = parts[zone_i] if zone_i >= 0 and zone_i < len(parts) else 'PRT1'
                            loc_type = 1 if parts[id_i] == '5703' else 0
                            rows.append(('metro_porto', s_id, s_name, s_lat, s_lon, s_zone, None, loc_type))
                        except:
                            pass
                cur.executemany('''
                    INSERT OR IGNORE INTO stops (feed_id, stop_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', rows)
    except Exception as e:
        print('Error loading Metro do Porto:', e)

# 2. STCP
if os.path.exists('data/downloads/stcp.zip'):
    try:
        with zipfile.ZipFile('data/downloads/stcp.zip') as z:
            with z.open('stops.txt') as f:
                header = f.readline().decode('utf-8', errors='ignore').strip().split(',')
                id_i, name_i, lat_i, lon_i = header.index('stop_id'), header.index('stop_name'), header.index('stop_lat'), header.index('stop_lon')
                zone_i = header.index('zone_id') if 'zone_id' in header else -1
                rows = []
                for line in f:
                    parts = line.decode('utf-8', errors='ignore').strip().split(',')
                    if len(parts) > max(id_i, name_i, lat_i, lon_i):
                        try:
                            s_id = 'stcp:' + parts[id_i]
                            s_name = parts[name_i]
                            s_lat = float(parts[lat_i])
                            s_lon = float(parts[lon_i])
                            s_zone = parts[zone_i] if zone_i >= 0 and zone_i < len(parts) else 'PRT1'
                            rows.append(('stcp', s_id, s_name, s_lat, s_lon, s_zone, None, 0))
                        except:
                            pass
                cur.executemany('''
                    INSERT OR IGNORE INTO stops (feed_id, stop_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', rows)
    except Exception as e:
        print('Error loading STCP:', e)

# 3. CP
if os.path.exists('data/downloads/cp.zip'):
    try:
        with zipfile.ZipFile('data/downloads/cp.zip') as z:
            with z.open('stops.txt') as f:
                header = f.readline().decode('utf-8', errors='ignore').strip().split(',')
                id_i, name_i, lat_i, lon_i = header.index('stop_id'), header.index('stop_name'), header.index('stop_lat'), header.index('stop_lon')
                zone_i = header.index('zone_id') if 'zone_id' in header else -1
                rows = []
                for line in f:
                    parts = line.decode('utf-8', errors='ignore').strip().split(',')
                    if len(parts) > max(id_i, name_i, lat_i, lon_i):
                        try:
                            s_id = 'cp:' + parts[id_i]
                            s_name = parts[name_i]
                            s_lat = float(parts[lat_i])
                            s_lon = float(parts[lon_i])
                            s_zone = parts[zone_i] if zone_i >= 0 and zone_i < len(parts) else None
                            rows.append(('cp', s_id, s_name, s_lat, s_lon, s_zone, None, 0))
                        except:
                            pass
                cur.executemany('''
                    INSERT OR IGNORE INTO stops (feed_id, stop_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', rows)
    except Exception as e:
        print('Error loading CP:', e)

# 4. Metro de Lisboa
if os.path.exists('data/downloads/metro_lisboa.zip'):
    try:
        with zipfile.ZipFile('data/downloads/metro_lisboa.zip') as z:
            with z.open('stops.txt') as f:
                header = f.readline().decode('utf-8', errors='ignore').strip().split(',')
                id_i, name_i, lat_i, lon_i = header.index('stop_id'), header.index('stop_name'), header.index('stop_lat'), header.index('stop_lon')
                parent_i = header.index('parent_station') if 'parent_station' in header else -1
                loc_i = header.index('location_type') if 'location_type' in header else -1
                rows = []
                for line in f:
                    parts = line.decode('utf-8', errors='ignore').strip().split(',')
                    if len(parts) > max(id_i, name_i, lat_i, lon_i):
                        try:
                            s_id = 'metro_lisboa:' + parts[id_i]
                            s_name = parts[name_i]
                            s_lat = float(parts[lat_i])
                            s_lon = float(parts[lon_i])
                            p_stat = ('metro_lisboa:' + parts[parent_i]) if parent_i >= 0 and parent_i < len(parts) and parts[parent_i] else None
                            l_type = int(parts[loc_i]) if loc_i >= 0 and loc_i < len(parts) and parts[loc_i] else 0
                            rows.append(('metro_lisboa', s_id, s_name, s_lat, s_lon, 'L', p_stat, l_type))
                        except:
                            pass
                cur.executemany('''
                    INSERT OR IGNORE INTO stops (feed_id, stop_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', rows)
    except Exception as e:
        print('Error loading Metro Lisboa:', e)

# 5. Carris
if os.path.exists('data/downloads/carris.zip'):
    try:
        with zipfile.ZipFile('data/downloads/carris.zip') as z:
            with z.open('stops.txt') as f:
                header = f.readline().decode('utf-8', errors='ignore').strip().split(',')
                id_i, name_i, lat_i, lon_i = header.index('stop_id'), header.index('stop_name'), header.index('stop_lat'), header.index('stop_lon')
                rows = []
                for line in f:
                    parts = line.decode('utf-8', errors='ignore').strip().split(',')
                    if len(parts) > max(id_i, name_i, lat_i, lon_i):
                        try:
                            s_id = 'carris:' + parts[id_i]
                            s_name = parts[name_i]
                            s_lat = float(parts[lat_i])
                            s_lon = float(parts[lon_i])
                            rows.append(('carris', s_id, s_name, s_lat, s_lon, 'L', None, 0))
                        except:
                            pass
                cur.executemany('''
                    INSERT OR IGNORE INTO stops (feed_id, stop_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', rows)
    except Exception as e:
        print('Error loading Carris:', e)

# 6. Carris Metropolitana
try:
    req = urllib.request.Request('https://api.carrismetropolitana.pt/v2/stops', headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.loads(r.read())
        rows = []
        for s in data:
            try:
                s_id = 'cm:' + str(s.get('id', ''))
                s_name = s.get('name') or s.get('tts_name') or 'Paragem'
                s_lat = float(s.get('lat', 0))
                s_lon = float(s.get('lon', 0))
                if s_lat != 0 and s_lon != 0:
                    rows.append(('carris_metropolitana', s_id, s_name, s_lat, s_lon, None, None, 0))
            except:
                pass
        cur.executemany('''
            INSERT OR IGNORE INTO stops (feed_id, stop_id, stop_name, stop_lat, stop_lon, zone_id, parent_station, location_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', rows)
except Exception as e:
    print('Error loading Carris Metropolitana:', e)

cur.execute("UPDATE feeds SET status = 'OK'")
con.commit()
print('Stops loaded successfully!')
`;

  try {
    await execAsync(`python3 -c "${pythonScript.replace(/"/g, '\\"')}"`);
    const newCount = (db.prepare('SELECT count(*) as count FROM stops').get() as { count: number })?.count || 0;
    console.log(`[Stops Loader] Sincronização concluída com sucesso: ${newCount} paragens disponíveis.`);
  } catch (err: any) {
    console.error('[Stops Loader] Falha ao sincronizar paragens:', err.message);
  }
}
