/* Tra từ tiếng Trung — tìm kiếm, pinyin, giọng đọc (Web Speech API), link chia sẻ ?w=<từ> */
(() => {
  const $ = (id) => document.getElementById(id);
  const els = { q: $('q'), detail: $('detail'), list: $('list'), listTitle: $('listTitle'), empty: $('empty'), toast: $('toast') };
  const WORDS = window.WORDS || [];
  const byWord = new Map(WORDS.map((x) => [x.w, x]));

  /* ---------- Chuẩn hoá để tìm kiếm ---------- */
  // Bỏ dấu (pinyin + tiếng Việt), bỏ khoảng trắng: "nǐ hǎo" -> "nihao", "cảm ơn" -> "camon"
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[\s'’,.\-]/g, '');
  const index = WORDS.map((x) => ({ x, keys: [x.w, norm(x.py), norm(x.hv), norm(x.nghia)] }));

  function search(q) {
    const raw = q.trim();
    if (!raw) return WORDS;
    const n = norm(raw);
    const scored = [];
    for (const { x, keys } of index) {
      let s = 0;
      if (x.w === raw || keys[1] === n) s = 100;
      else if (raw.includes(x.w) || x.w.includes(raw)) s = 80;
      else if (keys[1].startsWith(n)) s = 60;
      else if (keys[3].includes(n) || keys[2].includes(n)) s = 40;
      else if (keys[1].includes(n)) s = 20;
      if (s) scored.push([s, x]);
    }
    return scored.sort((a, b) => b[0] - a[0]).map((p) => p[1]);
  }

  /* ---------- Giọng đọc ---------- */
  let zhVoice = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices();
    zhVoice = vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  }
  function speak(text, rate = 0.85) {
    if (!('speechSynthesis' in window)) return toast('Trình duyệt không hỗ trợ đọc giọng nói.');
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    if (zhVoice) u.voice = zhVoice;
    u.rate = rate;
    speechSynthesis.speak(u);
    if (!zhVoice && speechSynthesis.getVoices().length) {
      toast('Máy chưa có giọng tiếng Trung — hãy cài thêm giọng đọc zh-CN trong cài đặt hệ thống.');
    }
  }

  /* ---------- Link chia sẻ ---------- */
  const linkFor = (w) => {
    const u = new URL(location.href);
    u.search = '?w=' + encodeURIComponent(w);
    u.hash = '';
    return u.toString();
  };

  async function share(x) {
    const url = linkFor(x.w);
    const data = { title: `${x.w} (${x.py}) — ${x.nghia}`, text: `${x.w} · ${x.py} · ${x.nghia}`, url };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Đã sao chép link: ' + decodeURIComponent(url));
    } catch {
      prompt('Sao chép link này:', url);
    }
  }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
  }

  /* ---------- Hiển thị ---------- */
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const href = (w) => '?w=' + encodeURIComponent(w);

  function renderList(items) {
    els.list.innerHTML = items.map((x) => `
      <li><a href="${href(x.w)}" data-w="${esc(x.w)}">
        <span class="han">${esc(x.w)}</span>
        <span class="py">${esc(x.py)}</span>
        <span class="vi">${esc(x.nghia)}</span>
      </a></li>`).join('');
    els.empty.hidden = items.length > 0;
  }

  // Mục "Ý nghĩa Hán tự": tách từng chữ trong từ
  function renderChars(w) {
    const CHARS = window.CHARS || {};
    const items = [...new Set(w)].filter((c) => CHARS[c]);
    if (!items.length) return '';
    return `<section class="hanzi">
      <h3>Ý nghĩa Hán tự</h3>
      ${items.map((c) => {
        const d = CHARS[c];
        return `<div class="hz">
          <button class="hz-char han" data-act="char" data-c="${esc(c)}" title="Nghe chữ ${esc(c)}" lang="zh-CN">${esc(c)}</button>
          <div class="hz-body">
            <p class="hz-title"><span class="hz-hv">${esc(d.hv)}</span> · <span class="hz-py">${esc(d.py)}</span></p>
            <p class="hz-mean">${esc(d.nghia)}</p>
            <p class="hz-meta">Bộ: <span class="han">${esc(d.bo)}</span>${d.pt ? ` · Phồn thể: <span class="han pt">${esc(d.pt)}</span>` : ''}</p>
            ${d.ct ? `<p class="hz-ct">${esc(d.ct)}</p>` : ''}
          </div>
        </div>`;
      }).join('')}
    </section>`;
  }

  function renderDetail(x) {
    if (!x) { els.detail.hidden = true; els.detail.innerHTML = ''; return; }
    // Từ liên quan: có chung ít nhất một chữ
    const related = WORDS.filter((y) => y !== x && [...x.w].some((c) => y.w.includes(c)));
    const [ex, exPy, exVi] = x.vd;
    els.detail.innerHTML = `
      <div class="head">
        <h1 class="han big" lang="zh-CN">${esc(x.w)}</h1>
        <div class="actions">
          <button class="btn primary" data-act="say" title="Nghe đọc">🔊 Nghe</button>
          <button class="btn" data-act="slow" title="Đọc chậm">🐢 Chậm</button>
          <button class="btn" data-act="write" title="Xem cách viết">✍️ Cách viết</button>
          <button class="btn" data-act="share" title="Chia sẻ link">🔗 Chia sẻ</button>
        </div>
      </div>
      <p class="pinyin">${esc(x.py)}</p>
      <dl>
        <dt>Nghĩa</dt><dd class="meaning">${esc(x.nghia)}</dd>
        <dt>Hán Việt</dt><dd>${esc(x.hv)}</dd>
        <dt>Từ loại</dt><dd>${esc(x.loai)}</dd>
      </dl>
      ${renderChars(x.w)}
      ${renderWriting(x.w)}
      <div class="example">
        <div class="ex-head"><strong>Ví dụ</strong>
          <button class="btn small" data-act="ex" title="Nghe câu ví dụ">🔊</button></div>
        <p class="han ex" lang="zh-CN">${esc(ex)}</p>
        <p class="ex-py">${esc(exPy)}</p>
        <p class="ex-vi">${esc(exVi)}</p>
      </div>
      ${related.length ? `<div class="related"><strong>Từ liên quan</strong>
        ${related.map((y) => `<a class="chip" href="${href(y.w)}" data-w="${esc(y.w)}"><span class="han">${esc(y.w)}</span> ${esc(y.py)}</a>`).join('')}
      </div>` : ''}
      <div class="sharelink"><input readonly value="${esc(decodeURIComponent(linkFor(x.w)))}" aria-label="Link của từ"></div>`;
    els.detail.hidden = false;
    els.detail.onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      const act = btn?.dataset.act;
      if (act === 'char') speak(btn.dataset.c, 0.7);
      else if (act === 'say') speak(x.w);
      else if (act === 'slow') speak(x.w, 0.5);
      else if (act === 'ex') speak(ex);
      else if (act === 'share') share(x);
      else if (act === 'write') {
        $('writing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        animateAll();
      } else if (act === 'anim') animateOne(+btn.dataset.i);
      else if (act === 'quiz') quizOne(+btn.dataset.i);
    };
    els.detail.querySelector('.sharelink input').onclick = (e) => e.target.select();
    mountWriters([...x.w].filter((c) => HAN_RE.test(c)));
  }

  /* ---------- Hướng dẫn viết (Hanzi Writer: thứ tự nét) ---------- */
  const HAN_RE = /\p{Script=Han}/u;
  let writers = [];

  function renderWriting(w) {
    const chars = [...w].filter((c) => HAN_RE.test(c));
    if (!chars.length) return '';
    return `<section class="writing" id="writing">
      <h3>Hướng dẫn viết</h3>
      <p class="writing-hint">Bấm ▶ để xem thứ tự từng nét. Bấm ✍️ rồi tự viết lên ô bằng chuột hoặc ngón tay; viết sai nét sẽ được nhắc.</p>
      <div class="writers">
        ${chars.map((c, i) => `<div class="wr">
          <div class="wr-box" id="wr${i}" aria-label="Cách viết chữ ${esc(c)}"></div>
          <p class="wr-info"><span class="han">${esc(c)}</span> · <span class="wr-count" id="wrc${i}">…</span></p>
          <div class="wr-btns">
            <button class="btn small" data-act="anim" data-i="${i}" title="Xem thứ tự nét">▶ Xem</button>
            <button class="btn small" data-act="quiz" data-i="${i}" title="Tự tập viết">✍️ Tập viết</button>
          </div>
        </div>`).join('')}
      </div>
    </section>`;
  }

  function mountWriters(chars) {
    writers = [];
    if (!chars.length) return;
    if (!window.HanziWriter) {
      $('writing').querySelector('.writers').innerHTML = '<p class="writing-hint">Không tải được thư viện hướng dẫn viết (cần kết nối mạng).</p>';
      return;
    }
    const css = getComputedStyle(document.documentElement);
    const red = css.getPropertyValue('--red').trim() || '#a3201b';
    const gold = css.getPropertyValue('--gold').trim() || '#b8913f';
    chars.forEach((c, i) => {
      const w = HanziWriter.create(`wr${i}`, c, {
        width: 150, height: 150, padding: 8,
        strokeColor: red, radicalColor: gold, outlineColor: '#e6dac5',
        highlightColor: gold, drawingColor: '#3a2a1f', drawingWidth: 6,
        strokeAnimationSpeed: 1, delayBetweenStrokes: 250,
        showHintAfterMisses: 2,
        charDataLoader: (ch, onLoad, onErr) => {
          fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${encodeURIComponent(ch)}.json`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then(onLoad, onErr);
        },
        onLoadCharDataSuccess: (data) => { const el = $(`wrc${i}`); if (el) el.textContent = `${data.strokes.length} nét`; },
        onLoadCharDataError: () => { const el = $(`wrc${i}`); if (el) el.textContent = 'chưa có dữ liệu nét'; },
      });
      writers.push(w);
    });
  }

  function animateOne(i) {
    const w = writers[i];
    if (!w) return Promise.resolve();
    w.cancelQuiz?.();
    return new Promise((res) => { w.hideCharacter(); w.animateCharacter({ onComplete: res }); });
  }

  async function animateAll() {
    const list = writers;
    for (let i = 0; i < list.length; i++) {
      if (writers !== list) return; // đã chuyển sang từ khác
      await animateOne(i);
    }
  }

  function quizOne(i) {
    const w = writers[i];
    if (!w) return;
    w.hideCharacter();
    w.quiz({
      onComplete: ({ totalMistakes }) => {
        toast(totalMistakes ? `Xong! Sai ${totalMistakes} nét — thử lại nhé.` : 'Viết đúng hết các nét! 🎉');
      },
    });
  }

  /* ---------- Điều hướng ---------- */
  function route() {
    const w = new URLSearchParams(location.search).get('w');
    const x = w ? byWord.get(w.trim()) : null;
    renderDetail(x);
    if (w && !x) {
      els.detail.hidden = false;
      els.detail.innerHTML = `<p>Chưa có từ <span class="han">${esc(w)}</span> trong từ điển.</p>`;
    }
    document.title = x ? `${x.w} ${x.py} – ${x.nghia} | Tra Từ Tiếng Trung` : 'Tra Từ Tiếng Trung';
    if (x) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function go(w) {
    history.pushState(null, '', href(w));
    route();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-w]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(a.dataset.w);
  });
  window.addEventListener('popstate', route);

  els.q.addEventListener('input', () => {
    const items = search(els.q.value);
    els.listTitle.textContent = els.q.value.trim() ? `Kết quả (${items.length})` : 'Tất cả từ';
    renderList(items);
  });
  els.q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = search(els.q.value)[0];
    if (first) go(first.w);
  });

  renderList(WORDS);
  route();
})();
