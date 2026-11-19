/* ============================================================
   图见world · 交互层
   依赖 js/data.js 提供的数据，以及 d3-geo / topojson-client
   ============================================================ */
/* d3-geo 与 topojson-client 以 UMD 形式在 index.html 中加载 */
const geoNaturalEarth1 = d3.geoNaturalEarth1;
const geoPath = d3.geoPath;
const geoGraticule10 = d3.geoGraticule10;
const feature = topojson.feature;

let proj = geoNaturalEarth1();
let path = geoPath(proj);
let landGeo = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

/* ================= 图例 ================= */
function renderLegend(){
  legend.innerHTML = `
    <label class="legend-toggle">
      <input type="checkbox" id="placeToggle">
      <span class="lt-switch" aria-hidden="true"></span>
      <span>显示地名</span>
    </label>
    <div class="legend-title">事件分类</div>` +
    Object.entries(CATS).map(([k,v])=>
      `<div class="legend-row"><span class="swatch" style="background:${v.color}"></span>${v.label}</div>`
    ).join('') + `
    <div class="legend-title" style="margin-top:12px">年代疆域示意</div>
    <div class="legend-row"><span class="swatch" style="background:rgba(77,122,82,.45)"></span>势力扩张</div>
    <div class="legend-row"><span class="swatch" style="background:rgba(156,51,39,.45)"></span>解体 / 割让</div>
    <div class="legend-row"><span class="swatch" style="background:rgba(168,127,53,.45)"></span>政权存续</div>`;
  document.getElementById('placeToggle').addEventListener('change', e=>{
    state.showPlaces = e.target.checked;
    drawMarkers();
  });
}

/* ================= 分期 ================= */
function periodOf(year){
  return PERIODS.find(p=>year>=p[0]&&year<=p[1]) || PERIODS[PERIODS.length-1];
}

/* ================= 搜索 ================= */
function treatyOf(ev){
  return ev ? (TREATY[ev.t] || null) : null;
}

function eventHay(ev){
  const idx = EVENTS.indexOf(ev);
  const ex = EXAM[String(idx)] || {};
  const kp = (KP[String(idx)] || []).join(' ');
  const tr = treatyOf(ev);
  const tre = tr ? (tr.name + ' ' + tr.terms.join(' ') + ' ' + (tr.note || '')) : '';
  return (ev.t + ' ' + ev.p + ' ' + ev.d + ' ' + (ev.wiki || '') + ' ' +
    (ex.people || '') + ' ' + (ex.status || '') + ' ' + (ex.impact || '') + ' ' + kp + ' ' + tre
  ).toLowerCase();
}

function searchEvents(q){
  const yearM = q.match(/(?:18|19|20)\d{2}/);
  const year = yearM ? Number(yearM[0]) : null;
  const text = q.replace(/(?:18|19|20)\d{2}/g,'').replace(/[+＋,，、·]/g,' ').trim();
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  return EVENTS.filter(ev=>{
    if (year && ev.y!==year) return false;
    if (!words.length) return true;
    const hay = eventHay(ev);
    return words.every(w=>hay.includes(w));
  }).sort((a,b)=>a.y-b.y || a.t.localeCompare(b.t,'zh'));
}

function currentEvents(){
  if (state.query.trim()) return searchEvents(state.query);
  if (state.year === 'all') return EVENTS.slice().sort((a,b)=>a.y-b.y || a.t.localeCompare(b.t,'zh'));
  return EVENTS.filter(e=>e.y===state.year);
}

function nearestEvents(n=5){
  return EVENTS.slice()
    .sort((a,b)=>Math.abs(a.y-state.year)-Math.abs(b.y-state.year) || a.y-b.y)
    .slice(0,n);
}

/* ================= 下拉菜单 ================= */
function renderDropdown(){
  let html = `<button class="dd-opt ${state.year==='all'?'active':''}" data-year="all" role="option" aria-selected="${state.year==='all'}"><span>全部事件</span><span class="dd-count">${EVENTS.length} 起</span></button>`;
  PERIODS.forEach(p=>{
    const years = YEARS.filter(y=>y>=p[0]&&y<=p[1]);
    if (!years.length) return;
    html += `<div class="dd-group-title">${p[2]}</div>`;
    years.forEach(y=>{
      const n = EVENTS.filter(e=>e.y===y).length;
      html += `<button class="dd-opt ${state.year===y?'active':''}" data-year="${y}" role="option" aria-selected="${state.year===y}"><span>${y} 年</span><span class="dd-count">${n} 起</span></button>`;
    });
  });
  ddPop.innerHTML = html;
  ddPop.querySelectorAll('.dd-opt').forEach(b=>{
    b.addEventListener('click', ()=>{
      setYear(b.dataset.year==='all' ? 'all' : Number(b.dataset.year));
      closeDD();
    });
  });
}

function openDD(){
  state.ddOpen = true;
  ddPop.classList.add('show');
  ddBtn.setAttribute('aria-expanded','true');
}
function closeDD(){
  state.ddOpen = false;
  ddPop.classList.remove('show');
  ddBtn.setAttribute('aria-expanded','false');
}

function setYear(year){
  state.year = year;
  state.selected = null;
  if (year === 'all'){
    ddLabel.textContent = '全部事件';
    eraDesc.innerHTML = `<h2>全部年代</h2><p>纵览 ${YEAR_MIN}—${YEAR_MAX} 年间世界各地收录的变革、冲突与演进。</p>`;
  } else {
    const p = periodOf(year);
    ddLabel.textContent = `${year} 年 · ${p[2]}`;
    eraDesc.innerHTML = `<h2>${p[2]}</h2><p>${p[3]}</p>`;
  }
  renderDropdown();
  refresh();
}

/* ================= 地图绘制 ================= */
function bboxFeature(b){
  const [x0,y0,x1,y1] = b;
  const pts = [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[(x0+x1)/2,(y0+y1)/2]];
  return { type:'FeatureCollection', features: pts.map(c=>({ type:'Feature', geometry:{ type:'Point', coordinates:c } })) };
}

function resize(){
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if(!w || !h) return;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const atlas = ATLAS.find(a=>a.id===state.atlas) || ATLAS[0];
  const base = atlas.bbox ? bboxFeature(atlas.bbox) : (landGeo || { type:'Sphere' });
  proj = geoNaturalEarth1().fitExtent([[10,10],[w-10,h-10]], base);
  path = geoPath(proj);
  drawLand();
  drawRealms();
  drawMarkers();
  applyTransform();
}

function setAtlas(id){
  state.atlas = id;
  state.k = 1; state.tx = 0; state.ty = 0;
  resize();
}

function drawLand(){
  gGraticule.innerHTML = '';
  gLand.innerHTML = '';
  if (!landGeo) {
    const sp = document.createElementNS('http://www.w3.org/2000/svg','path');
    sp.setAttribute('class','sphere');
    sp.setAttribute('d', path({type:'Sphere'}));
    gGraticule.appendChild(sp);
    const gr = document.createElementNS('http://www.w3.org/2000/svg','path');
    gr.setAttribute('class','graticule');
    gr.setAttribute('d', path(geoGraticule10()));
    gGraticule.appendChild(gr);
    return;
  }
  const gr = document.createElementNS('http://www.w3.org/2000/svg','path');
  gr.setAttribute('class','graticule');
  gr.setAttribute('d', path(geoGraticule10()));
  gGraticule.appendChild(gr);
  landGeo.features.forEach(f=>{
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('class','land');
    p.setAttribute('d', path(f));
    gLand.appendChild(p);
  });
}

