import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../api/generate-trip.js";
import { validateRequest, validateItinerary, tripDates } from "../lib/tripItinerary.js";
import { redactGeminiMessage } from "../lib/geminiDiagnostics.js";
const request = { plan: { title: "京都旅行", prefectureId: 26, startDate: "2026-10-01", endDate: "2026-10-02", notes: "ゆっくり", days: ["must not send"] }, mood: "のんびり", pace: "ゆったり" };
const itinerary = { days: [1, 2].map(day => ({ day, items: [{ time: "09:00", title: "移動", memo: "余裕を持って移動" }, { time: "12:00", title: "昼食", memo: "周辺で休憩" }] })) };
function invoke(handler, overrides = {}) {
  const req = { method: "POST", headers: { host: "localhost:5173", origin: "http://localhost:5173", "content-type": "application/json" }, body: request, ...overrides };
  return new Promise((resolve, reject) => {
    const res = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(value) { resolve({ status: this.statusCode, body: JSON.parse(value), headers: this.headers }); } };
    handler(req,res).catch(reject);
  });
}
const options = { env: { GEMINI_API_KEY: "test-only-not-a-real-key" }, rateLimit: () => true };
test("diagnostics redact credentials and remain disabled by default and in production",async()=>{
  const message='Model unavailable. '+options.env.GEMINI_API_KEY+' https://example.test/?key=hidden-url-key\nAuthorization: Bearer auth-secret\n{"api_key":"json-secret"} token=other-secret';
  const safe=redactGeminiMessage(message,options.env);
  for(const secret of [options.env.GEMINI_API_KEY,'hidden-url-key','auth-secret','json-secret','other-secret'])assert.ok(!safe.includes(secret));
  for(const [diagnostics,env,expected] of [[true,options.env,1],[false,options.env,0],[true,{...options.env,NODE_ENV:'production'},0],[true,{...options.env,VERCEL:'1'},0]]){
    const logs=[];
    const handler=createHandler({...options,diagnostics,env,logger:(...args)=>logs.push(args),fetchImpl:async()=>({ok:false,status:404,json:async()=>({error:{message}})})});
    const response=await invoke(handler);assert.equal(response.status,502);assert.deepEqual(response.body,{error:'AI旅程の作成に失敗しました。もう一度お試しください。'});assert.equal(logs.length,expected);
    if(expected){assert.equal(logs[0][1].status,404);assert.equal(logs[0][1].model,'gemini-2.5-flash');assert.equal(logs[0][1].message,safe);}
  }
});
test("diagnostics identify malformed JSON without echoing generated content",async()=>{
  const logs=[];
  const response=await invoke(createHandler({...options,diagnostics:true,logger:(...args)=>logs.push(args),fetchImpl:async()=>({ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:'private travel details, not JSON'}]}}]})})}));
  assert.equal(response.status,502);assert.equal(logs[0][1].status,200);assert.match(logs[0][1].message,/itinerary JSON\/schema validation/);assert.ok(!JSON.stringify(logs).includes('private travel details'));
});
test("date and input validation; only allowlisted fields leave the client", () => {
  assert.deepEqual(tripDates("2028-02-28","2028-03-01"),["2028-02-28","2028-02-29","2028-03-01"]);
  for (const dates of [["2026-02-30","2026-03-01"],["2026-10-02","2026-10-01"],["2026-10-01","2026-10-15"],["","2026-10-01"]]) assert.throws(()=>tripDates(...dates));
  assert.equal(validateRequest(request).plan.days,undefined);
  assert.throws(()=>validateRequest({...request,plan:{...request.plan,notes:"x".repeat(2001)}}));
  assert.throws(()=>validateRequest({...request,plan:{...request.plan,prefectureId:99}}));
});
test("reject wrong day count, duplicate days and malformed or unordered times",()=>{
  assert.deepEqual(validateItinerary(itinerary,2),itinerary);
  assert.throws(()=>validateItinerary(itinerary,3));
  for (const change of [value=>value.days[1].day=1,value=>value.days[0].items[0].time="25:00",value=>value.days[0].items[1].time="08:00",value=>value.days[0].items[0].title=""]) {
    const data=structuredClone(itinerary);change(data);assert.throws(()=>validateItinerary(data,2));
  }
});
test("server keeps credentials in headers and validates JSON response",async()=>{
  let called=false;
  const handler=createHandler({...options, fetchImpl:async(url,init)=>{
    called=true;assert.match(url,/models\/gemini-2.5-flash:generateContent$/);assert.equal(init.headers["x-goog-api-key"],options.env.GEMINI_API_KEY);
    assert.ok(!url.includes(options.env.GEMINI_API_KEY));
    const body=JSON.parse(init.body);assert.equal(body.generationConfig.responseMimeType,"application/json");
    assert.ok(!init.body.includes("must not send"));
    return {ok:true,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{text:JSON.stringify(itinerary)}]}}]})};
  }});
  const result=await invoke(handler);assert.equal(result.status,200);assert.deepEqual(result.body,itinerary);assert.ok(called);assert.equal(result.headers["Cache-Control"],"no-store");
});
test("no key, invalid requests, cross-origin, rate limit do not call Gemini",async()=>{
  const never=async()=>{throw Error("unexpected upstream")};
  assert.equal((await invoke(createHandler({env:{},fetchImpl:never}))).status,503);
  const h=createHandler({...options,fetchImpl:never});
  const unsupported = await invoke(h,{method:"PUT"});
  assert.equal(unsupported.status,405);
  assert.equal(unsupported.headers.Allow,"GET, POST");
  assert.equal((await invoke(h,{body:"{"})).status,400);
  assert.equal((await invoke(h,{headers:{host:"localhost",origin:"https://other.example","content-type":"application/json"}})).status,403);
  assert.equal((await invoke(h,{headers:{"content-type":"text/plain"}})).status,415);
  assert.equal((await invoke(h,{body:{...request,extra:"x".repeat(65000)}})).status,413);
  assert.equal((await invoke(createHandler({...options,rateLimit:()=>false,fetchImpl:never}))).status,429);
});
test("GET reports only readiness, never calls Gemini or consumes generation quota", async () => {
  for (const [key, expected] of [[undefined,false],["",false],["   ",false],["test-only-not-a-real-key",true]]) {
    let calls=0, quotas=0;
    const handler=createHandler({env:{GEMINI_API_KEY:key},fetchImpl:async()=>{calls++;throw Error("unexpected upstream");},rateLimit:()=>{quotas++;return true;}});
    const response=await invoke(handler,{method:"GET",headers:{host:"localhost:3001"},body:undefined});
    assert.equal(response.status,200);
    assert.deepEqual(response.body,{ready:expected});
    assert.equal(response.headers["Cache-Control"],"no-store");
    assert.equal(calls,0);assert.equal(quotas,0);
    if(key?.trim())assert.ok(!JSON.stringify(response).includes(key));
  }
});
test("upstream errors, incomplete JSON, malformed schedules and timeout fail safely",async()=>{
  for(const response of [{ok:false,status:500}, {ok:true,json:async()=>({candidates:[{finishReason:"MAX_TOKENS"}]})}, {ok:true,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{text:"not json"}]}}]})}, {ok:true,json:async()=>({candidates:[{finishReason:"STOP",content:{parts:[{text:'{"days":[]}'}]}}]})}]) {
    const result=await invoke(createHandler({...options,fetchImpl:async()=>response}));assert.equal(result.status,502);assert.ok(!JSON.stringify(result).includes(options.env.GEMINI_API_KEY));
  }
  const timeout=await invoke(createHandler({...options,timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(Error("aborted"))))}));assert.equal(timeout.status,504);
});
