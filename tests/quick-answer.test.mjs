import test from 'node:test';import assert from 'node:assert/strict';
globalThis.Netlify={env:{get:()=>undefined}};
const {clean}=await import('../netlify/functions/quick-answer.mjs');
test('uncovered answers fall back to the honest hand-off',()=>{const r=clean({covered:false,answer:'x'});assert.equal(r.covered,false);assert.deepEqual(r.doors,['tell','cal']);});
test('em dashes are removed and unknown doors dropped',()=>{const r=clean({covered:true,answer:'A — B',doors:['cal','nope']});assert.equal(r.answer,'A, B');assert.deepEqual(r.doors,['cal']);});
test('missing doors default to a sit-down',()=>{assert.deepEqual(clean({covered:true,answer:'Hi'}).doors,['cal']);});
