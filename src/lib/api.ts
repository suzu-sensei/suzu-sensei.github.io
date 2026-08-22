import { supabase } from './supabase';
import type { Booking, BookingRequest, Candidate, Credit, LessonHistory, Payment, Student, StudentInvitation, StudentSnapshot, TeacherSnapshot } from '../types';
import { validateSlip } from './validation';
import { uuid } from './format';
import { friendlyMessage } from './errors';

const unwrap = <T>(result: { data: T | null; error: { message: string } | null }): T => {
  if (result.error) throw new Error(friendlyMessage(result.error.message));
  if (result.data === null) throw new Error('データが見つかりません。');
  return result.data;
};

export async function loginWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw new Error(friendlyMessage(error.message));
}

export async function logout(): Promise<void> { unwrap(await supabase.auth.signOut().then(({ error }) => ({ data: true, error }))); }

export async function isTeacher(userId: string): Promise<boolean> {
  const { data, error } = await supabase.from('teacher_roles').select('id').eq('user_id', userId).is('revoked_at', null).limit(1);
  if (error) throw new Error(friendlyMessage(error.message));
  return (data?.length ?? 0) > 0;
}

export async function claimProfile(token: string): Promise<void> {
  unwrap(await supabase.rpc('claim_student_profile', { p_claim_token: token }));
}

async function list<T>(table: string, orderColumn?: string, ascending = true): Promise<T[]> {
  let query = supabase.from(table).select('*');
  if (orderColumn) query = query.order(orderColumn, { ascending });
  const { data, error } = await query;
  if (error) throw new Error(friendlyMessage(error.message));
  return (data ?? []) as T[];
}

export async function loadStudent(): Promise<StudentSnapshot | null> {
  const students = await list<Student>('students');
  if (!students[0]) return null;
  const [credits, requests, candidates, bookings, history, payments] = await Promise.all([
    list<Credit>('lesson_credits', 'created_at'), list<BookingRequest>('booking_requests', 'submitted_at', false),
    list<Candidate>('booking_candidates', 'starts_at'), list<Booking>('bookings', 'starts_at'),
    list<LessonHistory>('lesson_history', 'starts_at', false), list<Payment>('payments', 'submitted_at', false),
  ]);
  return { student: students[0], credits, requests, candidates, bookings, history, payments };
}

export async function loadTeacher(): Promise<TeacherSnapshot> {
  const [students, credits, requests, candidates, bookings, history, payments] = await Promise.all([
    list<Student>('students', 'full_name'), list<Credit>('lesson_credits', 'created_at'),
    list<BookingRequest>('booking_requests', 'submitted_at'), list<Candidate>('booking_candidates', 'starts_at'),
    list<Booking>('bookings', 'starts_at'), list<LessonHistory>('lesson_history', 'starts_at', false),
    list<Payment>('payments', 'submitted_at'),
  ]);
  return { students, credits, requests, candidates, bookings, history, payments };
}

export async function submitBooking(starts: string[], note: string): Promise<void> {
  const candidates = starts.map((starts_at) => ({ starts_at, ends_at: new Date(new Date(starts_at).getTime() + 50 * 60_000).toISOString() }));
  unwrap(await supabase.rpc('submit_booking_request', { p_candidates: candidates, p_idempotency_key: uuid(), p_note: note || null }));
}

export async function approveBooking(requestId: string, candidateId: string): Promise<void> {
  unwrap(await supabase.rpc('approve_booking_request', { p_request_id: requestId, p_candidate_id: candidateId }));
}
export async function rejectBooking(requestId: string, reason: string): Promise<void> {
  unwrap(await supabase.rpc('reject_booking_request', { p_request_id: requestId, p_reason: reason }));
}
export async function completeBooking(bookingId: string): Promise<void> {
  unwrap(await supabase.rpc('complete_booking', { p_booking_id: bookingId }));
}
export async function registerPurchase(studentId: string, lessonCount: number, note: string): Promise<void> {
  unwrap(await supabase.rpc('register_manual_purchase', { p_student_id: studentId, p_lesson_count: lessonCount, p_idempotency_key: uuid(), p_note: note || null }));
}
export async function approvePayment(paymentId: string): Promise<void> {
  unwrap(await supabase.rpc('approve_payment', { p_payment_id: paymentId }));
}
export async function rejectPayment(paymentId: string, reason: string): Promise<void> {
  unwrap(await supabase.rpc('reject_payment', { p_payment_id: paymentId, p_reason: reason }));
}
export async function voidCredit(creditId: string, reason: string): Promise<void> {
  unwrap(await supabase.rpc('void_credit', { p_credit_id: creditId, p_reason: reason }));
}

