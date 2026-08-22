export type CreditStatus = 'available' | 'reserved' | 'completed' | 'voided';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export type Student = {
  id: string; auth_user_id: string | null; email: string; full_name: string;
  nickname: string | null; status: 'active' | 'paused' | 'inactive';
  timezone: string; notes_folder_url: string | null; meeting_url: string | null;
};
export type Credit = { id: string; student_id: string; status: CreditStatus; created_at: string };
export type Candidate = { id: string; request_id: string; starts_at: string; ends_at: string; status: string };
export type BookingRequest = { id: string; student_id: string; status: string; note: string | null; submitted_at: string };
export type Booking = { id: string; student_id: string; starts_at: string; ends_at: string; status: string };
export type LessonHistory = { id: string; student_id: string; starts_at: string; ends_at: string; note: string | null };
export type Payment = {
  id: string; student_id: string; status: ReviewStatus;
  application_mode: 'grant_new_credits' | 'evidence_only'; requested_lesson_count: number | null;
  amount_minor: number | null; currency: string | null; slip_path: string | null;
  slip_mime_type: string | null; slip_size_bytes: number | null;
  slip_status: 'none' | 'pending' | 'uploaded' | 'missing'; submitted_at: string;
  rejection_reason: string | null;
};

export type StudentSnapshot = {
  student: Student;
  credits: Credit[];
  requests: BookingRequest[];
  candidates: Candidate[];
  bookings: Booking[];
  history: LessonHistory[];
  payments: Payment[];
};

export type TeacherSnapshot = {
  students: Student[];
  credits: Credit[];
  requests: BookingRequest[];
  candidates: Candidate[];
  bookings: Booking[];
  history: LessonHistory[];
  payments: Payment[];
};

export type StudentInvitation = {
  student: Student;
  claim_code: string;
  expires_at: string;
};
