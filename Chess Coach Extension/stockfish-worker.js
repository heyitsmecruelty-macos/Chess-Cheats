/* Venice Chess Coach Stockfish UCI bridge. SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';

const parentPostMessage = self.postMessage.bind(self);
let protocolReady = false;
let engineReady = false;
let active = null;
let queued = null;
let pulseTimer = null;
const engineOnMessage = self.onmessage;

self.postMessage = message => {
  if (typeof message === 'string') onEngineLine(message);
  else parentPostMessage(message);
};

if (typeof engineOnMessage !== 'function') {
  parentPostMessage({ ok: false, error: 'Stockfish engine did not initialize.' });
}

function sendEngineCommand(command) {
  if (typeof engineOnMessage !== 'function') {
    parentPostMessage({ ok: false, error: 'Stockfish engine did not initialize.' });
    return;
  }
  engineOnMessage.call(self, { data: command });
}

function optionValue(parts, name, fallback) {
  const index = parts.indexOf(name);
  return index >= 0 && parts[index + 1] ? parts[index + 1] : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function searchDepth(request) {
  const rating = clamp(+request.rating || 1200, 150, 3000);
  let depth = rating < 400 ? 3 : rating < 700 ? 4 : rating < 1000 ? 5
    : rating < 1300 ? 6 : rating < 1700 ? 7 : rating < 2000 ? 9
    : rating < 2300 ? 11 : 13;
  if (request.tc === 'bullet') depth--;
  if (request.tc === 'rapid' || request.tc === 'classical') depth++;
  if (+request.depth > 0) depth = +request.depth;
  if (request.deep) depth = Math.max(depth, 14);
  if (request.boost) depth = Math.max(depth, 9);
  if (request.punish) depth = Math.max(depth, 7);
  return clamp(Math.floor(depth), 1, 20);
}

function searchTime(request, depth) {
  const base = request.tc === 'bullet' ? 450 : request.tc === 'blitz' ? 750
    : request.tc === 'rapid' ? 1100 : request.tc === 'classical' ? 1500 : 900;
  let time = request.deep ? 5000 : request.boost ? Math.max(base, 1800)
    : request.punish ? Math.max(base, 1300) : base;
  if (+request.depth > 0) time = Math.max(time, Math.min(5000, depth * 180));
  if (+request.clock > 0) time = Math.min(time, Math.max(150, +request.clock * 25));
  return clamp(Math.round(time), 150, 5000);
}

function beginRequest(request) {
  active = { request: request, stage: 'waiting-ready', lines: new Map(), depth: 0 };
  if (protocolReady && engineReady) configureRequest();
}

function configureRequest() {
  if (!active) return;
  active.stage = 'preparing';
  const request = active.request;
  const rating = clamp(Math.round(+request.rating || 1200), 150, 3000);
  const elo = clamp(rating + 120, 1320, 3190);
  const skill = rating >= 1320 ? 20 : clamp(Math.round((rating - 150) * 20 / 1170), 0, 20);
  sendEngineCommand('setoption name MultiPV value 3');
  sendEngineCommand('setoption name UCI_LimitStrength value ' + (request.boost ? 'false' : 'true'));
  sendEngineCommand('setoption name UCI_Elo value ' + elo);
  sendEngineCommand('setoption name Skill Level value ' + (request.boost ? 20 : skill));
  sendEngineCommand('isready');
}

function beginSearch() {
  if (!active) return;
  const request = active.request;
  const depth = searchDepth(request);
  const time = searchTime(request, depth);
  active.stage = 'searching';
  active.lines.clear();
  sendEngineCommand('position fen ' + request.fen);
  sendEngineCommand('go depth ' + depth + ' movetime ' + time);
}

function parseInfo(line) {
  if (!active || active.stage !== 'searching') return;
  const parts = line.trim().split(/\s+/);
  const scoreAt = parts.indexOf('score');
  if (scoreAt < 0 || !parts[scoreAt + 2]) return;
  const scoreType = parts[scoreAt + 1];
  if (scoreType !== 'cp' && scoreType !== 'mate') return;
  const score = Number(parts[scoreAt + 2]);
  if (!Number.isFinite(score)) return;
  const depth = Number(optionValue(parts, 'depth', '0')) || 0;
  const multipv = Number(optionValue(parts, 'multipv', '1')) || 1;
  const pvAt = parts.indexOf('pv');
  const pv = pvAt >= 0 ? parts.slice(pvAt + 1).filter(move => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) : [];
  if (!pv.length) return;
  active.depth = Math.max(active.depth, depth);
  active.lines.set(multipv, { multipv: multipv, depth: depth, scoreType: scoreType, score: score, pv: pv });
}

function finishSearch(line) {
  if (!active) return;
  const request = active.request;
  const cancelled = active.cancelled;
  const bestmove = line.trim().split(/\s+/)[1] || '0000';
  const lines = Array.from(active.lines.values()).sort((a, b) => a.multipv - b.multipv);
  active = null;
  if (!cancelled) {
    self.postMessage({
      ok: true,
      analysis: { fen: request.fen, bestmove: bestmove, depth: lines.length ? Math.max(...lines.map(item => item.depth)) : 0, lines: lines }
    });
  }
  if (queued) {
    const next = queued;
    queued = null;
    beginRequest(next);
  }
}

function handleEngineLine(line) {
  if (line === 'uciok') {
    if (protocolReady) return;
    protocolReady = true;
    sendEngineCommand('setoption name Threads value 1');
    sendEngineCommand('isready');
    return;
  }
  if (line === 'readyok') {
    if (!engineReady) {
      engineReady = true;
      if (active) configureRequest();
    } else if (active && active.stage === 'preparing') {
      if (queued) {
        active = null;
        const next = queued;
        queued = null;
        beginRequest(next);
      } else {
        beginSearch();
      }
    }
    return;
  }
  if (line.indexOf('info ') === 0) {
    parseInfo(line);
    return;
  }
  if (line.indexOf('bestmove ') === 0) finishSearch(line);
}

function onEngineLine(value) {
  const text = String(value || '');
  const starts = [];
  // Stockfish.js batches several UCI lines into one postMessage.
  const marker = /(?:uciok|readyok|info |bestmove )/g;
  let match;
  while ((match = marker.exec(text))) starts.push(match.index);
  for (let i = 0; i < starts.length; i++) {
    const line = text.slice(starts[i], starts[i + 1] == null ? text.length : starts[i + 1]).trim();
    if (line) handleEngineLine(line);
  }
}

function submit(request) {
  if (!request || typeof request.fen !== 'string') {
    self.postMessage({ ok: false, error: 'Invalid position sent to Stockfish.' });
    return;
  }
  if (active) {
    queued = request;
    if (active.stage === 'searching') {
      active.cancelled = true;
      sendEngineCommand('stop');
    }
    return;
  }
  beginRequest(request);
}

self.onmessage = event => {
  const data = event.data || {};
  if (data.type === 'pulse-start') {
    if (!pulseTimer) pulseTimer = setInterval(() => self.postMessage({ type: 'pulse' }), 420);
    return;
  }
  if (data.type === 'pulse-stop') {
    if (pulseTimer) clearInterval(pulseTimer);
    pulseTimer = null;
    return;
  }
  if (data.type === 'analyze') submit(data);
  else if (typeof data === 'string') sendEngineCommand(data);
};

sendEngineCommand('uci');
