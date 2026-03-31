/**
 * routes/visa-arrival.js — 签证案例、到校记录、到校后问卷
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, requireAdmissionModule, sendMail, escHtml, brandedEmail }) {
  const router = express.Router();

  // ═══════════════════════════════════════════════════════
  //  VISA CASES
  // ═══════════════════════════════════════════════════════

  router.get('/visa-cases/:id', requireAdmissionModule, (req, res) => {
    const vc = db.get('SELECT * FROM visa_cases WHERE id=?', [req.params.id]);
    if (!vc) return res.status(404).json({ error: '签证案例不存在' });
    res.json(vc);
  });

  router.put('/visa-cases/:id', requireRole('principal','intake_staff'), (req, res) => {
    if (!db.get('SELECT id FROM visa_cases WHERE id=?', [req.params.id])) {
      return res.status(404).json({ error: '签证案例不存在' });
    }
    const { status, submission_date, additional_docs_due, medical_due, notes, ipa_issue_date, ipa_expiry_date } = req.body;
    if (status) {
      const validVisaStatuses = ['not_started','submitted','ipa_received','additional_docs','medical','complete_formalities','approved','rejected','reapply'];
      if (!validVisaStatuses.includes(status)) return res.status(400).json({ error: '无效的签证状态值' });
    }
    if (ipa_expiry_date && ipa_issue_date && ipa_expiry_date <= ipa_issue_date) {
      return res.status(400).json({ error: 'IPA 到期日期必须晚于签发日期' });
    }
    db.run(`UPDATE visa_cases SET
      status=COALESCE(?,status),
      submission_date=COALESCE(?,submission_date),
      additional_docs_due=COALESCE(?,additional_docs_due),
      medical_due=COALESCE(?,medical_due),
      notes=COALESCE(?,notes),
      ipa_issue_date=COALESCE(?,ipa_issue_date),
      ipa_expiry_date=COALESCE(?,ipa_expiry_date),
      updated_at=datetime('now') WHERE id=?`,
      [status||null, submission_date||null, additional_docs_due||null, medical_due||null, notes||null,
       ipa_issue_date||null, ipa_expiry_date||null, req.params.id]);
    audit(req, 'UPDATE', 'visa_cases', req.params.id, req.body);
    res.json({ ok: true });
  });

  router.put('/visa-cases/:id/ipa', requireRole('principal','intake_staff'), (req, res) => {
    const { ipa_issue_date, ipa_expiry_date, notes } = req.body;
    if (!ipa_issue_date || !ipa_expiry_date) return res.status(400).json({ error: '缺少 ipa_issue_date 或 ipa_expiry_date' });
    if (ipa_expiry_date <= ipa_issue_date) return res.status(400).json({ error: 'IPA 到期日期必须晚于签发日期' });
    // F-01: 检查是否已有 IPA 记录，避免重复创建任务和日历事件
    const existingVc = db.get('SELECT ipa_issue_date FROM visa_cases WHERE id=?', [req.params.id]);
    if (!existingVc) return res.status(404).json({ error: '签证案例不存在' });
    const isFirstIpa = !existingVc?.ipa_issue_date;
    db.run(`UPDATE visa_cases SET status='ipa_received',ipa_issue_date=?,ipa_expiry_date=?,notes=COALESCE(?,notes),updated_at=datetime('now') WHERE id=?`,
      [ipa_issue_date, ipa_expiry_date, notes||null, req.params.id]);
    const vc = db.get('SELECT * FROM visa_cases WHERE id=?', [req.params.id]);
    if (vc) {
      const ic = db.get('SELECT * FROM intake_cases WHERE id=?', [vc.case_id]);
      if (ic) {
        if (isFirstIpa) {
          // 仅首次标记 IPA 时创建日历事件和提醒任务
          const anchorId = uuidv4();
          db.run(`INSERT INTO calendar_anchor_events (id,name,event_type,event_date,notes,is_system,created_at) VALUES (?,?,?,?,?,0,?)`,
            [anchorId, `IPA 有效期到期 - ${ic.program_name||''}`, 'ipa_expiry', ipa_expiry_date, `IPA for case ${vc.case_id}，学生: ${ic.student_name||''}`, new Date().toISOString()]);
          const taskId = uuidv4();
          db.run(`INSERT INTO milestone_tasks (id,student_id,intake_case_id,title,description,category,due_date,status,priority,assigned_to) VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [taskId, null, vc.case_id, 'IPA 有效期提醒 - 须在此前完成所有入境手续', `IPA 有效期至 ${ipa_expiry_date}，请确保在此日期前入境并完成所有 Student's Pass 手续`, '签证', ipa_expiry_date, 'pending', 'high', ic.case_owner_staff_id||null]);
        }
        // BUG-002b: 只在合法前驱状态下推进案例状态，避免跳过中间流程
        if (['visa_in_progress','paid'].includes(ic.status)) {
          db.run(`UPDATE intake_cases SET status='ipa_received',updated_at=datetime('now') WHERE id=?`, [vc.case_id]);
          db.run(`INSERT INTO case_status_log (id,case_id,from_status,to_status,changed_by,changed_by_name,reason) VALUES (?,?,?,?,?,?,?)`,
            [uuidv4(), vc.case_id, ic.status, 'ipa_received', req.session.user?.id, req.session.user?.name||'', 'IPA received']);
        }
      }
    }
    audit(req, 'IPA_RECEIVED', 'visa_cases', req.params.id, { ipa_issue_date, ipa_expiry_date });
    res.json({ ok: true, ipa_issue_date, ipa_expiry_date });
  });

  // ═══════════════════════════════════════════════════════
  //  ARRIVAL RECORDS
  // ═══════════════════════════════════════════════════════

  router.get('/arrival-records/:id', requireAdmissionModule, (req, res) => {
    const ar = db.get('SELECT * FROM arrival_records WHERE id=?', [req.params.id]);
    if (!ar) return res.status(404).json({ error: '记录不存在' });
    res.json(ar);
  });

  router.put('/arrival-records/:id', requireRole('principal','intake_staff','student_admin'), (req, res) => {
    if (!db.get('SELECT id FROM arrival_records WHERE id=?', [req.params.id])) {
      return res.status(404).json({ error: '到校记录不存在' });
    }
    const { expected_arrival, actual_arrival, flight_no, accommodation, insurance_provider, pickup_arranged, orientation_date, orientation_done, student_pass_issued, notes,
      accommodation_address, emergency_contact_name, emergency_contact_phone,
      student_pass_no, student_pass_expiry, local_bank_account, orientation_notes } = req.body;
    // F-02/H-01: 直接赋值（不用COALESCE），允许前端明确清空字段（发送null即可置空）
    db.run(`UPDATE arrival_records SET
      expected_arrival=?,
      actual_arrival=?,
      flight_no=?,
      accommodation=?,
      insurance_provider=?,
      pickup_arranged=?,
      orientation_date=?,
      orientation_done=?,
      student_pass_issued=?,
      notes=?,
      accommodation_address=?,
      emergency_contact_name=?,
      emergency_contact_phone=?,
      student_pass_no=?,
      student_pass_expiry=?,
      local_bank_account=?,
      orientation_notes=?,
      updated_at=datetime('now') WHERE id=?`,
      [expected_arrival||null, actual_arrival||null, flight_no||null, accommodation||null, insurance_provider||null,
       pickup_arranged!=null?pickup_arranged:null, orientation_date||null, orientation_done!=null?orientation_done:null,
       student_pass_issued!=null?student_pass_issued:null, notes||null,
       accommodation_address||null, emergency_contact_name||null, emergency_contact_phone||null,
       student_pass_no||null, student_pass_expiry||null, local_bank_account||null, orientation_notes||null,
       req.params.id]);
    // BUG-002a: 到校记录变更只在合法前驱状态下推进案例状态，避免绕过状态机
    if (actual_arrival) {
      const ar = db.get('SELECT case_id FROM arrival_records WHERE id=?', [req.params.id]);
      if (ar) {
        const ic = db.get('SELECT status FROM intake_cases WHERE id=?', [ar.case_id]);
        if (ic && ic.status === 'ipa_received') {
          db.run(`UPDATE intake_cases SET status='arrived',updated_at=datetime('now') WHERE id=?`, [ar.case_id]);
          db.run(`INSERT INTO case_status_log (id,case_id,from_status,to_status,changed_by,changed_by_name,reason) VALUES (?,?,?,?,?,?,?)`,
            [uuidv4(), ar.case_id, 'ipa_received', 'arrived', req.session.user?.id, req.session.user?.name||'', '到校记录更新']);
        }
      }
    }
    if (orientation_done) {
      const ar = db.get('SELECT case_id FROM arrival_records WHERE id=?', [req.params.id]);
      if (ar) {
        const ic = db.get('SELECT status FROM intake_cases WHERE id=?', [ar.case_id]);
        if (ic && ic.status === 'arrived') {
          db.run(`UPDATE intake_cases SET status='oriented',updated_at=datetime('now') WHERE id=?`, [ar.case_id]);
          db.run(`INSERT INTO case_status_log (id,case_id,from_status,to_status,changed_by,changed_by_name,reason) VALUES (?,?,?,?,?,?,?)`,
            [uuidv4(), ar.case_id, 'arrived', 'oriented', req.session.user?.id, req.session.user?.name||'', 'Orientation 完成']);
        }
      }
    }
    audit(req, 'UPDATE', 'arrival_records', req.params.id, req.body);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════
  //  POST-ARRIVAL SURVEYS
  // ═══════════════════════════════════════════════════════

  router.post('/intake-cases/:id/surveys', requireAuth, (req, res) => {
    const u = req.session.user;
    // BUG-006: 阻止无关角色（agent/mentor/parent）提交问卷
    const allowedRoles = ['principal','counselor','intake_staff','student_admin','student'];
    if (!allowedRoles.includes(u.role)) return res.status(403).json({ error: '无权提交到校问卷' });
    // 验证案例存在
    if (!db.get('SELECT id FROM intake_cases WHERE id=?', [req.params.id])) {
      return res.status(404).json({ error: 'Case 不存在' });
    }
    // 学生只能提交自己案例的问卷
    if (u.role === 'student') {
      const caseOwner = db.get('SELECT student_id FROM intake_cases WHERE id=?', [req.params.id]);
      if (!caseOwner || caseOwner.student_id !== u.linked_id) {
        return res.status(403).json({ error: '无权提交该案例的问卷' });
      }
    }
    // BUG-003: 重复提交检查
    const existing = db.get('SELECT id FROM post_arrival_surveys WHERE case_id=?', [req.params.id]);
    if (existing) return res.status(409).json({ error: '该案例已有问卷记录，不可重复提交' });
    const { survey_date, overall_satisfaction, accommodation_ok, orientation_helpful, support_needed, comments, filled_by } = req.body;
    const id = uuidv4();
    db.run(`INSERT INTO post_arrival_surveys (id,case_id,survey_date,overall_satisfaction,accommodation_ok,orientation_helpful,support_needed,comments,filled_by) VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, survey_date||new Date().toISOString().slice(0,10), overall_satisfaction||null, accommodation_ok?1:0, orientation_helpful?1:0, support_needed||null, comments||null, filled_by||'student']);
    // Only counselor/principal can close the case; student submission does NOT auto-close
    if (u.role === 'principal' || u.role === 'counselor') {
      db.run(`UPDATE intake_cases SET status='closed',updated_at=datetime('now') WHERE id=? AND status='oriented'`, [req.params.id]);
    }
    audit(req, 'CREATE', 'post_arrival_surveys', id, { case_id: req.params.id });
    res.json({ id, case_id: req.params.id });
  });

  return router;
};
