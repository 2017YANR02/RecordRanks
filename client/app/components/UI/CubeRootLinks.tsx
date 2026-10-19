"use client";
import { usePathname, useSearchParams } from 'next/navigation';
import { cubeRootContestDestination } from '~/helpers/cuberoot-route.ts';

export default function CubeRootLinks() {
  const path = usePathname();
  const query = useSearchParams();
  const current = new URL(`${path}?${query}`, 'https://contests.cuberoot.me');
  current.searchParams.delete('lang');
  const zh = cubeRootContestDestination(current, 'https://cuberoot.me/zh/contests');
  current.searchParams.set('lang', 'en');
  const en = cubeRootContestDestination(current, 'https://cuberoot.me/zh/contests');
  if (!zh || !en) return null;
  return <div className="d-flex gap-3 px-3 py-2">
    <a href={zh.href}>CubeRoot 中文查询</a>
    <a href={en.href}>CubeRoot English</a>
  </div>;
}
