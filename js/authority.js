// ---------- Authority: KPI row ----------
function renderKPIs(){
  const all = CIVIC.reports;
  const open = all.filter(r=>r.status!=='resolved' && r.status!=='queued').length;
  const resolved = all.filter(r=>r.status==='resolved').length;
  const breached = all.filter(r=>r.status!=='resolved' && r.status!=='queued' && r.slaDeadline && r.slaDeadline!=='DEMO_BREACH_SOON' && new Date(r.slaDeadline) < new Date()).length;
  const topSeverity = Math.max(...all.map(r=>r.severity)).toFixed(2);
  const nums = document.querySelectorAll('.kpi .num');
  if(nums.length===4){
    nums[0].textContent = open;
    nums[1].textContent = resolved;
    nums[2].textContent = breached;
    nums[3].textContent = topSeverity;
  }
  const slaBanner = document.querySelector('.sla-banner');
  if(slaBanner){
    if(breached>0){
      slaBanner.style.display = 'flex';
      slaBanner.textContent = `🚨 SLA breached: ${breached} report${breached>1?'s':''} — auto-escalated to Ward Officer`;
    } else {
      slaBanner.style.display = 'none';
    }
  }
}

// ---------- Authority: explainable priority score ----------
// The one place the "explainable AI" claim in the deck gets proven: every term
// here is arithmetic over real fields on the report, nothing hardcoded.
// Equity correction is computed but held at 0 until step 5 wires a real
// switch to `equityCorrectionOn` — flipping that switch is what will make the
// queue below visibly reorder.
let equityCorrectionOn = false;
const EQUITY_BONUS = 0.5; // additive priority bonus for underReported wards, while the correction is on
const SLA_URGENCY_WEIGHT = 0.5; // max additive bonus as a report's SLA window fully elapses

function slaWindowHours(category){
  return CIVIC.slaHours[category] || 48;
}
// Hours left until slaDeadline (negative once breached). DEMO_BREACH_SOON is
// resolved to a real deadline at runtime by step 6 — until then, treat it as
// "just submitted" so it doesn't distort the score before that wiring exists.
function slaRemainingHours(r){
  if(!r.slaDeadline || r.slaDeadline==='DEMO_BREACH_SOON') return slaWindowHours(r.category);
  return (new Date(r.slaDeadline) - new Date()) / 3600000;
}
function computePriority(r){
  const proximityWeight = CIVIC.proximityWeights[r.proximity] ?? 1.0;
  const baseTerm = r.severity * proximityWeight;
  const confirmTerm = r.confirms * 0.02;
  const totalHours = slaWindowHours(r.category);
  const remaining = slaRemainingHours(r);
  const elapsedFraction = Math.min(Math.max((totalHours - remaining) / totalHours, 0), 1);
  const slaTerm = SLA_URGENCY_WEIGHT * elapsedFraction;
  const ward = wardInfo(r.ward);
  const equityTerm = (equityCorrectionOn && ward.underReported) ? EQUITY_BONUS : 0;
  return {
    proximityWeight, baseTerm, confirmTerm,
    totalHours, remaining, slaTerm,
    ward, equityTerm,
    total: baseTerm + confirmTerm + slaTerm + equityTerm
  };
}
function slaRemainingLabel(remaining, totalHours){
  return remaining>=0
    ? `${Math.round(remaining)}h remaining of ${totalHours}h`
    : `${Math.round(-remaining)}h overdue of ${totalHours}h`;
}
function whyPanelHtml(r){
  const p = computePriority(r);
  return `
    <div class="why-row"><span>severity ${r.severity.toFixed(2)} × proximity ${p.proximityWeight.toFixed(2)} (${r.proximity})</span><span>= ${p.baseTerm.toFixed(3)}</span></div>
    <div class="why-row"><span>+ confirmations ${r.confirms} × 0.02</span><span>= ${p.confirmTerm.toFixed(3)}</span></div>
    <div class="why-row"><span>+ SLA urgency (${slaRemainingLabel(p.remaining, p.totalHours)})</span><span>= ${p.slaTerm.toFixed(3)}</span></div>
    <div class="why-row"><span>+ equity correction (${p.ward.name}, ${p.ward.underReported ? (equityCorrectionOn ? 'flagged' : 'flagged, correction off') : 'not flagged'})</span><span>= ${p.equityTerm.toFixed(3)}</span></div>
    <div class="why-total"><span>PRIORITY SCORE</span><span>${p.total.toFixed(3)}</span></div>`;
}

