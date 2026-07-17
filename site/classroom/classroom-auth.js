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
    },

    // 毎週の曜日・時間から、次回以降の授業日時をcount件計算する。
    // weeklyDay: 0=日 1=月 ... 6=土, weeklyTime: 'HH:MM'
    upcomingDates(weeklyDay, weeklyTime, count) {
      if (weeklyDay === null || weeklyDay === undefined || !weeklyTime) return [];
      const parts = weeklyTime.split(':').map(Number);
      const h = parts[0] || 0, m = parts[1] || 0;
      let d = new Date();
      d.setHours(h, m, 0, 0);
      let diff = (weeklyDay - d.getDay() + 7) % 7;
      if (diff === 0 && d.getTime() <= Date.now()) diff = 7;
      d.setDate(d.getDate() + diff);
      const results = [];
      for (let i = 0; i < count; i++) {
        results.push(new Date(d));
        d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      return results;
    },

    // 毎週の曜日・時間パターン + classroom_lesson_overrides（個別の振替・欠席）をふまえた
    // 実際の今後の上課日をcount件返す。各要素: { date: Date, time: 'HH:MM', overridden: bool,
    // originalDate: 'YYYY-MM-DD'（本来の週次パターン上の日付・upsertのキーになる）, overrideId? }
    async upcomingSchedule(studentEmail, weeklyDay, weeklyTime, count) {
      if (weeklyDay === null || weeklyDay === undefined || !weeklyTime || !count) return [];

      const { data: overrides, error } = await sb
        .from('classroom_lesson_overrides')
        .select('*')
        .eq('student_email', studentEmail)
        .eq('status', 'active');
      if (error) console.error('upcomingSchedule: overrides取得エラー', error);

      const byOriginal = {};
      (overrides || []).forEach(o => { byOriginal[o.original_date] = o; });

      const parts = weeklyTime.split(':').map(Number);
      const h = parts[0] || 0, m = parts[1] || 0;
      let d = new Date();
      d.setHours(h, m, 0, 0);
      let diff = (weeklyDay - d.getDay() + 7) % 7;
      if (diff === 0 && d.getTime() <= Date.now()) diff = 7;
      d.setDate(d.getDate() + diff);

      const results = [];
      let guard = 0;
      while (results.length < count && guard < count + 60) {
        guard++;
        const iso = d.toISOString().slice(0, 10);
        const ov = byOriginal[iso];
        if (ov) {
          if (ov.new_date) {
            const [ny, nm, nd] = ov.new_date.split('-').map(Number);
            const timeStr = ov.new_time || weeklyTime;
            const [th, tm] = timeStr.split(':').map(Number);
            const newDateObj = new Date(ny, nm - 1, nd, th || 0, tm || 0, 0, 0);
            results.push({ date: newDateObj, time: timeStr, overridden: true, originalDate: iso, overrideId: ov.id, note: ov.note || '' });
          }
          // ov.new_date が null の場合は「欠席（振替なし）」なのでスキップ（結果に含めない）
        } else {
          results.push({ date: new Date(d), time: weeklyTime, overridden: false, originalDate: iso });
        }
        d = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      results.sort((a, b) => a.date - b.date);
      return results;
    },

    // ══ ブラウザだけで録画（OBS不要）══
    // Google Meetのタブを画面共有として選び「タブの音声を共有」にチェックすると、
    // 相手の声（タブ音声）+ 自分のマイクの両方を1本の動画として録画し、
    // 停止時に自分のPCへ自動ダウンロードする。サーバーには一切送信しない。
    _recorder: null,
    _recordedChunks: [],
    _recordingStreams: [],

    async startRecording(onStateChange) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        let micStream = null;
        try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch (e) { console.warn('マイクを取得できませんでした（画面の音声のみ録画します）', e); }

        const tracks = [...displayStream.getVideoTracks(), ...displayStream.getAudioTracks()];
        if (micStream) tracks.push(...micStream.getAudioTracks());
        const combined = new MediaStream(tracks);

        this._recordingStreams = [displayStream, micStream].filter(Boolean);
        this._recordedChunks = [];
        this._recorder = new MediaRecorder(combined, { mimeType: 'video/webm' });
        this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._recordedChunks.push(e.data); };
        this._recorder.onstop = () => {
          const blob = new Blob(this._recordedChunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
          a.href = url;
          a.download = `lesson-${ts}.webm`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
          this._recordingStreams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
          this._recordingStreams = [];
          if (onStateChange) onStateChange('stopped');
        };
        // 相手がブラウザ側の「共有を停止」を押した場合も止める
        displayStream.getVideoTracks()[0].addEventListener('ended', () => {
          if (this._recorder && this._recorder.state !== 'inactive') this._recorder.stop();
        });

        this._recorder.start();
        if (onStateChange) onStateChange('recording');
        return true;
      } catch (err) {
        console.error('録画開始エラー', err);
        alert('録画を開始できませんでした。\n共有する画面を選ぶ時に「Chromeタブ」→Google Meetのタブを選び、「タブの音声を共有」にチェックを入れてください。\n(' + err.message + ')');
        if (onStateChange) onStateChange('error');
        return false;
      }
    },

    stopRecording() {
      if (this._recorder && this._recorder.state !== 'inactive') this._recorder.stop();
    }
  };

  window.Classroom = Classroom;
})();
