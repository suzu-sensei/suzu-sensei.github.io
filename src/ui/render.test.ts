import { describe, expect, it } from 'vitest';
import type { StudentSnapshot, TeacherSnapshot } from '../types';
import { renderStudent } from './student';
import { renderTeacher } from './teacher';

const student = {
  id: 'student-a', auth_user_id: 'user-a', email: 'a@example.invalid',
  full_name: '<Student A>', nickname: null, status: 'active' as const,
  timezone: 'Asia/Taipei', notes_folder_url: null, meeting_url: null,
};

const baseStudent: StudentSnapshot = {
  student,
  credits: [{ id: 'credit-a', student_id: student.id, status: 'available', created_at: '2026-01-01T00:00:00Z' }],
  requests: [], candidates: [], bookings: [], history: [], payments: [],
};

describe('student rendering', () => {
  it('shows the profile timezone and escapes profile names', () => {
    const html = renderStudent(baseStudent);
    expect(html).toContain('Asia/Taipei');
    expect(html).toContain('&lt;Student A&gt;');
    expect(html).not.toContain('<Student A>');
  });

  it('blocks another pending request when no credit remains uncommitted', () => {
    const html = renderStudent({
      ...baseStudent,
      requests: [{ id: 'request-a', student_id: student.id, status: 'pending', note: null, submitted_at: '2026-01-01T00:00:00Z' }],
    });
    expect(html).toContain('現在は新しい予約申請を送れません');
    expect(html).not.toContain('id="booking-form"');
  });
});

describe('teacher rendering', () => {
  it('provides the student invitation workflow', () => {
    const snapshot: TeacherSnapshot = {
      students: [], credits: [], requests: [], candidates: [], bookings: [], history: [], payments: [],
    };
    const html = renderTeacher(snapshot);
    expect(html).toContain('id="invite-form"');
    expect(html).toContain('72時間有効');
  });
});
