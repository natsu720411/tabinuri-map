import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../api/generate-trip.js";
import { validateRequest, validateItinerary, tripDates } from "../lib/tripItinerary.js";

const request = {
  plan: {
    title: "京都旅行",
    prefectureId: 26,
    startDate: "2026-10-01",
    endDate: "2026-10-02",
    departureLocation: "福井駅",
    returnLocation: "福井駅",
    notes: "ゆっくり",
    days: ["must not send"],
  },
  mood: "のんびり",
  pace: "ゆったり",
  transportStyle: "公共交通中心",
};

const itinerary = {
  days: [1, 2].map(day => ({
    day,
    items: [
      { time: "09:00", title: "移動", memo: "余裕を持って移動" },
      { time: "12:00", title: "昼食", memo: "周辺で休憩" },
    ],
  })),
};

function invoke(handler, overrides = {}) {
  const req = {
    method: "POST",
    headers: {
      host: "localhost:5173",
      origin: "http://localhost:5173",
      "content-type": "application/json",
    },
    body: request,
    ...overrides,
  };
  return new Promise((resolve, reject) => {
    const res = {
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      end(value) { resolve({ status: this.statusCode, body: JSON.parse(value), headers: this.headers }); },
    };
    handler(req, res).catch(reject);
  });
}

const options = {
  env: { GEMINI_API_KEY: "test-only-not-a-real-key", GEMINI_MODEL: "gemini-3.6-flash" },
  rateLimit: () => true,
};

const okResponse = text => ({
  ok: true,
  status: 200,
  json: async () => ({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
  }),
});

test("date and itinerary validation", () => {
  assert.deepEqual(tripDates("2028-02-28", "2028-03-01"), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.equal(validateRequest(request).plan.days, undefined);
  assert.deepEqual(validateItinerary(itinerary, 2), itinerary);
});

test("Flash-Lite is the primary model and succeeds with one request", async () => {
  let calls = 0;
  const handler = createHandler({
    ...options,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.match(url, /models\/gemini-3\.5-flash-lite:generateContent$/);
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
      assert.equal(body.generationConfig.temperature, undefined);
      assert.ok(body.generationConfig.maxOutputTokens <= 10000);
      assert.ok(!init.body.includes("must not send"));
      return okResponse(JSON.stringify(itinerary));
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, itinerary);
  assert.equal(calls, 1);
});

test("quota on Flash-Lite falls back to another model", async () => {
  const urls = [];
  const handler = createHandler({
    ...options,
    fetchImpl: async (url) => {
      urls.push(url);
      if (urls.length === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" } }),
        };
      }
      return okResponse(JSON.stringify(itinerary));
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /gemini-3\.5-flash-lite/);
  assert.match(urls[1], /gemini-3\.6-flash/);
});

test("all models hitting daily quota returns a specific message", async () => {
  let calls = 0;
  const handler = createHandler({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" } }),
      };
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 429);
  assert.equal(calls, 3);
  assert.match(result.body.error, /1日あたり利用上限/);
});

test("auth errors do not retry", async () => {
  let calls = 0;
  const handler = createHandler({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 403, json: async () => ({ error: { message: "forbidden" } }) };
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 503);
  assert.equal(calls, 1);
});

test("GET readiness never calls Gemini", async () => {
  let calls = 0;
  const ready = await invoke(createHandler({
    ...options,
    fetchImpl: async () => { calls += 1; throw Error("unexpected upstream"); },
  }), {
    method: "GET",
    headers: { host: "localhost:3001" },
    body: undefined,
  });
  assert.deepEqual(ready.body, { ready: true });
  assert.equal(calls, 0);
});
