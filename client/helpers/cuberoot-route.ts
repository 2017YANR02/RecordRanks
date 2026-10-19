/** Link public RR views to CubeRoot, without redirecting or removing legacy views. */
export function cubeRootContestDestination(url: URL, base: string): URL | null {
  const match = /^\/(?:default\/?|(?:default\/)?(competitions|rankings|records)(?:\/([^/]+))?(?:\/([^/]+))?\/?)?$/.exec(url.pathname);
  if (!match) return null;
  const target = new URL(base);
  if (url.searchParams.get("lang") === "en") {
    target.pathname = target.pathname.replace(/^\/zh\//, "/");
    target.searchParams.set("lang", "en");
  }
  const [, section, id, type] = match;
  if (section) target.searchParams.set("view", section === "competitions" && id ? "contest" : section);
  if (section === "competitions" && id) target.searchParams.set("id", id);
  if (section === "rankings" && id) target.searchParams.set("event", id);
  if (section === "rankings" && type) target.searchParams.set("type", type);
  if (section === "records" && id) target.searchParams.set("group", id);
  for (const key of ["region", "category"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const event = url.searchParams.get("eventId");
  if (event) target.searchParams.set("event", event);
  return target;
}