function drawRealms(){
  gRealms.innerHTML = '';
  if(state.year==='all' || !landGeo) return;
  const y = state.year;
  REALMS.filter(r=>y>=r.from && y<=r.to).forEach(r=>{
    const [x0,y0,x1,y1] = r.bbox;
    const ring = [[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('class','realm '+r.kind);
    p.setAttribute('d', path({type:'Polygon', coordinates:[ring]}));
    p.setAttribute('data-name', r.name);
    gRealms.appendChild(p);
  });
}

function drawMarkers(){
  const data = currentEvents();
  gMarkers.innerHTML = '';
  const cluster = {};
  data.forEach(ev=>{
    const pos = proj([ev.lng, ev.lat]);
    if (!pos) return;
    const key = pos[0].toFixed(1)+','+pos[1].toFixed(1);
    const n = (cluster[key] = (cluster[key]||0)+1);
    let [x,y] = pos;
    if (n > 1){
      const ang = (n-1) * 2.399;            // 黄金角环形散开
      x += Math.cos(ang) * 9;
      y += Math.sin(ang) * 9;
    }
    const cat = CATS[ev.c];
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','marker' + (state.selected===ev?' active':''));
    g.setAttribute('transform', `translate(${x},${y})`);
    g.dataset.idx = EVENTS.indexOf(ev);

    const halo = document.createElementNS('http://www.w3.org/2000/svg','circle');
    halo.setAttribute('class','halo'); halo.setAttribute('r', 6);
    const dot = document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('class','dot'); dot.setAttribute('r', 3.2);
    dot.setAttribute('fill', cat.color);
    g.append(halo, dot);

    if (state.showPlaces && state.selected!==ev){
      const region = ev.p.includes(' · ') ? ev.p.split(' · ')[0] : ev.p;
      const pl = document.createElementNS('http://www.w3.org/2000/svg','text');
      pl.setAttribute('class','place-label');
      pl.setAttribute('x', 8); pl.setAttribute('y', 3);
      pl.textContent = region;
      g.appendChild(pl);
    }

    if (state.selected===ev){
      halo.setAttribute('r', 8); dot.setAttribute('r', 4.5);
      const lb = document.createElementNS('http://www.w3.org/2000/svg','text');
      lb.setAttribute('class','marker-label');
      lb.setAttribute('x', 10); lb.setAttribute('y', 4);
      lb.textContent = `${ev.y} ${ev.t}`;
      g.appendChild(lb);
    }

    g.addEventListener('pointerenter', ()=>showTooltip(ev, g));
    g.addEventListener('pointerleave', hideTooltip);
    g.addEventListener('click', (e)=>{ e.stopPropagation(); openModal(ev, true); });
    gMarkers.appendChild(g);
  });
}

/* ================= 列表 ================= */
function renderList(){
  const searching = state.query.trim().length > 0;
  const data = currentEvents();
  listCount.textContent = searching ? `搜索 ${data.length} 起` : `${data.length} 起`;
  yearCount.textContent = EVENTS.length;

  if (!data.length){
    const hint = searching
      ? `未找到与「${esc(state.query.trim())}」相关的事件，可换地区名、事件名或四位年份试试。`
      : `${state.year} 年暂无收录事件，以下为邻近年份的事件，点击查看详情。`;
    listEl.innerHTML = `<div class="list-hint">${hint}</div>` +
      (searching ? '' : nearestEvents(5).map(ev=>itemHtml(ev, true)).join(''));
  } else {
    listEl.innerHTML = data.map(ev=>itemHtml(ev, false)).join('');
  }
  listEl.querySelectorAll('.event-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ev = EVENTS[Number(btn.dataset.idx)];
      openModal(ev, true);
    });
  });
}

function itemHtml(ev, isNearest){
  const cat = CATS[ev.c];
  const nearestTag = isNearest && ev.y!==state.year ? `<span class="ei-cat">邻近 ${ev.y} 年</span>` : '';
  return `<button class="event-item ${state.selected===ev?'active':''}" data-idx="${EVENTS.indexOf(ev)}">
    <div class="ei-top"><span class="ei-year">${ev.y}</span><span class="ei-cat" style="color:${cat.color}">${cat.label}</span>${nearestTag}</div>
    <div class="ei-title">${esc(ev.t)}</div>
    <div class="ei-place">${esc(ev.p)}</div>
  </button>`;
}

function refresh(){
  renderList();
  drawRealms();
  drawMarkers();
}