// ---------- Authority: ranked queue ----------
const queueList = document.getElementById('queueList');
let dashTab = 'queue';
function severityColor(score){
  return score>=0.75 ? 'var(--red)' : score>=0.45 ? 'var(--amber)' : 'var(--muted)';
}
function slaBreached(r){
  if(!r.slaDeadline || r.slaDeadline==='DEMO_BREACH_SOON') return false;
  return new Date(r.slaDeadline) - Date.now() <= 0;
}
function formatDuration(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(total/3600), m = Math.floor((total%3600)/60), s = total%60;
  return h>0 ? `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s` : `${m}m ${String(s).padStart(2,'0')}s`;
}
function slaCountdownText(r){
  if(!r.slaDeadline || r.slaDeadline==='DEMO_BREACH_SOON') return 'Pending';
  const ms = new Date(r.slaDeadline) - Date.now();
  return ms<=0 ? `BREACHED · ${formatDuration(-ms)} over` : `${formatDuration(ms)} left`;
}
// isEscalatedToChallenge() now lives in data.js (it reads the Supabase-
// synced reportChallenges array, shared with the faculty review queue).
function renderQueue(highlightId){
  queueList.innerHTML = '';
  const rows = CIVIC.reports
    .filter(r=> dashTab === 'resolved' ? r.status === 'resolved' : (r.status !== 'resolved' && r.status !== 'queued'))
    .filter(r=> dashTab!=='sla' || slaBreached(r)) // SLA tab narrows to breached/escalated only
    .slice()
    .sort((a,b)=> dashTab === 'resolved' ? new Date(b.resolvedAt || 0) - new Date(a.resolvedAt || 0) : computePriority(b).total - computePriority(a).total);
    
  rows.forEach((r,i)=>{
    const breached = slaBreached(r);
    const row = document.createElement('div');
    row.className = 'queue-item' + (breached && dashTab !== 'resolved' ? ' critical' : '');
    row.dataset.id = r.id;
    
    if (dashTab === 'resolved') {
      row.innerHTML = `<div class="rank">#${i+1}</div>
        <div class="qmeta"><strong>${r.title}</strong><span>${tc('Resolved on ', 'हल हुआ ')}${formatDate(r.resolvedAt)}</span></div>
        <div class="sla-countdown" style="color:var(--s-ok);">${tc('Resolved', 'हल हो गया')}</div>
      </div>
      <div class="qfoot">
          <span style="font-family:var(--mono); font-size:12px; color:var(--a-ink-soft);">${tc('Fixed by ', 'द्वारा ठीक किया ')}${r.assignee || tc('Officer', 'अधिकारी')}</span>
        </div>`;
    } else {
      row.innerHTML = `<div class="rank">#${i+1}</div>
        <div class="qmeta"><strong>${r.title}</strong><span>${tc('severity', 'गंभीरता')} ${r.severity.toFixed(2)} · ${r.confirms} ${tc('confirms', 'पुष्टि')}</span></div>
        <div class="sla-countdown${breached ? ' critical' : ''}" data-id="${r.id}">${slaCountdownText(r)}</div>
        <div class="sev-bar"><div class="sev-fill" style="width:${r.severity*100}%; background:${severityColor(r.severity)};"></div></div>
        <div class="qactions">
          <button class="why">${tc('Why this rank?', 'यह रैंक क्यों?')}</button>
          <button class="assign${r.assignee ? ' done' : ''}" ${r.assignee ? 'disabled' : ''}>${r.assignee ? tc('Assigned ✓', 'सौंपा ✓') : tc('Assign', 'सौंपें')}</button>
          <button class="closeit">${tc('Close', 'बंद करें')}</button>
          ${(()=>{
            const st = challengeStatusForReport(r.id);
            const label = st === 'approved' ? '🎓 In Team Builder ✓'
              : st === 'pending_review' ? '🎓 Awaiting Faculty Review'
              : st === 'rejected' ? '🎓 Rejected by Faculty'
              : '🎓 Escalate to Challenge';
            return `<button class="escalate-challenge${st ? ' done' : ''}" ${st ? 'disabled' : ''} title="Turn this into a university research challenge">${label}</button>`;
          })()}
        </div>
        <div class="why-panel">${whyPanelHtml(r)}</div>`;
    }
    queueList.appendChild(row);
  });
  renderKPIs();
  refreshAllHotspots();
  if(highlightId){
    const row = queueList.querySelector(`[data-id="${highlightId}"]`);
    if(row){
      row.classList.add('new');
      setTimeout(()=> row.classList.remove('new'), 3000);
    }
  }
}
renderQueue();

