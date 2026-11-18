/* Venice Chess Coach - background pulse.
   Keeps a hidden, unfocused or occluded tab ticking so the coach still plays
   while you are on another tab, another window, or another application. */

const ALARM = 'vcc-pulse';
const HOSTS = ['https://*.chess.com/*', 'https://*.lichess.org/*'];
const FAST = 300;

const ports = new Map();
const timers = new Map();

function arm() {
  try { chrome.alarms.create(ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 }); } catch (e) {}
}

function stop(tabId) {
  const t = timers.get(tabId);
  if (t) clearInterval(t);
  timers.delete(tabId);
  ports.delete(tabId);
}

function ping(tabId) {
  const p = ports.get(tabId);
  if (p) {
    try { p.postMessage({ type: 'vcc-pulse' }); return; } catch (e) { stop(tabId); }
  }
  try { chrome.tabs.sendMessage(tabId, { type: 'vcc-pulse' }).catch(() => {}); } catch (e) {}
}

chrome.runtime.onConnect.addListener(port => {
  const tabId = port.sender && port.sender.tab && port.sender.tab.id;
  if (!tabId) return;
  stop(tabId);
  ports.set(tabId, port);
  timers.set(tabId, setInterval(() => ping(tabId), FAST));
  port.onDisconnect.addListener(() => stop(tabId));
  arm();
  ping(tabId);
});

chrome.runtime.onInstalled.addListener(arm);
chrome.runtime.onStartup.addListener(arm);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'vcc-arm') { arm(); reply && reply({ ok: true }); }
  return true;
});

chrome.alarms.onAlarm.addListener(async a => {
  if (!a || a.name !== ALARM) return;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: HOSTS }); } catch (e) { return; }
  for (const t of tabs) if (t.id) ping(t.id);
});

arm();