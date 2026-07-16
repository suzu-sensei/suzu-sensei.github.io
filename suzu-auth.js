// ════════════════════════════════════════════════
//  suzu-auth.js — 共通ログイン・スコア保存・ランキング
//  quiz.html と jlpt.html の両方から読み込んで使う。
//  学生は「書き込み」と「ランキング(ニックネーム＋ポイント)」だけ。
//  本名・メールは先生だけが Supabase で見られる。
// ════════════════════════════════════════════════
(function () {
  const SUPABASE_URL = 'https://ploropobmgwlpphtkndo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_UiW9NELmp2_nVbp2PRHrhA_WYCYrTDl';
  const GOOGLE_CLIENT_ID = '176773735482-5uj0i09c5hchb9l87grglq0bmlrqe5sj.apps.googleusercontent.com';

  const LS_USER = 'suzuUser';       // {email, name}
  const LS_NICK = 'suzuNickname';   // 表示名

  function parseJwt(token) {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(b).split('').map(
      c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  }

  const Suzu = {
    // ── 状態 ──────────────────────────────
    user() { try { return JSON.parse(localStorage.getItem(LS_USER)); } catch (e) { return null; } },
    isLoggedIn() { return !!this.user(); },
    nickname() { return localStorage.getItem(LS_NICK) || ''; },
    setNickname(n) { localStorage.setItem(LS_NICK, n); },
    logout() { localStorage.removeItem(LS_USER); localStorage.removeItem(LS_NICK); },

    // ニックネーム変更（本人がいつでも変えられる）
    changeNickname() {
      const cur = this.nickname();
      const n = prompt('ランキングに表示するニックネーム（本名・メールは他の人に見えません）:', cur);
      if (n && n.trim()) { this.setNickname(n.trim().slice(0, 20)); return true; }
      return false;
    },

    // ── ログイン ──────────────────────────
    _onLogin: null,
    _pending: null,
    initButton(elId, onLogin) {
      this._onLogin = onLogin;
      if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(() => this.initButton(elId, onLogin), 300); return;
      }
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => this._handle(r) });
      const el = document.getElementById(elId);
      if (el) google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with' });
    },
    // ボタンを描かず、One Tap のプロンプトだけ出したい場合
    prompt(onLogin) {
      this._onLogin = onLogin;
      if (typeof google === 'undefined' || !google.accounts) {
        setTimeout(() => this.prompt(onLogin), 300); return;
      }
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => this._handle(r) });
      google.accounts.id.prompt();
    },
    _handle(r) {
      const d = parseJwt(r.credential);
      localStorage.setItem(LS_USER, JSON.stringify({ email: d.email, name: d.name }));
      if (!this.nickname()) {
        let n = prompt('ランキングに表示するニックネームを決めてください（本名・メールは他の人に見えません）:', d.given_name || '');
        this.setNickname((n && n.trim()) ? n.trim().slice(0, 20) : ('学生' + Math.floor(Math.random() * 9000 + 1000)));
      }
      if (this._onLogin) this._onLogin(this.user());
    },

    // ── スコア保存（書き込み専用）────────────
    async saveScore(o) {
      const u = this.user();
      if (!u) return false; // 未ログインなら送らない
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/quiz_scores`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            student_email: u.email,
            student_name: u.name,
            nickname: this.nickname(),
            level: o.level || null,
            score: o.score || 0,
            total_questions: o.total || 0,
            points: o.points || 0,
            source: o.source || null,
            completed_at: new Date().toISOString()
          })
        });
        return res.ok;
      } catch (e) { console.error('saveScore error', e); return false; }
    },

    // ── ランキング取得（ニックネーム＋合計ポイントのみ）──
    async leaderboard(limit) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/public_leaderboard?select=nickname,total_points,sessions&order=total_points.desc&limit=${limit || 50}`,
          { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
        if (!res.ok) return [];
        return await res.json();
      } catch (e) { console.error('leaderboard error', e); return []; }
    },

    // ── 偽のCPU5人（毎日少しずつポイントが増える）──
    _bots() {
      const start = new Date('2026-07-16T00:00:00');
      const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
      return [
        { nickname: '雅婷',   base: 20, rate: 12 },
        { nickname: '冠宇',   base: 10, rate: 18 },
        { nickname: '佳穎',   base: 35, rate: 9 },
        { nickname: '宗翰',   base: 5,  rate: 22 },
        { nickname: '怡君',   base: 28, rate: 14 }
      ].map(b => ({ nickname: b.nickname, total_points: b.base + b.rate * days, sessions: 0, bot: true }));
    },
    // 本物の学生＋CPUを合算して順位付け
    async leaderboardWithBots(limit) {
      const real = await this.leaderboard(limit || 50);
      const all = real.concat(this._bots()).sort((a, b) => b.total_points - a.total_points);
      return all.slice(0, limit || 50);
    }
  };

  window.SuzuAuth = Suzu;
})();