// ---------- Authority: live SLA countdown + auto-escalation ----------
// "Already escalated" must be derived from something that survives a
// Supabase realtime refresh. `report.escalated` is an in-memory-only flag —
// bootstrapReportsFromSupabase() rebuilds CIVIC.reports from DB rows on
// every insert/update from any client (including this one's own escalation
// write), which has no `escalated` column and silently drops the flag. The
// timeline IS persisted (it's part of every SB.updateReport patch here), so
// it's the reliable signal. Without this, the 1s interval below re-detects
// the same breach after every realtime refresh and escalates forever.
function isSlaEscalated(r){
  return !!r.escalated || (r.timeline||[]).some(s => s.step === 'SLA Breached — Escalated');
}
const escalationInFlight = new Set();
async function escalateReport(r){
  if(isSlaEscalated(r) || escalationInFlight.has(r.id)) return;
  escalationInFlight.add(r.id);
  try {
    await escalateReportInner(r);
  } finally {
    escalationInFlight.delete(r.id);
  }
}
async function escalateReportInner(r){
  // The in-memory `r` this was called with can be a client-resolved copy
  // (DEMO_BREACH_SOON reports get a fresh slaDeadline computed locally on
  // every page load, before the async Supabase fetch has necessarily merged
  // in this report's real, already-persisted timeline) — a client-only
  // check can race and fire again even though the DB already has this
  // escalation recorded from an earlier session. Re-check the server's
  // actual current timeline right before writing, so a race produces at
  // worst one skipped write, never a duplicate one.
  if(typeof SB !== 'undefined' && SB.client){
    try {
      const { data: fresh } = await SB.client.from('reports').select('timeline').eq('id', r.id).single();
      if(fresh && isSlaEscalated({ timeline: fresh.timeline })){
        r.escalated = true;
        r.timeline = fresh.timeline;
        return;
      }
    } catch(e){ /* select failed (offline, RLS) — fall through to local-only escalation */ }
  }
  r.escalated = true;
  ensureTimeline(r);
  r.timeline.push({
    step: 'SLA Breached — Escalated',
    stepHi: 'एसएलए उल्लंघन — अधिकारी को अग्रेषित',
    at: new Date().toISOString(),
    done: true, active: false,
    note: `Auto-escalated to ${CIVIC.departments[r.category] || 'Ward Officer'}`
  });
  pushNotification('🚨', `SLA breached: ${r.id} — escalated to ${CIVIC.departments[r.category] || 'Ward Officer'}`);

  if(typeof SB !== 'undefined' && SB.client){
    SB.updateReport(r.id, { timeline: r.timeline }).then(result=>{
      const msg = syncFailureMessage(result);
      if(msg) showToast(msg, 5000);
    });
  }
}
setInterval(()=>{
  // This queue (and its hidden DOM) exists app-wide regardless of which role
  // view is on screen, but only an authority/officer session can actually
  // write an escalation — RLS restricts report UPDATEs to the report's own
  // owner or an authority. Without this guard, a signed-in citizen sits
  // through the same SLA breach every second, each one silently retried and
  // rejected by the server, which used to surface as a scary "permission
  // denied — sign out and back in" toast for something the citizen never did.
  if(typeof currentUser === 'undefined' || !currentUser || !isOfficerRole(currentUser.role)) return;
  let newBreach = false;
  queueList.querySelectorAll('.sla-countdown').forEach(el=>{
    const report = CIVIC.reports.find(r=>r.id===el.dataset.id);
    if(!report) return;
    const breached = slaBreached(report);
    el.textContent = slaCountdownText(report);
    el.classList.toggle('critical', breached);
    el.closest('.queue-item')?.classList.toggle('critical', breached);
    if(breached && !isSlaEscalated(report)){
      escalateReport(report);
      showToast(`🚨 SLA breached: ${report.id} — escalated to Ward Officer`, 4000);
      newBreach = true;
    }
  });
  if(newBreach){
    renderKPIs();
    animateQueueReorder();
    if(currentTrack) openTrack(currentTrack);
  }
}, 1000);

