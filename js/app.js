/* ============ 内耗账单 · 应用逻辑 ============ */
(function () {
  'use strict';

  var cloud = WorkBuddyCloud.createWorkBuddyCloud({
    endpoint: window.PUBLIC_CONFIG.endpoint,
    publishableKey: window.PUBLIC_CONFIG.publishableKey
  });

  // ---------- 状态 ----------
  // 演示模式：非正式部署域名（GitHub Pages、本地文件等）跳过密码门，直接答题
  var PROD_HOST = 'neihao-test-55278.app.workbuddy.host';
  var IS_DEMO = location.hostname !== PROD_HOST;

  var state = {
    password: '',          // 本次会话使用的密码
    answers: new Array(30).fill(0), // 每题已选 value（0=未答）
    current: 0,
    lastResult: null,      // { d:[5], total, hours, tierIdx, typeIdx, dualIdx }
    saving: false
  };

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }
  var screens = {
    gate: $('screen-gate'),
    quiz: $('screen-quiz'),
    result: $('screen-result')
  };

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('active', k === name);
    });
    window.scrollTo(0, 0);
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, ms || 2200);
  }

  function openModal(id) { $(id).style.display = 'flex'; }
  function closeModal(id) { $(id).style.display = 'none'; }

  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (el) {
    el.addEventListener('click', function () { closeModal(el.getAttribute('data-close')); });
  });
  // 点击遮罩关闭
  Array.prototype.forEach.call(document.querySelectorAll('.modal'), function (m) {
    m.addEventListener('click', function (e) {
      if (e.target === m) m.style.display = 'none';
    });
  });

  // ---------- 密码核销（云端） ----------
  // 返回值：>0 剩余次数；0 次数已用完；-1 密码无效
  function redeemCode(code) {
    return cloud.database.rpc('redeem_code', { p_code: code }).then(function (res) {
      if (res.error) throw res.error;
      var row = res.data;
      return (row === null || row === undefined) ? -1 : Number(row);
    });
  }

  // ---------- 密码门 ----------
  $('btn-start').addEventListener('click', function () {
    var code = $('pwd-input').value.trim();
    var errEl = $('gate-error');
    errEl.textContent = '';
    if (!code) { errEl.textContent = '请先输入测评密码'; return; }

    var btn = $('btn-start');
    btn.disabled = true;
    btn.textContent = '校验中…';

    redeemCode(code).then(function (remaining) {
      btn.disabled = false;
      btn.textContent = '开始测试';
      if (remaining === -1) {
        errEl.textContent = '密码无效，请检查后重新输入';
        return;
      }
      if (remaining === 0) {
        errEl.textContent = '该密码的 3 次测试次数已用完';
        return;
      }
      state.password = code;
      startQuiz();
      toast('校验成功，该密码剩余 ' + remaining + ' 次测试机会');
    }).catch(function () {
      btn.disabled = false;
      btn.textContent = '开始测试';
      errEl.textContent = '网络异常，请稍后重试';
    });
  });
  $('pwd-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') $('btn-start').click();
  });

  // ---------- 答题 ----------
  function startQuiz() {
    state.answers = new Array(30).fill(0);
    state.current = 0;
    renderQuestion();
    show('quiz');
  }

  function renderQuestion() {
    var i = state.current;
    var q = QUESTIONS[i];
    $('quiz-cur').textContent = i + 1;
    $('quiz-qnum').textContent = i + 1;
    $('quiz-progress-fill').style.width = ((i + 1) / 30 * 100) + '%';
    $('quiz-question').textContent = q.text;

    var box = $('quiz-options');
    box.innerHTML = '';
    OPTIONS.forEach(function (opt) {
      var b = document.createElement('button');
      b.className = 'opt-btn' + (state.answers[i] === opt.value ? ' selected' : '');
      b.textContent = opt.label;
      b.addEventListener('click', function () {
        state.answers[i] = opt.value;
        renderQuestion();
        // 自动前进（最后一题停住）
        if (i < 29) {
          setTimeout(function () {
            state.current = i + 1;
            renderQuestion();
          }, 180);
        }
      });
      box.appendChild(b);
    });

    $('btn-prev').disabled = i === 0;
    var nextBtn = $('btn-next');
    if (i === 29) {
      nextBtn.textContent = '🧾 生成我的内耗账单';
    } else {
      nextBtn.textContent = '下一题 →';
    }
    nextBtn.disabled = state.answers[i] === 0;
  }

  $('btn-prev').addEventListener('click', function () {
    if (state.current > 0) {
      state.current--;
      renderQuestion();
    }
  });

  $('btn-next').addEventListener('click', function () {
    if (state.answers[state.current] === 0) return;
    if (state.current < 29) {
      state.current++;
      renderQuestion();
    } else {
      submitAnswers();
    }
  });

  // ---------- 计分 ----------
  function computeResult() {
    var d = [0, 0, 0, 0, 0];
    state.answers.forEach(function (v, i) {
      d[QUESTIONS[i].dim] += v;
    });
    var total = d[0] + d[1] + d[2] + d[3] + d[4];
    var hours = Math.max(0, Math.round((total - 30) * 0.8 * 10) / 10);

    var tierIdx = 0;
    for (var t = 0; t < TIERS.length; t++) {
      if (total >= TIERS[t].min && total <= TIERS[t].max) { tierIdx = t; break; }
    }

    var typeIdx = 0, dualIdx = -1;
    var maxVal = Math.max.apply(null, d);
    for (var k = 0; k < 5; k++) { if (d[k] === maxVal) { typeIdx = k; break; } }
    for (var k2 = 0; k2 < 5; k2++) {
      if (k2 !== typeIdx && maxVal - d[k2] <= 2) { dualIdx = k2; break; }
    }

    return { d: d, total: total, hours: hours, tierIdx: tierIdx, typeIdx: typeIdx, dualIdx: dualIdx };
  }

  // ---------- 结果渲染 ----------
  function renderResult(r, isShared) {
    state.lastResult = r;

    // 账单编号
    var no = '';
    var seed = Math.abs(Math.round(r.total * 137 + r.d[0] * 31 + r.d[2] * 17)) % 100000000;
    no = String(seed).replace(/(\d{4})(\d{4})/, '$1-$2');
    $('receipt-no').textContent = no;

    $('bill-hours').textContent = r.hours;
    var convert = [];
    convert.push('≈ ' + (r.hours / 16).toFixed(1) + ' 个完整的周末');
    convert.push('≈ ' + Math.round(r.hours / 2) + ' 部两小时的电影');
    convert.push('≈ ' + (r.hours / 8).toFixed(1) + ' 个完整工作日');
    $('bill-convert').innerHTML = convert.join('<br>');

    var tier = TIERS[r.tierIdx];
    var tierEl = $('tier-badge');
    tierEl.textContent = tier.badge;
    tierEl.title = tier.note;
    tierEl.style.display = 'inline-block';

    // 明细条
    var barsEl = $('bill-bars');
    barsEl.innerHTML = '';
    var maxDim = Math.max.apply(null, r.d);
    DIMS.forEach(function (dim, i) {
      var pct = Math.round(r.d[i] / maxDim * 100);
      var row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML =
        '<div class="bar-name">' + dim.name + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + dim.color + '"></div></div>' +
        '<div class="bar-score">' + r.d[i] + '</div>';
      barsEl.appendChild(row);
      var note = document.createElement('div');
      note.className = 'bar-note';
      note.textContent = dim.name + '：' + r.d[i] + ' / 30 分' + (r.d[i] >= 24 ? '（重度损耗）' : r.d[i] >= 18 ? '（中度损耗）' : '（轻度损耗）');
      barsEl.appendChild(note);
    });

    // 复合源提示（五维完全相同视为均匀型，不提示）
    var dualEl = $('dual-note');
    var allEqual = r.d.every(function (x) { return x === r.d[0]; });
    if (r.dualIdx >= 0 && !allEqual) {
      dualEl.style.display = 'block';
      dualEl.textContent = '⚡ 复合内耗源：你的「' + DIMS[r.typeIdx].typeName + '」和「' + DIMS[r.dualIdx].typeName +
        '」几乎并列，两种损耗同时在烧，请按主源处方优先回血。';
    } else {
      dualEl.style.display = 'none';
    }

    // 类型卡
    var dim = DIMS[r.typeIdx];
    $('type-emoji').textContent = dim.emoji + ' ';
    $('type-name').textContent = dim.typeName;
    $('type-pct').textContent = '约 ' + dim.pct + '% 的内耗人群和你同款';
    $('type-desc').textContent = dim.desc;
    $('type-quote').textContent = '「' + dim.quote + '」';

    // 理论与处方
    $('theory-title').textContent = dim.theoryTitle;
    $('theory-text').textContent = dim.theoryText;
    var tipsEl = $('type-tips');
    tipsEl.innerHTML = '';
    dim.tips.forEach(function (tip) {
      var li = document.createElement('li');
      li.textContent = tip;
      tipsEl.appendChild(li);
    });

    $('share-banner').style.display = isShared ? 'block' : 'none';
    show('result');
  }

  // ---------- 提交 ----------
  function submitAnswers() {
    for (var i = 0; i < 30; i++) {
      if (!state.answers[i]) { state.current = i; renderQuestion(); toast('还有题目未作答'); return; }
    }
    var r = computeResult();
    // 写入云端记录（演示模式不写入；失败不阻断结果展示）
    if (!IS_DEMO) {
      cloud.database.from('test_records').insert({
        d1: r.d[0], d2: r.d[1], d3: r.d[2], d4: r.d[3], d5: r.d[4],
        total: r.total, bill_hours: r.hours, ptype: DIMS[r.typeIdx].typeName
      }).then(function (res) {
        if (res.error) { /* 记录失败不影响用户 */ }
      });
    }
    renderResult(r, false);
  }

  // ---------- 保存长图 ----------
  $('btn-save-img').addEventListener('click', function () {
    if (state.saving) return;
    state.saving = true;
    var btn = $('btn-save-img');
    btn.disabled = true;
    btn.textContent = '生成中…';

    var card = $('result-card');
    html2canvas(card, { scale: 2, backgroundColor: '#fffdf8', useCORS: true, logging: false })
      .then(function (canvas) {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        $('result-img').src = dataUrl;
        openModal('modal-image');
        // 桌面端尝试直接触发下载
        try {
          var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
          if (!isMobile) {
            var a = document.createElement('a');
            a.href = dataUrl;
            a.download = '内耗账单_' + Date.now() + '.jpg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        } catch (e) { /* 下载失败时用户仍可长按/右键保存 */ }
        state.saving = false;
        btn.disabled = false;
        btn.textContent = '📥 保存结果图片';
      })
      .catch(function () {
        state.saving = false;
        btn.disabled = false;
        btn.textContent = '📥 保存结果图片';
        toast('图片生成失败，请重试');
      });
  });

  // ---------- 复制结果链接 ----------
  function buildResultLink() {
    var r = state.lastResult;
    var payload = JSON.stringify({ v: 1, d: r.d });
    var encoded = btoa(unescape(encodeURIComponent(payload)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#r=' + encoded;
  }

  $('btn-copy-link').addEventListener('click', function () {
    if (!state.lastResult) return;
    var link = buildResultLink();
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = link;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('链接已复制，快去分享吧'); }
      catch (e) { toast('复制失败，链接已在下方显示'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        toast('链接已复制，快去分享吧');
      }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  // ---------- 再测一次 ----------
  $('btn-retest').addEventListener('click', function () {
    if (IS_DEMO) { startQuiz(); return; }
    $('retest-msg').textContent = '再测一次将消耗密码的 1 次测试机会（云端核销）。继续吗？';
    openModal('modal-retest');
  });
  $('btn-retest-cancel').addEventListener('click', function () {
    closeModal('modal-retest');
  });
  $('btn-retest-confirm').addEventListener('click', function () {
    closeModal('modal-retest');
    if (!state.password) { show('gate'); return; }
    redeemCode(state.password).then(function (remaining) {
      if (remaining > 0) {
        startQuiz();
        toast('已消耗 1 次，该密码剩余 ' + remaining + ' 次');
      } else if (remaining === 0) {
        toast('该密码 3 次机会已用完，请输入新密码');
        $('pwd-input').value = '';
        show('gate');
      } else {
        toast('密码异常，请重新输入');
        show('gate');
      }
    }).catch(function () {
      toast('网络异常，请稍后重试');
    });
  });

  // ---------- 好评有礼 ----------
  $('btn-praise').addEventListener('click', function () {
    openModal('modal-praise');
  });

  // ---------- 分享链接进入 ----------
  function parseSharedResult() {
    var m = /#r=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
    if (!m) return null;
    try {
      var b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var obj = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!obj || obj.v !== 1 || !Array.isArray(obj.d) || obj.d.length !== 5) return null;
      var d = obj.d.map(function (x) { return Math.min(30, Math.max(6, Number(x) || 6)); });
      var total = d[0] + d[1] + d[2] + d[3] + d[4];
      var hours = Math.max(0, Math.round((total - 30) * 0.8 * 10) / 10);
      var tierIdx = 0;
      for (var t = 0; t < TIERS.length; t++) {
        if (total >= TIERS[t].min && total <= TIERS[t].max) { tierIdx = t; break; }
      }
      var typeIdx = 0, dualIdx = -1;
      var maxVal = Math.max.apply(null, d);
      for (var k = 0; k < 5; k++) { if (d[k] === maxVal) { typeIdx = k; break; } }
      for (var k2 = 0; k2 < 5; k2++) {
        if (k2 !== typeIdx && maxVal - d[k2] <= 2) { dualIdx = k2; break; }
      }
      return { d: d, total: total, hours: hours, tierIdx: tierIdx, typeIdx: typeIdx, dualIdx: dualIdx };
    } catch (e) {
      return null;
    }
  }

  (function init() {
    var shared = parseSharedResult();
    if (shared) {
      renderResult(shared, true);
    } else if (IS_DEMO) {
      startQuiz();
    } else {
      show('gate');
    }
  })();
})();
