import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const home = read("index.html");
const sitemap = read("public/sitemap.xml");
const base = "https://tabinuri-map.vercel.app";

test("sitemap URLs resolve to unique pages in the repository", () => {
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]));
  assert.equal(urls.length, 13);
  assert.equal(new Set(urls.map((url) => url.href)).size, urls.length);
  for (const url of urls) {
    assert.equal(url.origin, base);
    assert.ok(existsSync(join(root, url.pathname === "/" ? "index.html" : "public", url.pathname === "/" ? "" : url.pathname.slice(1))), url.href);
  }
});

test("homepage and guide pages have unique titles, headings, and self canonicals", () => {
  const pages = ["/", "/japan-map.html", "/prefecture-check.html"];
  const titles = [];
  for (const urlPath of pages) {
    const html = urlPath === "/" ? home : read("public" + urlPath);
    const titlesFound = [...html.matchAll(/<title>([^<]+)<\/title>/g)];
    assert.equal(titlesFound.length, 1, urlPath);
    titles.push(titlesFound[0][1]);
    assert.equal([...html.matchAll(/<h1\b[^>]*>/g)].length, 1, urlPath);
    assert.ok(html.includes('rel="canonical" href="' + base + urlPath + '"'), urlPath);
    assert.ok(!/<meta\s+name="robots"\s+content="noindex/i.test(html), urlPath);
  }
  assert.equal(new Set(titles).size, titles.length);
});

test("main page retains React mount and links to human-readable guides", () => {
  const app = read("src/main.jsx");
  assert.ok(home.includes('id="root"'));
  assert.ok(home.includes('src="/src/main.jsx"'));
  assert.ok(app.includes('createRoot(document.getElementById("root"))'));
  assert.ok(app.includes('href="/japan-map.html"'));
  assert.ok(app.includes('href="/travel-itinerary.html"'));
});

test("favicon.ico is a real icon file, not a missing asset", () => {
  const path = join(root, "public/favicon.ico");
  assert.ok(existsSync(path));
  const icon = readFileSync(path);
  assert.equal(icon.subarray(0, 6).toString("hex"), "000001000100");
});