// Re-renders the queue but animates rows from their old screen position to
// their new one (a FLIP transition), so a reorder is visibly a *move*, not a
// silent redraw — required so the equity-correction claim below is provable.
function animateQueueReorder(){
  const oldTops = {};
  queueList.querySelectorAll('.queue-item').forEach(el=>{
    oldTops[el.dataset.id] = el.getBoundingClientRect().top;
  });
  renderQueue();
  queueList.querySelectorAll('.queue-item').forEach(el=>{
    const oldTop = oldTops[el.dataset.id];
    if(oldTop==null) return; // a row that wasn't on screen before — nothing to animate from
    const delta = oldTop - el.getBoundingClientRect().top;
    if(!delta) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      el.style.transition = '';
      el.style.transform = '';
    }));
  });
}
const equityBtn = document.getElementById('equityBtn');
function setEquityCorrection(on){
  equityCorrectionOn = on;
  if(equityBtn){
    equityBtn.textContent = on ? 'ON' : 'OFF';
    equityBtn.classList.toggle('on', on);
  }
  animateQueueReorder();
}
equityBtn?.addEventListener('click', ()=> setEquityCorrection(!equityCorrectionOn));

async function assignReport(r){
  ensureTimeline(r);
  r.status = 'assigned';
  r.assignee = CIVIC.departments[r.category];
  const officer = currentUser?.name || 'Officer';
  const step = r.timeline.find(s=>s.step==='Assigned to Officer');
  if(step){ step.done = true; step.active = false; step.at = new Date().toISOString(); step.note = `Assigned to: ${r.assignee} (by ${officer})`; }
  pushNotification('🛠️', `${r.id} assigned to ${r.assignee}`);

  if(typeof SB !== 'undefined' && SB.client){
    SB.updateReport(r.id, { status: r.status, assignee: r.assignee, timeline: r.timeline }).then(result=>{
      const msg = syncFailureMessage(result);
      if(msg) showToast(msg, 5000);
    });
  }
}

