// Optional local research-data audit; private static JSON and provenance are required.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {selectInterval, intervalProfitability} from '../dist/interval.js';
import {findReplayIndex} from '../dist/replay-date.js';

const read = name => fs.readFileSync(new URL('../dist/' + name, import.meta.url));
const rawBytes = read('static-raw.json'), dataBytes = read('static-data.json');
const raw = JSON.parse(rawBytes), data = JSON.parse(dataBytes);
const manifest = JSON.parse(read('data-provenance.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let checks = 0, maxRecomputedDifference = 0;
function equal(a, b, label) { assert.deepStrictEqual(a, b, label); checks++; }
function near(a, b, label) {
  assert(Number.isFinite(a) && Number.isFinite(b), label);
  const difference = Math.abs(a - b);
  maxRecomputedDifference = Math.max(maxRecomputedDifference, difference);
  assert(difference <= 1e-8 + 1e-9 * Math.abs(b), `${label}: ${a} != ${b}`); checks++;
}
function structuralDigest(value) {
  const hash = createHash('sha256');
  function visit(v) {
    if (v === null) hash.update('n');
    else if (typeof v === 'boolean') hash.update(v ? 'b1' : 'b0');
    else if (typeof v === 'number') { assert(Number.isFinite(v)); const b = Buffer.alloc(8); b.writeDoubleBE(v); hash.update('d').update(b); }
    else if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'), n = Buffer.alloc(4); n.writeUInt32BE(b.length); hash.update('s').update(n).update(b); }
    else if (Array.isArray(v)) { hash.update('['); v.forEach(visit); hash.update(']'); }
    else { hash.update('{'); Object.keys(v).sort().forEach(k => { visit(k); visit(v[k]); }); hash.update('}'); }
  }
  visit(value); return hash.digest('hex');
}
function getPath(obj, path) { return path.split('.').reduce((v, k) => v[k], obj); }

equal(sha(rawBytes), data.sourceSha256, 'consumer hash points to derived raw bytes');
equal(sha(rawBytes), manifest.output['static-raw.json'], 'raw manifest hash');
equal(sha(dataBytes), manifest.output['static-data.json'], 'data manifest hash');
equal(data.originalSourceSha256, '7867b09f41bbc243373422f761122f03e33588d8af2298e386f7b2b039907b04', 'verified archive');
equal(raw.originalSourceSha256, data.originalSourceSha256);
equal(manifest.source.originalSourceSha256, data.originalSourceSha256);
for (const item of manifest.protectedSubtrees) {
  equal(structuralDigest(getPath(item.file === 'raw' ? raw : data, item.path)), item.sha256, 'immutable source subtree ' + item.file + '.' + item.path);
}
equal([data.projectName, raw.projectName], ['FlyAlloc', 'FlyAlloc']);
equal([data.strategy.id, raw.artifact_id], ['monthly12', 'monthly12']);
equal([data.graph.dataset, raw.graph.dataset], ['MaleCNS v1.0', 'MaleCNS v1.0']);
equal(data.strategy.online, false);
equal(data.graphVersions, {});
equal(Object.keys(raw.baseline_paths), ['buyhold']);
equal(raw.controls, undefined);
equal(raw.model_selection.all_candidates, undefined);
equal(raw.training.rejected_pilot_experiment, undefined);
equal(Object.keys(raw.audit.ledgers).some(k => k.startsWith('legacy_')), false);
equal(raw.model_selection.candidate_count, 24);
equal(raw.model_selection.winner, raw.training.winner);
equal(raw.training.winner.qualified, false);
equal([raw.training.fits, raw.training.actual_epochs, raw.training.winner.epoch], [74, 876, 6]);
equal([data.frames.length, raw.daily_decisions.length, raw.baseline_paths.buyhold.length, raw.simulated_orders.length], [417, 417, 417, 595]);
equal(raw.brain_visualization.raw_state_shape, [417, 2, 3, 384]);
equal(data.graph.nodes.length, 384);
equal(data.graph.edges.length, 9377);
equal(raw.trained_graph_states.members.map(m => m.seed), [17, 29]);

const fieldMap = {decisionDate:'decision_date', entryDate:'entry_date', valuationDate:'valuation_date', equity:'equity', preperiodEquity:'preperiod_equity', rebalanceScheduled:'rebalance_scheduled', proposedWeights:'neural_target', cost:'cost', fees:'fee', slippage:'slippage'};
let peak = data.initialCapital, basePeak = data.initialCapital;
for (let i = 0; i < data.frames.length; i++) {
  const frame = data.frames[i], decision = raw.daily_decisions[i], baseline = raw.baseline_paths.buyhold[i];
  for (const [dst, src] of Object.entries(fieldMap)) equal(frame[dst], decision[src], `frame ${i} ${dst}`);
  equal(frame.weights, decision.actual_weights.slice(0, 7));
  equal(frame.cashWeight, decision.actual_weights[7]);
  equal(frame.baselineEquity, baseline.equity);
  equal(frame.baselinePreperiodEquity, baseline.preperiod_equity);
  equal(frame.rebalanced, decision.turnover > 1e-10);
  equal(frame.modelVersion, 'static');
  equal(frame.states, [{symbol:'portfolio', label:'整体组合', date:decision.decision_date, values:decision.brain_activity_u8, nodeIds:raw.brain_visualization.node_ids}]);
  equal(decision.brain_activity_u8.length, 384);
  assert(decision.brain_activity_u8.every(v => Number.isInteger(v) && v >= 0 && v <= 255)); checks++;
  peak = Math.max(peak, frame.equity); basePeak = Math.max(basePeak, frame.baselineEquity);
  near(frame.drawdown, frame.equity / peak - 1, 'drawdown');
  near(frame.baselineDrawdown, frame.baselineEquity / basePeak - 1, 'baseline drawdown');
  near(frame.weights.reduce((a,b) => a+b, frame.cashWeight), 1, 'weights plus cash');
  const single = selectInterval(data, frame.entryDate, frame.valuationDate);
  equal(single.frames.length, 1);
  equal(single.initialCapital, frame.preperiodEquity);
  equal(single.baselineInitialCapital, frame.baselinePreperiodEquity);
  equal(single.frames[0].states, frame.states);
  equal(single.frames[0].weights, frame.weights);
  near(single.metrics.totalReturn, frame.equity / frame.preperiodEquity - 1, 'single period return');
  equal(findReplayIndex(data.frames, frame.decisionDate), i);
}
const trained = raw.trained_graph_states;
for (let i = 0; i < data.graph.edges.length; i++) {
  equal(data.graph.edges[i], {source:trained.edge_source[i], target:trained.edge_target[i], weight:(trained.members[0].normalized_edge_weight[i] + trained.members[1].normalized_edge_weight[i]) / 2}, `trained graph edge ${i}`);
}
equal(data.costModel, raw.cost_model);
equal(data.costModel.one_way_rate, .0005);
equal(data.costModel.headline_extra_cost, 0);
equal(data.terminalAccounting, raw.terminal_accounting);
equal(data.metrics2026, raw.metrics_2026_frontend_interval);
equal(data.metrics.totalReturn, raw.metrics.total_return);
equal(data.metrics.maxDrawdown, raw.metrics.max_drawdown);
equal(data.metrics.meanExposure, raw.metrics.mean_gross_exposure);
equal(data.metrics.assumedCost, raw.metrics.cost);
equal(data.metrics.fees, raw.metrics.fees);
equal(data.metrics.slippage, raw.metrics.slippage);
near(raw.simulated_orders.reduce((a,o) => a+o.cost, 0), raw.metrics.cost, 'order cost total');
for (const order of raw.simulated_orders) { near(order.fee, order.notional * .0005, 'order fee'); near(order.cost, order.fee + order.slippage, 'order cost'); }
const all = selectInterval(data, data.period.entryStart, data.period.valuationEnd);
for (const key of ['totalReturn','baselineReturn','maxDrawdown','meanExposure','assumedCost','fees','slippage']) near(all.metrics[key], data.metrics[key], 'full interval ' + key);
const year = selectInterval(data, '2026-01-01', '2026-09-30');
equal(year.frames.length, 180);
near(year.metrics.totalReturn, data.metrics2026.total_return, '2026 return');
near(year.metrics.maxDrawdown, data.metrics2026.max_drawdown, '2026 drawdown');
near(year.metrics.assumedCost, data.metrics2026.cost, '2026 cost');
const profitability = intervalProfitability(year);
equal([profitability.positiveMonths, profitability.months], [3, 9]);
equal(data.metrics2026.monthly_returns.filter(m => m.return > 0).length, 3);
equal(data.metrics2026.positive_month_fraction, 3/9);
equal(findReplayIndex(data.frames, '2025-01-11'), data.frames.findIndex(f => f.decisionDate >= '2025-01-11'));
equal(findReplayIndex(data.frames, '2027-01-01'), 416);
assert.throws(() => selectInterval(data, '2026-09-30', '2026-01-01')); checks++;
console.log(JSON.stringify({status:'passed', checks, protectedSubtrees:manifest.protectedSubtrees.length, frames:417, orders:595, nodes:384, edges:9377, positive2026Months:3, months2026:9, immutableSourceValues:'exact', recomputationTolerance:{rtol:1e-9, atol:1e-8}, maxRecomputedDifference, scope:'Derived export hashes, source subtree fingerprints, every frame mapping, orders/cost, trained graph, neural states, full and 2026 intervals, date navigation.'}));
