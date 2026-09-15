import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createTripLink, readTripFragment, selectSharedTrip, validateSharedTrip, lineTripLink, SHARE_FIELDS } from '../src/tripShare.js';
const plan = {id:'private-id',title:'京都2泊3日旅行🌸',prefectureId:26,startDate:'2026-10-10',endDate:'2026-10-12',days:[{id:'local-day',date:'2026-10-10',items:[{id:'local-item',time:'09:00',name:'清水寺 & 散策',memo:'写真を撮る'}]}],places:'伏見稲荷',foods:'湯葉',activities:'散歩',companions:'非公開の人',budget:'50000',accommodation:'非公開ホテル',transport:'非公開交通',notes:'秘密メモ',GEMINI_API_KEY:'not-a-real-key'};
const defaults=Object.fromEntries(SHARE_FIELDS.map(([k,,v])=>[k,v]));
test('Japanese roundtrip in gzip and UTF-8, only selected fields and no local metadata',async()=>{
 for(const compress of [true,false]) {
  const url=await createTripLink(plan,defaults,{compress});const parsed=new URL(url);assert.equal(parsed.search,'?shared-trip=1');
  const restored=await readTripFragment(parsed.hash);assert.equal(restored.title,plan.title);assert.equal(restored.days[0].items[0].memo,'写真を撮る');
  for(const k of ['id','companions','budget','accommodation','transport','notes','GEMINI_API_KEY'])assert.equal(k in restored,false);
  assert.equal('id' in restored.days[0],false);assert.equal('id' in restored.days[0].items[0],false);
 }
 const url=await createTripLink(plan,{});assert.equal('foods' in await readTripFragment(new URL(url).hash),false);
});
test('LINE intent safely preserves URL fragment and Japanese text',async()=>{
 const url=await createTripLink(plan,defaults);const line=new URL(lineTripLink(plan.title,url));
 assert.equal(line.origin,'https://social-plugins.line.me');assert.equal(line.searchParams.get('url'),url);assert.match(line.searchParams.get('text'),/京都2泊3日旅行🌸/);
});
test('reject schema, date, time, count, text and version violations',()=>{
 const valid=selectSharedTrip(plan,defaults);
 for(const mutate of [p=>p.version=2,p=>p.type='other',p=>p.plan.prefectureId=48,p=>p.plan.title='a'.repeat(121),p=>p.plan.endDate='2026-10-24',p=>p.plan.startDate='2026-02-30',p=>p.plan.days=Array(15).fill(valid.plan.days[0]),p=>p.plan.days[0].items=Array(31).fill(valid.plan.days[0].items[0]),p=>p.plan.days[0].items[0].time='25:00',p=>p.plan.days[0].items[0].memo='a'.repeat(1001),p=>p.plan.days=null]) {
  const data=structuredClone(valid);mutate(data);assert.throws(()=>validateSharedTrip(data));
 }
 const fourteen=structuredClone(valid);fourteen.plan.endDate='2026-10-23';assert.doesNotThrow(()=>validateSharedTrip(fourteen));
});
test('malformed, invalid UTF-8, oversized fragments and decompression bombs reject safely',async()=>{
 for(const hash of ['','#g1.invalid','#j1._w','#j1.'+'a'.repeat(20001),'#j1.'+Buffer.from('{}').toString('base64url')]) await assert.rejects(readTripFragment(hash));
 await assert.rejects(readTripFragment('#g1.'+gzipSync('x'.repeat(200000)).toString('base64url')));
});
test('compression unavailable uses uncompressed fallback; unsupported receiver fails clearly',async()=>{
 const compressed=await createTripLink(plan,defaults);const cs=globalThis.CompressionStream,ds=globalThis.DecompressionStream;
 try {globalThis.CompressionStream=undefined;globalThis.DecompressionStream=undefined;
 const url=await createTripLink(plan,defaults);assert.match(new URL(url).hash,/^#j1\./);assert.equal((await readTripFragment(new URL(url).hash)).title,plan.title);
 if(new URL(compressed).hash.startsWith('#g1.')) await assert.rejects(readTripFragment(new URL(compressed).hash),/圧縮リンクに対応/);
 }finally{globalThis.CompressionStream=cs;globalThis.DecompressionStream=ds;}
});
test('long URLs are stopped rather than silently truncating data',async()=>{
 const large={...plan,days:Array.from({length:14},()=>({date:'',items:Array.from({length:4},()=>({time:'',name:'予定',memo:'あ'.repeat(1000)}))}))};
 await assert.rejects(createTripLink(large,{}, {compress:false}));
});
