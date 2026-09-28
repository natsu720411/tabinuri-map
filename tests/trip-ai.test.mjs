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
  assert.throws(() => validateItinerary(itinerary, 3));
});

test("preferred Gemini 3.8 succeeds with a single request", async () => {
  let calls = 0;
  const handler = createHandler({
    ...options,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.match(url, /models\/gemini-3\.8-flash:generateContent$/);
      assert.equal(init.headers["x-goog-api-key"], options.env.GEMINI_API_KEY);
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.responseMimeType, undefined);
      assert.equal(body.generationConfig.responseJsonSchema, undefined);
      assert.ok(body.generationConfig.maxOutputTokens <= 12000);
      assert.ok(!init.body.includes("must not send"));
      return okResponse(JSON.stringify(itinerary));
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, itinerary);
  assert.equal(calls, 1);
});

test("429 on 3.8 tries configured model once, then succeeds", async () => {
  const urls = [];
  const handler = createHandler({
    ...options,
    fetchImpl: async (url) => {
      urls.push(url);
      if (urls.length === 1) {
        return { ok: false, status: 429, json: async () => ({ error: { message: "quota" } }) };
      }
      return okResponse("```json\n" + JSON.stringify(itinerary) + "\n```");
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /gemini-3\.8-flash/);
  assert.match(urls[1], /gemini-3\.6-flash/);
});

test("both models returning 429 stops after two requests", async () => {
  let calls = 0;
  const handler = createHandler({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 429, json: async () => ({ error: { message: "quota" } }) };
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 429);
  assert.equal(calls, 2);
  assert.equal(result.headers["Retry-After"], "60");
});

test("invalid JSON from 3.8 falls back to configured model", async () => {
  let calls = 0;
  const handler = createHandler({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? okResponse("not json") : okResponse(JSON.stringify(itinerary));
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
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

test("GET readiness and invalid requests never call Gemini", async () => {
  let calls = 0;
  const never = async () => { calls += 1; throw Error("unexpected upstream"); };
  const ready = await invoke(createHandler({ ...options, fetchImpl: never }), {
    method: "GET",
    headers: { host: "localhost:3001" },
    body: undefined,
  });
  assert.deepEqual(ready.body, { ready: true });
  assert.equal(calls, 0);
  assert.equal((await invoke(createHandler({ env: {}, fetchImpl: never }))).status, 503);
});
