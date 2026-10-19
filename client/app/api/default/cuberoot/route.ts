import type { NextRequest } from "next/server";
import { and, arrayContains, desc, eq, ilike, inArray, or } from "drizzle-orm";
import z from "zod";
import { getFormattedTime } from "~/helpers/utility-functions.ts";
import { getCurrentTiedRecords } from "~/helpers/current-records.ts";
import { db } from "~/server/db/provider.ts";
import { contestsTable, contestsPublicCols } from "~/server/db/schema/contests.ts";
import { personsTable, personsPublicCols } from "~/server/db/schema/persons.ts";
import { resultsTable, resultsPublicCols } from "~/server/db/schema/results.ts";
import { getContest, getContests } from "~/server/server-only-functions/contests-functions.ts";
import { getEvents, getRankings, getRecords, getRegions } from "~/server/server-only-functions/server-only-functions.ts";

// Public, read-only adapter owned by the CubeRoot fork. No accounts, roles, API keys,
// moderation notes or unapproved results cross this boundary. Keep RR calculations
// and its non-WCA result encoding in RR; the host consumes display strings only.
const querySchema = z.object({
  view: z.enum(["catalog", "competitions", "contest", "rankings", "records", "persons", "person"]),
  event: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional(),
  region: z.string().regex(/^[A-Z]{2}$/).optional(),
  group: z.string().regex(/^[a-z0-9-]{1,40}$/).default("main"),
  category: z.enum(["competitions", "meetups", "online"]).default("competitions"),
  type: z.enum(["single", "average", "all-avg-formats"]).default("single"),
  q: z.string().trim().max(100).default(""),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  history: z.enum(["current", "all"]).default("current"),
});
const publicStates = ["approved", "ongoing", "finished", "published"] as const;

