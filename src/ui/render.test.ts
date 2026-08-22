import { describe, expect, it } from 'vitest';
import type { StudentSnapshot, TeacherSnapshot } from '../types';
import { renderStudent } from './student';
import { renderTeacher } from './teacher';

const student = {
  id: 'student-a', auth_user_id: 'user-a', email: 'a@example.invalid',
  full_name: '<Student A>', status: 'active' as const,
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

  it('renders five-day/three-range guidance and all student languages', () => {
    const ja = renderStudent(baseStudent, 'ja');
    const zh = renderStudent(baseStudent, 'zh');
    const en = renderStudent(baseStudent, 'en');
    expect(ja).toContain('候補日は最大5件');
    expect(ja).toContain('第3希望（任意）');
    expect(ja).toContain('>送信する<');
    expect(ja).not.toContain('安全に送信');
    expect(zh).toContain('候選日期');
    expect(en).toContain('Candidate date');
  });
});

describe('teacher rendering', () => {
  it('provides the student invitation workflow', () => {
    const snapshot: TeacherSnapshot = {
      students: [], labels: [], credits: [], requests: [], candidates: [], bookings: [], history: [], payments: [],
    };
    const html = renderTeacher(snapshot);
    expect(html).toContain('id="invite-form"');
    expect(html).toContain('72時間有効');
    expect(html).toContain('先生用の呼び名');
    expect(html).toContain('管理者用（訂正・返金時のみ）');
  });

  it('renders teacher-only labels and an edit control for existing students', () => {
    const snapshot: TeacherSnapshot = {
      students: [student], labels: [{ student_id: student.id, nickname: 'たい時間' }],
      credits: [], requests: [], candidates: [], bookings: [], history: [], payments: [],
    };
    const html = renderTeacher(snapshot);
    expect(html).toContain('たい時間');
    expect(html).toContain(`data-label-form="${student.id}"`);
    expect(html).toContain('括弧内は先生のみ表示');
  });
});