/* ================= 弹窗 ================= */
function openModal(ev, fly){
  state.selected = ev;
  refresh();
  const cat = CATS[ev.c];
  const idx = EVENTS.indexOf(ev);
  const media = MEDIA[String(idx)] || null;
  document.getElementById('mYear').textContent = `${ev.y} 年`;
  document.getElementById('mTitle').textContent = ev.t;
  document.getElementById('mPlace').innerHTML = `${esc(ev.p)}<span class="m-cat" style="background:${cat.color}">${cat.label}</span>`;
  document.getElementById('mDesc').textContent = ev.d;
  const kp = KP[String(idx)] || [];
  document.getElementById('mKp').innerHTML = kp.length
    ? `<div class="kp-title">知识点</div><ul class="kp-list">${kp.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`
    : '';

  const ex = EXAM[String(idx)] || null;
  const tr = treatyOf(ev);
  document.getElementById('mExam').innerHTML = (ex || tr) ? `
    <div class="exam-block">${ex ? `
      <div class="exam-row"><span class="exam-tag">主要人物</span><span class="exam-val">${esc(ex.people)}</span></div>
      <div class="exam-row"><span class="exam-tag">历史地位</span><span class="exam-val">${esc(ex.status)}</span></div>
      <div class="exam-row"><span class="exam-tag">历史影响</span><span class="exam-val">${esc(ex.impact)}</span></div>` : ''}
    </div>
    ${tr ? `<div class="treaty-block">
      <div class="treaty-title">${esc(tr.name)} · 条约内容</div>
      <ul class="treaty-list">${tr.terms.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      ${tr.note ? `<div class="treaty-note">${esc(tr.note)}</div>` : ''}
    </div>` : ''}` : '';

  const q = encodeURIComponent(ev.t);
  const wikiTitle = encodeURIComponent(ev.wiki || ev.t);
  const videoHref = media
    ? `https://www.bilibili.com/video/${media.bv}`
    : `https://search.bilibili.com/all?keyword=${q}%20历史`;
  document.getElementById('mRefs').innerHTML = `
    <a href="https://baike.baidu.com/search?word=${q}" target="_blank" rel="noopener"><span class="ref-dot" style="background:#8a7a4d"></span>百度百科词条</a>
    <a href="https://image.baidu.com/search/index?word=${q}" target="_blank" rel="noopener"><span class="ref-dot" style="background:#3d6e8f"></span>图片参考</a>
    <a href="${videoHref}" target="_blank" rel="noopener"><span class="ref-dot" style="background:#9c3327"></span>${media?'查看原视频':'相关视频'}</a>
    <a href="https://zh.wikipedia.org/wiki/${wikiTitle}" target="_blank" rel="noopener"><span class="ref-dot" style="background:#7a5a8c"></span>维基百科(备用)</a>`;

  overlay.classList.add('show');
  renderMedia(ev, media);
  if (fly) centerOn(ev);
}

function closeModal(){
  overlay.classList.remove('show');
  state.selected = null;
  stopModalMedia();
  refresh();
}

function stopModalMedia(){
  const box = document.getElementById('mMedia');
  if (!box) return;
  box.querySelectorAll('iframe').forEach(f=>{ f.src = 'about:blank'; });
  box.innerHTML = '';
}

function renderMedia(ev, media){
  const box = document.getElementById('mMedia');
  if (!media){
    box.innerHTML = `<div class="media-ph">
      <svg viewBox="0 0 64 64" width="42" height="42" fill="none" stroke="#8f7d57" stroke-width="2" aria-hidden="true">
        <rect x="10" y="16" width="44" height="32" rx="3"/>
        <circle cx="22" cy="27" r="3"/>
        <path d="M14 44l12-10 8 7 8-6 8 9"/>
      </svg>
      <div>该事件暂无内嵌照片与视频<br>可通过下方图片、视频链接查阅相关资料</div>
    </div>`;
    return;
  }
  box.innerHTML = `
    <div class="m-photo" id="mPhoto">
      <img src="${esc(media.pic)}" alt="${esc(media.vt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()">
      <button class="m-play" id="mPlay" aria-label="播放相关视频">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
      </button>
      <a class="media-attr" href="https://www.bilibili.com/video/${media.bv}" target="_blank" rel="noopener">参考图片 · UP主：${esc(media.au)}</a>
    </div>
    <div class="m-video" id="mVideo" hidden>
      <iframe src="https://player.bilibili.com/player.html?bvid=${media.bv}&autoplay=0&danmaku=0&high_quality=1" title="${esc(media.vt)}" loading="lazy" allowfullscreen></iframe>
    </div>
    <div class="m-cap">${esc(media.vt)} · ${esc(media.au)}</div>`;

  const play = box.querySelector('#mPlay');
  const photo = box.querySelector('#mPhoto');
  const video = box.querySelector('#mVideo');
  play.addEventListener('click', ()=>{
    photo.hidden = true;
    video.hidden = false;
  });
}

document.getElementById('modalClose').addEventListener('click', closeModal);
overlay.addEventListener('click', (e)=>{ if (e.target===overlay) closeModal(); });

/* ================= 平移缩放 ================= */
function applyTransform(){
  viewport.setAttribute('transform', `translate(${state.tx},${state.ty}) scale(${state.k})`);
}

function zoomAt(cx, cy, factor){
  const k2 = Math.min(6, Math.max(1, state.k * factor));
  if (k2 === state.k) return;
  const px = (cx - state.tx) / state.k;
  const py = (cy - state.ty) / state.k;
  state.tx = cx - px * k2;
  state.ty = cy - py * k2;
  state.k = k2;
  applyTransform();
}

function centerOn(ev){
  const pos = proj([ev.lng, ev.lat]);
  if (!pos) return;
  const [x,y] = pos;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  const k2 = Math.max(state.k, 1.8);
  const tx2 = w/2 - x*k2, ty2 = h/2 - y*k2;
  if (reducedMotion){
    state.k=k2; state.tx=tx2; state.ty=ty2; applyTransform(); return;
  }
  const from = {k:state.k, tx:state.tx, ty:state.ty};
  const start = performance.now(), dur = 300;
  function step(now){
    const t = Math.min(1, (now-start)/dur);
    const e = 1 - Math.pow(1-t, 3);
    state.k  = from.k  + (k2-from.k)*e;
    state.tx = from.tx + (tx2-from.tx)*e;
    state.ty = from.ty + (ty2-from.ty)*e;
    applyTransform();
    if (t<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* 拖拽 */
let dragging = false, sx=0, sy=0, stx=0, sty=0;
let downX=0, downY=0, moved=false;
svg.addEventListener('pointerdown', (e)=>{
  dragging = true;
  svg.classList.add('dragging');
  svg.setPointerCapture(e.pointerId);
  sx = e.clientX; sy = e.clientY; stx = state.tx; sty = state.ty;
  downX = e.clientX; downY = e.clientY; moved = false;
});
svg.addEventListener('pointermove', (e)=>{
  if (!dragging) return;
  if (Math.hypot(e.clientX-downX, e.clientY-downY) > 5) moved = true;
  state.tx = stx + (e.clientX - sx);
  state.ty = sty + (e.clientY - sy);
  applyTransform();
});
svg.addEventListener('pointerup', ()=>{ dragging=false; svg.classList.remove('dragging'); });
svg.addEventListener('pointercancel', ()=>{ dragging=false; svg.classList.remove('dragging'); });

/* 点击陆地空白：命中最近事件弹出 */
function nearestEvent(lng, lat){
  const data = currentEvents();
  let best=null, bd=Infinity;
  data.forEach(ev=>{
    const dx=ev.lng-lng, dy=ev.lat-lat, d=dx*dx+dy*dy;
    if(d<bd){bd=d;best=ev;}
  });
  return { ev:best, dist:Math.sqrt(bd) };
}
svg.addEventListener('click', (e)=>{
  if (moved) return;
  if (e.target.closest('.marker')) return;
  const r = wrap.getBoundingClientRect();
  const pt = proj.invert ? proj.invert([e.clientX-r.left, e.clientY-r.top]) : null;
  if (!pt || !isFinite(pt[0]) || !isFinite(pt[1])) return;
  const {ev, dist} = nearestEvent(pt[0], pt[1]);
  if (ev && dist < 13) openModal(ev, true);
});

/* 滚轮 */
wrap.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const rect = wrap.getBoundingClientRect();
  zoomAt(e.clientX-rect.left, e.clientY-rect.top, Math.exp(-e.deltaY*0.0012));
}, { passive:false });

/* 缩放按钮 */
document.getElementById('zoomIn').addEventListener('click', ()=>{
  const r = wrap.getBoundingClientRect();
  zoomAt(r.width/2, r.height/2, 1.35);
});
document.getElementById('zoomOut').addEventListener('click', ()=>{
  const r = wrap.getBoundingClientRect();
  zoomAt(r.width/2, r.height/2, 1/1.35);
});
document.getElementById('zoomReset').addEventListener('click', ()=>{
  state.k=1; state.tx=0; state.ty=0; applyTransform();
});
svg.addEventListener('dblclick', (e)=>{
  const r = wrap.getBoundingClientRect();
  zoomAt(e.clientX-r.left, e.clientY-r.top, 1.5);
});

/* ================= 下拉与搜索事件 ================= */
ddBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  state.ddOpen ? closeDD() : openDD();
});
document.addEventListener('click', (e)=>{
  if (!dd.contains(e.target)) closeDD();
});
searchInput.addEventListener('input', ()=>{
  state.query = searchInput.value;
  state.selected = null;
  searchClear.classList.toggle('show', searchInput.value.length>0);
  refresh();
});
searchClear.addEventListener('click', ()=>{
  searchInput.value = '';
  state.query = '';
  searchClear.classList.remove('show');
  state.selected = null;
  refresh();
  searchInput.focus();
});
document.addEventListener('keydown', (e)=>{
  if (e.key==='Escape'){ finishIntro(); closeDD(); if (overlay.classList.contains('show')) closeModal(); }
});

/* ================= 提示框 ================= */
function showTooltip(ev, g){
  const cat = CATS[ev.c];
  tooltip.innerHTML = `<div><span class="tt-year">${ev.y}</span>${esc(ev.t)}</div><div style="color:#c9b98f">${esc(ev.p)} · ${cat.label}</div>`;
  tooltip.hidden = false;
  const r = wrap.getBoundingClientRect();
  const gr = g.getBoundingClientRect();
  let left = gr.left - r.left + 12, top = gr.top - r.top - 10;
  if (left + 220 > r.width) left = gr.left - r.left - 220;
  tooltip.style.left = left+'px';
  tooltip.style.top = top+'px';
  tooltip.classList.add('show');
}
function hideTooltip(){ tooltip.classList.remove('show'); tooltip.hidden = true; }

