export type FeedStatus = 'OK' | 'EXPIRED' | 'horário expirado' | 'ERROR' | 'falhou' | 'NEEDS_KEY' | 'NOT_FOUND' | 'TOO_LARGE' | 'queued' | 'A aguardar' | 'SEM DADOS' | 'downloading' | 'parsing';

export type FeedType = 'gtfs' | 'gtfs_rt' | 'api';

export type FeedSourceOrigin = 'seed' | 'discovery' | 'manual' | 'AMP QiHoras (não oficial)' | string;

export interface FeedItem {
  id: string;
  operator_name: string;
  mode: string;
  feed_type: FeedType;
  source_origin: FeedSourceOrigin;
  url: string;
  latest_url?: string;
  license_url?: string;
  auth_type?: string;
  auth_key?: string;
  etag?: string;
  last_modified?: string;
  status: FeedStatus;
  progress?: string; // Live status e.g. "queued", "downloading", "parsing 40%", "OK", "ERROR: <msg>"
  lines_count: number;
  stops_count: number;
  trips_count: number;
  valid_from?: string;
  valid_until?: string;
  realtime_entities: string;
  last_ok?: string;
  last_error?: string;
  last_fetch_at?: string;
}

export interface FetchLogItem {
  id: number;
  feed_id: string;
  url: string;
  http_status: number;
  bytes: number;
  duration_ms: number;
  timestamp: string;
  message: string;
  error_details?: string;
}

export interface NetworkChecklistItem {
  name: string;
  mode: string;
  isCovered: boolean;
  status: FeedStatus | 'NOT_CONFIGURED';
  feedId?: string;
  details?: string;
}

export interface CoverageReport {
  totals: {
    totalFeeds: number;
    totalLines: number;
    totalStops: number;
    totalTrips: number;
    activeRealtimeCount: number;
    errorCount: number;
    expiredCount: number;
    okCount: number;
  };
  feeds: FeedItem[];
  checklist: NetworkChecklistItem[];
  lastSync: string;
}

export interface ManualFeedInput {
  url: string;
  feed_type: 'gtfs' | 'gtfs_rt';
  operator_name: string;
  mode?: string;
  key?: string;
}
