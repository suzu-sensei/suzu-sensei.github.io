const messages: Array<[string, string]> = [
  ['teacher authorization required', '先生権限が確認できません。再ログインしても直らない場合は管理者へ連絡してください。'],
  ['student profile not linked', '生徒profileがまだ連携されていません。先生から受け取ったclaim codeを入力してください。'],
  ['invalid or expired claim token', 'claim codeが無効か、期限切れです。先生に再発行を依頼してください。'],
  ['student profile already claimed', 'この生徒profileはすでに別のアカウントへ連携されています。先生へ連絡してください。'],
  ['student profile is already linked', 'この生徒はすでにGoogleアカウントと連携済みです。'],
  ['student email is already linked', 'このメールアドレスの生徒はすでに連携済みです。'],
  ['no uncommitted lesson credit available', '未予約creditの数を超えて予約申請はできません。現在の申請結果をお待ちください。'],
  ['no available lesson credit', '利用できるcreditがありません。支払い状況または予約申請をご確認ください。'],
  ['booking cancellation deadline has passed', '授業開始12時間前を過ぎているため、画面からキャンセルできません。先生へ直接連絡してください。'],
  ['booking request already approved with another candidate', 'この申請は別の候補日時ですでに承認されています。画面を更新してください。'],
  ['only pending requests can be approved', 'この予約申請はすでに処理済みです。画面を更新してください。'],
  ['only reserved bookings can be completed', 'この授業は完了またはキャンセル済みです。画面を更新してください。'],
  ['only pending payments can be approved', 'この支払いはすでに処理済みです。画面を更新してください。'],
  ['duplicate key value', '同じ内容がすでに登録されています。画面を更新して確認してください。'],
  ['conflicts with existing key', '同じ内容がすでに登録されています。画面を更新して確認してください。'],
  ['exclusion constraint', 'この時間は別の授業と重なっています。別の候補を選んでください。'],
  ['violates exclusion constraint', 'この時間は別の授業と重なっています。別の候補を選んでください。'],
  ['row-level security', 'このデータを操作する権限がありません。'],
];

export function friendlyMessage(message: string): string {
  const normalized = message.toLowerCase();
  return messages.find(([key]) => normalized.includes(key))?.[1]
    ?? '処理を完了できませんでした。画面を更新して、もう一度お試しください。';
}

export function errorMessage(error: unknown): string {
  return friendlyMessage(error instanceof Error ? error.message : String(error ?? ''));
}
