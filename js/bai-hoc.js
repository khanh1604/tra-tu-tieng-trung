/* Trang bài học: từ mới, đọc, nghe, nói, viết, dịch */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } },
  };

  /* ---------- Chọn bài: ?bai=<id>, nếu không có thì mở bài lần trước ---------- */
  const LESSONS = window.LESSONS || [];
  const FIRST_ID = 'mot-xu'; // bài đầu tiên giữ tên khoá lưu trữ cũ để không mất tiến độ
  const L = LESSONS.find((x) => x.id === new URLSearchParams(location.search).get('bai'))
    || LESSONS.find((x) => x.id === store.get('bh-lesson'))
    || LESSONS[0];
  store.set('bh-lesson', L.id);
  const lessonKey = (k) => (L.id === FIRST_ID ? `bh-${k}` : `bh-${k}-${L.id}`);
  const isStory = L.kind === 'story';
  // đơn vị của mỗi khối: bài hội thoại tính theo câu, bài đọc theo đoạn (hoặc theo câu nếu bài khai báo unit)
  const unitOf = (ls) => ls.unit || (ls.kind === 'story' ? 'Đoạn' : 'Câu');
  const UNIT = unitOf(L);
  // nhãn của khối thứ i, ví dụ "Đoạn 2 · Câu 5" khi câu có số đoạn p
  const labelOf = (ls, i) => {
    const l = ls.lines[i];
    return l?.p ? `Đoạn ${l.p} · ${unitOf(ls)} ${i + 1}` : `${unitOf(ls)} ${i + 1}`;
  };

  const byW = new Map(L.vocab.map((v) => [v.w, v]));
  const HAN_RE = /\p{Script=Han}/u;
  const plain = (s) => s.replace(/[[\]]/g, '');
  const keywords = (s) => [...s.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- Thông báo nhỏ ---------- */
  let toastT;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ---------- Sổ từ: lưu những từ quên (dùng chung cho mọi bài) ----------
     Mỗi mục: { w, py, vi, lesson (id bài), line (chỉ số câu/đoạn, có thể null),
                forgot (số lần quên), box (0–3: số lần nhớ liên tiếp khi ôn), at } */
  const NB_KEY = 'bh-notebook';
  const DONE_BOX = 3;
  let nb = store.get(NB_KEY, []).filter((x) => x && x.w).map((x) => ({ lesson: FIRST_ID, ...x }));
  const nbGet = (w) => nb.find((x) => x.w === w);
  function nbPersist() {
    store.set(NB_KEY, nb);
    const due = nb.filter((x) => x.box < DONE_BOX).length;
    $('nbCount').textContent = due;
    $('nbCount').hidden = !due;
    refreshStars();
    if (!$('p-notebook').hidden) renderNotebook();
  }
  /* Thêm từ (hoặc tăng số lần quên nếu đã có) */
  function nbAdd(w, line = null, extra = {}) {
    w = w.trim();
    if (!w) return;
    const v = byW.get(w);
    const cur = nbGet(w);
    if (cur) {
      cur.forgot++; cur.box = 0; cur.at = Date.now();
      if (cur.line == null && line != null) { cur.line = line; cur.lesson = L.id; }
    } else {
      nb.unshift({ w, py: v?.py || extra.py || '', vi: v?.vi || extra.vi || '', lesson: L.id, line, forgot: 1, box: 0, at: Date.now() });
    }
    nbPersist();
  }
  function nbRemove(w) { nb = nb.filter((x) => x.w !== w); nbPersist(); }
  const star = (w, line) => {
    const on = !!nbGet(w);
    return `<button class="star${on ? ' on' : ''}" data-star="${esc(w)}" data-line="${line ?? ''}" title="${on ? 'Bỏ khỏi Sổ từ' : 'Lưu vào Sổ từ'}">${on ? '★' : '☆'}</button>`;
  };
  function refreshStars() {
    document.querySelectorAll('[data-star]').forEach((b) => {
      const on = !!nbGet(b.dataset.star);
      b.classList.toggle('on', on);
      b.textContent = on ? '★' : '☆';
      b.title = on ? 'Bỏ khỏi Sổ từ' : 'Lưu vào Sổ từ';
    });
  }
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-star]');
    if (s) {
      const w = s.dataset.star;
      if (nbGet(w)) { nbRemove(w); toast(`Đã bỏ ${w} khỏi Sổ từ.`); }
      else { nbAdd(w, s.dataset.line === '' ? null : +s.dataset.line); toast(`Đã lưu ${w} vào Sổ từ ★`); }
      return;
    }
    const all = e.target.closest('[data-saveall]');
    if (all) {
      const ws = all.dataset.saveall.split('|');
      ws.forEach((w) => nbAdd(w, +all.dataset.line));
      all.disabled = true;
      all.textContent = '✓ Đã lưu vào Sổ từ';
      toast(`Đã lưu ${ws.length} từ vào Sổ từ.`);
    }
  });

  /* ---------- Giọng đọc ---------- */
  let zhVoice = null;
  const hasTTS = 'speechSynthesis' in window;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    zhVoice = vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  if (hasTTS) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }
  let warnedVoice = false;
  function speak(text, rate) {
    return new Promise((res) => {
      if (!hasTTS) { toast('Trình duyệt không hỗ trợ đọc giọng nói.'); return res(); }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(plain(text));
      u.lang = 'zh-CN';
      if (zhVoice) u.voice = zhVoice;
      u.rate = rate ?? +$('rate').value;
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      u.onend = finish; u.onerror = finish;
      // phòng khi trình duyệt không báo kết thúc
      setTimeout(finish, 1500 + plain(text).length * 450 / u.rate);
      speechSynthesis.speak(u);
      if (!zhVoice && !warnedVoice && speechSynthesis.getVoices().length) {
        warnedVoice = true;
        toast('Máy chưa có giọng tiếng Trung, hãy cài thêm giọng đọc zh-CN trong cài đặt hệ thống.');
      }
    });
  }
  const stopSpeak = () => hasTTS && speechSynthesis.cancel();

  /* ---------- Nhận dạng giọng nói ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function recognize() {
    return new Promise((res, rej) => {
      if (!SR) return rej(new Error('nosr'));
      rec?.abort();
      rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = false;
      rec.maxAlternatives = 5;
      let got = [];
      rec.onresult = (e) => { got = [...e.results[0]].map((a) => a.transcript); };
      rec.onerror = (e) => rej(new Error(e.error));
      rec.onend = () => res(got);
      rec.start();
    });
  }

  /* So khớp từng chữ (LCS): trả về điểm và HTML tô màu chữ đúng/thiếu */
  const norm = (s) => [...plain(s)].filter((c) => /[\p{Script=Han}a-z0-9]/iu.test(c)).join('');
  function compare(expect, got) {
    const a = [...norm(expect)], b = [...norm(got)];
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const hit = new Array(a.length).fill(false);
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i] === b[j]) { hit[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    const score = a.length ? Math.round((dp[0][0] / a.length) * 100) : 0;
    const html = a.map((c, i) => `<span class="${hit[i] ? 'ok' : 'miss'}">${esc(c)}</span>`).join('');
    return { score, html };
  }
  const grade = (s) => (s >= 90 ? 'Rất tốt! 🎉' : s >= 70 ? 'Khá ổn 👍' : s >= 40 ? 'Cần luyện thêm' : 'Thử lại nhé');

  /* ---------- Hiển thị câu có từ in đỏ ---------- */
  const markup = (s) => esc(s).replace(/\[([^\]]+)\]/g, (_, w) => `<button class="kw han" data-w="${w}">${w}</button>`);
  // nhãn trên mỗi khối: tên người nói (hội thoại) hoặc "Đoạn N" (bài kể chuyện)
  const spName = (l, i) => (isStory ? labelOf(L, i) : `${L.speakers[l.sp]} <small>${L.speakersVi[l.sp]}</small>`);
  // câu đầu của mỗi đoạn có thêm khoảng cách phía trên
  const blockCls = (l, i) => (isStory
    ? `para${l.p && i > 0 && L.lines[i - 1].p !== l.p ? ' pstart' : ''}`
    : `sp-${l.sp}`);

  /* ---------- Tiêu đề và chọn bài ---------- */
  $('ttl').textContent = L.title;
  $('sub').textContent = `${L.titleVi} · ${L.lines.length} ${UNIT.toLowerCase()} · ${L.vocab.length} từ mới`;
  document.title = `Bài học: ${L.title}`;
  $('vocabN').textContent = L.vocab.length;
  $('lessons').innerHTML = LESSONS.map((x, k) => `<a href="?bai=${encodeURIComponent(x.id)}" class="lchip${x === L ? ' on' : ''}"${x === L ? ' aria-current="page"' : ''}>
      Bài ${k + 1}: <span class="han">${esc(x.title)}</span></a>`).join('');
  // giữ tab đang mở khi chuyển bài
  $('lessons').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) a.href = a.getAttribute('href').split('#')[0] + location.hash;
  });
  if (isStory) { $('roleRow').hidden = true; $('roleHint').hidden = true; }

  /* ---------- Tab ---------- */
  const TABS = ['vocab', 'read', 'listen', 'speak', 'write', 'trans', 'notebook'];
  function showTab(t) {
    if (!TABS.includes(t)) t = 'vocab';
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
    TABS.forEach((x) => { $('p-' + x).hidden = x !== t; });
    stopAll();
    if (t === 'write' && !writers.length) selectWord(L.vocab[0].w);
    if (t === 'notebook') { $('nbReview').hidden = true; renderNotebook(); }
    if (history.replaceState) history.replaceState(null, '', '#' + t);
    store.set('bh-tab', t);
  }
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) showTab(b.dataset.tab);
  });

  /* ---------- 1. Từ mới ---------- */
  const known = new Set(store.get(lessonKey('known'), []));
  function renderKnown() { $('known').textContent = `Đã thuộc ${[...known].filter((w) => byW.has(w)).length}/${L.vocab.length}`; }
  $('vgrid').innerHTML = L.vocab.map((v) => `
    <article class="vcard${known.has(v.w) ? ' known' : ''}" data-w="${esc(v.w)}">
      <div class="vhead">
        <span class="vw han">${esc(v.w)}</span>
        <button class="btn small" data-say="${esc(v.w)}" title="Nghe">🔊</button>
      </div>
      <p class="vpy">${esc(v.py)}${v.hv ? ` · <span class="vhv">${esc(v.hv)}</span>` : ''}</p>
      ${v.type ? `<p class="vtype">${esc(v.type)}</p>` : ''}
      <div class="vmean">
        <p class="vvi">${esc(v.vi)}</p>
        ${v.note ? `<p class="vnote">${esc(v.note)}</p>` : ''}
        ${v.ex ? `<div class="vex">
          <p><span class="han">${esc(v.ex)}</span> <button class="btn small" data-say="${esc(v.ex)}" title="Nghe ví dụ">🔊</button></p>
          <p class="ex-py">${esc(v.exPy || '')}</p>
          <p class="ex-vi">${esc(v.exVi || '')}</p>
        </div>` : ''}
      </div>
      <label class="vknown"><input type="checkbox" ${known.has(v.w) ? 'checked' : ''}> Đã thuộc</label>
    </article>`).join('');
  renderKnown();
  $('ggrid').innerHTML = L.grammar.map((g) => `
    <div class="gcard">
      <p class="gp han">${esc(g.p)}</p>
      <p class="gvi">${esc(g.vi)}</p>
      <p><span class="han">${esc(g.ex)}</span> <button class="btn small" data-say="${esc(g.ex)}">🔊</button></p>
      <p class="ex-vi">${esc(g.exVi)}</p>
    </div>`).join('');
  $('hideMean').addEventListener('change', (e) => {
    $('vgrid').classList.toggle('hide-mean', e.target.checked);
    document.querySelectorAll('.vcard.reveal').forEach((c) => c.classList.remove('reveal'));
  });
  $('vgrid').addEventListener('click', (e) => {
    const card = e.target.closest('.vcard');
    if (!card || e.target.closest('button, label')) return;
    if ($('vgrid').classList.contains('hide-mean')) card.classList.toggle('reveal');
  });
  $('vgrid').addEventListener('change', (e) => {
    const card = e.target.closest('.vcard');
    if (!card) return;
    e.target.checked ? known.add(card.dataset.w) : known.delete(card.dataset.w);
    card.classList.toggle('known', e.target.checked);
    store.set(lessonKey('known'), [...known]);
    renderKnown();
  });

  /* Nút 🔊 dùng chung cho cả trang */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-say]');
    if (b) speak(b.dataset.say, b.dataset.rate ? +b.dataset.rate : undefined);
  });

  /* ---------- Bảng nghĩa khi bấm chữ đỏ ---------- */
  const pop = $('pop');
  document.addEventListener('click', (e) => {
    const k = e.target.closest('.kw');
    if (k && !k.closest('.fill-q')) {
      const v = byW.get(k.dataset.w);
      if (!v) return;
      pop.innerHTML = `
        <div class="pop-head"><span class="han">${esc(v.w)}</span>
          ${star(v.w, k.closest('[data-line]')?.dataset.line)}
          <button class="btn small" data-say="${esc(v.w)}">🔊</button>
          <button class="btn small pop-x" aria-label="Đóng">✕</button></div>
        <p class="vpy">${esc(v.py)}${v.hv ? ` · <span class="vhv">${esc(v.hv)}</span>` : ''}</p>
        <p class="vvi">${esc(v.vi)}</p>
        ${v.note ? `<p class="vnote">${esc(v.note)}</p>` : ''}`;
      pop.hidden = false;
      const r = k.getBoundingClientRect();
      const w = Math.min(320, innerWidth - 24);
      pop.style.width = w + 'px';
      pop.style.left = Math.max(12, Math.min(r.left + scrollX, scrollX + innerWidth - w - 12)) + 'px';
      pop.style.top = r.bottom + scrollY + 8 + 'px';
      speak(v.w);
      return;
    }
    if (!e.target.closest('#pop') || e.target.closest('.pop-x')) pop.hidden = true;
  });

  /* ---------- 2. Đọc ---------- */
  $('readDlg').innerHTML = L.lines.map((l, i) => `
    <div class="bubble ${blockCls(l, i)}" data-line="${i}">
      <p class="who">${spName(l, i)}</p>
      <p class="zh han">${markup(l.zh)} <button class="btn small" data-say="${esc(plain(l.zh))}" title="Nghe ${UNIT.toLowerCase()} ${i + 1}">🔊</button></p>
      <p class="py">${esc(l.py)}</p>
      <p class="vi">${esc(l.vi)}</p>
    </div>`).join('');
  const syncRead = () => {
    $('readDlg').classList.toggle('no-py', !$('showPy').checked);
    $('readDlg').classList.toggle('show-vi', $('showVi').checked);
  };
  $('showPy').addEventListener('change', syncRead);
  $('showVi').addEventListener('change', syncRead);
  syncRead();

  /* ---------- 3. Nghe ---------- */
  $('listenDlg').innerHTML = L.lines.map((l, i) => `
    <div class="bubble ${blockCls(l, i)}" id="ls${i}" data-line="${i}">
      <p class="who">${spName(l, i)} <button class="btn small" data-say="${esc(plain(l.zh))}">🔊</button></p>
      <p class="zh han">${markup(l.zh)}</p>
      <p class="py">${esc(l.py)}</p>
      <p class="vi">${esc(l.vi)}</p>
    </div>`).join('');
  $('blind').addEventListener('change', (e) => $('listenDlg').classList.toggle('blind', e.target.checked));

  let runId = 0; // mỗi lần phát/đóng vai mới thì tăng, để dừng vòng cũ
  function stopAll() {
    runId++;
    stopSpeak();
    rec?.abort();
    document.querySelectorAll('.bubble.now').forEach((b) => b.classList.remove('now'));
  }
  $('stopAll').addEventListener('click', stopAll);
  $('playAll').addEventListener('click', async () => {
    stopAll();
    const id = runId;
    for (let i = 0; i < L.lines.length; i++) {
      if (id !== runId) return;
      document.querySelectorAll('#listenDlg .now').forEach((b) => b.classList.remove('now'));
      const b = $('ls' + i);
      b.classList.add('now');
      b.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await speak(L.lines[i].zh);
      await new Promise((r) => setTimeout(r, 350));
    }
    if (id === runId) $('ls' + (L.lines.length - 1)).classList.remove('now');
  });

  /* Nghe và điền từ */
  const fillLines = L.lines.filter((l) => keywords(l.zh).length);
  let fillScore = store.get(lessonKey('fill'), { right: 0, total: 0 });
  function newFill() {
    const l = fillLines[Math.floor(Math.random() * fillLines.length)];
    const kws = keywords(l.zh);
    const ans = kws[Math.floor(Math.random() * kws.length)];
    let blanked = false;
    const sentence = esc(l.zh).replace(/\[([^\]]+)\]/g, (_, w) => {
      if (w === ans && !blanked) { blanked = true; return '<span class="blank">＿＿</span>'; }
      return `<span class="red">${w}</span>`;
    });
    const opts = shuffle([ans, ...shuffle(L.vocab.map((v) => v.w).filter((w) => w !== ans)).slice(0, 3)]);
    $('fill').innerHTML = `
      <div class="fill-q">
        <div class="review-head"><h3>Nghe ${UNIT.toLowerCase()} rồi chọn từ còn thiếu</h3>
          <span class="streak">Đúng ${fillScore.right}/${fillScore.total}</span></div>
        <p class="player-row"><button class="btn primary" data-say="${esc(plain(l.zh))}">🔊 Nghe câu</button>
          <button class="btn" data-say="${esc(plain(l.zh))}" data-rate="0.55">🐢 Nghe chậm</button></p>
        <p class="fill-s han">${sentence}</p>
        <div class="opts">${opts.map((o) => `<button class="opt han" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <p class="q-msg" id="fillMsg"></p>
        <p class="fill-vi" hidden>${esc(l.vi)}</p>
        <button class="btn" id="fillNext" hidden>Câu khác →</button>
      </div>`;
    $('fill').dataset.ans = ans;
    $('fill').dataset.say = plain(l.zh);
  }
  $('fill').addEventListener('click', (e) => {
    if (e.target.id === 'fillNext') return newFill();
    const o = e.target.closest('.opt');
    if (!o || o.disabled) return;
    const ans = $('fill').dataset.ans;
    const ok = o.dataset.o === ans;
    const first = !$('fill').querySelector('.opt.wrong');
    o.classList.add(ok ? 'right' : 'wrong');
    o.disabled = true;
    if (!ok) { $('fillMsg').textContent = 'Chưa đúng, nghe lại rồi thử tiếp nhé.'; $('fillMsg').className = 'q-msg bad'; return; }
    fillScore.total++; if (first) fillScore.right++;
    store.set(lessonKey('fill'), fillScore);
    $('fill').querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
    const v = byW.get(ans);
    $('fill').querySelector('.blank').outerHTML = `<span class="red">${esc(ans)}</span>`;
    $('fillMsg').innerHTML = `${first ? 'Chính xác!' : 'Đúng rồi.'} <span class="han">${esc(ans)}</span> (${esc(v.py)}) nghĩa là ${esc(v.vi)}.`;
    $('fillMsg').className = 'q-msg ok';
    $('fill').querySelector('.fill-vi').hidden = false;
    $('fillNext').hidden = false;
    $('fill').querySelector('.streak').textContent = `Đúng ${fillScore.right}/${fillScore.total}`;
    speak($('fill').dataset.say);
  });
  newFill();

  /* ---------- 4. Nói ---------- */
  $('micNote').innerHTML = SR
    ? '🎙️ Bấm <b>Nói</b> rồi đọc to câu đó, máy sẽ chấm từng chữ: chữ <span class="ok">xanh</span> là đọc đúng, chữ <span class="miss">đỏ</span> là máy chưa nghe ra. Bấm <b>Thu</b> để ghi âm giọng mình, sau đó nghe lại để so với giọng mẫu.'
    : '⚠️ Trình duyệt này không hỗ trợ chấm giọng nói (hãy dùng Chrome hoặc Edge). Bạn vẫn có thể bấm <b>Thu</b> để ghi âm giọng mình và tự so với giọng mẫu.';
  $('speakDlg').innerHTML = L.lines.map((l, i) => `
    <div class="bubble ${blockCls(l, i)}" id="sk${i}" data-line="${i}">
      <p class="who">${spName(l, i)}</p>
      <p class="zh han">${markup(l.zh)}</p>
      <p class="py">${esc(l.py)}</p>
      <div class="sk-btns">
        <button class="btn small" data-say="${esc(plain(l.zh))}">🔊 Nghe</button>
        <button class="btn small" data-say="${esc(plain(l.zh))}" data-rate="0.55">🐢 Chậm</button>
        ${SR ? `<button class="btn small primary" data-mic="${i}">🎙️ Nói</button>` : ''}
        <button class="btn small" data-rec="${i}">⏺ Thu</button>
        <button class="btn small next" data-next="${i}" hidden>Tiếp ▶</button>
      </div>
      <div class="sk-res" id="skr${i}"></div>
      <audio class="sk-audio" id="ska${i}" controls hidden></audio>
    </div>`).join('');

  async function tryLine(i) {
    const out = $('skr' + i);
    const btn = document.querySelector(`[data-mic="${i}"]`);
    stopSpeak();
    out.innerHTML = '<span class="listening">● Đang nghe… hãy đọc câu này</span>';
    btn && (btn.disabled = true);
    try {
      const alts = await recognize();
      if (!alts.length) { out.innerHTML = '<span class="miss">Máy chưa nghe thấy gì. Hãy nói to và rõ hơn.</span>'; return 0; }
      const best = alts.map((t) => ({ t, ...compare(L.lines[i].zh, t) })).sort((a, b) => b.score - a.score)[0];
      out.innerHTML = `<p class="han sk-diff">${best.html}</p>
        <p><b>${best.score}%</b> · ${grade(best.score)} <span class="muted">(Máy nghe được: <span class="han">${esc(best.t)}</span>)</span></p>`;
      return best.score;
    } catch (err) {
      const m = err.message;
      out.innerHTML = `<span class="miss">${m === 'not-allowed' || m === 'service-not-allowed'
        ? 'Chưa được cấp quyền dùng micro. Hãy cho phép micro trên thanh địa chỉ.'
        : m === 'aborted' ? '' : 'Không nhận dạng được (' + esc(m) + '). Hãy thử lại.'}</span>`;
      return 0;
    } finally { btn && (btn.disabled = false); }
  }

  /* Thu âm để tự nghe lại */
  let recorder = null, recIdx = -1;
  async function toggleRecord(i) {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      if (recIdx === i) return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Trình duyệt không hỗ trợ ghi âm.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return toast('Chưa được cấp quyền dùng micro.'); }
    const chunks = [];
    recorder = new MediaRecorder(stream);
    recIdx = i;
    const b = document.querySelector(`[data-rec="${i}"]`);
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      b.textContent = '⏺ Thu lại';
      b.classList.remove('recording');
      const a = $('ska' + i);
      if (a.src) URL.revokeObjectURL(a.src);
      a.src = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
      a.hidden = false;
      a.play().catch(() => {});
    };
    recorder.start();
    b.textContent = '■ Dừng thu';
    b.classList.add('recording');
  }

  $('speakDlg').addEventListener('click', (e) => {
    const m = e.target.closest('[data-mic]');
    if (m) return tryLine(+m.dataset.mic);
    const r = e.target.closest('[data-rec]');
    if (r) return toggleRecord(+r.dataset.rec);
  });

  /* Đóng vai */
  async function rolePlay(role) {
    stopAll();
    const id = runId;
    document.querySelectorAll('[data-role]').forEach((b) => b.classList.toggle('primary', b.dataset.role === role));
    for (let i = 0; i < L.lines.length; i++) {
      if (id !== runId) return;
      const b = $('sk' + i);
      document.querySelectorAll('#speakDlg .now').forEach((x) => x.classList.remove('now', 'mine'));
      b.classList.add('now');
      b.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (L.lines[i].sp !== role) {
        await speak(L.lines[i].zh);
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      b.classList.add('mine');
      if (SR) {
        await tryLine(i);
        await new Promise((r) => setTimeout(r, 900));
      } else {
        const nx = b.querySelector('[data-next]');
        nx.hidden = false;
        await new Promise((r) => {
          const go = () => { nx.removeEventListener('click', go); clearInterval(t); r(); };
          nx.addEventListener('click', go);
          const t = setInterval(() => { if (id !== runId) go(); }, 300);
        });
        nx.hidden = true;
      }
    }
    if (id === runId) { toast('Hết bài rồi! Thử đổi sang vai kia nhé.'); stopAll(); }
  }
  document.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => rolePlay(b.dataset.role)));
  $('roleStop').addEventListener('click', () => {
    stopAll();
    document.querySelectorAll('[data-role]').forEach((b) => b.classList.remove('primary'));
    document.querySelectorAll('[data-next]').forEach((b) => { b.hidden = true; });
  });

  /* ---------- 5. Viết ---------- */
  let writers = [];
  $('wchips').innerHTML = L.vocab.map((v) => `<button class="wchip han" data-ww="${esc(v.w)}">${esc(v.w)}</button>`).join('');
  $('wchips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ww]');
    if (b) selectWord(b.dataset.ww);
  });
  function selectWord(w) {
    const v = byW.get(w) || nbGet(w) || { py: '', vi: '' };
    document.querySelectorAll('.wchip').forEach((b) => b.classList.toggle('on', b.dataset.ww === w));
    const chars = [...w].filter((c) => HAN_RE.test(c));
    $('wcard').innerHTML = `
      <div class="whead">
        <div><p class="vw han">${esc(w)}</p><p class="vpy">${esc([v.py, v.vi].filter(Boolean).join(' · '))}</p></div>
        <div class="actions">
          <button class="btn" data-say="${esc(w)}">🔊 Nghe</button>
          <button class="btn primary" id="animAll">▶ Xem cả từ</button>
        </div>
      </div>
      <div class="writers">${chars.map((c, i) => `
        <div class="wr">
          <div class="wr-box" id="bw${i}" aria-label="Cách viết chữ ${esc(c)}"></div>
          <p class="wr-info"><span class="han">${esc(c)}</span> · <span id="bwc${i}">…</span></p>
          <div class="wr-btns">
            <button class="btn small" data-wa="anim" data-i="${i}" title="Xem thứ tự nét">▶</button>
            <button class="btn small" data-wa="quiz" data-i="${i}" title="Viết theo nét mờ">✍️</button>
            <button class="btn small" data-wa="blind" data-i="${i}" title="Tự viết, không có nét mờ">🧠</button>
          </div>
        </div>`).join('')}</div>`;
    writers = [];
    if (!window.HanziWriter) {
      $('wcard').querySelector('.writers').innerHTML = '<p class="hint">Không tải được thư viện hướng dẫn viết (cần kết nối mạng).</p>';
      return;
    }
    const css = getComputedStyle(document.documentElement);
    chars.forEach((c, i) => {
      writers.push(HanziWriter.create('bw' + i, c, {
        width: 150, height: 150, padding: 8,
        strokeColor: css.getPropertyValue('--red').trim() || '#a3201b',
        radicalColor: css.getPropertyValue('--gold').trim() || '#b8913f',
        outlineColor: '#e6dac5', highlightColor: '#b8913f', drawingColor: '#3a2a1f', drawingWidth: 6,
        strokeAnimationSpeed: 1, delayBetweenStrokes: 250, showHintAfterMisses: 2,
        charDataLoader: (ch, onLoad, onErr) => {
          fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(onLoad, onErr);
        },
        onLoadCharDataSuccess: (d) => { const el = $('bwc' + i); if (el) el.textContent = `${d.strokes.length} nét`; },
        onLoadCharDataError: () => { const el = $('bwc' + i); if (el) el.textContent = 'chưa có dữ liệu nét'; },
      }));
    });
  }
  const animate = (w) => new Promise((res) => { w.cancelQuiz?.(); w.showOutline(); w.hideCharacter(); w.animateCharacter({ onComplete: res }); });
  $('wcard').addEventListener('click', async (e) => {
    if (e.target.id === 'animAll') {
      const list = writers;
      for (const w of list) { if (writers !== list) return; await animate(w); }
      return;
    }
    const b = e.target.closest('[data-wa]');
    if (!b) return;
    const w = writers[+b.dataset.i];
    if (!w) return;
    if (b.dataset.wa === 'anim') return animate(w);
    w.hideCharacter();
    b.dataset.wa === 'blind' ? w.hideOutline() : w.showOutline();
    w.quiz({
      onComplete: ({ totalMistakes }) => {
        w.showOutline();
        toast(totalMistakes ? `Xong! Sai ${totalMistakes} nét, thử lại nhé.` : 'Viết đúng hết các nét! 🎉');
      },
    });
  });

  /* ---------- 6. Dịch ---------- */
  let dir = 'vz';
  function renderTrans() {
    $('transHint').textContent = dir === 'vz'
      ? 'Đọc câu tiếng Việt rồi gõ câu tiếng Trung (có thể gõ bằng bộ gõ pinyin hoặc bấm 🎙️ để nói). Bấm “Kiểm tra” để máy chấm từng chữ.'
      : 'Đọc câu tiếng Trung rồi tự dịch sang tiếng Việt, sau đó bấm “Xem đáp án” để so sánh.';
    $('tlist').innerHTML = L.lines.map((l, i) => {
      const hints = keywords(l.zh).filter((w, k, a) => a.indexOf(w) === k).map((w) => byW.get(w))
        .map((v) => `<span class="hchip">${star(v.w, i)}<span class="han">${esc(v.w)}</span> ${esc(v.py)}: ${esc(v.vi)}</span>`).join('');
      return `<div class="card tcard" data-i="${i}">
        <p class="tnum">${isStory ? labelOf(L, i) : `${UNIT} ${i + 1} · ${L.speakersVi[l.sp]}`}</p>
        ${dir === 'vz'
          ? `<p class="tsrc">${esc(l.vi)}</p>`
          : `<p class="tsrc han">${esc(plain(l.zh))} <button class="btn small" data-say="${esc(plain(l.zh))}">🔊</button></p>`}
        <textarea rows="${isStory ? 3 : 2}" lang="${dir === 'vz' ? 'zh' : 'vi'}" placeholder="${dir === 'vz' ? 'Gõ câu tiếng Trung…' : 'Gõ bản dịch tiếng Việt…'}"></textarea>
        <div class="sk-btns">
          ${dir === 'vz' ? '<button class="btn small primary" data-t="check">Kiểm tra</button>' : ''}
          ${dir === 'vz' && SR ? '<button class="btn small" data-t="mic">🎙️ Nói</button>' : ''}
          <button class="btn small" data-t="hint">💡 Gợi ý</button>
          <button class="btn small" data-t="ans">Xem đáp án</button>
        </div>
        <div class="thint" hidden>${hints || '<span class="muted">Câu này không có từ mới.</span>'}</div>
        <div class="tres"></div>
        <div class="tans" hidden>
          ${dir === 'vz'
            ? `<p class="han">${esc(plain(l.zh))} <button class="btn small" data-say="${esc(plain(l.zh))}">🔊</button></p><p class="ex-py">${esc(l.py)}</p>`
            : `<p>${esc(l.vi)}</p><p class="ex-py">${esc(l.py)}</p>`}
          ${hints ? `<p class="tsave-t">Quên từ nào thì bấm ☆ để lưu vào Sổ từ:</p><div class="thint">${hints}</div>` : ''}
          <form class="addform" data-line="${i}">
            <input name="w" placeholder="Từ khác bị quên (chữ Hán)" lang="zh" required>
            <input name="py" placeholder="Pinyin">
            <input name="vi" placeholder="Nghĩa">
            <button class="btn small">＋ Lưu</button>
          </form>
        </div>
      </div>`;
    }).join('');
  }
  const dirSeg = document.querySelector('#p-trans .seg');
  dirSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]');
    if (!b || b.dataset.dir === dir) return;
    dir = b.dataset.dir;
    dirSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderTrans();
  });
  $('tlist').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const card = b.closest('.tcard');
    const l = L.lines[+card.dataset.i];
    const ta = card.querySelector('textarea');
    const t = b.dataset.t;
    if (t === 'hint') card.querySelector('.thint').hidden = !card.querySelector('.thint').hidden;
    if (t === 'ans') card.querySelector('.tans').hidden = false;
    if (t === 'mic') {
      b.disabled = true;
      card.querySelector('.tres').innerHTML = '<span class="listening">● Đang nghe…</span>';
      try {
        const alts = await recognize();
        ta.value = alts.map((x) => ({ x, s: compare(l.zh, x).score })).sort((p, q) => q.s - p.s)[0]?.x || '';
        card.querySelector('.tres').innerHTML = '';
        if (ta.value) card.querySelector('[data-t="check"]').click();
      } catch { card.querySelector('.tres').innerHTML = '<span class="miss">Không nhận dạng được, hãy thử lại.</span>'; }
      finally { b.disabled = false; }
    }
    if (t === 'check') {
      if (!norm(ta.value)) { card.querySelector('.tres').innerHTML = '<span class="miss">Hãy gõ câu trả lời trước.</span>'; return; }
      const r = compare(l.zh, ta.value);
      // từ mới của câu mà bài làm không có
      const missed = [...new Set(keywords(l.zh))].filter((w) => !norm(ta.value).includes(w));
      const i = +card.dataset.i;
      card.querySelector('.tres').innerHTML = `<p class="han sk-diff">${r.html}</p><p><b>${r.score}%</b> · ${grade(r.score)}</p>
        ${missed.length ? `<div class="tmiss">
          <p>Từ bạn còn thiếu hoặc viết sai:</p>
          <div class="thint">${missed.map((w) => `<span class="hchip">${star(w, i)}<span class="han">${esc(w)}</span> ${esc(byW.get(w).py)}: ${esc(byW.get(w).vi)}</span>`).join('')}</div>
          <button class="btn small primary" data-saveall="${esc(missed.join('|'))}" data-line="${i}">⭐ Lưu tất cả vào Sổ từ</button>
        </div>` : ''}`;
      card.querySelector('.tans').hidden = false;
    }
  });
  renderTrans();

  /* Ô "thêm từ khác" (ở phần Dịch và trong Sổ từ) */
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('.addform');
    if (!f) return;
    e.preventDefault();
    const w = f.w.value.trim();
    if (!w) return;
    nbAdd(w, f.dataset.line ? +f.dataset.line : null, { py: f.py.value.trim(), vi: f.vi.value.trim() });
    f.reset();
    toast(`Đã lưu ${w} vào Sổ từ ★`);
  });

  /* ---------- 7. Sổ từ ---------- */
  let nbFilter = 'due';
  // bài và câu/đoạn nơi từ bị quên (từ có thể thuộc bài khác bài đang mở)
  const lessonOf = (x) => LESSONS.find((y) => y.id === x.lesson);
  const lineOf = (x) => lessonOf(x)?.lines[x.line];
  const lineCtx = (x) => {
    const ls = lessonOf(x), l = lineOf(x);
    const tag = ls && LESSONS.length > 1 ? `<span class="nb-lesson">Bài ${LESSONS.indexOf(ls) + 1}: <span class="han">${esc(ls.title)}</span></span>` : '';
    if (!l) return tag ? `<p>${tag}</p>` : '';
    const s = esc(plain(l.zh)).split(esc(x.w)).join(`<b class="red">${esc(x.w)}</b>`);
    return `<p class="nb-ctx"><span class="han">${s}</span> <button class="btn small" data-say="${esc(plain(l.zh))}">🔊</button></p>
      <p class="ex-vi">${tag} ${labelOf(ls, x.line)}: ${esc(l.vi)}</p>`;
  };
  const dots = (b) => `<span class="dots" title="Nhớ liên tiếp ${b}/${DONE_BOX} lần">${Array.from({ length: DONE_BOX }, (_, k) => `<i class="${k < b ? 'on' : ''}"></i>`).join('')}</span>`;

  function renderNotebook() {
    const due = nb.filter((x) => x.box < DONE_BOX);
    $('nbStat').textContent = nb.length ? `${nb.length} từ · ${due.length} cần ôn` : '';
    $('nbStart').disabled = !nb.length;
    const list = nbFilter === 'due' ? due : nbFilter === 'done' ? nb.filter((x) => x.box >= DONE_BOX) : nb;
    if (!nb.length) {
      $('nbList').innerHTML = '<p class="empty-nb">Sổ từ đang trống. Vào phần <b>🔁 Dịch</b>, khi quên từ nào thì bấm ☆ để lưu lại đây nhé.</p>';
      return;
    }
    if (!list.length) {
      $('nbList').innerHTML = `<p class="empty-nb">${nbFilter === 'due' ? 'Không còn từ nào cần ôn. Giỏi lắm! 🎉' : 'Chưa có từ nào ở mục này.'}</p>`;
      return;
    }
    $('nbList').innerHTML = list.map((x) => `
      <article class="nbitem${x.box >= DONE_BOX ? ' done' : ''}">
        <div class="nb-main">
          <span class="vw han">${esc(x.w)}</span>
          <div>
            <p class="vpy">${esc(x.py || '—')}</p>
            <p class="vvi">${esc(x.vi || '(chưa có nghĩa)')}</p>
          </div>
        </div>
        ${lineCtx(x)}
        <div class="nb-foot">
          <span class="muted">Quên ${x.forgot} lần</span> ${dots(x.box)}
          <span class="nb-btns">
            <button class="btn small" data-say="${esc(x.w)}" title="Nghe">🔊</button>
            <button class="btn small" data-nbw="${esc(x.w)}" title="Tập viết">✍️</button>
            <button class="btn small" data-nbdel="${esc(x.w)}" title="Xoá khỏi sổ">🗑</button>
          </span>
        </div>
      </article>`).join('');
  }
  $('nbFilter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    nbFilter = b.dataset.f;
    $('nbFilter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    renderNotebook();
  });
  $('nbList').addEventListener('click', (e) => {
    const d = e.target.closest('[data-nbdel]');
    if (d) { nbRemove(d.dataset.nbdel); return; }
    const w = e.target.closest('[data-nbw]');
    if (w) { showTab('write'); selectWord(w.dataset.nbw); }
  });

  /* Ôn tập: nhìn nghĩa (và câu có chỗ trống) → nhớ lại chữ Hán */
  let queue = [], qi = 0;
  function startReview() {
    const due = nb.filter((x) => x.box < DONE_BOX);
    queue = shuffle((due.length ? due : nb).map((x) => x.w));
    qi = 0;
    $('nbReview').hidden = false;
    showCard(false);
    $('nbReview').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function showCard(revealed) {
    const box = $('nbReview');
    if (qi >= queue.length) {
      box.innerHTML = `<p class="rv-done">Xong lượt ôn ${queue.length} từ! 🎉</p>
        <p class="player-row"><button class="btn primary" id="rvAgain">Ôn lượt nữa</button><button class="btn" id="rvClose">Đóng</button></p>`;
      return;
    }
    const x = nbGet(queue[qi]);
    if (!x) { qi++; return showCard(false); }
    const l = lineOf(x);
    const blank = l ? esc(plain(l.zh)).split(esc(x.w)).join(revealed ? `<b class="red">${esc(x.w)}</b>` : '<span class="blank">＿＿</span>') : '';
    box.innerHTML = `
      <div class="review-head"><h3>Ôn tập</h3><span class="streak">${qi + 1}/${queue.length}</span></div>
      <p class="rv-q">${esc(x.vi || '(không có nghĩa)')}</p>
      ${l ? `<p class="rv-ctx han">${blank}</p><p class="ex-vi">${esc(l.vi)}</p>` : ''}
      ${revealed
        ? `<p class="rv-a"><span class="han">${esc(x.w)}</span> <span class="vpy">${esc(x.py)}</span> <button class="btn small" data-say="${esc(x.w)}">🔊</button></p>
           <p class="player-row"><button class="btn rv-bad" data-rv="0">😕 Vẫn quên</button><button class="btn rv-good" data-rv="1">🙂 Nhớ rồi</button></p>`
        : `<p class="hint">Hãy nhớ lại chữ Hán của từ này (nói thành tiếng hoặc viết ra giấy), rồi bấm xem đáp án.</p>
           <p class="player-row"><button class="btn primary" data-rv="show">Xem đáp án</button></p>`}`;
    if (revealed) speak(x.w);
  }
  $('nbStart').addEventListener('click', startReview);
  $('nbReview').addEventListener('click', (e) => {
    if (e.target.id === 'rvAgain') return startReview();
    if (e.target.id === 'rvClose') { $('nbReview').hidden = true; return; }
    const b = e.target.closest('[data-rv]');
    if (!b) return;
    if (b.dataset.rv === 'show') return showCard(true);
    const x = nbGet(queue[qi]);
    if (x) {
      if (b.dataset.rv === '1') x.box = Math.min(DONE_BOX, x.box + 1);
      else { x.box = 0; x.forgot++; }
      x.at = Date.now();
      store.set(NB_KEY, nb);
    }
    qi++;
    nbPersist();
    showCard(false);
  });
  nbPersist();

  /* ---------- Mở tab ---------- */
  showTab(location.hash.slice(1) || store.get('bh-tab', 'vocab'));
  addEventListener('hashchange', () => showTab(location.hash.slice(1)));
})();
