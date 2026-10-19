import type { RecordRanking } from './types/Rankings.ts';

// Shared by the legacy records table and CubeRoot's public adapter. Input is
// newest-first, as returned by getRecords. Preserve tied holders and team order.
export function getCurrentTiedRecords(records: RecordRanking[], eventId: string): RecordRanking[] {
  const output: RecordRanking[] = [];
  for (const type of ['single', 'average'] as const) {
    let current: number | undefined;
    for (const record of records) {
      if (record.eventId !== eventId || (record.type !== type && record.type !== 'single-and-avg')) continue;
      const result = type === 'single' ? record.best : record.average;
      if (current === undefined) current = result;
      else if (result > current) break;
      output.push({ ...record, type, rankingId: record.rankingId.replace(/_.*$/, `_${type}`) });
    }
  }
  return output;
}
