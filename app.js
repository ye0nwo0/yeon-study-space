'use strict';
(() => {
  const mode = document.body.dataset.mode;
  const storage = {
    read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
  };
  if (mode === 'home') {
    const checks = [...document.querySelectorAll('[data-task]')];
    const update = () => { document.querySelector('#progress').textContent = `${checks.filter(c => c.checked).length} / ${checks.length}`; };
    checks.forEach(c => {
      c.checked = storage.read('yeon-task-' + c.dataset.task) === true;
      c.addEventListener('change', () => { storage.write('yeon-task-' + c.dataset.task, c.checked); update(); });
    });
    update();
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
    const days = Math.round((Date.parse('2026-10-22T00:00:00+09:00') - Date.parse(today + 'T00:00:00+09:00')) / 86400000);
    document.querySelector('#days-left').textContent = days > 0 ? `D-${days}` : days === 0 ? '오늘 마감' : '마감일 지남';
    return;
  }
  const $ = s => document.querySelector(s);
  const input = $('#url-input');
  let generatedUrl = '';
  let busy = false;
  const status = (message, kind = '') => { $('#status').textContent = message; $('#status').className = 'status ' + kind; };
  function clearResult() {
    generatedUrl = ''; $('#result').hidden = true; $('#empty-result').hidden = false;
    $('#result-badge').textContent = '입력 대기'; $('#result-url').removeAttribute('href');
  }
  function normalize(raw) {
    if (!/^https?:\/\//i.test(raw.trim())) throw new Error('https:// 또는 http://로 시작하는 웹 주소를 입력해 주세요.');
    let u;
    try { u = new URL(raw.trim()); } catch { throw new Error('주소 형식을 확인해 주세요. 예: https://github.com'); }
    if (!u.hostname.includes('.') || u.username || u.password) throw new Error('로그인 정보가 포함되지 않은 공개 웹사이트 주소를 입력해 주세요.');
    if (u.href.length > 2000) throw new Error('주소가 너무 길어요. 2,000자 이하의 주소를 입력해 주세요.');
    return u.href;
  }
  function renderQR(value) {
    if (typeof qrcodegen === 'undefined') throw new Error('QR 라이브러리를 불러오지 못했어요. 페이지를 새로고침해 주세요.');
    const qr = qrcodegen.QrCode.encodeText(value, qrcodegen.QrCode.Ecc.MEDIUM);
    const border = 4, scale = Math.max(4, Math.floor(800 / (qr.size + border * 2)));
    const canvas = $('#qr-canvas');
    canvas.width = canvas.height = (qr.size + border * 2) * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#173d30';
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
    }
    canvas.setAttribute('aria-label', value + '로 연결되는 QR 코드');
  }
  function shorten(url) {
    const cached = storage.read('yeon-short-' + url);
    if (typeof cached === 'string' && /^https:\/\/is\.gd\/[A-Za-z0-9_]+$/.test(cached)) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      const name = 'yeonShort_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      const script = document.createElement('script');
      let timeout;
      const cleanup = () => { clearTimeout(timeout); script.remove(); delete window[name]; };
      window[name] = data => {
        cleanup();
        if (data && typeof data.shorturl === 'string' && /^https:\/\/is\.gd\/[A-Za-z0-9_]+$/.test(data.shorturl)) {
          storage.write('yeon-short-' + url, data.shorturl); resolve(data.shorturl);
        } else {
          const message = data && Number(data.errorcode) === 3 ? '단축 서비스 요청 한도에 도달했어요. 1분 후 다시 시도해 주세요.' : '단축 서비스가 주소를 처리하지 못했어요. 공개된 웹 주소인지 확인하거나 잠시 후 다시 시도해 주세요.';
          reject(new Error(message));
        }
      };
      timeout = setTimeout(() => { cleanup(); reject(new Error('단축 서비스 응답이 늦어지고 있어요. 인터넷 연결을 확인하고 다시 시도해 주세요.')); }, 18000);
      script.onerror = () => { cleanup(); reject(new Error('단축 서비스에 연결할 수 없어요. 잠시 후 다시 시도하거나 URL2QR에서 QR만 만들어 주세요.')); };
      script.referrerPolicy = 'no-referrer';
      script.src = 'https://is.gd/create.php?' + new URLSearchParams({format: 'json', url, callback: name});
      document.head.appendChild(script);
    });
  }
  function setBusy(value) {
    busy = value; input.disabled = value;
    ['#submit', '#example', '#reset'].forEach(s => { $(s).disabled = value; });
    $('#convert-form').setAttribute('aria-busy', String(value));
  }
  $('#example').addEventListener('click', () => { input.value = 'https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site'; clearResult(); input.removeAttribute('aria-invalid'); status('예시 주소를 넣었어요. 변환 버튼을 눌러 보세요.'); input.focus(); });
  $('#reset').addEventListener('click', () => { input.value = ''; clearResult(); input.removeAttribute('aria-invalid'); status('주소를 입력하고 변환 버튼을 눌러 주세요.'); input.focus(); });
  input.addEventListener('input', () => { clearResult(); input.removeAttribute('aria-invalid'); status('새 주소를 변환할 준비가 됐어요.'); });
  $('#convert-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    clearResult();
    let original;
    try { original = normalize(input.value); } catch (err) { input.setAttribute('aria-invalid', 'true'); status(err.message, 'error'); input.focus(); return; }
    input.removeAttribute('aria-invalid'); setBusy(true);
    status(mode === 'short' ? '단축 URL을 발급하고 QR 코드를 만드는 중이에요…' : 'QR 코드를 만드는 중이에요…');
    try {
      const value = mode === 'short' ? await shorten(original) : original;
      renderQR(value); generatedUrl = value;
      $('#result-url').textContent = value; $('#result-url').href = value;
      $('#original-url').textContent = mode === 'short' ? '원본: ' + original : '스마트폰 카메라로 QR 코드를 스캔해 보세요.';
      $('#result').hidden = false; $('#empty-result').hidden = true; $('#result-badge').textContent = '변환 완료';
      status(mode === 'short' ? '단축 URL과 QR 코드를 만들었어요. 아래 주소를 눌러 연결을 확인해 보세요.' : 'QR 코드를 만들었어요. 이미지를 저장하거나 주소를 복사해 보세요.', 'success');
    } catch (err) { clearResult(); status(err.message || '변환에 실패했어요. 다시 시도해 주세요.', 'error'); }
    finally { setBusy(false); }
  });
  $('#copy').addEventListener('click', async () => {
    if (!generatedUrl) return;
    try { await navigator.clipboard.writeText(generatedUrl); status('주소를 클립보드에 복사했어요.', 'success'); }
    catch { const selection = window.getSelection(), range = document.createRange(); range.selectNodeContents($('#result-url')); selection.removeAllRanges(); selection.addRange(range); status('자동 복사가 차단됐어요. 선택된 주소를 Ctrl+C로 복사해 주세요.'); }
  });
  $('#download').addEventListener('click', () => {
    if (!generatedUrl) return;
    const a = document.createElement('a'); a.download = mode === 'short' ? 'yeon-qrnshort.png' : 'yeon-url2qr.png';
    a.href = $('#qr-canvas').toDataURL('image/png'); a.click(); status('QR 이미지 저장을 요청했어요. 브라우저 다운로드를 확인해 주세요.', 'success');
  });
})();
