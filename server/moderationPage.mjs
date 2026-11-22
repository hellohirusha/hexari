export const moderationHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Forge report review</title>
<style>body{font:16px system-ui;background:#111e29;color:#f5eadb;max-width:850px;margin:3rem auto;padding:0 1rem}input,button{font:inherit;padding:.65rem;border-radius:.4rem}button{cursor:pointer}article{padding:1rem;margin:1rem 0;background:#223444;border-radius:.5rem}small{display:block;color:#c6d6d9;margin:.4rem 0}p{overflow-wrap:anywhere}#error{color:#ffb6a3}</style></head>
<body><h1>Forge report review</h1><p>Reports are visible only with the moderator token. Marking a report reviewed does not block a player.</p>
<form id="login"><label for="token">Moderator token</label> <input id="token" type="password" autocomplete="off" required> <button>Load reports</button></form>
<p id="error" role="alert"></p><section id="reports" aria-live="polite"></section><script src="/moderation/app.js" defer></script></body></html>`;

export const moderationScript = `"use strict";
const form = document.querySelector('#login'), token = document.querySelector('#token');
const error = document.querySelector('#error'), list = document.querySelector('#reports');
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { authorization: 'Bearer ' + token.value, ...(options.headers || {}) }, cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 403 ? 'Token was not accepted.' : 'Could not load or update reports.');
  return response.json();
}
async function refresh() {
  error.textContent = ''; list.replaceChildren();
  try {
    const { reports } = await request('/moderation/reports');
    if (!reports.length) { list.textContent = 'No reports.'; return; }
    for (const report of reports) {
      const room = report.room_id ?? report.room, message = report.message_id ?? report.id;
      const reporter = report.reporter_seat ?? report.reporter;
      const article = document.createElement('article'), text = document.createElement('p'), meta = document.createElement('small'), action = document.createElement('button');
      text.textContent = report.message ?? report.text;
      meta.textContent = 'Room ' + room + ' | Reporter ' + (reporter + 1) + ' | ' + (report.reviewed_at || report.reviewedAt ? 'Reviewed' : 'Awaiting review');
      article.append(text, meta); action.textContent = 'Mark reviewed'; action.disabled = Boolean(report.reviewed_at || report.reviewedAt);
      action.onclick = async () => { action.disabled = true; try { await request('/moderation/reports/review', { method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({room, message, reporter}) }); await refresh(); } catch (e) { error.textContent = e.message; action.disabled = false; } };
      article.append(action); list.append(article);
    }
  } catch (e) { error.textContent = e.message; }
}
form.addEventListener('submit', (event) => { event.preventDefault(); void refresh(); });`;