/* ================= 边界数据加载 ================= */
async function loadBoundaries(){
  try {
    const res = await fetch('https://fastly.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    if (!res.ok) throw new Error(res.status);
    const topo = await res.json();
    landGeo = feature(topo, topo.objects.countries);
  } catch (err) {
    mapNote.hidden = false;
  }
  resize();
}

/* ================= 开场动画（15 秒，可跳过） ================= */
const introEl = document.getElementById('intro');
const introTimeline = document.getElementById('introTimeline');
const introSkip = document.getElementById('introSkip');
let introDone = false;
const introTimers = [];

PERIODS.forEach((p, i)=>{
  const chip = document.createElement('span');
  chip.className = 'intro-chip';
  chip.textContent = `${p[0]}—${p[1]} ${p[2]}`;
  introTimeline.appendChild(chip);
  introTimers.push(setTimeout(()=>chip.classList.add('on'), 2600 + i*1050));
});

function finishIntro(){
  if (introDone) return;
  introDone = true;
  introTimers.forEach(clearTimeout);
  if (!introEl) return;
  introEl.classList.add('out');
  setTimeout(()=>{ introEl.remove(); resize(); }, 650);
  resize();
}

introSkip.addEventListener('click', finishIntro);
introEl.addEventListener('click', (e)=>{ if (e.target===introEl) finishIntro(); });
introTimers.push(setTimeout(finishIntro, 15000));
if (reducedMotion) finishIntro();

/* ================= 答题模式 ================= */
const $ = id => document.getElementById(id);
const mainEl = document.querySelector('main');
const quizPanel = $('quizPanel');
const reviewPanel = $('reviewPanel');
const modeMapBtn = $('modeMap'), modeQuizBtn = $('modeQuiz'), modeReviewBtn = $('modeReview');

const quiz = { questions: [], idx: 0, score: 0, answers: [], locked: false };

/* ================= 主题课件 PPT ================= */
const themeOverlay = $('themeOverlay');
const themeStage = $('themeStage'), themePager = $('themePager'), themeBar = $('themeBar');
const themePrev = $('themePrev'), themeNext = $('themeNext'), themeTag = $('themeTag');
const themeInput = $('themeInput'), themeGo = $('themeGo');
const themeHint = document.querySelector('.theme-hint');
let themeDeck = null, themeIdx = 0;
const ZOOMS = [1, 1.15, 1.3];
let themeZoomIdx = 0;
let themeFs = false;

function setThemeFs(on){
  themeFs = on;
  themeOverlay.classList.toggle('fs', on);
  $('themeFs').textContent = on ? '退出全屏' : '全屏放映';
  if(on){
    if(themeOverlay.requestFullscreen) themeOverlay.requestFullscreen().catch(()=>{});
  } else if(document.fullscreenElement){
    document.exitFullscreen().catch(()=>{});
  }
}
function toggleThemeFs(){ setThemeFs(!themeFs); }
document.addEventListener('fullscreenchange', ()=>{
  if(!document.fullscreenElement && themeFs) setThemeFs(false);
});

function applyThemeZoom(){
  const z = ZOOMS[themeZoomIdx];
  themeStage.style.zoom = z;
  $('themeZoomVal').textContent = Math.round(z*100) + '%';
}
function themeZoom(dir){
  themeZoomIdx = Math.min(ZOOMS.length-1, Math.max(0, themeZoomIdx + dir));
  applyThemeZoom();
}
function themeNav(dir){
  if(!themeDeck) return;
  const total = 1 + themeDeck.slides.length;
  const next = themeIdx + dir;
  if(next < 0 || next > total-1) return;
  themeIdx = next; renderTheme();
}

function matchTheme(q){
  q = q.toLowerCase().trim();
  let best = null, bs = 0;
  THEMES.forEach(t=>{
    let s = 0;
    t.keys.forEach(k=>{ if(q.includes(k.toLowerCase())) s += k.length; });
    if(s > bs){ bs = s; best = t; }
  });
  return bs > 0 ? best : null;
}

function relatedChips(related){
  const items = related.map(i=>EVENTS[i]).filter(Boolean);
  if(!items.length) return '';
  return `<div class="tp-related">
    <div class="tr-title">地图关联事件</div>
    <div class="tp-chips">${items.map(ev=>{
      const i = EVENTS.indexOf(ev);
      return `<button class="tp-chip" data-ev="${i}" type="button">${ev.y} · ${esc(ev.t)}</button>`;
    }).join('')}</div></div>`;
}

function renderTheme(){
  const deck = themeDeck;
  const total = 1 + deck.slides.length;
  themeTag.textContent = '主题课件 · ' + deck.name;
  themePager.textContent = `${themeIdx+1} / ${total}`;
  themeBar.style.width = ((themeIdx+1)/total*100) + '%';
  themePrev.disabled = themeIdx === 0;
  themeNext.textContent = themeIdx === total-1 ? '完成' : '下一页';
  if(themeIdx === 0){
    const c = deck.cover;
    themeStage.innerHTML = `
      <div class="tp-cover">
        <div class="tp-eyebrow">${esc(deck.name)}</div>
        <h2>${esc(c.title)}</h2>
        <div class="tp-sub">${esc(c.sub)}</div>
        <p class="tp-lead">${esc(c.lead)}</p>
        <figure class="tp-art">${themeArt(deck.id)}<figcaption>史料示意图 · ${esc(deck.name)}（非真实历史照片）</figcaption></figure>
      </div>`;
  } else {
    const s = deck.slides[themeIdx-1];
    themeStage.innerHTML = `
      <div class="tp-slide">
        <h3>${esc(s.h)}</h3>
        <ul class="tp-points">${s.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>
        <p class="tp-body">${esc(s.body)}</p>
        ${s.notes?`<p class="tp-notes">补充：${esc(s.notes)}</p>`:''}
        ${relatedChips(s.related || deck.related)}
      </div>`;
  }
  themeStage.scrollTop = 0;
  themeStage.querySelectorAll('.tp-chip').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ev = EVENTS[Number(btn.dataset.ev)];
      closeTheme();
      openModal(ev);
    });
  });
}

function openTheme(deck){
  themeDeck = deck; themeIdx = 0; themeZoomIdx = 0;
  applyThemeZoom();
  renderTheme();
  themeOverlay.hidden = false;
}
function closeTheme(){ if(themeFs) setThemeFs(false); themeOverlay.hidden = true; themeDeck = null; }

function runThemeQuery(){
  const q = themeInput.value.trim();
  if(!q) return;
  const deck = matchTheme(q);
  if(deck){ openTheme(deck); return; }
  themeHint.textContent = '未找到对应主题课件，可试试：长征、抗战、一战、二战、鸦片战争、独立运动、科技发明、十月革命、新中国。';
  setTimeout(()=>{ themeHint.textContent = '输入历史主题，自动识别并放映配套学习课件。'; }, 2600);
}

themeGo.addEventListener('click', runThemeQuery);
themeInput.addEventListener('keydown', e=>{ if(e.key==='Enter') runThemeQuery(); });
$('themeClose').addEventListener('click', closeTheme);
$('themeFs').addEventListener('click', toggleThemeFs);
themePrev.addEventListener('click', ()=>themeNav(-1));
themeNext.addEventListener('click', ()=>{
  if(!themeDeck) return;
  const total = 1 + themeDeck.slides.length;
  if(themeIdx < total-1) themeNav(1);
  else closeTheme();
});
$('themeZoomOut').addEventListener('click', ()=>themeZoom(-1));
$('themeZoomIn').addEventListener('click', ()=>themeZoom(1));
themeOverlay.addEventListener('click', e=>{ if(e.target===themeOverlay) closeTheme(); });
document.addEventListener('keydown', e=>{
  if(themeOverlay.hidden) return;
  if(e.key==='Escape') closeTheme();
  else if(e.key==='ArrowLeft'){ e.preventDefault(); themeNav(-1); }
  else if(e.key==='ArrowRight'){ e.preventDefault(); themeNav(1); }
});