export async function inviteStudent(input: {
  email: string; fullName: string; nickname?: string; timezone?: string;
}): Promise<StudentInvitation> {
  return unwrap<StudentInvitation>(await supabase.rpc('invite_student', {
    p_email: input.email,
    p_full_name: input.fullName,
    p_nickname: input.nickname || null,
    p_timezone: input.timezone || 'Asia/Taipei',
    p_token_ttl_hours: 72,
  }));
}

export async function reissueClaimCode(studentId: string): Promise<StudentInvitation> {
  return unwrap<StudentInvitation>(await supabase.rpc('reissue_student_claim_code', {
    p_student_id: studentId,
    p_token_ttl_hours: 72,
  }));
}

export async function cancelOwnBooking(bookingId: string, reason?: string): Promise<void> {
  unwrap(await supabase.rpc('cancel_own_booking', { p_booking_id: bookingId, p_reason: reason || null }));
}

export async function cancelBookingAsTeacher(bookingId: string, reason: string): Promise<void> {
  unwrap(await supabase.rpc('cancel_booking_as_teacher', { p_booking_id: bookingId, p_reason: reason }));
}

type PaymentInput = { studentId?: string; mode: 'grant_new_credits' | 'evidence_only'; lessons?: number; amountMinor?: number; currency?: string; file: File };
async function uploadAndConfirmPaymentSlip(payment: Payment, file: File): Promise<void> {
  if (!payment.slip_path) throw new Error('安全なupload先を作成できませんでした。');
  const { error: uploadError } = await supabase.storage.from('payment-slips').upload(payment.slip_path, file, {
    contentType: file.type, upsert: false,
  });
  if (!uploadError) {
    unwrap(await supabase.rpc('confirm_payment_slip_upload', { p_payment_id: payment.id }));
    return;
  }

  // A lost response can look like failure even when Storage accepted the object.
  const confirmation = await supabase.rpc('confirm_payment_slip_upload', { p_payment_id: payment.id });
  if (!confirmation.error) return;

  const marked = await supabase.rpc('mark_payment_slip_upload_failed', { p_payment_id: payment.id });
  if (marked.error) throw new Error(friendlyMessage(marked.error.message));
  throw new Error('証拠ファイルを送信できませんでした。申請内容は保存されています。「再送信」からファイルを選び直してください。');
}

export async function submitPayment(input: PaymentInput): Promise<void> {
  validateSlip(input.file);
  const extension = input.file.name.split('.').pop()?.toLowerCase() || 'bin';
  const payment = unwrap<Payment>(await supabase.rpc('submit_payment', {
    p_application_mode: input.mode, p_student_id: input.studentId ?? null,
    p_requested_lesson_count: input.mode === 'grant_new_credits' ? input.lessons : null,
    p_amount_minor: input.amountMinor ?? null, p_currency: input.amountMinor === undefined ? null : input.currency,
    p_mime_type: input.file.type, p_size_bytes: input.file.size, p_extension: extension,
    p_idempotency_key: uuid(),
  }));
  await uploadAndConfirmPaymentSlip(payment, input.file);
}

export async function retryPaymentSlip(paymentId: string, file: File): Promise<void> {
  validateSlip(file);
  const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const payment = unwrap<Payment>(await supabase.rpc('restart_payment_slip_upload', {
    p_payment_id: paymentId,
    p_mime_type: file.type,
    p_size_bytes: file.size,
    p_extension: extension,
  }));
  await uploadAndConfirmPaymentSlip(payment, file);
}

export async function signedSlipUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('payment-slips').createSignedUrl(path, 300);
  if (error) throw new Error(friendlyMessage(error.message));
  return data.signedUrl;
}
