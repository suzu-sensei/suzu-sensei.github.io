export type StudentLocale = 'ja' | 'zh' | 'en';

const storageKey = 'suzu-classroom-language';

export const localeTag: Record<StudentLocale, string> = {
  ja: 'ja-JP', zh: 'zh-TW', en: 'en',
};

export const studentCopy = {
  ja: {
    language: '言語', languageReset: '言語を変えると、まだ送信していない入力内容が消えます。変更しますか？', loading: '教室を準備しています…', title: 'すず先生の教室',
    loginLead: '予約、授業回数、お支払いを管理する教室ポータルです。', login: 'Googleでログイン', loggingIn: 'Googleへ移動中…',
    privacy: 'ログイン後も、他の生徒のデータは表示されません。', logout: 'ログアウト',
    claimTitle: '生徒プロフィールを連携', claimLead: 'お名前と、先生から受け取ったclaim codeを入力してください。',
    registrationName: '登録するお名前', registrationHint: '予約や支払いの確認に使うお名前を入力してください。', claimCode: 'Claim code', link: '連携する',
    hello: 'さん、こんにちは', intro: '授業の回数・予約・お支払いをここで確認できます。',
    available: '未予約', reserved: '予約済み', completed: '完了', count: '回',
    flow1: 'creditを確認', flow2: '希望日時を送信', flow3: '先生の承認で確定',
    nextLesson: '🗓️ 次の授業', noBooking: '現在、確定した予約はありません', onlineLesson: 'オンライン授業', cancel: 'キャンセル', lateNotice: '12時間前を過ぎた変更は先生へ連絡',
    requestTitle: '✨ 希望日時を送る', requestHelp: '候補日は最大5件。各1件に、第3希望まで時間の範囲を入力できます。時刻は00分または30分を選んでください。送信時点では予約は確定しません。',
    dayCandidate: '候補日', date: '日付', timePreference: '時間の希望', preference1: '第1希望（必須）', preference2: '第2希望（任意）', preference3: '第3希望（任意）', from: '開始', to: '終了', choose: '選択', addDay: '＋候補日を追加', removeDay: 'この候補日を削除', sendRequest: '予約を申請', noteToTeacher: '先生へのメモ',
    cannotRequest: '現在は新しい予約申請を送れません', cannotRequestHelp: '未予約creditがないか、確認待ちの申請があります。',
    paymentTitle: '💳 お支払い証拠を送る', paymentHelp: 'JPEG・PNG・WebP・PDF、10MB以下。先生の確認後にcreditへ反映されます。', application: '申請内容', newCredits: '新しい授業回数を購入', evidenceOnly: '証拠のみ提出', lessonCount: '授業回数', amount: '金額', currency: '通貨', slip: '振込証拠', send: '送信する',
    requests: '📋 予約申請', payments: '🧾 支払い記録', history: '🎓 授業履歴', noRecords: '記録はありません', noNote: 'メモなし', received: '受講済み', viewSlip: '証拠を見る', retryChoose: '証拠を選び直す', retry: '再送信', evidenceNoCredit: '証拠のみ・credit発行なし', reason: '理由',
    sentBooking: '予約希望を送りました。', sentPayment: 'お支払い証拠を送信しました。', maxDays: '候補日は最大5件です。', invalidRange: '各候補日の時間範囲を順番に入力してください。',
    pending: '確認待ち', approved: '承認済み', rejected: '却下', cancelled: 'キャンセル', uploaded: '送信済み', missing: '再送信が必要', voided: '無効', none: '未添付',
    resources: '🔗 レッスンリンク', joinMeet: 'Google Meetに参加', openDrive: '学習ノートを開く', noResources: '先生がリンクを準備すると、ここに表示されます。', recording: '録画（任意）', recordingHelp: 'Google Meetのタブを選び「タブの音声を共有」を有効にしてください。停止すると動画はこの端末へ保存され、サイトには送信されません。', recordingStart: '録画開始', recordingStop: '録画停止', recordingSaved: '録画を端末へ保存しました。', lessonDates: '授業日時', showLessonDates: '過去・予約済みの授業日時を見る', hideLessonDates: '授業日時を閉じる', bookedLessons: '予約済み', pastLessons: '過去の授業', activeStatus: '在籍中', pausedStatus: '休止中', inactiveStatus: '退会・停止中', inactiveTitle: '現在このアカウントは停止中です。', inactiveHelp: '過去の授業と先生のリンクは確認できます。新しい予約・支払いは先生へご連絡ください。', pausedHelp: '現在休止中のため、新しい予約は送れません。',
  },
  zh: {
    language: '語言', languageReset: '切換語言會清除尚未送出的內容。要繼續嗎？', loading: '正在準備教室…', title: '鈴老師的教室', loginLead: '在這裡管理預約、課程點數與付款。', login: '使用 Google 登入', loggingIn: '正在前往 Google…', privacy: '登入後也無法查看其他學生的資料。', logout: '登出', claimTitle: '連結學生資料', claimLead: '請輸入您的姓名與老師提供的 claim code。', registrationName: '登記姓名', registrationHint: '請填寫用於預約和付款確認的姓名。', claimCode: 'Claim code', link: '連結', hello: '，您好', intro: '您可在這裡查看課程點數、預約與付款。', available: '未預約', reserved: '已預約', completed: '已完成', count: '堂', flow1: '確認 credit', flow2: '送出希望時間', flow3: '老師批准後確定', nextLesson: '🗓️ 下一堂課', noBooking: '目前沒有已確定的預約', onlineLesson: '線上課程', cancel: '取消', lateNotice: '少於12小時請直接聯絡老師', requestTitle: '✨ 送出希望時間', requestHelp: '最多可選5個候選日期，每個日期最多填寫3個可上課的時間範圍。時間請選擇00分或30分。送出並不代表預約已確定。', dayCandidate: '候選日期', date: '日期', timePreference: '時間偏好', preference1: '第1希望（必填）', preference2: '第2希望（選填）', preference3: '第3希望（選填）', from: '開始', to: '結束', choose: '請選擇', addDay: '＋新增候選日期', removeDay: '刪除此日期', sendRequest: '送出預約申請', noteToTeacher: '給老師的備註', cannotRequest: '目前無法送出新的預約申請', cannotRequestHelp: '可能沒有未預約 credit，或已有待確認的申請。', paymentTitle: '💳 上傳付款證明', paymentHelp: '支援 JPEG、PNG、WebP、PDF，上限10MB。老師確認後才會加入 credit。', application: '申請類型', newCredits: '購買新課程點數', evidenceOnly: '僅提交證明', lessonCount: '課程堂數', amount: '金額', currency: '幣別', slip: '付款證明', send: '送出', requests: '📋 預約申請', payments: '🧾 付款記錄', history: '🎓 課程記錄', noRecords: '沒有記錄', noNote: '無備註', received: '已上課', viewSlip: '查看證明', retryChoose: '重新選擇證明', retry: '重新送出', evidenceNoCredit: '僅證明・不發行 credit', reason: '原因', sentBooking: '已送出預約希望。', sentPayment: '已送出付款證明。', maxDays: '候選日期最多5個。', invalidRange: '請依順序填寫每個候選日期的時間範圍。', pending: '待確認', approved: '已批准', rejected: '已拒絕', cancelled: '已取消', uploaded: '已送出', missing: '需重新送出', voided: '已作廢', none: '未附件',
    resources: '🔗 上課連結', joinMeet: '加入 Google Meet', openDrive: '開啟學習筆記', noResources: '老師準備好連結後會顯示在這裡。', recording: '錄影（選填）', recordingHelp: '請選擇 Google Meet 分頁並開啟「分享分頁音訊」。停止後影片只會儲存在此裝置，不會上傳到網站。', recordingStart: '開始錄影', recordingStop: '停止錄影', recordingSaved: '影片已儲存到此裝置。', lessonDates: '上課日期時間', showLessonDates: '查看過去與已預約的上課時間', hideLessonDates: '關閉上課時間', bookedLessons: '已預約', pastLessons: '過去的課程', activeStatus: '在籍中', pausedStatus: '暫停中', inactiveStatus: '已退會／停用', inactiveTitle: '此帳號目前已停用。', inactiveHelp: '您仍可查看過去課程與老師提供的連結。新預約或付款請聯絡老師。', pausedHelp: '目前為暫停狀態，無法送出新的預約。',
  },
  en: {
    language: 'Language', languageReset: 'Changing language will clear entries that have not been sent. Continue?', loading: 'Preparing your classroom…', title: "Suzu Sensei's Classroom", loginLead: 'Manage bookings, lesson credits, and payments in one place.', login: 'Sign in with Google', loggingIn: 'Opening Google…', privacy: "After sign-in, you cannot view another student's data.", logout: 'Log out', claimTitle: 'Link your student profile', claimLead: 'Enter your name and the claim code from your teacher.', registrationName: 'Registration name', registrationHint: 'Enter the name you want used for booking and payment confirmation.', claimCode: 'Claim code', link: 'Link profile', hello: ', welcome', intro: 'Check your lesson credits, bookings, and payments here.', available: 'Available', reserved: 'Booked', completed: 'Completed', count: '', flow1: 'Check credit', flow2: 'Send availability', flow3: 'Teacher confirms', nextLesson: '🗓️ Next lesson', noBooking: 'There are no confirmed bookings.', onlineLesson: 'Online lesson', cancel: 'Cancel', lateNotice: 'Contact your teacher if the lesson is less than 12 hours away.', requestTitle: '✨ Send availability', requestHelp: 'Add up to 5 candidate dates. For each date, you may enter up to 3 preferred time ranges. Choose times on the hour or half hour. Sending this form does not confirm the booking.', dayCandidate: 'Candidate date', date: 'Date', timePreference: 'Preferred time range', preference1: '1st preference (required)', preference2: '2nd preference (optional)', preference3: '3rd preference (optional)', from: 'From', to: 'To', choose: 'Choose', addDay: '+ Add candidate date', removeDay: 'Remove this date', sendRequest: 'Send booking request', noteToTeacher: 'Note to teacher', cannotRequest: 'You cannot send a new booking request right now.', cannotRequestHelp: 'You may have no available credit, or a request may already be awaiting review.', paymentTitle: '💳 Send payment proof', paymentHelp: 'JPEG, PNG, WebP, or PDF; maximum 10 MB. Credit is added only after teacher approval.', application: 'Request type', newCredits: 'Purchase new lesson credits', evidenceOnly: 'Submit proof only', lessonCount: 'Number of lessons', amount: 'Amount', currency: 'Currency', slip: 'Payment proof', send: 'Send', requests: '📋 Booking requests', payments: '🧾 Payment history', history: '🎓 Lesson history', noRecords: 'No records', noNote: 'No note', received: 'Completed', viewSlip: 'View proof', retryChoose: 'Choose proof again', retry: 'Retry', evidenceNoCredit: 'Proof only · no credit issued', reason: 'Reason', sentBooking: 'Your availability was sent.', sentPayment: 'Your payment proof was sent.', maxDays: 'You can add up to 5 candidate dates.', invalidRange: 'Complete the time ranges in order for each candidate date.', pending: 'Pending', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', uploaded: 'Uploaded', missing: 'Upload required', voided: 'Voided', none: 'No file',
    resources: '🔗 Lesson links', joinMeet: 'Join Google Meet', openDrive: 'Open lesson notes', noResources: 'Links will appear here after your teacher adds them.', recording: 'Recording (optional)', recordingHelp: 'Choose the Google Meet tab and enable “Share tab audio.” When stopped, the video is saved only to this device and is not uploaded to the site.', recordingStart: 'Start recording', recordingStop: 'Stop recording', recordingSaved: 'The recording was saved to this device.', lessonDates: 'Lesson dates', showLessonDates: 'View booked and past lesson dates', hideLessonDates: 'Close lesson dates', bookedLessons: 'Booked lessons', pastLessons: 'Past lessons', activeStatus: 'Active', pausedStatus: 'Paused', inactiveStatus: 'Inactive', inactiveTitle: 'This account is currently inactive.', inactiveHelp: 'You can still view past lessons and teacher-provided links. Contact your teacher for a new booking or payment.', pausedHelp: 'Your account is paused, so you cannot send a new booking request.',
  },
} as const;

export type StudentCopy = (typeof studentCopy)[StudentLocale];

export function getStudentLocale(): StudentLocale {
  const saved = window.localStorage.getItem(storageKey);
  if (saved === 'ja' || saved === 'zh' || saved === 'en') return saved;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh'
    : navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ja';
}

export function setStudentLocale(locale: StudentLocale): void {
  window.localStorage.setItem(storageKey, locale);
  document.documentElement.lang = locale === 'zh' ? 'zh-Hant' : locale;
}

export function languageSwitch(locale: StudentLocale): string {
  return `<div class="language-switch" role="group" aria-label="${studentCopy[locale].language}">
    <button type="button" data-language="ja" class="${locale === 'ja' ? 'active' : ''}">日本語</button>
    <button type="button" data-language="zh" class="${locale === 'zh' ? 'active' : ''}">中文</button>
    <button type="button" data-language="en" class="${locale === 'en' ? 'active' : ''}">English</button>
  </div>`;
}
