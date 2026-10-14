// Headless function and asset checks. This test does not open a browser or URL.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as THREE from '../dist/vendor/three.module.js';
import {selectInterval, intervalProfitability} from '../dist/interval.js';
import {findReplayIndex} from '../dist/replay-date.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const validation = fileURLToPath(new URL('../validation/', import.meta.url));
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const portableError = error => String(error.stack || error).replaceAll('file://' + projectRoot, '').replaceAll(projectRoot, '');
const read = name => fs.readFileSync(path.join(dist, name), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const html = read('index.html'), css = read('challenge.css'), appSource = read('challenge.js');
const themeSource = read('theme.js');
const data = JSON.parse(read('demo-data.json'));
const defaultInterval = selectInterval(data, data.defaultPeriodStart || data.period.entryStart, data.period.valuationEnd);
// A synthetic fixture exercises the research-loading branch without private market records.
const researchFixture = {...data, dataMode:'research_replay', synthetic:false, modelInference:true, accountingStatus:'corrected_adjusted_proxy', strategy:{...data.strategy,directNeural:true}};
const results = {};
let checks = 0;
const ok = (value, message = 'Expected condition to hold') => {assert(value, message); checks++;};
const equal = (a, b, message = 'Values match') => {assert.deepStrictEqual(a, b, message); checks++;};
const clone = value => JSON.parse(JSON.stringify(value));

function findPython() {
  const override = process.env.PYTHON;
  const candidates = override ? [{executable: override, args: [], label: 'PYTHON override'}]
    : process.platform === 'win32'
      ? [{executable: 'py', args: ['-3'], label: 'py -3'}, {executable: 'python', args: [], label: 'python'}]
      : [{executable: 'python3', args: [], label: 'python3'}, {executable: 'python', args: [], label: 'python'}];
  const failures = [];
  for (const candidate of candidates) {
    try {
      const output = execFileSync(candidate.executable,
        [...candidate.args, '-c', 'import json, sys; print(json.dumps(list(sys.version_info[:3])))'],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, windowsHide: true, shell: false});
      const version = JSON.parse(output.trim());
      if (Array.isArray(version) && version.length >= 2 && version.every(Number.isInteger)
          && (version[0] > 3 || version[0] === 3 && version[1] >= 10)) return candidate;
      failures.push(candidate.label + ': requires Python 3.10 or newer');
    } catch (error) {
      failures.push(candidate.label + (error.code === 'ENOENT' ? ': not found' : ': version probe failed'));
    }
  }
  throw Error('Python 3.10 or newer is required for the demo check. ' + failures.join('; ')
    + '. Install Python or set PYTHON to a single executable path, without command-line arguments.');
}

function themeVariables(theme) {
  const values = {};
  for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!block[1].includes(':root') && !block[1].includes(`[data-theme="${theme}"]`)) continue;
    for (const item of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) values[item[1]] = item[2].trim();
  }
  return values;
}

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(f => f !== listener));
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    this['on' + event.type]?.call(this, event);
    return true;
  }
}
class TestEvent {
  constructor(type, init = {}) {this.type = type; Object.assign(this, init);}
  preventDefault() {this.defaultPrevented = true;}
}

function canvasContext() {
  const commands = [];
  const context = new Proxy({commands}, {
    set(target, key, value) {target[key] = value; commands.push(['set', key, value]); return true;},
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
        commands.push([key, ...args]);
        return {addColorStop: (...stop) => commands.push(['colorStop', ...stop])};
      };
      if (key === 'measureText') return text => ({width: String(text).length * 6});
      return (...args) => commands.push([key, ...args]);
    }
  });
  return context;
}

