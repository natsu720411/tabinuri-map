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

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalizePlaces(data, lat, lng) {
  return (Array.isArray(data.features) ? data.features : []).map(feature => {
    const p = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates || [];
    const placeLat = Number.isFinite(p.lat) ? p.lat : (Number.isFinite(coordinates[1]) ? coordinates[1] : null);
    const placeLng = Number.isFinite(p.lon) ? p.lon : (Number.isFinite(coordinates[0]) ? coordinates[0] : null);
    const distance = placeLat !== null && placeLng !== null
      ? distanceMeters(lat, lng, placeLat, placeLng)
      : null;
    return {
      id: typeof p.place_id === "string" ? p.place_id : "",
      name: typeof p.name === "string" && p.name.trim()
        ? p.name.trim()
        : (typeof p.formatted === "string" ? p.formatted.split(",")[0] : "名称不明"),
      address: typeof p.formatted === "string" ? p.formatted : "",
      distance,
      lat: placeLat,
      lng: placeLng,
      categories: Array.isArray(p.categories)
        ? p.categories.filter(value => typeof value === "string").slice(0, 6)
        : [],
    };
  }).filter(place => place.id && place.name && place.lat !== null && place.lng !== null)
    .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
}

export function createHandler({ fetchImpl = fetch, env = process.env, rateLimit = allow } = {}) {
  return async function handler(req, res) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return send(res, 405, { error: "GETでアクセスしてください。" });
    }

    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) {
          return send(res, 403, { error: "サイトから操作してください。" });
        }
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

    const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown")
      .split(",")[0].trim();
    if (!rateLimit(ip)) {
      res.setHeader("Retry-After", "60");
      return send(res, 429, { error: "周辺検索が多すぎます。少し待ってからお試しください。" });
    }

    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.until > Date.now()) {
      return send(res, 200, { places: cached.places, searchRadius: cached.searchRadius });
    }

    const categories = [
      "catering",
      "commercial",
      "tourism",
      "entertainment",
      "accommodation",
      "leisure.park",
      "leisure.playground",
      "public_transport",
    ].join(",");

    async function fetchPlaces(filter) {
      const params = new URLSearchParams({
        categories,
        bias: `proximity:${lng},${lat}`,
        limit: "20",
        lang: "ja",
        apiKey: key,
      });
      if (filter) params.set("filter", filter);

      const upstream = await fetchImpl(`https://api.geoapify.com/v2/places?${params}`, {
        headers: { Accept: "application/json" },
      });

      if (!upstream.ok) {
        const error = new Error(upstream.status === 429
          ? "周辺検索が混み合っています。少し待ってからお試しください。"
          : "周辺スポットを取得できませんでした。");
        error.status = upstream.status === 429 ? 429 : 502;
        throw error;
      }

      return normalizePlaces(await upstream.json(), lat, lng);
    }

    try {
      let places = await fetchPlaces(`circle:${lng},${lat},1000`);
      let searchRadius = 1000;

      if (places.length === 0) {
        places = (await fetchPlaces("")).filter(place => place.distance !== null && place.distance <= 5000);
        searchRadius = 5000;
      }

      places = places.slice(0, 8);
      cache.set(cacheKey, { until: Date.now() + 90000, places, searchRadius });
      return send(res, 200, { places, searchRadius });
    } catch (error) {
      return send(res, error.status || 502, {
        error: error.message || "周辺スポットを取得できませんでした。",
      });
    }
  };
}

export default createHandler();