function regionOf(ev){ return ev.p.includes(' · ') ? ev.p.split(' · ')[0] : ev.p; }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function filterPool(){
  const region=$('quizRegion').value, cat=$('quizCat').value, era=$('quizEra').value;
  return EVENTS.map((ev,i)=>({ev,i})).filter(({ev})=>{
    if(region==='china' && !ev.p.startsWith('中国')) return false;
    if(region==='world' && ev.p.startsWith('中国')) return false;
    if(cat!=='all' && ev.c!==cat) return false;
    if(era!=='all'){
      const pi=PERIODS.findIndex(x=>ev.y>=x[0]&&ev.y<=x[1]);
      if(pi!==Number(era)) return false;
    }
    return true;
  }).map(x=>x.i);
}

function examOf(i){ return EXAM[String(i)] || {}; }
function primaryPeople(people){
  if(!people) return '';
  return people.split(/[；;]/)[0].trim();
}

/* 题型：考点辨析优先，兼顾基础记忆 */
const QUIZ_TYPES = ['people','status','impact','kp','region','cat','year'];

function makeQuestion(i, type){
  const ev = EVENTS[i], ex = examOf(i), kp = KP[String(i)] || [];
  switch(type){
    case 'people': {
      const p = primaryPeople(ex.people); if(!p) return null;
      return { type, stem:`下列哪位人物与「${ev.t}」直接相关？`, correct:p,
        distKey:e=>primaryPeople(examOf(EVENTS.indexOf(e)).people) };
    }
    case 'status': {
      if(!ex.status) return null;
      return { type, stem:`「${ev.t}」的历史地位，下列表述正确的是？`, correct:ex.status,
        distKey:e=>examOf(EVENTS.indexOf(e)).status };
    }
    case 'impact': {
      if(!ex.impact) return null;
      return { type, stem:`「${ev.t}」带来的主要历史影响是？`, correct:ex.impact,
        distKey:e=>examOf(EVENTS.indexOf(e)).impact };
    }
    case 'kp': {
      if(!kp.length) return null;
      return { type, stem:`关于「${ev.t}」，下列哪一说法正确？`, correct:kp[0],
        distKey:e=>(KP[String(EVENTS.indexOf(e))]||[''])[0] };
    }
    case 'region':
      return { type, stem:`「${ev.t}」发生在哪个国家 / 地区？`, correct:regionOf(ev),
        distKey:e=>regionOf(e) };
    case 'cat':
      return { type, stem:`「${ev.t}」属于下列哪一类别？`, correct:CATS[ev.c].label,
        distKey:e=>CATS[e.c].label };
    case 'year':
      return { type, stem:`「${ev.t}」发生于哪一年？`, correct:String(ev.y),
        distKey:e=>String(e.y) };
  }
  return null;
}

function availableTypes(i){
  return QUIZ_TYPES.filter(t=>makeQuestion(i,t));
}

function buildQuestions(count){
  const pool = filterPool();
  const idxs = shuffle(pool).slice(0, Math.min(count, pool.length));
  const othersAll = EVENTS.map((_,k)=>k);
  // 题型洗牌后循环分配，避免同类题连续出现
  const typeRot = shuffle([...QUIZ_TYPES]);
  const qs = [];
  idxs.forEach((i, n)=>{
    const ev = EVENTS[i];
    const avail = availableTypes(i);
    let t = typeRot[n % typeRot.length];
    if(!avail.includes(t)) t = avail[Math.floor(Math.random()*avail.length)];
    let picked = makeQuestion(i,t) || makeQuestion(avail[0]);
    if(!picked) return;

    const seen = new Set([picked.correct]);
    const dist = [];
    for(const k of shuffle(othersAll.filter(k=>k!==i))){
      const v = picked.distKey(EVENTS[k]);
      if(!v || seen.has(v)) continue;
      seen.add(v); dist.push(v);
      if(dist.length===3) break;
    }
    // 干扰项不足时回退同字段补充（年份/地区等兜底）
    if(dist.length<3){
      const fb = picked.type==='year' ? e=>String(e.y) : picked.type==='region' ? e=>regionOf(e) : picked.distKey;
      for(const k of shuffle(othersAll.filter(k=>k!==i))){
        const v = fb(EVENTS[k]);
        if(!v || seen.has(v)) continue;
        seen.add(v); dist.push(v);
        if(dist.length===3) break;
      }
    }
    const options = shuffle([{text:picked.correct,correct:true}, ...dist.map(t=>({text:t,correct:false}))]);
    qs.push({ i, ev, type:picked.type, stem:picked.stem, options,
      explain: KP[String(i)] || [], desc: ev.d, exam: examOf(i) });
  });
  return qs;
}

function showPanel(name){ ['quizStart','quizPlay','quizResult'].forEach(p=>$(p).hidden = p!==name); }

function beginQuiz(){
  const n = parseInt($('quizCount').value, 10);
  const pool = filterPool();
  if(!pool.length){
    alert('当前所选范围内暂无收录事件，请调整地区、分类或年代范围。');
    return;
  }
  quiz.questions = buildQuestions(n);
  quiz.idx = 0; quiz.score = 0; quiz.answers = [];
  clearQa();
  showPanel('quizPlay');
  renderQuestion();
}

function renderQuestion(){
  quiz.locked = false;
  const q = quiz.questions[quiz.idx];
  $('quizProgress').textContent = `第 ${quiz.idx+1} / ${quiz.questions.length} 题`;
  $('quizScore').textContent = `得分 ${quiz.score}`;
  $('quizStem').textContent = q.stem;
  $('quizExplain').hidden = true;
  $('quizNext').hidden = true;
  const keys = ['A','B','C','D'];
  $('quizOptions').innerHTML = q.options.map((o,k)=>`
    <button class="quiz-option" data-k="${k}">
      <span class="qo-key">${keys[k]}</span><span>${esc(o.text)}</span>
    </button>`).join('');
  [...$('quizOptions').children].forEach(btn=>{
    btn.addEventListener('click', ()=>answerQuestion(Number(btn.dataset.k), btn));
  });
}

function answerQuestion(k, btn){
  if(quiz.locked) return;
  quiz.locked = true;
  const q = quiz.questions[quiz.idx];
  const picked = q.options[k];
  const isRight = picked.correct;
  if(isRight) quiz.score++;
  quiz.answers.push({ q, picked: picked.text, isRight });
  [...$('quizOptions').children].forEach((b,bi)=>{
    b.classList.add('locked');
    if(q.options[bi].correct) b.classList.add('correct');
  });
  if(!isRight) btn.classList.add('wrong');
  $('quizScore').textContent = `得分 ${quiz.score}`;
  const kpHtml = q.explain.map(b=>`<li>${esc(b)}</li>`).join('');
  const ex = q.exam || {};
  const examRows = [
    ex.people ? ['主要人物', primaryPeople(ex.people)] : null,
    ex.status ? ['历史地位', ex.status] : null,
    ex.impact ? ['历史影响', ex.impact] : null
  ].filter(Boolean);
  const examHtml = examRows.map(([tag,val])=>`
    <div class="exam-row"><span class="exam-tag">${tag}</span><span class="exam-val">${esc(val)}</span></div>`).join('');
  $('quizExplain').innerHTML = `
    <div class="qe-title">${isRight?'回答正确':'回答错误'}</div>
    <div>${esc(q.desc)}</div>
    ${examHtml?`<div class="exam-block" style="margin-top:8px">${examHtml}</div>`:''}
    ${kpHtml?`<ul class="kp-list" style="margin-top:6px">${kpHtml}</ul>`:''}`;
  $('quizExplain').hidden = false;
  $('quizNext').hidden = false;
  $('quizNext').textContent = quiz.idx===quiz.questions.length-1 ? '查看结果' : '下一题';
}