async function resolveReport(r, proofPhoto){
  ensureTimeline(r);
  r.status = 'resolved';
  r.resolvedAt = new Date().toISOString();
  if(proofPhoto) r.proofPhoto = proofPhoto; // data URL, same as how `photo` is stored

  const officer = currentUser?.name || 'Officer';
  const step = r.timeline.find(s=>s.step==='Issue Resolved');
  if(step){ step.done = true; step.active = false; step.at = r.resolvedAt; step.note = `Resolved by ${officer}`; }
  pushNotification('✅', `Resolved: ${r.title}`);

  if(typeof SB !== 'undefined' && SB.client){
    SB.updateReport(r.id, { status: r.status, resolvedAt: r.resolvedAt, timeline: r.timeline, proofPhoto: r.proofPhoto }).then(result=>{
      const msg = syncFailureMessage(result);
      if(msg) showToast(msg, 5000);
    });
  }
}
function finishResolve(){
  renderQueue();
  renderReports(reportsFilter);
  if(typeof renderResolvedGallery === 'function') renderResolvedGallery();
  if(currentTrack && reportPendingResolve && currentTrack.id===reportPendingResolve.id) openTrack(reportPendingResolve);
  reportPendingResolve = null;
  resolvePhotoInput.value = '';
}
let reportPendingResolve = null;
const resolvePhotoInput = document.getElementById('resolvePhotoInput');
resolvePhotoInput.addEventListener('change', ()=>{
  const file = resolvePhotoInput.files[0];
  if(!reportPendingResolve) return;
  if(file){
    const reader = new FileReader();
    reader.onload = (e)=>{
      resolveReport(reportPendingResolve, e.target.result);
      finishResolve();
    };
    reader.readAsDataURL(file);
  } else {
    resolveReport(reportPendingResolve, null);
    finishResolve();
  }
});
queueList.addEventListener('click', (e)=>{
  const item = e.target.closest('.queue-item');
  if(!item) return;
  const report = CIVIC.reports.find(r=>r.id===item.dataset.id);
  if(!report) return;
  if(e.target.classList.contains('why')){
    const panel = item.querySelector('.why-panel');
    panel.classList.toggle('show');
    e.target.textContent = panel.classList.contains('show') ? 'Hide breakdown' : 'Why this rank?';
    return;
  }
  if(e.target.classList.contains('assign') && !report.assignee){
    assignReport(report);
    renderQueue();
    renderReports(reportsFilter);
    if(currentTrack && currentTrack.id===report.id) openTrack(report);
  }
  if(e.target.classList.contains('closeit')){
    // Step 8c: prompt for a proof photo before resolving.
    reportPendingResolve = report;
    resolvePhotoInput.click();
  }
  if(e.target.classList.contains('escalate-challenge') && !isEscalatedToChallenge(report.id)){
    e.target.disabled = true;
    e.target.textContent = '🎓 Sending for review…';
    createChallengeFromReport(report).then(challenge=>{
      if(challenge){
        pushNotification('🎓', `${report.id} escalated for faculty review: "${challenge.title}"`);
        showToast(`🎓 Sent to faculty for review — will appear in Team Builder once approved`, 4500);
      } else {
        showToast('⚠️ Could not escalate this report — try again.', 4000);
      }
      renderQueue();
    });
  }
});

// ---------- Authority: dashboard tabs (Queue / Wards / SLA / Map) ----------
let dashMap = null;
let dashMarkers = [];
let wardHeatmap = null;
let wardMarkers = [];