export async function GET(req: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });
  if (process.env.PROJECT_ID !== "cuberoot-contests") return fail("Not found", 404);
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return fail("Invalid query", 400);
  const q = parsed.data;
  const org = await db.query.organizations.findFirst({
    columns: { id: true, metadata: true }, where: { id: "default", slug: "default" },
  });
  if (!org || !org.metadata || JSON.parse(org.metadata).private !== false) return fail("Not found", 404);
  const organizationId = org.id;
  const events = await getEvents({ organizationId, columns: "public+rules" });
  const eventMap = new Map(events.map(event => [event.eventId, event]));
  const regions = await getRegions(organizationId);
  const region = q.region ? regions.find(region => region.code === q.region && region.type !== "meta-region") : undefined;
  if (q.region && !region) return fail("Region not found", 400);
  if (q.event && !eventMap.has(q.event)) return fail("Event not found", 404);
  const event = q.event ? eventMap.get(q.event) : undefined;
  const format = (value: number, eventId: string, average = false) => value === 0 ? "—" : getFormattedTime(value, {
    eventFormat: eventMap.get(eventId)!.format, isAverage: average,
  });
  const resultDisplay = (r: { eventId: string; best: number; average: number; attempts: { result: number; memo?: number }[] }) => ({
    bestText: format(r.best, r.eventId), averageText: format(r.average, r.eventId, true),
    attemptsText: r.attempts.map(a => format(a.result, r.eventId)),
    memoText: r.attempts.map(a => a.memo == null ? null : getFormattedTime(a.memo)),
  });
  let data: unknown;
  switch (q.view) {
    case "catalog":
      data = { events, regions: regions.filter(r => r.type !== "meta-region") };
      break;
    case "competitions":
      data = await getContests({ organizationId, eventId: q.event, region });
      break;
    case "contest": {
      if (!q.id) return fail("Contest ID required", 400);
      const [info] = await db.select(contestsPublicCols).from(contestsTable).where(and(
        eq(contestsTable.organizationId, organizationId), eq(contestsTable.competitionId, q.id),
        inArray(contestsTable.state, [...publicStates]),
      ));
      if (!info) return fail("Contest not found", 404);
      if (q.event && !await db.query.rounds.findFirst({ columns: { id: true }, where: { organizationId, competitionId: q.id, eventId: q.event } })) {
        return fail("Event not found in contest", 404);
      }
      const details = await getContest({ organizationId, competitionId: q.id, eventId: q.event });
      if (!details) return fail("Contest not found", 404);
      const visibleResults = details.results.filter(r => r.approved && eventMap.has(r.eventId));
      data = {
        ...details, contest: { ...info, schedule: details.contest.schedule },
        events: details.events.filter(e => eventMap.has(e.eventId)),
        results: visibleResults.map(r => ({ ...r, ...resultDisplay(r) })),
        persons: details.persons.filter(p => visibleResults.some(r => r.personIds.includes(p.id))),
      };
      break;
    }
    case "rankings": {
      if (!event) return fail("Event required", 400);
      const rankings = await getRankings(organizationId, event, q.type, q.category, { region: q.region, topN: 100 });
      data = rankings.map(r => ({ ...r, eventId: event.eventId,
        resultText: format(r.result, event.eventId, q.type !== "single"),
        attemptsText: r.attempts.map(a => format(a.result, event.eventId)),
      }));
      break;
    }
    case "records": {
      if (!events.some(e => e.category.categoryId === q.group)) return fail("Category not found", 404);
      const records = await getRecords({ organizationId, eventCategory: q.group, recordCategory: q.category,
        eventId: q.event, regionCode: q.region });
      const selected = q.history === "all" ? records : events.filter(e => e.category.categoryId === q.group)
        .flatMap(e => getCurrentTiedRecords(records, e.eventId));
      data = selected.map(r => ({ ...r, ...resultDisplay(r) }));
      break;
    }
    case "persons": {
      // Search is bounded; escape LIKE metacharacters so input stays literal.
      const search = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
      data = await db.select(personsPublicCols).from(personsTable).where(and(
        eq(personsTable.organizationId, organizationId), eq(personsTable.approved, true),
        q.q ? or(ilike(personsTable.name, search), ilike(personsTable.localizedName, search), ilike(personsTable.wcaId, search)) : undefined,
        q.region ? inArray(personsTable.regionCode, regions.filter(r => r.code === q.region || r.superRegionCode === q.region).map(r => r.code)) : undefined,
      )).orderBy(personsTable.name, personsTable.id).limit(51).offset(q.offset);
      break;
    }
    case "person": {
      if (!q.id || !/^(?:[1-9]\d{0,9}|\d{4}[A-Z]{4}\d{2})$/.test(q.id)) return fail("Person ID required", 400);
      const [person] = await db.select(personsPublicCols).from(personsTable).where(and(
        eq(personsTable.organizationId, organizationId), eq(personsTable.approved, true),
        /^\d+$/.test(q.id) ? eq(personsTable.id, Number(q.id)) : eq(personsTable.wcaId, q.id),
      ));
      if (!person) return fail("Person not found", 404);
      const results = await db.select(resultsPublicCols).from(resultsTable).where(and(
        eq(resultsTable.organizationId, organizationId), eq(resultsTable.approved, true),
        arrayContains(resultsTable.personIds, [person.id]),
        inArray(resultsTable.eventId, q.event ? [q.event] : events.map(e => e.eventId)),
      )).orderBy(desc(resultsTable.date), desc(resultsTable.id)).limit(101).offset(q.offset);
      const page = results.slice(0, 100);
      const peopleIds = [...new Set(page.flatMap(r => r.personIds))];
      const compIds = [...new Set(page.flatMap(r => r.competitionId ? [r.competitionId] : []))];
      const [persons, contests] = await Promise.all([
        peopleIds.length ? db.select(personsPublicCols).from(personsTable).where(and(
          eq(personsTable.organizationId, organizationId), inArray(personsTable.id, peopleIds),
        )) : [],
        compIds.length ? db.select({ competitionId: contestsTable.competitionId, shortName: contestsTable.shortName,
          regionCode: contestsTable.regionCode, type: contestsTable.type }).from(contestsTable).where(and(
          eq(contestsTable.organizationId, organizationId), inArray(contestsTable.competitionId, compIds),
        )) : [],
      ]);
      data = { person, persons, contests, hasMore: results.length > 100,
        results: page.map(r => ({ ...r, ...resultDisplay(r) })) };
      break;
    }
  }
  return Response.json({ data }, { headers: { "Cache-Control": "public, max-age=300" } });
}