function nextQuestion(){
  if(quiz.idx < quiz.questions.length-1){ quiz.idx++; renderQuestion(); }
  else renderResult();
}

function renderResult(){
  showPanel('quizResult');
  const total = quiz.questions.length, right = quiz.score;
  const rate = Math.round(right/total*100);
  const wrong = quiz.answers.filter(a=>!a.isRight);
  $('resultTitle').textContent = rate>=80 ? '成绩优秀' : rate>=60 ? '继续加油' : '仍需巩固';
  $('resultStat').innerHTML = `
    <div class="rs-item"><span class="rs-num">${right}/${total}</span><span class="rs-label">答对题数</span></div>
    <div class="rs-item"><span class="rs-num">${rate}%</span><span class="rs-label">正确率</span></div>
    <div class="rs-item"><span class="rs-num">${wrong.length}</span><span class="rs-label">待巩固错题</span></div>`;
  $('resultReview').innerHTML = quiz.answers.map((a,ai)=>{
    const ex = EXAM[String(a.q.i)] || {};
    const examLine = ex.people ? `<div class="ri-line">考点：${esc(ex.people)}｜${esc(ex.status||'')}｜${esc(ex.impact||'')}</div>` : '';
    return `
    <div class="review-item ${a.isRight?'':'bad-item'}">
      <div class="ri-stem">${ai+1}. ${esc(a.q.stem)}</div>
      <div class="ri-line ${a.isRight?'ok':'bad'}">${a.isRight?'✓ 回答正确':'✗ 你的选择：'+esc(a.picked)}</div>
      <div class="ri-line">正确答案：${esc(a.q.options.find(o=>o.correct).text)}</div>
      ${examLine}
    </div>`;
  }).join('');
  $('quizReviewDeck').hidden = wrong.length===0;
}

function buildReviewDeck(){
  const wrong = quiz.answers.filter(a=>!a.isRight);
  const total = quiz.questions.length, right = quiz.score;
  const rate = Math.round(right/total*100);
  const slides = wrong.map((a, n)=>{
    const i = a.q.i, ev = a.q.ev;
    const ex = EXAM[String(i)] || {};
    const correct = a.q.options.find(o=>o.correct).text;
    const points = [
      '题目：' + a.q.stem,
      '你的选择：' + a.picked,
      '正确答案：' + correct
    ];
    const notes = [
      ex.people ? '主要人物：' + ex.people : '',
      ex.status ? '历史地位：' + ex.status : '',
      ex.impact ? '历史影响：' + ex.impact : ''
    ].filter(Boolean).join('；');
    const kp = (a.q.explain || []).map(b=>'知识点：' + b);
    return { h:`错题 ${n+1} · ${ev.t}`, points, body: a.q.desc, notes: notes || kp.join('；'), related:[i] };
  });
  return {
    name:'错题复盘',
    cover:{ title:'错题复盘 · 知识点归集', sub:`共 ${wrong.length} 道待巩固题目`, lead:`本轮共 ${total} 题，答对 ${right} 题，正确率 ${rate}%。下列课件逐题归集错题考点，可用左右方向键翻页复习，点击关联事件可回到地图查看详情。` },
    slides,
    related:[]
  };
}

function openReviewDeck(){
  const deck = buildReviewDeck();
  if(!deck.slides.length) return;
  openTheme(deck);
}

function switchMode(mode){
  state.mode = mode;
  const map = mode==='map', quiz = mode==='quiz', review = mode==='review';
  mainEl.hidden = !map;
  quizPanel.hidden = !quiz;
  reviewPanel.hidden = !review;
  modeMapBtn.classList.toggle('active', map);
  modeQuizBtn.classList.toggle('active', quiz);
  modeReviewBtn.classList.toggle('active', review);
  modeMapBtn.setAttribute('aria-selected', String(map));
  modeQuizBtn.setAttribute('aria-selected', String(quiz));
  modeReviewBtn.setAttribute('aria-selected', String(review));
  closeModal();
  if(quiz){
    showPanel('quizStart');
    if(!$('qaLog').children.length) addQa('sys','我是史鉴，可就当前题目连续追问。');
  }
  if(review) renderReview();
}

/* ================= 考前复习 ================= */
function reviewFiltered(){
  const q = $('reviewSearch').value.trim();
  const cat = $('reviewCat').value;
  const era = $('reviewEra').value;
  let list = q ? searchEvents(q) : EVENTS.slice();
  list = list.filter(ev=>{
    if(cat!=='all' && ev.c!==cat) return false;
    if(era!=='all'){ const p=PERIODS[Number(era)]; if(p && !(ev.y>=p[0]&&ev.y<=p[1])) return false; }
    return true;
  });
  return list.sort((a,b)=>a.y-b.y || a.t.localeCompare(b.t,'zh'));
}

function reviewCard(ev, i){
  const ex = EXAM[String(i)] || {};
  const kp = KP[String(i)] || [];
  const tr = treatyOf(ev);
  const cat = CATS[ev.c] || {label:ev.c,color:'#888'};
  const field = (label, val)=> val ? `<div><dt>${label}</dt><dd>${esc(val)}</dd></div>` : '';
  return `<article class="rv-card" data-i="${i}">
    <header class="rv-head">
      <span class="rv-year">${ev.y}</span>
      <h3>${esc(ev.t)}</h3>
      <span class="rv-cat" style="color:${cat.color}">${cat.label}</span>
    </header>
    <div class="rv-place">${esc(ev.p)}</div>
    <dl class="rv-fields">
      ${field('领导者', ex.people)}
      ${field('历史地位', ex.status)}
      ${field('历史影响', ex.impact)}
    </dl>
    ${tr?`<div class="rv-treaty">
      <div class="rv-treaty-title">${esc(tr.name)}</div>
      <ul class="rv-treaty-list">${tr.terms.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      ${tr.note?`<div class="rv-treaty-note">${esc(tr.note)}</div>`:''}
    </div>`:''}
    ${kp.length?`<ul class="rv-kp">${kp.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`:''}
    <button class="rv-open" type="button" data-i="${i}">查看事件详情</button>
  </article>`;
}

function renderReview(){
  const list = reviewFiltered();
  $('reviewCount').textContent = `共 ${list.length} 条考点`;
  $('reviewList').innerHTML = list.length
    ? list.map(ev=>reviewCard(ev, EVENTS.indexOf(ev))).join('')
    : `<div class="rv-empty">未找到匹配事件，换用事件名、人物、地区或年份试试。</div>`;
  $('reviewList').querySelectorAll('.rv-open').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ev = EVENTS[Number(btn.dataset.i)];
      if(ev) openModal(ev);
    });
  });
}

/* ================= 答疑助手（外部 API + 本地兜底） ================= */
let aiCfg = null;
try { aiCfg = JSON.parse(localStorage.getItem('aiCfg') || 'null'); } catch(e){ aiCfg = null; }

const PROVIDERS = {
  doubao: {
    base: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    basePh: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    modelDefault: 'doubao-seed-1-6-250615',
    modelPh: '可留空使用默认豆包模型；或填接入点 ID / 模型名，如 ep-2024xxxxxx',
    hint: '默认接入豆包大模型（火山方舟）：填入方舟 API Key 即可使用，模型留空走默认豆包模型；若用推理接入点，将接入点 ID 填入模型栏。'
  },
  openai: {
    base: '',
    basePh: 'https://api.example.com/v1/chat/completions',
    modelDefault: '',
    modelPh: '例如 gpt-4o-mini',
    hint: '其他 OpenAI 兼容服务：填写兼容 Chat Completions 的接口地址、模型名与密钥即可。'
  }
};
const PRESET_BASES = Object.values(PROVIDERS).map(p=>p.base).filter(Boolean);

