import { type NextRequest, NextResponse } from "next/server";
import { logMessage } from "~/server/server-only-functions/server-only-functions.ts";

function log(url: URL) {
  logMessage("RR0001", `Page visit: ${url.pathname}${url.search}`, {
    metadata: { pathname: url.pathname, queryString: url.search },
  });
}

function getSingleTenantDestination(request: NextRequest, pathname: string): URL {
  const destination = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? request.url);
  destination.pathname = pathname;
  destination.search = request.nextUrl.search;
  return destination;
}

export function proxy(request: NextRequest) {
  const url = new URL(request.url);

  if (process.env.NEXT_PUBLIC_MULTITENANCY_ENABLED === "true") {
    const isLoggablePage =
      /^\/[^/]+(\/|\/(about|competitions|export|moderator-instructions|blog|rankings|records|rules|video-based-results)(\/.*)?)?$/.test(
        url.pathname,
      );

    if (isLoggablePage) log(url);
  } else {
    const isLoggablePage =
      url.pathname === "/" ||
      /^\/(about|competitions|export|moderator-instructions|blog|rankings|records|rules|video-based-results)(\/.*)?$/.test(
        url.pathname,
      );

    if (isLoggablePage) log(url);

    // Single tenancy routing support

    const isPathWithSlug =
      url.pathname === "/" ||
      /^\/(about|competitions|export|mod|moderator-instructions|blog|rankings|records|rules|video-based-results)(\/.*)?$/.test(
        url.pathname,
      );

    if (isPathWithSlug) {
      const pathname = url.pathname === "/" ? "/default" : `/default${url.pathname}`;
      return NextResponse.redirect(getSingleTenantDestination(request, pathname));
    } else {
      const isApiPathWithSlug = /^\/api\/(events|results|enter-attempt|enter-results)(\/.*)?$/.test(url.pathname);
      if (isApiPathWithSlug)
        return NextResponse.redirect(
          getSingleTenantDestination(request, url.pathname.replace("/api/", "/api/default/")),
        );
    }
  }
}

export const config = {};
