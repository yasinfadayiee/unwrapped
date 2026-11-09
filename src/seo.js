// Keep crawler policy available even if the static asset binding is unavailable.
// Shared by the build and Worker so the two responses cannot drift.
export function robotsText(origin) {
  const base = new URL(origin).origin;
  return `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /success/\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`;
}

export function robotsResponse(request, origin) {
  return new Response(request.method === 'HEAD' ? null : robotsText(origin), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}