function applyProvider(id, fillBase){
  const p = PROVIDERS[id]; if(!p) return;
  $('aiBase').placeholder = p.basePh;
  $('aiModel').placeholder = p.modelPh;
  $('aiProviderHint').textContent = p.hint;
  if(fillBase && (!$('aiBase').value || PRESET_BASES.includes($('aiBase').value.trim()))){
    $('aiBase').value = p.base;
  }
}

function formatEvent(ev, i){
  const kp = KP[String(i)] || [];
  const tr = treatyOf(ev);
  const lines = [`【${ev.y} · ${ev.t}（${regionOf(ev)}）】`, ev.d];
  if(tr) lines.push(`【${tr.name}】` + tr.terms.map(t=>'· '+t).join(' '));
  if(kp.length) lines.push(kp.map(b=>'· '+b).join('\n'));
  return lines.join('\n');
}

function relatedFor(i, n=3){
  const ev = EVENTS[i]; if(!ev) return [];
  return EVENTS.map((e,j)=>({ e, j, score:(e.c===ev.c?2:0)+Math.abs(e.y-ev.y)/10 }))
    .filter(x=>x.j!==i)
    .sort((a,b)=>a.score-b.score)
    .slice(0,n).map(x=>x.e);
}

function deepAnalyze(ev, i){
  const ex = EXAM[String(i)] || {};
  const kp = KP[String(i)] || [];
  const tr = treatyOf(ev);
  const rel = relatedFor(i,3).map(r=>`${r.y} · ${r.t}`).join('；');
  const lines = [];
  lines.push(`【事件】${ev.y} · ${ev.t}（${regionOf(ev)}）`);
  lines.push(`【背景与经过】${ev.d}`);
  if(tr) lines.push(`【${tr.name}·条约内容】` + tr.terms.map(b=>'· '+b).join('\n'));
  if(kp.length) lines.push(`【要点】` + kp.map(b=>'· '+b).join('；'));
  if(ex.people) lines.push(`【主要人物】${ex.people}`);
  if(ex.status) lines.push(`【历史地位】${ex.status}`);
  if(ex.impact) lines.push(`【历史影响】${ex.impact}`);
  if(rel) lines.push(`【可联系的事件】${rel}`);
  return lines.join('\n');
}

function scoreEvent(ev, i, q, grams, contextEv){
  const blob = (ev.t+' '+ev.p+' '+ev.d+' '+(KP[String(i)]||[]).join(' ')).toLowerCase();
  let s = 0;
  grams.forEach(g=>{ if(blob.includes(g)) s += 1; });
  if(ev.t.toLowerCase().includes(q)) s += 5;
  if(contextEv && ev===contextEv) s += 3;
  return s;
}

/* 按提问意图作答：只答用户问的那一层，不把全部考点堆出来 */
function intentAnswer(ev, i, q){
  const ex = EXAM[String(i)] || {};
  const tr = treatyOf(ev);
  const kp = KP[String(i)] || [];
  const where = `${ev.y} 年 · ${regionOf(ev)}`;

  if(/条约|协定|条款|内容|割让|赔款|割地|开放.{0,4}口|写了什么|规定了/.test(q)){
    if(tr){
      return `${ev.t}——${tr.name}\n主要内容：\n` + tr.terms.map(t=>'· '+t).join('\n') + (tr.note?`\n一句话定位：${tr.note}`:'');
    }
    return `${ev.t}（${where}）本身不是条约类事件，未签订条约。\n若你问的是与它相关的条约，可试试：南京条约、马关条约、辛丑条约、凡尔赛和约、马关、华沙条约。`;
  }
  if(/何时|哪一年|时间|年份|什么时候|几年/.test(q)){
    return `${ev.t}：${ev.y} 年，发生于${ev.p}。${kp[0]?`\n关键时间点：${kp[0]}`:''}`;
  }
  if(/谁|人物|领导|领袖|主持|代表/.test(q)){
    return `${ev.t}的主要人物：${ex.people || '资料暂未细化到个人，可参考事件主体：' + ev.p}。`;
  }
  if(/地位|性质|标志着|意义在于|历史定位/.test(q)){
    return `${ev.t}的历史地位：${ex.status || ev.d}`;
  }
  if(/影响|后果|意义|作用|导致/.test(q)){
    return `${ev.t}的历史影响：${ex.impact || ev.d}${kp[1]?`\n补充：${kp[1]}`:''}`;
  }
  if(/原因|为什么|背景|起因|怎么会/.test(q)){
    return `${ev.t}的背景与原因：${ev.d}${kp.length?`\n要点：${kp.slice(0,2).join('；')}`:''}`;
  }
  if(/评价|怎么看|如何理解|启示|谈谈/.test(q)){
    const rel = relatedFor(i,2).map(r=>`${r.y} · ${r.t}`).join('；');
    return `${ev.t}（${where}）可以从三个层次理解：\n· 史实：${ev.d}\n· 地位：${ex.status || '—'}\n· 影响：${ex.impact || '—'}${rel?`\n可联系：${rel}`:''}\n评价时注意区分当时人的主观目的与后来的客观效果。`;
  }
  return `${ev.t}（${where}）\n${ev.d}${ex.status?`\n地位：${ex.status}`:''}${ex.impact?`\n影响：${ex.impact}`:''}`;
}

function localAnswer(query, contextEv){
  const q = query.toLowerCase().trim();
  const core = q.replace(/[它他这个那有什么历史影响意义原因背景经过时间哪吗呢啊的了和与是在]/g,'');
  const anaphoric = core.length < 2;
  if(anaphoric && contextEv){
    return { text: deepAnalyze(contextEv, EVENTS.indexOf(contextEv)), ev: contextEv };
  }
  const grams = [];
  for(let i=0;i<q.length-1;i++){ const g=q.slice(i,i+2); if(/[一-龥a-z0-9]/.test(g)) grams.push(g); }
  const ranked = EVENTS.map((ev,i)=>({ev,i,s:scoreEvent(ev,i,q,grams,contextEv)}))
    .filter(x=>x.s>0).sort((a,b)=>b.s-a.s);

  const compare = /对比|比较|区别|异同|相比|vs/i.test(q) && ranked.length>=2;
  if(compare){
    const [a,b] = ranked;
    const diff = `【对比小结】${a.ev.t}（${a.ev.y}）与 ${b.ev.t}（${b.ev.y}）：前者为${CATS[a.ev.c]?.label||'—'}，后者为${CATS[b.ev.c]?.label||'—'}。可从时代背景、主要力量、方式手段与历史后果四方面比较。`;
    return { text: deepAnalyze(a.ev,a.i)+'\n\n'+deepAnalyze(b.ev,b.i)+'\n\n'+diff, ev:a.ev };
  }
  if(!ranked.length) return { text:'暂未在内置资料中找到相关条目，可换用事件名、年份或国家名提问；也可以直接问“南京条约的内容”“长征有什么影响”。', ev:contextEv || null };
  const {ev,i} = ranked[0];
  return { text: intentAnswer(ev, i, q), ev };
}

