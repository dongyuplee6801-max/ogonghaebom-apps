'use strict';

(() => {
  const SERVICE = 'https://gy-ai.tkvkaosh.workers.dev';
  // 실제 팀 코드는 파일에 쓰지 않습니다. 화면에서 받아 브라우저에만 보관합니다.
  const TEAM_KEY = 'ogonghaebom-copy-team';
  const DATA_KEY = 'ogonghaebom-copy-data-v1';
  const SYSTEM = '너는 오공해봄의 상품 소개 담당 직원이다. 농산물 유통·가공·체험 회사의 고객인 50대와 60대가 쉽게 이해하도록 친근하고 정중한 한국어 존댓말로 쓴다. 입력한 상품 이름과 특징만 사용하며, 원문에 없는 가격·날짜·할인·인증·효능·배송 약속은 지어내지 않는다. 홈페이지용·인스타용·문자용 문구를 모두 작성한다.';
  const $ = selector => document.querySelector(selector);
  const types = ['homepage', 'instagram', 'sms'];
  const titles = ['홈페이지용', '인스타용', '문자용'];
  const numberFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 });
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const makeProduct = (name = '') => ({ id: crypto.randomUUID(), name, features: ['', '', ''], texts: { homepage: '', instagram: '', sms: '' }, raw: '', generatedFrom: '', date: '', cost: null, ms: null });
  let state = { version: 1, items: [makeProduct('매실청 키트')], selected: '', query: '' };
  let savedCode = '';
  let confirmedCode = '';
  let busy = false;
  let saveTimer;
  const asText = value => typeof value === 'string' ? value : '';
  const metric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const current = () => state.items.find(item => item.id === state.selected) || state.items[0];

  function storageWarning() { $('#storage-status').classList.add('error'); $('#storage-status').textContent = '자동 저장이 되지 않습니다. 필요한 문구는 복사하거나 엑셀용 파일로 보관해 주세요.'; }
  function load() {
    try {
      savedCode = localStorage.getItem(TEAM_KEY) || '';
      const data = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
      if (data && data.version === 1 && Array.isArray(data.items)) {
        const ids = new Set();
        const items = data.items.filter(item => item && typeof item === 'object').map(item => {
          let id = asText(item.id) || crypto.randomUUID();
          if (ids.has(id)) id = crypto.randomUUID();
          ids.add(id);
          const result = makeProduct(asText(item.name).slice(0, 120));
          result.id = id;
          result.features = [0, 1, 2].map(i => asText(item.features?.[i]).slice(0, 500));
          types.forEach(key => { result.texts[key] = asText(item.texts?.[key]); });
          result.raw = asText(item.raw); result.generatedFrom = asText(item.generatedFrom); result.date = asText(item.date); result.cost = metric(item.cost); result.ms = metric(item.ms);
          if (Number.isInteger(item.example) && item.example >= 0 && item.example < 5) result.example = item.example;
          return result;
        });
        if (items.length) state.items = items;
        state.selected = asText(data.selected);
        state.query = asText(data.query).slice(0, 300);
      }
    } catch { storageWarning(); }
    if (!state.items.some(item => item.id === state.selected)) state.selected = state.items[0].id;
  }
  function save() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(DATA_KEY, JSON.stringify(state)); }
    catch { storageWarning(); }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 180); }
  function showError(message) { $('#request-error').textContent = message; $('#request-error').hidden = !message; }
  function connection(message, error = false) { $('#connection-status').textContent = message; $('#connection-status').classList.toggle('error', error); }
  function setBusy(value, kind = '') {
    busy = value;
    document.querySelectorAll('[data-lock]').forEach(element => { element.disabled = value; });
    $('#save-team').textContent = value && kind === 'checking' ? '확인 중…' : '저장 · 확인';
    $('#generate').textContent = value && kind === 'writing' ? '작성 중…' : '문구 3종 만들기 ↗';
    $('#working-status').hidden = !(value && kind === 'writing');
    $('.results-card').setAttribute('aria-busy', String(value && kind === 'writing'));
    document.querySelectorAll('[data-copy]').forEach(button => { button.disabled = value || !current().texts[button.dataset.copy]; });
  }
  async function request(url, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      let data;
      try { data = await response.json(); } catch { throw new Error('받은 내용을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
      // 서버가 알려 준 오류 문장은 바꾸지 않고 빨간 글씨로 보여 줍니다.
      if (data && typeof data.error === 'string' && data.error) throw new Error(data.error);
      if (!response.ok) throw new Error('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.');
      if (!data || typeof data !== 'object') throw new Error('받은 내용을 읽지 못했습니다. 다시 시도해 주세요.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('응답을 오래 기다렸습니다. 잠시 후 다시 시도해 주세요.');
      if (error instanceof TypeError) throw new Error('연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function verifyTeam(shouldStore) {
    if (busy) return;
    const code = $('#team-code').value.trim();
    confirmedCode = ''; showError('');
    if (!code) { connection('팀 코드를 입력한 뒤 저장 · 확인을 눌러 주세요.', true); $('#team-code').focus(); return; }
    if (shouldStore) {
      try { localStorage.setItem(TEAM_KEY, code); savedCode = code; $('#team-code').value = code; }
      catch { storageWarning(); connection('팀 코드를 저장하지 못했습니다. 브라우저의 저장 허용 여부를 확인해 주세요.', true); return; }
    }
    setBusy(true, 'checking'); connection('팀 연결을 확인하고 있습니다…');
    try {
      const data = await request(`${SERVICE}/whoami?team=${encodeURIComponent(code)}`, { method: 'GET' });
      if (data.ok !== true || typeof data.team !== 'string' || !data.team.trim()) throw new Error('팀 코드를 확인하지 못했습니다. 전달받은 코드를 다시 확인해 주세요.');
      confirmedCode = code; connection(`✓ ${data.team} 연결됨`);
    } catch (error) { connection(error.message, true); }
    finally { setBusy(false); }
  }

  // 상품 이름·특징·완성된 문구를 모두 검색합니다.
  function filtered() {
    const query = state.query.trim().toLocaleLowerCase('ko-KR');
    return state.items.filter(item => !query || [item.name, ...item.features, ...types.map(key => item.texts[key]), item.raw].join('\n').toLocaleLowerCase('ko-KR').includes(query));
  }
  function renderList() {
    const list = $('#product-list'); list.replaceChildren();
    const items = filtered();
    $('#list-count').textContent = `전체 ${numberFormat.format(state.items.length)}개 중 ${numberFormat.format(items.length)}개 표시`;
    if (!items.length) { const empty = document.createElement('p'); empty.className = 'empty-list'; empty.textContent = '찾는 상품이 없습니다. 다른 말로 검색해 보세요.'; list.append(empty); return; }
    items.forEach(item => {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'product-row'; row.dataset.product = item.id; row.setAttribute('data-lock', ''); row.disabled = busy;
      row.classList.toggle('selected', item.id === state.selected); row.setAttribute('aria-pressed', String(item.id === state.selected));
      const contents = document.createElement('span'); const name = document.createElement('strong'); name.textContent = item.name || '이름을 적지 않은 상품';
      const preview = document.createElement('span'); preview.className = 'preview'; preview.textContent = item.features.filter(Boolean).join(' · ') || '특징 세 가지를 적어 주세요.';
      contents.append(name, preview);
      const status = document.createElement('span'); status.className = 'row-status'; status.textContent = types.every(key => item.texts[key]) ? '문구 3종 보관됨 ↗' : item.raw ? '전체 문구 보관됨 ↗' : '작성 전 ↗';
      row.append(contents, status); list.append(row);
    });
  }
  function renderResults() {
    const item = current();
    types.forEach(key => { $(`#${key}`).value = item.texts[key]; });
    const incomplete = !!item.raw && !types.every(key => item.texts[key]);
    $('#raw-result').hidden = !incomplete; $('#raw-text').value = item.raw;
    if (item.raw) {
      const cost = item.cost === null ? '' : ` · 비용 ${numberFormat.format(item.cost)}원`;
      $('#result-note').textContent = item.generatedFrom !== JSON.stringify([item.name, ...item.features]) ? '상품 정보를 고쳤습니다. 새 정보로 문구를 다시 만들어 주세요.' : `${item.date || '이전'} 작성${cost}`;
    } else $('#result-note').textContent = '아직 만든 문구가 없습니다.';
    document.querySelectorAll('[data-copy]').forEach(button => { button.disabled = busy || !item.texts[button.dataset.copy]; });
  }
  function renderEditor() {
    const item = current(); $('#product-name').value = item.name;
    ['#feature-one', '#feature-two', '#feature-three'].forEach((selector, i) => { $(selector).value = item.features[i]; });
    renderResults(); $('#copy-status').textContent = ''; showError('');
  }
  ['#product-name', '#feature-one', '#feature-two', '#feature-three'].forEach((selector, index) => {
    $(selector).addEventListener('input', () => {
      if (index === 0) current().name = $(selector).value;
      else current().features[index - 1] = $(selector).value;
      if (current().raw) $('#result-note').textContent = '상품 정보를 고쳤습니다. 새 정보로 문구를 다시 만들어 주세요.';
      saveSoon(); renderList();
    });
  });
  $('#search').addEventListener('input', () => { state.query = $('#search').value; saveSoon(); renderList(); });
  $('#product-list').addEventListener('click', event => {
    const row = event.target.closest('[data-product]'); if (!row || busy) return;
    state.selected = row.dataset.product; save(); renderEditor(); renderList(); $('#product-name').focus();
  });
  $('#new-product').addEventListener('click', () => {
    if (busy) return; const item = makeProduct(); state.items.unshift(item); state.selected = item.id; state.query = ''; $('#search').value = '';
    save(); renderEditor(); renderList(); $('#product-name').focus(); $('#action-status').textContent = '새 상품을 추가했습니다. 이름과 특징 세 가지를 적어 주세요.';
  });
  $('#examples').addEventListener('click', () => {
    if (busy) return;
    const examples = [
      ['매실청 키트 · 기본형 (가짜 예시)', ['매실청을 활용하는 음료 만들기 키트', '물이나 탄산수에 섞어 즐기는 구성', '집에서 만드는 시간을 위한 구성']],
      ['매실청 키트 · 선물형 (가짜 예시)', ['매실청과 꾸미기 재료로 구성한 키트', '선물 메시지를 직접 적는 구성', '마음을 전하는 활동에 활용']],
      ['매실청 키트 · 체험형 (가짜 예시)', ['매실청 음료 만들기 체험용 키트', '재료를 섞어 직접 완성하는 활동', '함께 만들고 이야기를 나누는 구성']],
      ['매실청 키트 · 가정형 (가짜 예시)', ['가정에서 활용하는 매실청 키트', '함께 음료를 만들어 보는 구성', '완성한 음료를 나누어 즐기는 구성']],
      ['매실청 키트 · 모임형 (가짜 예시)', ['작은 모임에서 활용하는 매실청 키트', '여럿이 함께 음료를 만드는 활동', '각자 취향대로 섞어 보는 구성']]
    ];
    // 연습 예시는 한 번만 추가하며, 이미 쓴 상품 정보는 지우지 않습니다.
    if (state.items.length === 1 && !current().raw && !current().features.some(Boolean) && ['', '매실청 키트'].includes(current().name)) state.items = [];
    let first;
    let added = 0;
    examples.forEach(([name, features], index) => {
      const existing = state.items.find(item => item.example === index);
      if (existing) { first ||= existing; return; }
      const item = makeProduct(name); item.features = features; item.example = index; state.items.push(item); first ||= item; added++;
    });
    state.selected = first.id; state.query = ''; $('#search').value = ''; save(); renderEditor(); renderList();
    $('#action-status').textContent = added ? `가짜 예시 ${added}줄을 추가했습니다. 실제 상품 정보로 고쳐 사용해 주세요.` : '예시 5줄이 이미 들어 있습니다. 중복으로 추가하지 않았습니다.';
  });

  // 문구 세 종류를 나눠 보여 줍니다. 형식이 달라도 받은 원문은 잃지 않습니다.
  function splitTexts(raw) {
    const result = { homepage: '', instagram: '', sms: '' };
    try {
      const json = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
      if (json && typeof json === 'object') {
        types.forEach((key, i) => { result[key] = asText(json[key] || json[titles[i]]); });
        if (types.every(key => result[key].trim())) return result;
      }
    } catch { /* 일반 문장으로 온 경우 아래의 제목을 찾습니다. */ }
    const pattern = /^\s*(?:#{1,6}\s*)?(?:\*\*)?[\[【]?(홈페이지용|인스타용|문자용)[\]】]?(?:\*\*)?\s*[:：]?\s*$/gm;
    const headings = [...raw.matchAll(pattern)];
    headings.forEach((heading, i) => {
      const key = types[titles.indexOf(heading[1])];
      result[key] = raw.slice(heading.index + heading[0].length, headings[i + 1]?.index ?? raw.length).trim();
    });
    return result;
  }
  $('#generate').addEventListener('click', async () => {
    if (busy) return; showError(''); $('#copy-status').textContent = '';
    if (!savedCode) { showError('먼저 팀 코드를 저장하세요'); $('#team-code').focus(); return; }
    if (confirmedCode !== savedCode || $('#team-code').value.trim() !== savedCode) { showError('팀 코드의 저장 · 확인을 먼저 마쳐 주세요.'); $('#save-team').focus(); return; }
    const item = current();
    if (!item.name.trim() || item.features.some(feature => !feature.trim())) { showError('상품 이름과 특징 세 가지를 모두 적어 주세요.'); $('#product-name').focus(); return; }
    save(); setBusy(true, 'writing');
    const prompt = `회사: 오공해봄\n상품 이름: ${item.name.trim()}\n특징 하나: ${item.features[0].trim()}\n특징 둘: ${item.features[1].trim()}\n특징 셋: ${item.features[2].trim()}\n\n이 정보만 바탕으로 친근하고 정중한 존댓말의 문구 세 종류를 작성해 주세요. 홈페이지용은 자세하고 알기 쉽게, 인스타용은 짧은 소개와 관련 해시태그로, 문자용은 간결하게 써 주세요. 아래 제목을 각각 한 줄에 정확히 쓰고 바로 다음 줄부터 해당 문구를 적으세요. 설명이나 다른 제목은 덧붙이지 마세요.\n[홈페이지용]\n문구\n[인스타용]\n문구\n[문자용]\n문구`;
    try {
      const data = await request(`${SERVICE}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team: savedCode, system: SYSTEM, prompt }) }, 60000);
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('받은 문구가 비어 있습니다. 다시 만들어 주세요.');
      item.raw = data.text; item.texts = splitTexts(data.text); item.generatedFrom = JSON.stringify([item.name, ...item.features]); item.date = today(); item.cost = metric(data.cost_krw); item.ms = metric(data.ms);
      save(); renderResults(); renderList();
      if (!types.every(key => item.texts[key].trim())) showError('문구 세 종류를 나누지 못했습니다. 받은 전체 문구를 함께 보여 드립니다. 다시 만들 수도 있습니다.');
    } catch (error) { showError(error.message); }
    finally { setBusy(false); }
  });
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const key = button.dataset.copy; const value = current().texts[key]; if (!value || busy) return;
    try { if (!navigator.clipboard?.writeText) throw new Error('직접 복사'); await navigator.clipboard.writeText(value); $('#copy-status').textContent = `${titles[types.indexOf(key)]} 문구를 복사했습니다. 원하는 곳에 붙여 넣어 주세요.`; }
    catch { $(`#${key}`).focus(); $(`#${key}`).select(); $('#copy-status').textContent = '글을 선택했습니다. 길게 누르거나 복사 키로 복사해 주세요.'; }
  }));
  function csvCell(value) {
    let content = String(value ?? '');
    if (/^\s*[=+\-@]/.test(content) || /^[\t\r\n]/.test(content)) content = `'${content}`;
    return `"${content.replaceAll('"', '""')}"`;
  }
  $('#export').addEventListener('click', () => {
    const items = filtered(); if (!items.length) { $('#action-status').textContent = '내보낼 검색 결과가 없습니다.'; return; }
    const rows = [['상품 이름', '특징 하나', '특징 둘', '특징 셋', ...titles, '작성 날짜', '받은 전체 문구'], ...items.map(item => [item.name, ...item.features, ...types.map(key => item.texts[key]), item.date, item.raw])];
    const file = new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = `오공해봄_상품문구_${today()}.csv`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('#action-status').textContent = `검색 결과 ${items.length}개의 상품을 엑셀용 파일로 내려받았습니다.`;
  });
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  function preparePrint() {
    const item = current();
    $('#print-sheet').innerHTML = `<div class="print-brand">오공해봄 · 상품 소개 문구</div><h1>${escapeHtml(item.name) || '이름을 적지 않은 상품'}</h1><p>작성 날짜: ${escapeHtml(item.date || today())}</p><h2>상품 특징</h2><ul>${item.features.map(feature => `<li>${escapeHtml(feature) || '미입력'}</li>`).join('')}</ul>${types.map((key, i) => `<section><h2>${titles[i]}</h2><p>${escapeHtml(item.texts[key]) || '아직 만든 문구가 없습니다.'}</p></section>`).join('')}${item.raw && !types.every(key => item.texts[key]) ? `<section><h2>받은 전체 문구</h2><p>${escapeHtml(item.raw)}</p></section>` : ''}`;
  }
  $('#print').addEventListener('click', () => { save(); preparePrint(); window.print(); });
  $('#settings-form').addEventListener('submit', event => { event.preventDefault(); verifyTeam(true); });
  $('#team-code').addEventListener('input', () => { confirmedCode = ''; connection('변경한 팀 코드는 저장 · 확인을 눌러 주세요.'); });
  window.addEventListener('beforeprint', preparePrint); window.addEventListener('pagehide', save);
  load(); $('#team-code').value = savedCode; $('#search').value = state.query;
  $('#today').textContent = today(); $('#today').dateTime = today();
  renderEditor(); renderList();
  if (savedCode) verifyTeam(false);
})();
