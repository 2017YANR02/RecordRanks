import { describe, expect, it } from 'vitest';
import { cubeRootContestDestination } from './cuberoot-route';
const base = 'https://cuberoot.me/zh/contests';
describe('CubeRoot public view links', () => {
  it.each([
    ['/default', base],
    ['/default/records/wca?region=CN&category=competitions', `${base}?view=records&group=wca&region=CN&category=competitions`],
    ['/default/competitions/NAC2026/results?eventId=fto', `${base}?view=contest&id=NAC2026&event=fto`],
    ['/rankings/fto/average?lang=en', 'https://cuberoot.me/contests?lang=en&view=rankings&event=fto&type=average'],
  ])('preserves %s', (path, expected) => {
    expect(cubeRootContestDestination(new URL(path, 'https://contests.cuberoot.me'), base)?.href).toBe(expected);
  });
  it.each(['/api/default/events', '/default/mod', '/login', '/default/export'])('keeps %s available', path => {
    expect(cubeRootContestDestination(new URL(path, 'https://contests.cuberoot.me'), base)).toBeNull();
  });
});
