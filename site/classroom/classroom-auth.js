// ════════════════════════════════════════════════
//  classroom-auth.js — 教室ポータル専用ログイン
//  student.html / teacher.html から読み込んで使う。
//
//  quiz.html/jlpt.html用のsuzu-auth.jsとは別物です。
//  こちらはSupabase Auth（Google IDトークン）で本物のセッションを
//  発行するため、Row Level Securityで「本人以外は見えない」を
//  データベース側で強制できます（支払い・個人情報を扱うため）。
// ════════════════════════════════════════════════
(function () {
  const SUPABASE_URL = 'https://ploropobmgwlpphtkndo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_UiW9NELmp2_nVbp2PRHrhA_WYCYrTDl';
  const GOOGLE_CLIENT_ID = '176773735482-5uj0i09c5hchb9l87grglq0bmlrqe5sj.apps.googleusercontent.com';
  const TEACHER_EMAIL = 'suzu.nihongo@gmail.com';

  if (!window.supabase) {
    console.error('classroom-auth.js: supabase-js が読み込まれていません。先に <script src="https://unpkg.com/@supabase/supabase-js@2"></script> を読み込んでください。');
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const Classroom = {
    client: sb,
    teacherEmail: TEACHER_EMAIL,
    _onChange: null,

    async session() {
      const { data } = await sb.auth.getSession();
      return data.session || null;
    },
    async currentEmail() {
      const s = await this.session();
      return s ? s.user.email : null;
    },
    async currentName() {
      const s = await this.session();
      if (!s) return null;
      return s.user.user_metadata.full_name || s.user.user_metadata.name || s.user.email;
    },
    async isTeacher() {
      const e = await this.currentEmail();
      return e === TEACHER_EMAIL;
    },

    // Googleログインボタンを指定要素に描画。ログイン状態が変わるたびonChangeを呼ぶ。
    initButton(elId, onChange) {
      this._onChange = onChange;
      const draw = () => {
        if (typeof google === 'undefined' || !google.accounts) { setTimeout(draw, 300); return; }
        google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r) => this._handle(r) });
        const el = document.getElementById(elId);
        if (el) google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with' });
      };
      draw();
    },

    async _handle(r) {
      const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: r.credential });
      if (error) {
        console.error(error);
        alert('ログインに失敗しました。時間をおいて再度お試しください。\n(' + error.message + ')');
        return;
      }
      if (this._onChange) this._onChange();
    },

    async logout() {
      await sb.auth.signOut();
      if (this._onChange) this._onChange();
    }
  };

  window.Classroom = Classroom;
})();
