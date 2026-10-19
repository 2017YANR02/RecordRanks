import { describe, expect, it } from 'vitest';
import { getCurrentTiedRecords } from './current-records';
import type { RecordRanking } from './types/Rankings';

describe('current tied records', () => {
  it('retains every tied single holder and the distinct average record', () => {
    const base = { eventId: 'fto', date: new Date('2026-01-01'), persons: [], attempts: [], contest: null, videoLink: null, discussionLink: null };
    const rows: RecordRanking[] = [
      { ...base, rankingId: '3_single-and-avg', type: 'single-and-avg', best: 1000, average: 2000 },
      { ...base, rankingId: '2_single', type: 'single', best: 1000, average: 0 },
      { ...base, rankingId: '1_single-and-avg', type: 'single-and-avg', best: 1100, average: 2100 },
    ];
    expect(getCurrentTiedRecords(rows, 'fto').map(r => r.rankingId)).toEqual(['3_single', '2_single', '3_average']);
    expect(getCurrentTiedRecords(rows, '333')).toEqual([]);
    expect(rows[0].type).toBe('single-and-avg');
  });
});