class Element extends Events {
  constructor(tag = 'div') {
    super(); this.tagName = tag.toUpperCase(); this.dataset = {}; this.attributes = {};
    this.style = {setProperty(key, value) {this[key] = value;}};
    this.textContent = ''; this.innerHTML = ''; this.value = ''; this.hidden = false;
    this.disabled = false; this.children = []; this.clientWidth = 720; this.clientHeight = 280;
    this.context = canvasContext();
    const classes = new Set();
    this.classList = {add: (...names) => names.forEach(n => classes.add(n)),
      remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n),
      toggle: (name, state = !classes.has(name)) => state ? classes.add(name) : classes.delete(name)};
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
    if (key === 'id') this.id = value;
  }
  getAttribute(key) {return this.attributes[key] ?? null;}
  removeAttribute(key) {delete this.attributes[key];}
  appendChild(child) {this.children.push(child); child.parentNode = this; return child;}
  append(...children) {children.forEach(child => this.appendChild(child));}
  getContext() {return this.context;}
  click() {this.dispatchEvent(new TestEvent('click', {target: this}));}
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const match = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
    return match ? this.getAttribute(match[1]) !== null && (!match[2] || this.getAttribute(match[1]) === match[2]) : false;
  }
  closest(selector) {return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null;}
  querySelector(selector) {
    if (selector.startsWith('.') && new RegExp(`class=["'][^"']*\\b${selector.slice(1)}\\b`).test(this.innerHTML)) {
      this.nested ||= new Map();
      if (!this.nested.has(selector)) this.nested.set(selector, new Element());
      return this.nested.get(selector);
    }
    return null;
  }
}

function dom() {
  const elements = [];
  for (const match of html.matchAll(/<([a-z][\w-]*)([^<>]*)>/gi)) {
    const element = new Element(match[1]);
    for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
      const value = attr[2] ?? attr[3] ?? '';
      element.setAttribute(attr[1], value);
      if (attr[1] === 'value') element.value = value;
      if (attr[1] === 'disabled' || attr[1] === 'hidden') element[attr[1]] = true;
    }
    elements.push(element);
  }
  const document = new Events();
  document.readyState = 'loading';
  document.documentElement = elements.find(e => e.tagName === 'HTML');
  document.body = elements.find(e => e.tagName === 'BODY');
  document.querySelectorAll = selector => elements.filter(e => e.matches(selector));
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.getElementById = id => document.querySelector('#' + id);
  document.createElement = tag => new Element(tag);
  document.getElementById('play-speed').value = '1400';
  return {document, elements};
}

function sandbox({saved = null, readError = false, writeError = false, query = ''} = {}) {
  const {document, elements} = dom(), window = new Events(), writes = [], emitted = [], timers = new Map();
  const storage = new Map(saved === null ? [] : [['flyalloc-theme', saved]]);
  const localStorage = {
    getItem(key) {if (readError) throw Error('storage denied'); return storage.get(key) ?? null;},
    setItem(key, value) {if (writeError) throw Error('storage denied'); writes.push([key, value]); storage.set(key, value);}
  };
  window.document = document; window.localStorage = localStorage; window.devicePixelRatio = 1;
  window.matchMedia = value => ({matches: false, media: value, addEventListener() {}});
  const dispatch = window.dispatchEvent.bind(window);
  window.dispatchEvent = event => {emitted.push({type: event.type, detail: clone(event.detail ?? null)}); return dispatch(event);};
  const location = {href: 'https://example.invalid/flyalloc/' + query};
  const history = {calls: [], replaceState(...args) {this.calls.push(args);}};
  let timerId = 0;
  const context = vm.createContext({console, document, window, localStorage, location, history,
    URL, AbortController, CustomEvent: TestEvent, Event: TestEvent, THREE, selectInterval, intervalProfitability, findReplayIndex,
    performance, setTimeout: (fn, ms) => {timers.set(++timerId, {fn, ms}); return timerId;},
    clearTimeout: id => timers.delete(id), requestAnimationFrame: () => 0,
    ResizeObserver: class {observe() {}},
    getComputedStyle: () => ({getPropertyValue: key => themeVariables(document.documentElement.dataset.theme)[key] || ''}),
    fetch: async () => {throw Error('Unexpected network attempt');}
  });
  return {context, document, window, elements, writes, emitted, storage, timers, history,
    evaluate: source => vm.runInContext(source, context),
    ready() {document.readyState = 'complete'; document.dispatchEvent(new TestEvent('DOMContentLoaded'));},
    button(theme) {return document.querySelector(`[data-theme-choice="${theme}"]`);}};
}

function loadTheme(options) {
  const env = sandbox(options);
  env.evaluate(themeSource); env.ready();
  return env;
}

function loadApp(query = '') {
  const env = loadTheme({query});
  // Execute the actual application functions. Only module imports and automatic boot are stripped.
  const source = appSource.replace(/^import[^\n]*\n/gm, '').replace(/^start\(\);\s*$/m, '');
  env.evaluate(source);
  env.context.fixture = clone(data);
  env.evaluate('fullRun=fixture;run=fixture;settings.initialCapital=fixture.initialCapital;settings.activationScale=fixture.activationScale||1;');
  env.document.getElementById('interval-start').value = data.defaultPeriodStart || data.period.entryStart;
  env.document.getElementById('interval-end').value = data.period.valuationEnd;
  return env;
}