async function aiAnswer(query, context, history){
  if(!aiCfg || !aiCfg.key) return null;
  const prov = PROVIDERS[aiCfg.provider] || PROVIDERS.doubao;
  const base = (aiCfg.base || prov.base || '').trim();
  const model = (aiCfg.model || prov.modelDefault || '').trim();
  if(!base) return null;
  const sys = '你是「史鉴」，面向中学生的世界近现代史答疑助手。\n' +
    '作答原则：\n' +
    '1) 先判断用户在问什么，只回答被问的那一层，不要每次都把背景、经过、人物、地位、影响全套罗列一遍。\n' +
    '   · 问条约/条款/内容 → 直接给条约名称与条款要点（割地、赔款、通商、驻兵、限制等），再补一句定位。\n' +
    '   · 问时间 → 先给年份与关键节点。\n' +
    '   · 问人物 → 给主要人物与各自角色。\n' +
    '   · 问地位/性质 → 给一句判断加依据。\n' +
    '   · 问影响/意义 → 分短期后果与长期意义。\n' +
    '   · 问原因 → 讲时代条件与直接起因，再点根本原因。\n' +
    '   · 问对比 → 用同一组维度对照两边，最后给一句结论。\n' +
    '   · 问开放评价 → 给出可用的论证角度与史实支撑，保留不同解释空间。\n' +
    '2) 篇幅跟着问题走：一句话能答清就一两句；需要展开时才分点，分点用「· 」而非长篇大标题。\n' +
    '3) 史实以给定资料为准；资料没写的不要编，缺细节就说明缺，并给出可继续追问的方向。\n' +
    '4) 评价客观中立，区分主观目的与客观效果，不夸大、不贴标签，不使用未经核实的数据。\n' +
    '5) 如果用户是在追问上一轮（如“那影响呢”“还有呢”），结合对话历史里的对象回答，不要重新泛泛而谈。';
  const ctxEv = currentEvent();
  const refLines = context ? [context] : [];
  if(ctxEv){
    relatedFor(EVENTS.indexOf(ctxEv),3).forEach(r=>refLines.push(formatEvent(r, EVENTS.indexOf(r))));
  }
  const ctxMsg = refLines.length ? {role:'system', content:'可参考的内置近代史资料：\n'+refLines.join('\n\n')} : null;
  const recent = (history || []).slice(-10);
  const messages = [
    {role:'system', content:sys},
    ...(ctxMsg ? [ctxMsg] : []),
    ...recent,
    {role:'user', content:query}
  ];
  const resp = await fetch(base, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+aiCfg.key},
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3
    })
  });
  if(!resp.ok) throw new Error('HTTP '+resp.status);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || null;
}

function addQa(role, text){
  const div = document.createElement('div');
  div.className = 'qa-msg '+role;
  div.textContent = text;
  $('qaLog').appendChild(div);
  $('qaLog').scrollTop = $('qaLog').scrollHeight;
}
function clearQa(){ qaHistory.length = 0; lastLocalEv = null; $('qaLog').innerHTML=''; addQa('sys','我是史鉴，可就当前题目连续追问。'); }

const qaHistory = [];
let lastLocalEv = null;

function currentContext(){
  if(quiz.questions.length && quiz.idx < quiz.questions.length){
    const q = quiz.questions[quiz.idx];
    const kp = (KP[String(q.i)] || []).map(b=>'· '+b).join('\n');
    return `${q.ev.t}（${q.ev.y}，${regionOf(q.ev)}）：${q.desc}\n${kp}`;
  }
  return '';
}
function currentEvent(){
  if(quiz.questions.length && quiz.idx < quiz.questions.length) return quiz.questions[quiz.idx].ev;
  return null;
}

async function sendQa(){
  const input = $('qaInput');
  const q = input.value.trim();
  if(!q) return;
  addQa('user', q);
  input.value = '';
  const steps = ['正在梳理背景与经过…','比对主要人物与举措…','归纳历史地位与影响…'];
  addQa('bot', steps[0]);
  const bot = $('qaLog').lastElementChild;
  let step = 0;
  const timer = setInterval(()=>{ step=(step+1)%steps.length; bot.textContent = steps[step]; }, 900);
  let reply = null, fallback = false;
  const ctxEv = lastLocalEv || currentEvent();
  try{
    reply = await aiAnswer(q, currentContext(), qaHistory);
    if(!reply){
      const res = localAnswer(q, ctxEv);
      reply = res.text; lastLocalEv = res.ev || lastLocalEv;
      fallback = true;
    } else {
      lastLocalEv = ctxEv;
    }
  }catch(e){
    const res = localAnswer(q, ctxEv);
    reply = 'AI 接口调用失败，已切换本地知识库：\n' + res.text;
    lastLocalEv = res.ev || lastLocalEv;
    fallback = true;
  }
  clearInterval(timer);
  bot.textContent = reply;
  if(fallback) bot.classList.add('sys');
  if(!fallback){
    qaHistory.push({role:'user', content:q});
    qaHistory.push({role:'assistant', content:reply});
  }
}

function openAi(){
  const prov = aiCfg?.provider || 'doubao';
  $('aiProvider').value = prov;
  $('aiBase').value = aiCfg?.base || '';
  $('aiModel').value = aiCfg?.model || '';
  $('aiKey').value = aiCfg?.key || '';
  applyProvider(prov, false);
  $('aiSettings').hidden = false;
}
function closeAi(){ $('aiSettings').hidden = true; }

modeMapBtn.addEventListener('click', ()=>switchMode('map'));
modeReviewBtn.addEventListener('click', ()=>switchMode('review'));
modeQuizBtn.addEventListener('click', ()=>switchMode('quiz'));
$('quizBegin').addEventListener('click', beginQuiz);
$('quizNext').addEventListener('click', nextQuestion);
$('quizQuit').addEventListener('click', ()=>switchMode('map'));
$('quizRetry').addEventListener('click', beginQuiz);
$('quizReviewDeck').addEventListener('click', openReviewDeck);
$('quizBackMap').addEventListener('click', ()=>switchMode('map'));
$('quizAiSettings').addEventListener('click', openAi);
$('qaSettings').addEventListener('click', openAi);
$('qaClear').addEventListener('click', clearQa);
$('aiClose').addEventListener('click', closeAi);
$('aiProvider').addEventListener('change', e=>applyProvider(e.target.value, true));
$('aiSave').addEventListener('click', ()=>{
  aiCfg = { provider:$('aiProvider').value, base:$('aiBase').value.trim(), model:$('aiModel').value.trim(), key:$('aiKey').value.trim() };
  localStorage.setItem('aiCfg', JSON.stringify(aiCfg));
  closeAi(); addQa('sys','AI 配置已保存。');
});
$('aiClear').addEventListener('click', ()=>{
  aiCfg = null; localStorage.removeItem('aiCfg');
  $('aiProvider').value = 'doubao'; applyProvider('doubao', false);
  $('aiBase').value=''; $('aiModel').value=''; $('aiKey').value='';
});
$('qaSend').addEventListener('click', sendQa);
$('qaInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendQa(); });

/* ================= 启动 ================= */
const atlasSelect = document.getElementById('atlasSelect');
atlasSelect.innerHTML = ATLAS.map(a=>`<option value="${a.id}">地图册 · ${a.name}</option>`).join('');
atlasSelect.addEventListener('change', ()=>setAtlas(atlasSelect.value));
$('quizEra').innerHTML = '<option value="all">全部年代</option>' + PERIODS.map((p,i)=>`<option value="${i}">${p[0]}—${p[1]} · ${p[2]}</option>`).join('');
$('reviewEra').innerHTML = '<option value="all">全部年代</option>' + PERIODS.map((p,i)=>`<option value="${i}">${p[0]}—${p[1]} · ${p[2]}</option>`).join('');
$('reviewSearch').addEventListener('input', renderReview);
$('reviewCat').addEventListener('change', renderReview);
$('reviewEra').addEventListener('change', renderReview);
rangeMeta.textContent = `收录 ${YEAR_MIN}—${YEAR_MAX} · ${EVENTS.length} 起`;
renderLegend();
setYear(1840);
loadBoundaries();
window.addEventListener('resize', resize);
window.addEventListener('load', ()=>setTimeout(resize, 80));
