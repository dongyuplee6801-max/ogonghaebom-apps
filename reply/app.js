'use strict';

(() => {
  const SERVICE = 'https://gy-ai.tkvkaosh.workers.dev';
  // 실제 팀 코드는 파일에 적지 않고, 설정 칸과 이 브라우저의 보관함에서만 읽습니다.
  const TEAM_KEY = 'ogonghaebom-reply-team';
  const DATA_KEY = 'ogonghaebom-reply-data-v1';
  const SYSTEM = '너는 오공해봄의 고객 담당 직원. 한국어 존댓말. 원문에 없는 가격 · 날짜 · 약속은 지어내지 않고, 확인이 필요하면 확인 후 다시 안내드리겠다고 쓴다.';
  const TONES = ['정중하게', '친근하게', '짧고 분명하게'];
  const $ = selector => document.querySelector(selector);
  const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 });
  const seconds = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });
  let busy = false;
  let confirmedCode = '';
  let savedCode = '';
  let saveTimer;
  let storageFailed = false;

  const state = { version: 1, inquiry: '', tone: '정중하게', result: '', cost: null, ms: null, history: [] };
  const text = value => typeof value === 'string' ? value : '';
  const metric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  function storageMessage() {
    const notice = $('#storage-status');
    notice.classList.add('error');
    notice.textContent = '이 브라우저에서는 자동 저장이 되지 않습니다. 필요한 답장은 복사해 따로 보관해 주세요.';
  }
  // 보관된 문의와 답장 5개를 불러옵니다. 팀 코드는 답장 기록과 따로 보관합니다.
  function load() {
    try {
      savedCode = localStorage.getItem(TEAM_KEY) || '';
      const data = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
      if (data && data.version === 1) {
        state.inquiry = text(data.inquiry).slice(0, 12000);
        state.tone = TONES.includes(data.tone) ? data.tone : '정중하게';
        state.result = text(data.result);
        state.cost = metric(data.cost);
        state.ms = metric(data.ms);
        state.history = (Array.isArray(data.history) ? data.history : []).filter(item => item && typeof item.result === 'string' && item.result.trim()).slice(0, 5).map(item => ({
          inquiry: text(item.inquiry).slice(0, 12000), result: item.result,
          tone: TONES.includes(item.tone) ? item.tone : '정중하게',
          cost: metric(item.cost), ms: metric(item.ms), at: text(item.at)
        }));
      }
    } catch {
      storageFailed = true;
      storageMessage();
    }
  }
  function save() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(state));
    } catch {
      storageFailed = true;
      storageMessage();
    }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 180); }
  function connection(message, error = false) {
    $('#connection-status').textContent = message;
    $('#connection-status').classList.toggle('error', error);
  }
  function showError(message) {
    $('#request-error').textContent = message;
    $('#request-error').hidden = !message;
  }
  function updateTone() {
    document.querySelectorAll('[data-tone]').forEach(button => {
      const selected = button.dataset.tone === state.tone;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function updateCount() { $('#input-count').textContent = `${won.format(state.inquiry.length)} / 12,000자`; }
  function details(cost, ms) {
    const costText = cost === null ? '비용 정보 없음' : `비용 ${won.format(cost)}원`;
    const timeText = ms === null ? '시간 정보 없음' : `${seconds.format(ms / 1000)}초 소요`;
    return `${costText} · ${timeText}`;
  }
  function renderResult() {
    $('#result').value = state.result;
    $('#result-details').textContent = state.result ? details(state.cost, state.ms) : '아직 만든 답장이 없습니다.';
    $('#copy-result').disabled = busy || !state.result;
  }
  function setBusy(value, kind = '') {
    busy = value;
    document.querySelectorAll('[data-lock]').forEach(button => { button.disabled = value; });
    $('#generate').textContent = value && kind === 'writing' ? '작성 중…' : '답장 만들기 ↗';
    $('#save-team').textContent = value && kind === 'checking' ? '확인 중…' : '저장 · 확인';
    $('#working-status').hidden = !(value && kind === 'writing');
    $('#inquiry').setAttribute('aria-busy', String(value && kind === 'writing'));
    $('#result').setAttribute('aria-busy', String(value && kind === 'writing'));
    $('#copy-result').disabled = value || !state.result;
  }

  // 오래 응답이 없으면 기다림을 끝내고, 다시 시도할 수 있게 합니다.
  async function request(url, options = {}, wait = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), wait);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      let data;
      try { data = await response.json(); }
      catch { throw new Error('답변을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
      // 서버에서 온 오류 문장은 바꾸지 않고 그대로 보여 줍니다.
      if (data && typeof data.error === 'string' && data.error) throw new Error(data.error);
      if (!response.ok) throw new Error('연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.');
      if (!data || typeof data !== 'object') throw new Error('답변을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('응답을 기다리는 시간이 길어졌습니다. 잠시 후 다시 시도해 주세요.');
      if (error instanceof TypeError) throw new Error('연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function verifyTeam(shouldStore) {
    if (busy) return;
    const code = $('#team-code').value.trim();
    confirmedCode = '';
    showError('');
    if (!code) { connection('팀 코드를 입력한 뒤 저장 · 확인을 눌러 주세요.', true); $('#team-code').focus(); return; }
    if (shouldStore) {
      try {
        localStorage.setItem(TEAM_KEY, code);
        savedCode = code;
        $('#team-code').value = code;
      } catch {
        storageFailed = true;
        storageMessage();
        connection('팀 코드를 저장하지 못했습니다. 브라우저의 저장 허용 여부를 확인해 주세요.', true);
        return;
      }
    }
    setBusy(true, 'checking');
    connection('팀 연결을 확인하고 있습니다…');
    try {
      const data = await request(`${SERVICE}/whoami?team=${encodeURIComponent(code)}`, { method: 'GET' });
      if (data.ok !== true || typeof data.team !== 'string' || !data.team.trim()) throw new Error('팀 코드를 확인하지 못했습니다. 전달받은 코드를 다시 확인해 주세요.');
      confirmedCode = code;
      connection(`✓ ${data.team} 연결됨`);
    } catch (error) { connection(error.message, true); }
    finally { setBusy(false); }
  }

  function renderHistory() {
    const list = $('#history-list');
    list.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-history';
      empty.textContent = '아직 보관된 답장이 없습니다. 첫 답장을 만들어 보세요.';
      list.append(empty);
      return;
    }
    state.history.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = 'history-item';
      const contents = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'history-meta';
      const date = new Date(item.at);
      const time = document.createElement('time');
      if (Number.isFinite(date.getTime())) { time.dateTime = item.at; time.textContent = date.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
      else time.textContent = '이전 기록';
      const tone = document.createElement('span');
      tone.textContent = item.tone;
      meta.append(time, tone);
      const original = document.createElement('p');
      original.className = 'history-question'; original.textContent = item.inquiry;
      const preview = document.createElement('p');
      preview.className = 'history-preview'; preview.textContent = item.result;
      contents.append(meta, original, preview);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'button secondary'; button.textContent = '다시 보기';
      button.dataset.history = String(index); button.setAttribute('data-lock', '');
      button.setAttribute('aria-label', `${index + 1}번째 답장 다시 보기`); button.disabled = busy;
      card.append(contents, button); list.append(card);
    });
  }

  $('#settings-form').addEventListener('submit', event => { event.preventDefault(); verifyTeam(true); });
  $('#team-code').addEventListener('input', () => {
    confirmedCode = '';
    connection('변경한 팀 코드는 저장 · 확인을 눌러 주세요.');
  });
  $('#inquiry').addEventListener('input', () => { state.inquiry = $('#inquiry').value; updateCount(); saveSoon(); });
  document.querySelectorAll('[data-tone]').forEach(button => button.addEventListener('click', () => {
    if (busy) return;
    state.tone = button.dataset.tone; updateTone(); save();
  }));
  $('#example').addEventListener('click', () => {
    if (busy) return;
    state.inquiry = '안녕하세요. 김○○입니다. 매실청 키트를 주문하고 싶어요. 가격과 주문 방법, 배송 가능한 날짜를 알려 주실 수 있을까요? 연락처는 010-0000-0001입니다.\n(이름과 연락처는 모두 가짜 예시입니다.)';
    $('#inquiry').value = state.inquiry; updateCount(); save(); showError(''); $('#inquiry').focus();
  });

  $('#generate').addEventListener('click', async () => {
    if (busy) return;
    showError(''); $('#copy-status').textContent = '';
    if (!savedCode) { showError('먼저 팀 코드를 저장하세요'); $('#team-code').focus(); return; }
    if (confirmedCode !== savedCode || $('#team-code').value.trim() !== savedCode) { showError('팀 코드의 저장 · 확인을 먼저 마쳐 주세요.'); $('#save-team').focus(); return; }
    const original = $('#inquiry').value.trim();
    if (!original) { showError('고객님의 문의를 먼저 붙여 넣어 주세요.'); $('#inquiry').focus(); return; }
    state.inquiry = $('#inquiry').value;
    save();
    setBusy(true, 'writing');
    try {
      const data = await request(`${SERVICE}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: savedCode, system: SYSTEM, prompt: `말투: ${state.tone}\n\n고객 문의 원문:\n${original}` })
      }, 60000);
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('답장 내용이 비어 있습니다. 다시 만들어 주세요.');
      state.result = data.text;
      state.cost = metric(data.cost_krw); state.ms = metric(data.ms);
      state.history.unshift({ inquiry: state.inquiry, result: state.result, tone: state.tone, cost: state.cost, ms: state.ms, at: new Date().toISOString() });
      state.history = state.history.slice(0, 5);
      save(); renderResult(); renderHistory();
    } catch (error) { showError(error.message); }
    finally { setBusy(false); }
  });

  $('#copy-result').addEventListener('click', async () => {
    if (!state.result || busy) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('직접 선택');
      await navigator.clipboard.writeText(state.result);
      $('#copy-status').textContent = '복사했습니다. 카톡이나 문자에 붙여 넣어 주세요.';
    } catch {
      // 자동 복사가 막힌 브라우저에서도 직접 복사할 수 있게 글을 선택합니다.
      $('#result').focus(); $('#result').select();
      $('#copy-status').textContent = '자동 복사가 되지 않아 글을 선택했습니다. 길게 누르거나 복사 키로 복사해 주세요.';
    }
  });
  $('#history-list').addEventListener('click', event => {
    const button = event.target.closest('[data-history]');
    if (!button || busy) return;
    const item = state.history[Number(button.dataset.history)];
    if (!item) return;
    state.inquiry = item.inquiry; state.tone = item.tone; state.result = item.result; state.cost = item.cost; state.ms = item.ms;
    $('#inquiry').value = state.inquiry; updateCount(); updateTone(); renderResult(); save();
    showError(''); $('#copy-status').textContent = '이전에 만든 답장을 불러왔습니다.';
    $('#result').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#result').focus({ preventScroll: true });
  });
  window.addEventListener('pagehide', save);

  load();
  $('#team-code').value = savedCode;
  $('#inquiry').value = state.inquiry;
  updateCount(); updateTone(); renderResult(); renderHistory();
  if (savedCode) verifyTeam(false);
  if (storageFailed) storageMessage();
})();
