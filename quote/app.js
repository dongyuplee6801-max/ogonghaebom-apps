'use strict';

(() => {
  // 새로 고쳐도 같은 주문서를 불러올 수 있도록 보관 이름을 정합니다.
  const STORAGE_KEY = 'ogonghaebom-quote-v1';
  const MAX_NUMBER = 1000000;
  const won = new Intl.NumberFormat('ko-KR');
  const $ = (selector) => document.querySelector(selector);
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const newItem = () => ({ name: '', quantity: 1, price: 0 });
  const defaultState = () => ({
    version: 1,
    number: `주문-${localDate.replaceAll('-', '')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    date: localDate,
    sender: { name: '오공해봄', phone: '010-0000-0001', address: '가상주소 · 광양시 매실길 00' },
    receiver: { name: '김○○', phone: '010-0000-0002', address: '가상주소 · 광양시 봄빛길 00' },
    items: [{ name: '매실청 키트', quantity: 1, price: 29000 }],
    memo: '신선한 마음을 담아 정성껏 준비하겠습니다. 감사합니다.'
  });
  let storageWarning = false;
  let saveTimer;

  // 저장된 내용에 문제가 있으면 새 예시로 시작하고, 그 사실을 알려 드립니다.
  function loadState() {
    const base = defaultState();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return base;
      const data = JSON.parse(saved);
      if (!data || data.version !== 1 || !Array.isArray(data.items)) throw new Error('저장 형식 오류');
      const shortText = (value, fallback, limit) => typeof value === 'string' ? value.slice(0, limit) : fallback;
      for (const side of ['sender', 'receiver']) {
        for (const key of ['name', 'phone', 'address']) {
          base[side][key] = shortText(data[side]?.[key], base[side][key], key === 'address' ? 250 : key === 'name' ? 80 : 40);
        }
      }
      base.number = shortText(data.number, base.number, 40);
      base.date = /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : base.date;
      base.memo = shortText(data.memo, '', 500);
      base.items = data.items.map((item) => ({ name: shortText(item?.name, '', 120), quantity: cleanNumber(item?.quantity), price: cleanNumber(item?.price) }));
      if (!base.items.length) base.items.push(newItem());
      return base;
    } catch {
      storageWarning = true;
      return base;
    }
  }

  // 숫자는 0 이상의 정수로 맞추고, 너무 큰 숫자가 들어가지 않게 합니다.
  function cleanNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(MAX_NUMBER, Math.max(0, Math.floor(number))) : 0;
  }
  const state = loadState();
  const money = (amount) => `${won.format(amount)}원`;
  function totals() {
    const subtotal = state.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const tax = Math.round(subtotal * 0.1);
    return { subtotal, tax, total: subtotal + tax };
  }

  function showSaveStatus(text, warning = false) {
    const status = $('#save-status');
    status.textContent = text;
    status.classList.toggle('warning', warning);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      showSaveStatus('● 자동 저장됨');
    } catch {
      showSaveStatus('자동 저장이 안 됩니다. 파일로 보관해 주세요.', true);
    }
  }
  function saveSoon() {
    showSaveStatus('● 저장 중…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  // 입력 칸은 한 번 만들고, 숫자가 바뀔 때 금액만 고칩니다.
  function renderItems() {
    const list = $('#item-list');
    list.replaceChildren();
    state.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.dataset.index = index;
      row.innerHTML = `<label class="item-name"><span class="mobile-label">품목</span><input data-item="name" maxlength="120" aria-label="${index + 1}번째 품목" placeholder="품목 이름을 적어 주세요"></label>
        <label><span class="mobile-label">수량</span><input data-item="quantity" type="number" min="0" max="${MAX_NUMBER}" step="1" inputmode="numeric" aria-label="${index + 1}번째 수량"></label>
        <label><span class="mobile-label">단가 · 원</span><input data-item="price" type="number" min="0" max="${MAX_NUMBER}" step="1" inputmode="numeric" aria-label="${index + 1}번째 단가"></label>
        <div class="amount-cell"><span class="mobile-label">금액</span><output class="line-amount" aria-label="${index + 1}번째 금액"></output></div>
        <button class="remove-item" type="button" aria-label="${index + 1}번째 품목 삭제">삭제</button>`;
      for (const key of ['name', 'quantity', 'price']) row.querySelector(`[data-item="${key}"]`).value = item[key];
      list.append(row);
    });
    updateAmounts();
  }
  function updateAmounts() {
    document.querySelectorAll('.item-row').forEach((row, index) => {
      const item = state.items[index];
      row.querySelector('output').textContent = money(item.quantity * item.price);
    });
    const amounts = totals();
    for (const key of ['subtotal', 'tax', 'total']) $(`#${key}`).textContent = money(amounts[key]);
  }

  document.querySelectorAll('[data-field]').forEach((input) => {
    const path = input.dataset.field.split('.');
    input.value = path.length === 2 ? state[path[0]][path[1]] : state[path[0]];
    input.addEventListener('input', () => {
      if (path.length === 2) state[path[0]][path[1]] = input.value;
      else state[path[0]] = input.value;
      saveSoon();
    });
  });
  $('#item-list').addEventListener('input', (event) => {
    const input = event.target;
    if (!input.dataset.item) return;
    const item = state.items[Number(input.closest('.item-row').dataset.index)];
    const key = input.dataset.item;
    item[key] = key === 'name' ? input.value : cleanNumber(input.value);
    if (key !== 'name' && input.value !== '' && Number(input.value) !== item[key]) input.value = item[key];
    updateAmounts();
    saveSoon();
  });
  $('#item-list').addEventListener('focusout', (event) => {
    const input = event.target;
    if (!['quantity', 'price'].includes(input.dataset.item)) return;
    input.value = state.items[Number(input.closest('.item-row').dataset.index)][input.dataset.item];
  });
  $('#item-list').addEventListener('click', (event) => {
    const button = event.target.closest('.remove-item');
    if (!button) return;
    const index = Number(button.closest('.item-row').dataset.index);
    state.items.splice(index, 1);
    if (!state.items.length) state.items.push(newItem());
    renderItems();
    saveNow();
    $('#action-status').textContent = '품목을 지웠습니다. 마지막 줄은 빈 줄로 남겨 드립니다.';
    const rows = document.querySelectorAll('.item-row');
    rows[Math.min(index, rows.length - 1)].querySelector('input').focus();
  });
  $('#add-item').addEventListener('click', () => {
    state.items.push(newItem());
    renderItems();
    saveNow();
    $('#item-list').lastElementChild.querySelector('input').focus();
    $('#action-status').textContent = '새 품목 줄을 추가했습니다.';
  });

  // 엑셀에서 한글이 깨지지 않게 표시를 붙이고, 쉼표와 줄바꿈도 안전하게 감쌉니다.
  function csvCell(value) {
    let text = String(value ?? '');
    // 사용자가 적은 글이 엑셀의 계산식으로 실행되지 않게 합니다.
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
  $('#export-csv').addEventListener('click', () => {
    saveNow();
    const amounts = totals();
    const rows = [
      ['오공해봄 주문서'], ['견적 번호', state.number], ['작성 날짜', state.date], [],
      ['구분', '이름 · 상호', '연락처', '주소'],
      ['보내는 곳', state.sender.name, state.sender.phone, state.sender.address],
      ['받는 곳', state.receiver.name, state.receiver.phone, state.receiver.address], [],
      ['품목', '수량', '단가(원)', '금액(원)'],
      ...state.items.map((item) => [item.name, item.quantity, item.price, item.quantity * item.price]), [],
      ['품목 금액 합계(원)', amounts.subtotal], ['부가세 10%(원)', amounts.tax], ['총 주문 금액(원)', amounts.total], [],
      ['함께 전할 말씀', state.memo]
    ];
    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `오공해봄_주문서_${(state.number || state.date || localDate).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('#action-status').textContent = '엑셀에서 열 수 있는 주문서 파일을 내려받았습니다.';
  });

  // 입력한 글은 글자로만 옮깁니다. 주소나 메모에 기호가 있어도 서류가 망가지지 않습니다.
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }
  function preparePrint() {
    const amounts = totals();
    const sideHtml = (title, side) => `<section><h2>${title}</h2><p><strong>${escapeHtml(side.name) || '미입력'}</strong></p><p>${escapeHtml(side.phone)}</p><p>${escapeHtml(side.address)}</p></section>`;
    $('#print-sheet').innerHTML = `<h1>주문서</h1><div class="print-meta"><span>견적 번호: ${escapeHtml(state.number)}</span><span>작성 날짜: ${escapeHtml(state.date)}</span></div>
      <div class="print-parties">${sideHtml('보내는 곳', state.sender)}${sideHtml('받는 곳', state.receiver)}</div>
      <table><thead><tr><th>품목</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>${state.items.map((item) => `<tr><td>${escapeHtml(item.name) || '미입력'}</td><td>${won.format(item.quantity)}</td><td>${money(item.price)}</td><td>${money(item.quantity * item.price)}</td></tr>`).join('')}</tbody></table>
      <div class="print-summary"><p><span>품목 금액 합계</span><span>${money(amounts.subtotal)}</span></p><p><span>부가세 10%</span><span>${money(amounts.tax)}</span></p><p class="print-total"><span>총 주문 금액</span><span>${money(amounts.total)}</span></p></div>
      ${state.memo ? `<section class="print-memo"><strong>함께 전할 말씀</strong><p>${escapeHtml(state.memo)}</p></section>` : ''}<div class="print-footer"><strong>오공해봄</strong> · 정성을 담아 준비하겠습니다.</div>`;
    // 품목이 많을 때도 A4 한 장에 들어가도록 종이용 서류만 알맞게 줄입니다.
    document.documentElement.style.setProperty('--print-scale', '1');
    document.body.classList.add('measuring-print');
    const availableHeight = 1010;
    const scale = Math.min(1, availableHeight / $('#print-sheet').scrollHeight);
    document.documentElement.style.setProperty('--print-scale', String(scale));
    document.body.classList.remove('measuring-print');
  }
  $('#print-order').addEventListener('click', () => { saveNow(); preparePrint(); window.print(); });
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('pagehide', saveNow);
  renderItems();
  if (storageWarning) {
    showSaveStatus('저장 내용을 불러오지 못해 예시를 열었습니다.', true);
  } else {
    saveNow();
  }
})();
