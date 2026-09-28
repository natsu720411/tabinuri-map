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

test("Gemini 3.6 JSON mode succeeds with one request", async () => {
  let calls = 0;
  const handler = createHandler({
    ...options,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.match(url, /models\/gemini-3\.6-flash:generateContent$/);
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.equal(body.generationConfig.responseJsonSchema, undefined);
      assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
      assert.ok(body.generationConfig.maxOutputTokens <= 7500);
      assert.ok(!init.body.includes("must not send"));
      return okResponse(JSON.stringify(itinerary));
    },
  });
  const result = await invoke(handler);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, itinerary);
  assert.equal(calls, 1);
});

test("minor AI format differences are normalized safely", async () => {
  const loose = {
    days: [
      { day: 99, items: [{ time: "9:00", name: "出発", description: "駅へ移動" }] },
      { day: 88, items: [{ time: "10時", title: "観光", memo: "散策" }] },
    ],
  };
  const result = await invoke(createHandler({
    ...options,
    fetchImpl: async () => okResponse(JSON.stringify(loose)),
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.days[0].day, 1);
  assert.equal(result.body.days[0].items[0].time, "09:00");
  assert.equal(result.body.days[0].items[0].title, "出発");
  assert.equal(result.body.days[1].items[0].time, "10:00");
});

test("invalid JSON returns diagnostic format code without retry", async () => {
  let calls = 0;
  const result = await invoke(createHandler({
    ...options,
    fetchImpl: async () => { calls += 1; return okResponse("not json"); },
  }));
  assert.equal(result.status, 502);
  assert.equal(calls, 1);
  assert.match(result.body.error, /E-JSON/);
});

test("daily quota is reported after one request", async () => {
  let calls = 0;
  const result = await invoke(createHandler({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" } }),
      };
    },
  }));
  assert.equal(result.status, 429);
  assert.equal(calls, 1);
  assert.match(result.body.error, /E-QUOTA-DAY/);
});

test("timeout returns a specific diagnostic code", async () => {
  const result = await invoke(createHandler({
    ...options,
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }),
  }));
  assert.equal(result.status, 504);
  assert.match(result.body.error, /E-TIMEOUT-36/);
});

test("auth errors do not retry", async () => {
  let calls = 0;
  const result = await invoke(createHandler({
    ...options,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 403, json: async () => ({ error: { message: "forbidden" } }) };
    },
  }));
  assert.equal(result.status, 503);
  assert.equal(calls, 1);
  assert.match(result.body.error, /E-AUTH/);
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
