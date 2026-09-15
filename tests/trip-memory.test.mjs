import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeTripMemory, importDefaults, importedIds } from '../src/tripMemory.js';
import { newPlan, loadPlans } from '../src/tripPlans.js';
test('append preserves existing fields and deduplicates list values and imports', () => {
  const old = { visited:false, visitDate:'2020-01-01', memory:'昔の思い出', companions:'家族', foods:'うどん', rating:5, favorite:true, municipalities:'京都市', wantToVisit:true, wantToVisitReason:'また行きたい', wantToVisitPlaces:'寺' };
  const plan = { id:'trip1', title:'京都旅行', startDate:'2026-01-01', endDate:'2026-01-03' };
  const values = { visitDate:'2026-01-02', memory:'楽しかった', companions:'家族、友達', foods:'うどん\n湯葉', recommendedSpots:'清水寺' };
  const merged = mergeTripMemory(old,plan,values);
  assert.equal(merged.visited,true); assert.equal(merged.visitDate,old.visitDate);
  for(const key of ['rating','favorite','municipalities','wantToVisit','wantToVisitReason','wantToVisitPlaces']) assert.equal(merged[key],old[key]);
  assert.equal(merged.companions,'家族\n友達'); assert.equal(merged.foods,'うどん\n湯葉');
  assert.match(merged.memory,/昔の思い出/); assert.match(merged.memory,/2026-01-02/);
  assert.strictEqual(mergeTripMemory(merged,plan,values),merged);
  assert.equal(mergeTripMemory({},plan,values).visitDate,values.visitDate);
});
test('candidate spots exclude generic schedules, accept missing days', () => {
  const values = importDefaults({ places:'清水寺', days:[{items:[{name:'清水寺'},{name:'昼食'},{name:'ホテルへ移動'},{name:'伏見稲荷'}]}] });
  assert.equal(values.recommendedSpots,'清水寺\n伏見稲荷');
  assert.equal(importDefaults({}).memory,''); assert.deepEqual(importedIds(undefined),[]);
});
test('old completed plans load with an empty import timestamp', () => {
  const plan = {...newPlan(), prefectureId:26, status:'completed'};
  delete plan.travelBookSavedAt;
  globalThis.localStorage = {getItem:()=>JSON.stringify({version:1,plans:[plan]})};
  assert.equal(loadPlans().plans[0].travelBookSavedAt,'');
  delete globalThis.localStorage;
});