function initDashMap() {
  if (!document.getElementById('dashMapCanvas') || dashMap) return;
  dashMap = L.map('dashMapCanvas').setView([23.3441, 85.3096], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(dashMap);
}

function initWardMap() {
  if (!document.getElementById('wardMap') || wardHeatmap) return;
  wardHeatmap = L.map('wardMap').setView([23.3441, 85.3096], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(wardHeatmap);
}

function reportPinColor(r){
  if(r.status==='resolved') return 'var(--green)';
  return slaBreached(r) ? 'var(--red)' : 'var(--amber)';
}

function renderDashMap(){
  initDashMap();
  if(!dashMap) return;
  
  dashMarkers.forEach(m => dashMap.removeLayer(m));
  dashMarkers = [];
  
  CIVIC.reports.filter(r=>r.status!=='queued').forEach(r => {
    const iconHtml = `<div style="background:${reportPinColor(r)}; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3); font-size:12px;">${{Pothole:'🕳️',Garbage:'🗑️',Streetlight:'💡',Handpump:'🚰',Drainage:'🌊'}[r.category] || '📍'}</div>`;
    const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [24,24], iconAnchor: [12,12] });
    const marker = L.marker([r.lat, r.lng], { icon }).addTo(dashMap);
    
    const popupHtml = `
      <div style="width:200px; font-family:var(--font);">
        <div style="font-weight:800; font-size:14px; color:var(--ink); margin-bottom:4px; line-height:1.2;">${r.title}</div>
        <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:8px;">
          <span style="color:${reportPinColor(r)}; font-weight:700; text-transform:uppercase;">${r.status}</span>
          <span style="color:var(--muted);">${wardInfo(r.ward).name}</span>
        </div>
        ${r.photo ? `<div style="width:100%; height:110px; border-radius:8px; overflow:hidden; margin-bottom:8px; background:var(--line);"><img src="${r.photo}" style="width:100%; height:100%; object-fit:cover;"></div>` : ''}
        ${r.assignee ? `<div style="font-size:11px; color:var(--muted); margin-bottom:4px;">🛠 Assigned to: ${r.assignee}</div>` : ''}
        <button style="width:100%; padding:6px; background:var(--paper); border:1px solid var(--line); border-radius:6px; cursor:pointer; font-weight:700; font-size:11px; color:var(--ink);" onclick="openTrack(CIVIC.reports.find(rp=>rp.id==='${r.id}'))">${tc('View Details', 'विवरण देखें')}</button>
      </div>
    `;
    marker.bindPopup(popupHtml);
    dashMarkers.push(marker);
  });
  
  if (typeof refreshAllHotspots === 'function') refreshAllHotspots();
}

function renderWardMap() {
  initWardMap();
  if(!wardHeatmap) return;
  
  wardMarkers.forEach(m => wardHeatmap.removeLayer(m));
  wardMarkers = [];
  
  CIVIC.reports.filter(r=>r.status!=='queued' && r.status!=='resolved').forEach(r => {
    const circle = L.circleMarker([r.lat, r.lng], {
      radius: 8 + (r.severity * 8),
      fillColor: reportPinColor(r),
      color: reportPinColor(r),
      weight: 1,
      opacity: 1,
      fillOpacity: 0.6
    }).addTo(wardHeatmap);
    wardMarkers.push(circle);
  });
}
const dashTabsEl = document.getElementById('dashTabs');
function setDashTab(tab){
  dashTab = tab;
  dashTabsEl.querySelectorAll('.fchip').forEach(c=> c.classList.toggle('active', c.dataset.dashtab===tab));

  const grid = document.getElementById('dashGrid');
  const mapCard = document.getElementById('dashMapCard');
  const sideCol = document.getElementById('dashSideCol');
  const queueCard = document.getElementById('dashQueueCard');

  mapCard.style.display = tab==='map' ? 'block' : 'none';
  grid.style.display = tab==='map' ? 'none' : 'grid';
  queueCard.style.display = tab==='wards' ? 'none' : 'block';
  sideCol.style.display = tab==='queue' ? 'flex' : (tab==='wards' ? 'flex' : 'none');
  grid.classList.toggle('single-col', tab==='sla' || tab==='wards');

  if(tab==='map') {
    renderDashMap();
    setTimeout(() => dashMap?.invalidateSize(), 100);
  }
  if(tab==='queue' || tab==='wards') {
    renderWardMap();
    setTimeout(() => wardHeatmap?.invalidateSize(), 100);
  }
  renderQueue();
}
dashTabsEl.addEventListener('click', (e)=>{
  const chip = e.target.closest('.fchip');
  if(!chip) return;
  setDashTab(chip.dataset.dashtab);
});
// setDashTab() is what actually initializes Leaflet into #wardMap and calls
// invalidateSize() — it only ever ran from a chip click, so a dashboard that
// opens straight to the default 'queue' tab (nobody has clicked a chip yet)
// left the ward heatmap card visible but never initialized: a permanently
// blank box. Run it once for the default tab so the map exists on first load.
setDashTab(dashTab);
