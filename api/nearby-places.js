const recent = new Map();
const cache = new Map();

function allow(ip) {
  const now = Date.now();
  for (const [key, entry] of recent) if (entry.until <= now) recent.delete(key);
  if (!recent.has(ip)) recent.set(ip, { until: now + 60000, count: 0 });
  return ++recent.get(ip).count <= 20;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function createHandler({ fetchImpl = fetch, env = process.env, rateLimit = allow } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return send(res, 405, { error: "GETでアクセスしてください。" });
    }
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: "サイトから操作してください。" });
      } catch {
        return send(res, 403, { error: "サイトから操作してください。" });
      }
    }
    const key = env.GEOAPIFY_API_KEY?.trim();
    if (!key) return send(res, 503, { error: "周辺スポット検索は準備中です。" });
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return send(res, 400, { error: "現在地を確認してください。" });
    }
    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
    if (!rateLimit(ip)) {
      res.setHeader("Retry-After", "60");
      return send(res, 429, { error: "周辺検索が多すぎます。少し待ってからお試しください。" });
    }

    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.until > Date.now()) return send(res, 200, { places: cached.places });

    const params = new URLSearchParams({
      categories: "catering,commercial,tourism,entertainment,leisure",
      filter: `circle:${lng},${lat},1000`,
      bias: `proximity:${lng},${lat}`,
      limit: "30",
      lang: "ja",
      apiKey: key,
    });

    try {
      const upstream = await fetchImpl(`https://api.geoapify.com/v2/places?${params}`, { headers: { Accept: "application/json" } });
      if (!upstream.ok) return send(res, upstream.status === 429 ? 429 : 502, { error: upstream.status === 429 ? "周辺検索が混み合っています。少し待ってからお試しください。" : "周辺スポットを取得できませんでした。" });
      const data = await upstream.json();
      const places = (Array.isArray(data.features) ? data.features : []).map(feature => {
        const p = feature?.properties || {};
        const coordinates = feature?.geometry?.coordinates || [];
        return {
          id: typeof p.place_id === "string" ? p.place_id : "",
          name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : (typeof p.formatted === "string" ? p.formatted.split(",")[0] : "名称不明"),
          address: typeof p.formatted === "string" ? p.formatted : "",
          distance: Number.isFinite(p.distance) ? Math.round(p.distance) : null,
          lat: Number.isFinite(p.lat) ? p.lat : (Number.isFinite(coordinates[1]) ? coordinates[1] : null),
          lng: Number.isFinite(p.lon) ? p.lon : (Number.isFinite(coordinates[0]) ? coordinates[0] : null),
          categories: Array.isArray(p.categories) ? p.categories.filter(value => typeof value === "string").slice(0, 6) : [],
        };
      }).filter(place => place.id && place.name && place.lat !== null && place.lng !== null).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
      const closePlaces = places.filter(place => place.distance === null || place.distance <= 300);
      const selected = (closePlaces.length ? closePlaces : places).slice(0, 8);
      cache.set(cacheKey, { until: Date.now() + 90000, places: selected });
      return send(res, 200, { places: selected });
    } catch {
      return send(res, 502, { error: "周辺スポットを取得できませんでした。" });
    }
  };
}

export default createHandler();
