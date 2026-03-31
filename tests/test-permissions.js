/**
 * Test: Permission matrix validation
 * Verifies that PAGE_ROLES matches expected access patterns
 * Run: node --test tests/test-permissions.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mirror of PAGE_ROLES from app.js
const PAGE_ROLES = {
  'dashboard':          ['principal', 'counselor'],
  'counselor':          ['principal', 'counselor'],
  'mentor':             ['principal', 'mentor'],
  'students':           ['principal', 'counselor', 'mentor', 'intake_staff'],
  'student-detail':     ['principal', 'counselor', 'mentor', 'student', 'parent'],
  'staff':              ['principal', 'counselor'],
  'materials':          ['principal', 'counselor', 'mentor'],
  'feedback-list':      ['principal', 'counselor'],
  'templates':          ['principal', 'counselor'],
  'settings':           ['principal', 'counselor'],
  'analytics':          ['principal', 'counselor'],
  'audit':              ['principal'],
  'admission-programs': ['principal', 'counselor'],
  'task-detail':        ['principal', 'counselor', 'mentor', 'intake_staff', 'student_admin'],
  'student-portal':     ['student'],
  'parent-portal':      ['parent'],
  'agent-portal':       ['agent'],
  'intake-dashboard':   ['principal', 'intake_staff', 'student_admin'],
  'intake-cases':       ['principal', 'intake_staff', 'student_admin'],
  'intake-case-detail': ['principal', 'intake_staff', 'student_admin'],
  'agents-management':  ['principal'],
  'mat-requests':       ['principal', 'counselor', 'intake_staff'],
  'mat-request-detail': ['principal', 'counselor', 'intake_staff'],
  'mat-companies':      ['principal', 'counselor', 'intake_staff'],
  'adm-profiles':       ['principal', 'counselor', 'intake_staff'],
  'adm-form':           ['principal', 'counselor', 'intake_staff'],
  'adm-case-detail':    ['principal', 'counselor', 'intake_staff'],
};

const ALL_ROLES = ['principal', 'counselor', 'mentor', 'student', 'parent', 'agent', 'intake_staff', 'student_admin'];

describe('Permission Matrix', () => {
  it('principal should access all pages', () => {
    for (const [page, roles] of Object.entries(PAGE_ROLES)) {
      if (['student-portal', 'parent-portal', 'agent-portal'].includes(page)) continue;
      assert.ok(roles.includes('principal'), `principal should access ${page}`);
    }
  });

  it('student should only access student-portal and student-detail', () => {
    for (const [page, roles] of Object.entries(PAGE_ROLES)) {
      if (['student-portal', 'student-detail'].includes(page)) {
        assert.ok(roles.includes('student'), `student should access ${page}`);
      } else {
        assert.ok(!roles.includes('student'), `student should NOT access ${page}`);
      }
    }
  });

  it('parent should only access parent-portal and student-detail', () => {
    for (const [page, roles] of Object.entries(PAGE_ROLES)) {
      if (['parent-portal', 'student-detail'].includes(page)) {
        assert.ok(roles.includes('parent'), `parent should access ${page}`);
      } else {
        assert.ok(!roles.includes('parent'), `parent should NOT access ${page}`);
      }
    }
  });

  it('agent should only access agent-portal', () => {
    for (const [page, roles] of Object.entries(PAGE_ROLES)) {
      if (page === 'agent-portal') {
        assert.ok(roles.includes('agent'));
      } else {
        assert.ok(!roles.includes('agent'), `agent should NOT access ${page}`);
      }
    }
  });

  it('counselor should NOT access intake management', () => {
    assert.ok(!PAGE_ROLES['intake-dashboard'].includes('counselor'));
    assert.ok(!PAGE_ROLES['intake-cases'].includes('counselor'));
    assert.ok(!PAGE_ROLES['intake-case-detail'].includes('counselor'));
  });

  it('student_admin should only access intake + task-detail', () => {
    for (const [page, roles] of Object.entries(PAGE_ROLES)) {
      if (roles.includes('student_admin')) {
        assert.ok(
          ['intake-dashboard', 'intake-cases', 'intake-case-detail', 'task-detail'].includes(page),
          `student_admin should NOT access ${page}`
        );
      }
    }
  });

  it('audit page should be principal-only', () => {
    assert.deepEqual(PAGE_ROLES['audit'], ['principal']);
  });

  it('agents-management should be principal-only', () => {
    assert.deepEqual(PAGE_ROLES['agents-management'], ['principal']);
  });

  it('all role references should be valid', () => {
    for (const [page, roles] of Object.entries(PAGE_ROLES)) {
      for (const role of roles) {
        assert.ok(ALL_ROLES.includes(role), `Invalid role '${role}' in page '${page}'`);
      }
    }
  });
});
