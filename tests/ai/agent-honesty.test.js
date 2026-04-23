/**
 * tests/ai/agent-honesty.test.js — Agent 诚信回归测试
 *
 * 目标：验证 agent 在以下情况下绝不能声称"已记录/已保存/已完成"：
 *   1. 写工具根本未被调用（hallucination 场景）
 *   2. 写工具执行失败（DB 异常）
 *   3. 调用者角色无写权限（student/parent）
 *
 * 同时验证：
 *   4. 写工具成功时返回结构必须含 ok:true
 *   5. SYSTEM_PROMPT 包含诚实性规则关键词
 *
 * 运行: node --test tests/ai/agent-honesty.test.js
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

let agent;
try {
  agent = require('../../ai-agent');
} catch (e) {
  agent = null;
}

// ── helpers ────────────────────────────────────────────────────
function makeCtx(role, overrides = {}) {
  return {
    db: {
      get: () => null,
      all: () => [],
      run: () => {},
    },
    user: { role, linked_id: role === 'student' ? 'stu-001' : 'staff-001' },
    studentId: 'stu-001',
    audit: null,
    req: null,
    ...overrides,
  };
}

const SUCCESS_CLAIMED = /已记录|已保存|已创建|已更新|已添加|已完成/;
const FAILURE_HONEST  = /失败|无法|不能|没有.*权限|请.*手动|error/i;

// ── 1. SYSTEM_PROMPT 诚实性规则存在 ────────────────────────────
describe('SYSTEM_PROMPT integrity', () => {
  it('module should load', () => {
    assert.ok(agent !== null, 'ai-agent.js must be loadable');
  });

  it('SYSTEM_PROMPT must contain honesty constraint', () => {
    if (!agent) return;
    const { SYSTEM_PROMPT } = agent;
    assert.ok(typeof SYSTEM_PROMPT === 'string', 'SYSTEM_PROMPT must be exported');
    assert.ok(
      SYSTEM_PROMPT.includes('诚实性规则') || SYSTEM_PROMPT.includes('禁止以任何形式编造'),
      'SYSTEM_PROMPT must contain explicit honesty constraint'
    );
  });

  it('SYSTEM_PROMPT must forbid claiming success without ok:true from tool_result', () => {
    if (!agent) return;
    const { SYSTEM_PROMPT } = agent;
    assert.ok(
      SYSTEM_PROMPT.includes('ok": true') || SYSTEM_PROMPT.includes('ok:true'),
      'SYSTEM_PROMPT must reference ok:true as the gate before claiming success'
    );
  });

  it('SYSTEM_PROMPT rule 4 must say to directly call the tool (not just describe)', () => {
    if (!agent) return;
    const { SYSTEM_PROMPT } = agent;
    assert.ok(
      SYSTEM_PROMPT.includes('直接调用对应工具') || SYSTEM_PROMPT.includes('直接调用'),
      'Rule 4 should instruct agent to directly invoke the tool, not just describe the action'
    );
  });
});

// ── 2. 写工具失败时 executeTool 抛出（不静默）────────────────────
describe('executeTool — write failure must throw, not return ok:true', () => {
  it('add_communication: DB.run failure must propagate as thrown error', async () => {
    if (!agent) return;
    const ctx = makeCtx('mentor', {
      db: {
        get: () => null,
        all: () => [],
        run: () => { throw new Error('SQLITE_BUSY: database is locked'); },
      },
    });
    await assert.rejects(
      () => agent.executeTool('add_communication', { type: 'other', topic: '导师更新', summary: '测试' }, ctx),
      (err) => {
        assert.ok(err.message.length > 0, 'Error should have message');
        // Critically: error must NOT contain success-claiming text
        assert.ok(!SUCCESS_CLAIMED.test(err.message), 'Error message must not claim success');
        return true;
      },
      'Should throw when DB fails'
    );
  });

  it('create_task: DB.run failure must propagate as thrown error', async () => {
    if (!agent) return;
    const ctx = makeCtx('counselor', {
      db: {
        get: () => null,
        all: () => [],
        run: () => { throw new Error('SQLITE_CONSTRAINT: NOT NULL constraint failed'); },
      },
    });
    await assert.rejects(
      () => agent.executeTool('create_task', { title: '测试任务', due_date: '2026-05-01' }, ctx),
      /NOT NULL|SQLITE/,
      'Should propagate DB constraint error'
    );
  });
});

// ── 3. 无权限角色调用写工具必须抛错 ─────────────────────────────
describe('executeTool — role without write access must throw', () => {
  it('student role calling add_communication should throw permission error', async () => {
    if (!agent) return;
    const ctx = makeCtx('student');
    await assert.rejects(
      () => agent.executeTool('add_communication', { type: 'other', topic: '测试', summary: '测试' }, ctx),
      /写操作仅限|角色.*不能使用/,
      'student role must be rejected for write operations'
    );
  });

  it('parent role calling create_task should throw permission error', async () => {
    if (!agent) return;
    const ctx = makeCtx('parent', {
      db: {
        get: (sql) => sql.includes('student_parents') ? { ok: 1 } : null,
        all: () => [],
        run: () => {},
      },
    });
    await assert.rejects(
      () => agent.executeTool('create_task', { title: '测试', due_date: '2026-05-01' }, ctx),
      /写操作仅限|角色.*不能使用/,
      'parent role must be rejected for write operations'
    );
  });

  it('intake_staff role calling add_communication should throw permission error', async () => {
    if (!agent) return;
    const ctx = makeCtx('intake_staff');
    await assert.rejects(
      () => agent.executeTool('add_communication', { type: 'other', topic: '测试', summary: '测试' }, ctx),
      /写操作仅限|角色.*不能使用/,
      'intake_staff must be rejected for add_communication'
    );
  });
});

// ── 4. 写工具成功时返回 {ok:true, ...} ──────────────────────────
describe('executeTool — successful writes must return {ok:true}', () => {
  it('add_communication with valid mentor ctx should return ok:true and log_id', async () => {
    if (!agent) return;
    let insertCalled = false;
    const ctx = makeCtx('mentor', {
      db: {
        get: () => null,
        all: () => [],
        run: () => { insertCalled = true; },
      },
    });
    const result = await agent.executeTool(
      'add_communication',
      { type: 'wechat', topic: '导师更新', summary: '导师被更新为 Yao Kexiang' },
      ctx
    );
    assert.ok(result.ok === true, `ok must be true, got: ${JSON.stringify(result)}`);
    assert.ok(typeof result.log_id === 'string' && result.log_id.length > 0, 'log_id must be a non-empty string');
    assert.ok(typeof result.message === 'string', 'message must be a string');
    assert.ok(insertCalled, 'DB.run must have been called (actual DB insert must happen)');
  });

  it('create_task with valid counselor ctx should return ok:true and task_id', async () => {
    if (!agent) return;
    const ctx = makeCtx('counselor', {
      db: {
        get: () => null,
        all: () => [],
        run: () => {},
      },
    });
    const result = await agent.executeTool(
      'create_task',
      { title: '准备 Oxford PAT', due_date: '2026-06-15' },
      ctx
    );
    assert.ok(result.ok === true, `ok must be true, got: ${JSON.stringify(result)}`);
    assert.ok(typeof result.task_id === 'string', 'task_id must be a string');
  });

  it('add_target_university should return ok:true and target_id', async () => {
    if (!agent) return;
    const ctx = makeCtx('principal', {
      db: {
        get: () => null,
        all: () => [],
        run: () => {},
      },
    });
    const result = await agent.executeTool(
      'add_target_university',
      { uni_name: 'Oxford', tier: '冲刺', department: 'CS' },
      ctx
    );
    assert.ok(result.ok === true, `ok must be true, got: ${JSON.stringify(result)}`);
    assert.ok(typeof result.target_id === 'string', 'target_id must be a string');
  });
});

// ── 5. buildToolsForRole — 读写权限分配正确 ─────────────────────
describe('buildToolsForRole — write tools only for authorized roles', () => {
  if (!agent) return;
  const { buildToolsForRole, WRITE_TOOLS } = agent;
  const writeNames = Object.keys(WRITE_TOOLS);

  for (const role of ['student', 'parent', 'intake_staff']) {
    it(`${role} should not have any write tools`, () => {
      const tools = buildToolsForRole(role);
      const toolNames = tools.map(t => t.name);
      for (const w of writeNames) {
        assert.ok(!toolNames.includes(w), `${role} must not have write tool: ${w}`);
      }
    });
  }

  for (const role of ['principal', 'counselor', 'mentor']) {
    it(`${role} should have all write tools`, () => {
      const tools = buildToolsForRole(role);
      const toolNames = tools.map(t => t.name);
      for (const w of writeNames) {
        assert.ok(toolNames.includes(w), `${role} must have write tool: ${w}`);
      }
    });
  }
});
