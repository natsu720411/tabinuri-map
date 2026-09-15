import test from 'node:test';
import assert from 'node:assert/strict';
import { copySharedPlan, sharedFingerprint } from '../src/tripImportShared.js';
import { loadPlans, newPlan } from '../src/tripPlans.js';
const shared={title:'京都旅行',prefectureId:26,startDate:'2020-01-01',endDate:'2020-01-02',days:[{date:'2020-01-01',items:[{time:'09:00',name:'清水寺',memo:'写真'}]}],foods:'湯葉'};
test('copy regenerates IDs, preserves existing plans, uses defaults, and deduplicates despite edited title',async()=>{
 const old={...newPlan(),title:'既存旅行',prefectureId:1};let raw=JSON.stringify({version:1,plans:[old]});
 globalThis.localStorage={getItem:()=>raw,setItem:(key,value)=>{assert.equal(key,'tabizucho_trip_plans');raw=value;}};
 const result=await copySharedPlan(shared,'自分の京都旅行');const p=result.plan;
 assert.equal(loadPlans().plans.length,2);assert.equal(loadPlans().plans[0].id,old.id);assert.equal(loadPlans().plans[0].sharedSourceId,'');
 assert.equal(p.title,'自分の京都旅行');assert.equal(p.companions,'');assert.equal(p.people,'1');assert.equal(p.foods,'湯葉');assert.equal(p.status,'planning');assert.equal(p.travelBookSavedAt,'');
 assert.equal(new Set([p.id,p.days[0].id,p.days[0].items[0].id]).size,3);assert.equal(p.days[0].items[0].memo,'写真');assert.equal(p.createdAt,p.updatedAt);
 assert.equal((await copySharedPlan(shared,'別名')).already,true);assert.equal(loadPlans().plans.length,2);
 assert.equal(await sharedFingerprint({...shared}),p.sharedSourceId);assert(!raw.includes('shared-trip='));
 const changed=await copySharedPlan({...shared,title:'別旅行'},'別旅行');assert.notEqual(changed.plan.id,p.id);assert.notEqual(changed.plan.days[0].id,p.days[0].id);
 delete globalThis.localStorage;
});
test('invalid data, unreadable storage and failed writes never report success',async()=>{
 globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('quota')}};
 await assert.rejects(copySharedPlan(shared,'京都旅行'),/保存できません/);
 await assert.rejects(copySharedPlan({...shared,prefectureId:99},'京都旅行'));
 await assert.rejects(copySharedPlan(shared,' '));
 globalThis.localStorage={getItem:()=>'{broken',setItem:()=>assert.fail('must not overwrite')};
 await assert.rejects(copySharedPlan(shared,'京都旅行'),/読み込めません/);delete globalThis.localStorage;
});
