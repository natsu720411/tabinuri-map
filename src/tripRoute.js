export function googleMapsRouteForItem(item) {
  const name = typeof item?.name === "string" ? item.name.trim() : "";
  if (!/^移動\s*[：:]/.test(name)) return "";
  const route = name.replace(/^移動\s*[：:]\s*/, "");
  const match = route.match(/^(.+?)\s*(?:→|⇒|➡|->)\s*(.+)$/);
  if (!match) return "";

  const origin = match[1].trim();
  const destination = match[2].trim();
  if (!origin || !destination) return "";

  const text = `${name} ${typeof item?.memo === "string" ? item.memo : ""}`;
  let travelmode = "transit";
  if (/(?:徒歩|歩いて|walking)/i.test(text) && !/(?:電車|鉄道|地下鉄|新幹線|バス|JR|線)/i.test(text)) travelmode = "walking";
  if (/(?:車|レンタカー|自動車|driving)/i.test(text) && !/(?:電車|鉄道|地下鉄|新幹線|バス|JR|線)/i.test(text)) travelmode = "driving";

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleMapsPlaceForItem(item) {
  const name = typeof item?.name === "string" ? item.name.trim() : "";
  if (!name || /^移動\s*[：:]/.test(name)) return "";
  const params = new URLSearchParams({
    api: "1",
    query: name,
  });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}
