import { NextRequest } from 'next/server';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { dbMock } from '~/__mocks__/db-mock';
import { organizationsTable, personsTable, resultsTable, contestsTable } from '~/__mocks__/db-schema';
import { reseedTestData } from '~/vitest-setup';
import { getFormattedTime } from '~/helpers/utility-functions';
import { GET } from './route';

const request = (query: string) => GET(new NextRequest(`http://localhost/api/default/cuberoot?${query}`));
describe('CubeRoot public adapter', () => {
  beforeAll(async () => {
    await reseedTestData();
    await dbMock.update(resultsTable).set({ approved: true });
  });
  beforeEach(() => { vi.stubEnv('PROJECT_ID', 'cuberoot-contests'); });
  it('returns only visible events and preserves RR result formats', async () => {
    const response = await request('view=catalog');
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.events.some((e: { hidden: boolean }) => e.hidden)).toBe(false);
    expect(getFormattedTime(999600065570000, { eventFormat: 'multi' })).toBe('3/3 1:05.57');
    expect(getFormattedTime(28, { eventFormat: 'number' })).toBe('28');
    expect(getFormattedTime(2833, { eventFormat: 'number', isAverage: true })).toBe('28.33');
    expect(getFormattedTime(1234, { eventFormat: 'time-3d' })).toBe('1.234');
  });
  it('links by WCA ID without guessing names', async () => {
    await dbMock.update(personsTable).set({ wcaId: '2026TEST01', regionCode: 'CN' }).where(eq(personsTable.id, 1));
    const response = await request('view=person&id=2026TEST01');
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.person.id).toBe(1);
    expect(data.results[0]).toBeDefined();
    expect(data.results.every((r: { personIds: number[] }) => r.personIds.includes(1))).toBe(true);
    expect(JSON.stringify(data)).not.toContain('createdBy');
    expect((await request('view=person&id=2026NONE01')).status).toBe(404);
    const search = await (await request('view=persons&q=2026TEST01&region=CN')).json();
    expect(search.data.map((p: { id: number }) => p.id)).toEqual([1]);
    expect((await (await request('view=persons&q=2026TEST01&region=US')).json()).data).toEqual([]);
  });
  it('loads public contest details without moderation notes', async () => {
    const row = await dbMock.query.results.findFirst({ where: { competitionId: { isNotNull: true } } });
    const contest = await dbMock.query.contests.findFirst({ where: { organizationId: 'default', competitionId: row!.competitionId! } });
    const response = await request(`view=contest&id=${contest!.competitionId}&event=${row!.eventId}`);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.contest.city).toBe(contest!.city);
    expect(data.results[0]).toBeDefined();
    expect(data.results.every((r: { bestText: string }) => typeof r.bestText === 'string')).toBe(true);
    expect(data.contest).not.toHaveProperty('adminNotes');
  });
  it('serves rankings using the production driver result shape and the RR formatter', async () => {
    // PGlite returns { rows }, while the production postgres-js driver returns a
    // row array. Keep the actual SQL engine, adapting only that driver boundary.
    const execute = dbMock.execute.bind(dbMock);
    const spy = vi.spyOn(dbMock, 'execute').mockImplementation((...args) =>
      execute(...args).then(result => result.rows) as unknown as ReturnType<typeof execute>);
    try {
      const row = await dbMock.query.results.findFirst({ where: { approved: true, best: { gt: 0 } } });
      const response = await request(`view=rankings&event=${row!.eventId}&category=${row!.recordCategory}`);
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data[0]).toBeDefined();
      expect(data[0].ranking).toBe(1);
      const event = await dbMock.query.events.findFirst({ where: { organizationId: 'default', eventId: row!.eventId } });
      expect(data[0].resultText).toBe(getFormattedTime(data[0].result, { eventFormat: event!.format }));
    } finally { spy.mockRestore(); }
    expect((await request('view=competitions&region=CN')).status).toBe(200);
    const records = await request('view=records&group=unofficial&history=all');
    expect(records.status).toBe(200);
    expect(Array.isArray((await records.json()).data)).toBe(true);
  });
  it('hides unapproved results and people', async () => {
    const row = await dbMock.query.results.findFirst();
    expect(row).toBeDefined();
    await dbMock.update(resultsTable).set({ approved: false }).where(eq(resultsTable.id, row!.id));
    const response = await request(`view=person&id=${row!.personIds[0]}`);
    const { data } = await response.json();
    expect(data.results.some((r: { id: number }) => r.id === row!.id)).toBe(false);
    await dbMock.update(personsTable).set({ approved: false }).where(eq(personsTable.id, 1));
    expect((await request('view=person&id=1')).status).toBe(404);
    await dbMock.update(personsTable).set({ approved: true }).where(eq(personsTable.id, 1));
  });
  it('does not expose draft contests, private organizations or other deployments', async () => {
    const contest = await dbMock.query.contests.findFirst();
    await dbMock.update(contestsTable).set({ state: 'created' }).where(eq(contestsTable.id, contest!.id));
    expect((await request(`view=contest&id=${contest!.competitionId}`)).status).toBe(404);
    const org = await dbMock.query.organizations.findFirst({ where: { id: 'default' } });
    await dbMock.update(organizationsTable).set({ metadata: JSON.stringify({ private: true }) }).where(eq(organizationsTable.id, 'default'));
    expect((await request('view=persons')).status).toBe(404);
    await dbMock.update(organizationsTable).set({ metadata: org!.metadata }).where(eq(organizationsTable.id, 'default'));
    vi.stubEnv('PROJECT_ID', 'another-instance');
    expect((await request('view=catalog')).status).toBe(404);
  });
});