function state(env) {
  return clone(env.evaluate(`({frameIndex,playing,chartType,selectedSymbol,
    initialCapital:settings.initialCapital,frames:run.frames,
    start:$('#interval-start').value,end:$('#interval-end').value,date:$('#replay-date').value})`));
}

async function test(name, fn) {
  const before = checks;
  try {const detail = await fn(); results[name] = {status: 'passed', checks: checks - before, ...detail};}
  catch (error) {results[name] = {status: 'failed', checks: checks - before, error: portableError(error)};}
}

// Test cases are below; all results are written even when an assertion fails.
await test('assets_and_simplified_interface', () => {
  const tags = [...html.matchAll(/<script\b([^>]*)>/g)].map(m => m[1]);
  const themeTag = tags.find(tag => /src="(?:\.\/)?theme\.js"/.test(tag));
  ok(themeTag !== undefined && !/\b(?:defer|async|type)\s*(?:=|\s|$)/.test(themeTag), 'Theme boot is a synchronous classic script');
  ok(html.indexOf('theme.js') < html.indexOf('</head>'), 'Theme script is in head');
  ok(/<html\b[^>]*data-theme="dark"/.test(html), 'Dark HTML fallback');
  ok(!/prefers-color-scheme/.test(themeSource + css), 'No system color preference changes the declared default');
  ok(/<h1>FlyAlloc<\/h1>/.test(html), 'Product name');
  ok(html.includes('果蝇神经网络驱动的 A 股资产配置实验'), 'Product description');
  for (const id of ['accounting-status', 'strategy-name', 'intro-model', 'model-tag', 'profitability-summary']) {
    ok(!new RegExp(`id=["']${id}["']`).test(html), 'Removed old ID ' + id);
  }
  ok(!html.includes('你的a股收益率能超过') && !html.includes('让果蝇开始交易'), 'Old marketing/playback copy removed');
  ok(/id="start-trading"[^>]*>应用区间<\/button>/.test(html), 'Interval submit label');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  equal(new Set(ids).size, ids.length, 'Unique HTML IDs');
  const localScripts = fs.readdirSync(dist).filter(name => name.endsWith('.js'));
  const selectors = new Set();
  let imports = 0;
  for (const name of localScripts) {
    const source = read(name);
    execFileSync(process.execPath, ['--check', path.join(dist, name)], {stdio: 'pipe'});
    for (const match of source.matchAll(/['"]#([a-z][\w-]*)['"]/g)) {
      if (!/^[a-f\d]{3}$|^[a-f\d]{6}$|^[a-f\d]{8}$/i.test(match[1])) selectors.add(match[1]);
    }
    for (const match of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) selectors.add(match[1]);
    for (const match of source.matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
      ok(fs.existsSync(path.resolve(dist, match[1])), `Local import ${name}: ${match[1]}`); imports++;
    }
  }
  for (const id of selectors) ok(ids.includes(id), 'JS selector exists in HTML: ' + id);
  const dark = themeVariables('dark'), light = themeVariables('light');
  equal([dark['--bg'], light['--bg']], ['#000000', '#ffffff'], 'Black and white page backgrounds');
  for (const key of ['--text', '--muted', '--border', '--chart-grid', '--chart-strategy', '--scene-fog', '--scene-ground']) {
    ok(dark[key] && light[key] && dark[key] !== light[key], 'Distinct theme token ' + key);
  }
  return {htmlIds: ids.length, javascriptIds: selectors.size, syntaxChecked: localScripts, localImports: imports};
});

await test('theme_initialization_and_persistence', () => {
  for (const saved of [null, 'dark', 'light', 'system', '', 'LIGHT', 'invalid']) {
    const env = sandbox({saved});
    env.evaluate(themeSource);
    equal(env.document.documentElement.dataset.theme, saved === 'light' ? 'light' : 'dark', 'Synchronous saved/default theme');
    env.ready();
    for (const theme of ['dark', 'light']) equal(env.button(theme).getAttribute('aria-pressed'), String(theme === env.document.documentElement.dataset.theme));
    equal(env.writes.length, 0, 'Initialization does not overwrite storage');
  }
  const env = loadTheme();
  env.button('light').click();
  equal(env.document.documentElement.dataset.theme, 'light');
  equal(env.writes.at(-1), ['flyalloc-theme', 'light']);
  equal(env.emitted.at(-1), {type: 'flyalloc-theme-change', detail: {theme: 'light'}});
  equal([env.button('dark').getAttribute('aria-pressed'), env.button('light').getAttribute('aria-pressed')], ['false', 'true']);
  equal(loadTheme({saved: env.storage.get('flyalloc-theme')}).document.documentElement.dataset.theme, 'light', 'Saved choice survives reload');
  env.button('dark').click();
  equal(env.writes.at(-1), ['flyalloc-theme', 'dark']);
  equal(env.emitted.at(-1).detail.theme, 'dark');
  return {default: 'dark', storageKey: 'flyalloc-theme', invalidValues: 'dark', event: 'flyalloc-theme-change'};
});

await test('theme_storage_failure_and_synchronization', () => {
  for (const options of [{readError: true}, {writeError: true}, {readError: true, writeError: true}]) {
    const env = loadTheme(options);
    equal(env.document.documentElement.dataset.theme, 'dark');
    env.button('light').click();
    equal(env.document.documentElement.dataset.theme, 'light', 'Storage failure does not block current page');
    equal(env.button('light').getAttribute('aria-pressed'), 'true');
    equal(env.emitted.at(-1).detail.theme, 'light');
  }
  const env = loadTheme();
  env.window.dispatchEvent(new TestEvent('storage', {key: 'flyalloc-theme', newValue: 'light'}));
  equal(env.document.documentElement.dataset.theme, 'light');
  env.window.dispatchEvent(new TestEvent('storage', {key: 'unrelated', newValue: 'dark'}));
  equal(env.document.documentElement.dataset.theme, 'light', 'Unrelated storage ignored');
  env.window.dispatchEvent(new TestEvent('storage', {key: null, newValue: null}));
  equal(env.document.documentElement.dataset.theme, 'dark', 'Storage clear restores declared default');
  equal(env.writes.length, 0, 'Storage events do not recursively write');
});

await test('interval_date_and_playback', () => {
  const env = loadApp();
  equal(env.evaluate('applyInterval(false)'), true, 'Default interval applies');
  equal(env.evaluate('run.frames.length'), defaultInterval.frames.length, 'Default demonstration frame count');
  equal(env.document.getElementById('fly-return').innerHTML, `${defaultInterval.metrics.totalReturn>=0?'+':''}${(defaultInterval.metrics.totalReturn*100).toFixed(2)}<span>%</span>`);
  equal(env.document.getElementById('play-button').textContent, '播放');
  env.document.getElementById('play-button').click();
  equal(env.evaluate('playing'), true);
  for (const id of ['play-button', 'stage-play']) {
    equal(env.document.getElementById(id).textContent, '暂停');
    equal(env.document.getElementById(id).getAttribute('aria-pressed'), 'true');
  }
  env.document.getElementById('stage-play').click();
  equal(env.evaluate('playing'), false);
  env.document.getElementById('next-step').click();
  equal(env.evaluate('frameIndex'), 1);
  for (const index of [...new Set([0, Math.floor(defaultInterval.frames.length/4), Math.floor(defaultInterval.frames.length/2), defaultInterval.frames.length-1])]) {
    const date = env.evaluate(`run.frames[${index}].decisionDate`);
    const control = env.document.getElementById('replay-date'); control.value = date;
    control.dispatchEvent(new TestEvent('change', {target: control}));
    equal(env.evaluate('frameIndex'), index, 'Date picker navigates original frame');
  }
  env.document.getElementById('play-button').click();
  equal(env.evaluate('frameIndex'), 0, 'Playback restarts after last frame');
  equal(env.evaluate('playing'), true);
  env.evaluate('stop()');
  env.document.getElementById('interval-start').value = data.period.entryStart;
  env.document.getElementById('interval-end').value = data.period.valuationEnd;
  env.evaluate('beginPlayback()');
  env.document.getElementById('interval-form').dispatchEvent(new TestEvent('submit'));
  equal(env.evaluate('playing'), false, 'Applying an interval does not start playback');
  equal(env.evaluate('run.frames.length'), data.frames.length);
  const valid = state(env);
  env.document.getElementById('interval-start').value = data.period.valuationEnd;
  env.document.getElementById('interval-end').value = data.period.entryStart;
  equal(env.evaluate('applyInterval(false)'), false, 'Reversed dates rejected');
  equal(state(env).frames, valid.frames, 'Rejected interval preserves current data');
  return {defaultFrames: defaultInterval.frames.length, allFrames: data.frames.length, playbackLabels: ['播放', '暂停']};
});

await test('theme_preserves_replay_and_chart_values', () => {
  const env = loadApp(); env.evaluate('applyInterval(false);updateFrame(13);beginPlayback();');
  const snapshot = state(env), dataHash = sha(JSON.stringify(env.context.fixture));
  const canvas = env.document.getElementById('equity-chart');
  const draw = theme => {
    env.button(theme).click();
    canvas.context.commands.length = 0;
    env.evaluate('drawCurve()');
    return clone(canvas.context.commands);
  };
  const dark = draw('dark'), light = draw('light');
  const coordinates = commands => commands.filter(c => ['moveTo', 'lineTo', 'arc', 'fillText', 'scale', 'createLinearGradient'].includes(c[0]));
  const colors = commands => commands.filter(c => c[0] === 'colorStop' || c[0] === 'set' && ['fillStyle', 'strokeStyle'].includes(c[1]));
  equal(coordinates(dark), coordinates(light), 'Theme changes no chart coordinates or numeric labels');
  ok(JSON.stringify(colors(dark)) !== JSON.stringify(colors(light)), 'Actual drawCurve uses different theme colors');
  equal(state(env), snapshot, 'Theme leaves dates, playback, selection and financial frames unchanged');
  equal(sha(JSON.stringify(env.context.fixture)), dataHash, 'Original loaded data not mutated');
  return {chartCoordinateCommands: coordinates(dark).length, numericalStatePreserved: true};
});

await test('actual_3d_and_software_theme_update', () => {
  const env = loadApp(); env.evaluate('applyInterval(false);updateFrame(13);');
  env.evaluate(read('software-renderer.js').replace(/^import[^\n]*\n/gm, '').replace('export class SoftwareRenderer', 'class SoftwareRenderer'));
  env.evaluate(`
    scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x080808,.018);
    camera=new THREE.PerspectiveCamera(36,1,.1,80);camera.position.set(8,9,12);
    brainCamera=new THREE.PerspectiveCamera(38,1,.1,50);brainCamera.position.set(0,.4,4.2);
    renderer=new SoftwareRenderer({canvas:$('#fly-canvas')});
    brainRenderer=new SoftwareRenderer({canvas:$('#brain-canvas')});
    brainGroup=new THREE.Group();brainScene=new THREE.Scene();brainScene.add(brainGroup);
    sceneMaterials.push({material:new THREE.MeshStandardMaterial({color:0x141714}),token:'scene-ground'},
      {material:new THREE.MeshBasicMaterial({color:0x4b5945}),token:'scene-ring'});
    stationObjects.push({symbol:run.symbols[0].symbol,position:new THREE.Vector3(1,.15,2),
      marker:new THREE.Mesh(new THREE.CylinderGeometry(.3,.4,.06,8),new THREE.MeshStandardMaterial())});
    selectedSymbol=run.symbols[0].symbol;
    makeNetwork(run.graph);setActivation(currentFrame().states[0]);
  `);
  const numericSnapshot = () => clone(env.evaluate(`({
    camera:camera.position.toArray(),brainCamera:brainCamera.position.toArray(),
    neurons:Array.from(neuralGeometry.attributes.position.array),
    activation:Array.from(neuralGeometry.attributes.activation.array),
    edges:Array.from(edgeGeometry.attributes.position.array),
    edgeSignals:Array.from(edgeGeometry.attributes.color.array),
    time:nodePoints.material.uniforms.uTime.value,scale:nodePoints.material.uniforms.uScale.value,
    radius:stationObjects[0].marker.geometry.parameters,frames:run.frames})`));
  const numeric = numericSnapshot(), replay = state(env);
  env.button('dark').click();
  const dark = clone(env.evaluate(`({fog:scene.fog.color.getHexString(),
    material:sceneMaterials.map(x=>x.material.color.getHexString()),
    marker:stationObjects[0].marker.material.color.getHexString(),
    palette:renderer.palette(.7),lightUniform:nodePoints.material.uniforms.uLightTheme.value,
    blending:nodePoints.material.blending,edgeOpacity:edgeLines.material.opacity})`));
  env.button('light').click();
  const light = clone(env.evaluate(`({fog:scene.fog.color.getHexString(),
    material:sceneMaterials.map(x=>x.material.color.getHexString()),
    marker:stationObjects[0].marker.material.color.getHexString(),
    palette:renderer.palette(.7),lightUniform:nodePoints.material.uniforms.uLightTheme.value,
    blending:nodePoints.material.blending,edgeOpacity:edgeLines.material.opacity})`));
  for (const key of ['fog', 'material', 'marker', 'palette', 'lightUniform', 'blending', 'edgeOpacity']) {
    ok(JSON.stringify(dark[key]) !== JSON.stringify(light[key]), '3D theme changes ' + key);
  }
  equal([dark.lightUniform, light.lightUniform], [0, 1]);
  equal([dark.blending, light.blending], [THREE.AdditiveBlending, THREE.NormalBlending]);
  equal(env.evaluate('renderer.theme'), 'light');
  equal(env.evaluate('brainRenderer.theme'), 'light');
  equal(env.evaluate('renderer.sprites.length'), 16);
  equal(numericSnapshot(), numeric, 'Theme preserves camera, topology, neuron values, chart values and frames');
  equal(state(env), replay, '3D theme event preserves replay state');
  return {actualFunctions: ['applyVisualTheme', 'makeNetwork', 'setActivation', 'SoftwareRenderer.setTheme'],
    nodes: data.graph.nodes.length, visibleEdges: Math.min(512,data.graph.edges.length), softwareSprites: 16, cameraAndNeuralValues: 'unchanged',
    renderingScope: 'Real scene/material/math objects and software sprite commands; no browser or pixel rendering'};
});

await test('actual_scene_initialization_order', async () => {
  const env = loadApp(), fetched = [];
  env.evaluate(read('software-renderer.js').replace(/^import[^\n]*\n/gm, '').replace('export class SoftwareRenderer', 'class SoftwareRenderer'));
  env.context.THREE = {...THREE, WebGLRenderer: class {constructor() {throw Error('VM has no WebGL context');}}};
  env.context.OrbitControls = class {
    constructor() {this.target = new THREE.Vector3();}
    update() {}
  };
  env.context.fetch = async url => {
    fetched.push(url);
    assert(['./static-data.json', './demo-data.json', './assets/fly-cpu.json'].includes(url), 'Only bundled local assets requested');
    if(url==='./static-data.json')return {ok:false,status:404};
    return {ok: true, status:200, json: async () => url === './demo-data.json' ? clone(data) : JSON.parse(read('assets/fly-cpu.json'))};
  };
  // Original boot executes with run=null, then the actual supported software initialization path.
  env.evaluate('fullRun=null;run=null;applyVisualTheme();');
  await env.evaluate('start()');
  equal(fetched.sort(), ['./assets/fly-cpu.json', './demo-data.json', './static-data.json']);
  equal(env.document.getElementById('scene-error').hidden, true, 'Scene initializes without DOM errors');
  equal(env.evaluate('flyReady'), true);
  equal(env.evaluate('stationObjects.length'), 7);
  equal(env.evaluate('neuralGeometry.attributes.activation.count'), data.graph.nodes.length);
  equal(env.evaluate('edgeLines.userData.indices.length'), Math.min(512,data.graph.edges.length)*2);
  equal(env.evaluate('sceneMaterials.length'), 4);
  equal(env.document.getElementById('fly-canvas').dataset.renderer, 'software-3d');
  equal(env.document.getElementById('brain-canvas').dataset.renderer, 'software-3d');
  for (const id of ['play-button', 'stage-play', 'timeline', 'next-step', 'replay-date', 'interval-start', 'interval-end', 'start-trading']) {
    equal(env.document.getElementById(id).disabled, false, 'Boot enables ' + id);
  }
  equal(env.evaluate('run.frames.length'), defaultInterval.frames.length);
  const first = clone(env.evaluate('Array.from(neuralGeometry.attributes.activation.array)'));
  env.evaluate('updateFrame(7)');
  const next = clone(env.evaluate('Array.from(neuralGeometry.attributes.activation.array)'));
  ok(JSON.stringify(first) !== JSON.stringify(next), 'Actual updateFrame loads next recorded neural activity');
  equal(next, clone(env.evaluate('currentFrame().states[0].values')), 'Artificial activity equals the synthetic saved values');
  const beforeTheme = state(env);
  env.button('light').click();
  equal(state(env), beforeTheme);
  equal(env.evaluate('renderer.theme'), 'light');
  equal(env.evaluate('brainRenderer.theme'), 'light');
  equal(clone(env.evaluate('Array.from(neuralGeometry.attributes.activation.array)')), next);
  return {path: 'start → actual initScene/initBrainScene → bundled software geometry → buildStations → makeNetwork → applyInterval/updateFrame',
    controlsAndAnimation: 'OrbitControls and requestAnimationFrame are stubs; no browser rendering',
    initializedMaterials: 4, stations: data.symbols.length, nodes: data.graph.nodes.length};
});

await test('research_loading_without_private_data', async () => {
  for (const query of ['', '?strategy=online&fold=2022&run=hybrid&foo=bar#view']) {
    const env = loadApp(query), fetched = [];
    env.context.fetch = async url => {fetched.push(url); return {ok:true,status:200,json:async()=>clone(researchFixture)};};
    env.evaluate('initScene=()=>{throw Error("test: scene intentionally unavailable")};');
    await env.evaluate('start()');
    equal(fetched, ['./static-data.json'], 'Available local research is never replaced by demo');
    equal(env.evaluate('isDemo()'), false);
    equal(env.document.getElementById('data-mode-banner').hidden, true);
    equal(env.document.getElementById('download-run').href, './static-raw.json');
    equal(env.document.getElementById('score-eyebrow-text').textContent, '区间收益');
    equal(env.document.getElementById('interval-start').disabled, false);
    equal(env.evaluate('run.frames.length'), defaultInterval.frames.length);
    if (query) equal(env.history.calls.at(-1)[2], '/flyalloc/?foo=bar#view', 'Obsolete selector query is ignored');
    for (const mutation of ['fixture.strategy.online=true', 'fixture.strategy.directNeural=false', "fixture.accountingStatus='other'"]) {
      env.context.fixture=clone(researchFixture);env.evaluate(mutation);
      assert.throws(()=>env.evaluate('validateRun(fixture)'));checks++;
    }
  }
  return {fixture:'Generated synthetic data shaped as the research schema; no private records loaded',url:'./static-data.json'};
});

await test('synthetic_fallback_and_disclosure', async () => {
  const env=loadApp(),fetched=[];
  env.context.fetch=async url=>{fetched.push(url);return url==='./static-data.json'?{ok:false,status:404}:{ok:true,status:200,json:async()=>clone(data)};};
  env.evaluate('initScene=()=>{throw Error("test: scene intentionally unavailable")};');
  await env.evaluate('start()');
  equal(fetched,['./static-data.json','./demo-data.json']);
  equal(env.evaluate('isDemo()'),true);
  equal(env.document.getElementById('data-mode-banner').hidden,false);
  ok(env.document.getElementById('data-mode-banner').textContent.includes('合成演示'));
  ok(env.document.getElementById('data-mode-banner').textContent.includes('不是模型推理输出或研究结果'));
  equal(env.document.getElementById('download-run').href,'./demo-data.json');
  equal(env.document.getElementById('score-eyebrow-text').textContent,'合成区间变化');
  equal(env.document.getElementById('baseline-label').textContent,'虚构资产买持示例');
  equal(env.document.getElementById('neural-title').textContent,'人工活动示意');
  ok(env.document.getElementById('method-model').textContent.includes('未加载或运行交易模型'));
  ok(env.document.getElementById('method-scope').textContent.includes('不是研究结果'));
  for(const mutation of ['fixture.modelInference=true','fixture.synthetic=false','fixture.strategy.directNeural=true']){
    env.context.fixture=clone(data);env.evaluate(mutation);assert.throws(()=>env.evaluate('validateRun(fixture)'));checks++;
  }
  return {fallback:'HTTP 404 only',disclosures:'Main banner, score, chart, neural activity, methods and JSON download'};
});

await test('non404_and_invalid_data_never_fall_back', async () => {
  for(const mode of [403,500,'network','json','schema','disguised']){
    const env=loadApp(),fetched=[];
    env.context.fetch=async url=>{
      fetched.push(url);
      if(mode==='network')throw Error('network unavailable');
      if(typeof mode==='number')return {ok:false,status:mode};
      return {ok:true,status:200,json:async()=>{
        if(mode==='json')throw SyntaxError('invalid JSON');
        return mode==='schema'?{}:clone(data);
      }};
    };
    await assert.rejects(env.evaluate('loadRun()'));checks++;
    equal(fetched,['./static-data.json'],'No synthetic fallback after '+mode);
  }
  const env=loadApp(),fetched=[];
  env.context.fetch=async url=>{fetched.push(url);return {ok:false,status:404};};
  await assert.rejects(env.evaluate('loadRun()'));checks++;
  equal(fetched,['./static-data.json','./demo-data.json']);
  return {rejected:[403,500,'network failure','malformed JSON','invalid schema','demo disguised as research','missing demo']};
});

await test('public_demo_determinism_and_accounting', () => {
  const script=fileURLToPath(new URL('../../scripts/generate_demo.py',import.meta.url));
  const python=findPython();
  const generated=JSON.parse(execFileSync(python.executable,[...python.args,script,'--check'],{encoding:'utf8',windowsHide:true,shell:false}));
  equal(generated.status,'passed');equal(generated.sha256,sha(read('demo-data.json')));
  equal(data.sourceGraphSha256,sha(read('demo-graph.json')));
  equal(data.synthetic,true);equal(data.modelInference,false);equal(data.generation.marketDataUsed,false);
  equal(data.symbols.map(s=>s.symbol),['DEMO_A','DEMO_B','DEMO_C','DEMO_D','DEMO_E','DEMO_F','DEMO_G']);
  equal(data.graph,JSON.parse(read('demo-graph.json')));
  equal(data.graph.license,'CC-BY-4.0');ok(data.graph.license_url.startsWith('https://creativecommons.org/'));
  for(const frame of data.frames){
    const one=selectInterval(data,frame.entryDate,frame.valuationDate);
    equal(one.frames.length,1);
    ok(Math.abs(one.metrics.totalReturn-(frame.equity/frame.preperiodEquity-1))<1e-12);
    ok(Math.abs(one.metrics.baselineReturn-(frame.baselineEquity/frame.baselinePreperiodEquity-1))<1e-12);
    ok(Math.abs(frame.cashWeight+frame.weights.reduce((a,b)=>a+b,0)-1)<1e-12);
    equal(one.frames[0].states,frame.states);
    equal(frame.states[0].values.length,data.graph.nodes.length);
  }
  return {deterministic:true,frames:data.frames.length,privateInputs:false,graph:'Real CC BY connectivity; activity is artificial'};
});

const sourceFiles = ['index.html', 'theme.js', 'challenge.css', 'challenge.js', 'software-renderer.js',
  'interval.js', 'replay-date.js', 'demo-data.json', 'demo-graph.json'];
const status = Object.values(results).every(result => result.status === 'passed') ? 'passed' : 'failed';
const timestamp = new Date().toISOString();
const report = {
  status, timestamp, checks, dataChecks: results.public_demo_determinism_and_accounting?.checks,
  command: 'node website/tests/check-interface.mjs', runtime: process.version,
  frames: data.frames.length, sourceHashes: Object.fromEntries(sourceFiles.map(name => [name, sha(read(name))])),
  testSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), results,
  limitations: [
    'No browser was opened and no network request was made. DOM and Canvas commands use VM stubs; this is not a rendered visual or layout inspection.',
    'Actual chart, Three.js scene/material and software palette functions execute against local assets; WebGL shader compilation, GPU rendering and responsive pixel layouts are not verified here.',
    'The earlier localhost browser URL safety rejection was respected; no substitute browser path was used.'
  ]
};
fs.mkdirSync(validation, {recursive: true});
fs.writeFileSync(path.join(validation, 'interface_checks.json'), JSON.stringify(report, null, 2) + '\n');
// Replace the previous UI-specific hashes and assertions; the canonical current report is above.
fs.writeFileSync(path.join(validation, 'ui_checks.json'), JSON.stringify({
  status, timestamp, report: 'interface_checks.json',
  scope: 'Public synthetic-demo, research-loading fixture, black/white theme and interface checks; no private data required.',
  supersedes: 'Previous UI report and its old interface hashes/copy assertions.'
}, null, 2) + '\n');
console.log(JSON.stringify({status, checks, dataChecks: report.dataChecks,
  suites: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.status])),
  report: 'website/validation/interface_checks.json'}, null, 2));
if (status !== 'passed') {
  for (const [name, result] of Object.entries(results)) if (result.status !== 'passed') console.error(name + '\n' + result.error);
  process.exitCode = 1;
}
