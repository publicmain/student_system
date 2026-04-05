/**
 * routes/adm-profiles.js — ADM Module: Admission Application Form + Document Generation
 */
const express = require('express');

module.exports = function({ db, uuidv4, audit, requireAuth, requireRole, upload, fileStorage, moveUploadedFile, pdfGenerator, UPLOAD_DIR }) {
  const router = express.Router();

  const ADM_ROLES = ['principal', 'counselor', 'intake_staff'];

  // ── 助手：加载 profile 完整数据 ───────────────────────────────────────────
  function _admLoadFull(profileId) {
    const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [profileId]);
    if (!profile) return null;
    profile.family             = db.all('SELECT * FROM adm_family_members WHERE profile_id=? ORDER BY sort_order', [profileId]);
    profile.residence          = db.all('SELECT * FROM adm_residence_history WHERE profile_id=? ORDER BY sort_order', [profileId]);
    profile.education          = db.all('SELECT * FROM adm_education_history WHERE profile_id=? ORDER BY sort_order', [profileId]);
    profile.employment         = db.all('SELECT * FROM adm_employment_history WHERE profile_id=? ORDER BY sort_order', [profileId]);
    profile.guardian           = db.get('SELECT * FROM adm_guardian_info WHERE profile_id=?', [profileId]);
    profile.parentPrAdditional = db.all('SELECT * FROM adm_parent_pr_additional WHERE profile_id=?', [profileId]);
    profile.spousePrAdditional = db.get('SELECT * FROM adm_spouse_pr_additional WHERE profile_id=?', [profileId]);
    profile.signatures         = db.all('SELECT * FROM adm_signatures WHERE profile_id=?', [profileId]);
    profile.documents          = db.all(
      'SELECT * FROM adm_generated_documents WHERE profile_id=? ORDER BY doc_type, version_no DESC', [profileId]
    );
    return profile;
  }

  // ── 触发异步文档生成 ────────────────────────────────────────────────────────
  const _generatingProfiles = new Set();
  function _admTriggerGeneration(profileId) {
    if (!pdfGenerator) {
      console.warn('[ADM] pdf-generator not loaded, skipping document generation');
      db.run(`UPDATE intake_cases SET review_status='pending_review' WHERE adm_profile_id=?`, [profileId]);
      return;
    }
    const p = db.get('SELECT surname,given_name,passport_no,dob,nationality,course_name FROM adm_profiles WHERE id=?', [profileId]);
    if (p) {
      const missing = [];
      if (!p.surname && !p.given_name) missing.push('姓名');
      if (!p.passport_no) missing.push('护照号');
      if (!p.dob) missing.push('出生日期');
      if (!p.nationality) missing.push('国籍');
      if (!p.course_name) missing.push('课程名称');
      if (missing.length > 0) {
        console.warn(`[ADM] PDF 生成跳过：缺少关键字段 [${missing.join(',')}]，profile=${profileId}`);
        db.run(`UPDATE intake_cases SET review_status='generation_failed' WHERE adm_profile_id=?`, [profileId]);
        return;
      }
    }
    if (_generatingProfiles.has(profileId)) {
      console.log(`[ADM] Generation already in progress for ${profileId}, skipping`);
      return;
    }
    _generatingProfiles.add(profileId);
    const _doGenerate = (attempt) => {
      pdfGenerator.generateAllDocuments(profileId, db, UPLOAD_DIR)
        .then(results => {
          _generatingProfiles.delete(profileId);
          const validResults = results.filter(r => {
            if (r.status !== 'done' || !r.file_id) return false;
            const size = fileStorage.getFileSize(r.file_id);
            if (size < 1000) {
              console.warn(`[ADM] 损坏的 PDF 已清理: ${r.file_id} (${size} bytes)`);
              fileStorage.deleteFile(r.file_id);
              return false;
            }
            return true;
          });
          const allOk = validResults.length === results.length && results.length > 0;
          const newStatus = allOk ? 'pending_review' : 'generation_failed';
          db.run(`UPDATE intake_cases SET review_status=? WHERE adm_profile_id=?`, [newStatus, profileId]);
          console.log(`[ADM] Document generation ${newStatus} for profile ${profileId} (${validResults.length}/${results.length} OK)`);
        })
        .catch(err => {
          console.error(`[ADM] Document generation error (attempt ${attempt}):`, err.message);
          if (attempt < 2) {
            console.log(`[ADM] Retrying in 3s... (attempt ${attempt + 1})`);
            setTimeout(() => _doGenerate(attempt + 1), 3000);
          } else {
            _generatingProfiles.delete(profileId);
            db.run(`UPDATE intake_cases SET review_status='generation_failed' WHERE adm_profile_id=?`, [profileId]);
          }
        });
    };
    _doGenerate(1);
  }

  const fs = require('fs');

  // ── POST /api/adm-profiles ──
  router.post('/adm-profiles', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const id = uuidv4();
    const { source_type = 'staff', agent_id, course_name, intake_year } = req.body;
    db.run(`INSERT INTO adm_profiles (id, created_by, source_type, agent_id, course_name, intake_year, status)
            VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
      [id, req.session.user.id, source_type, agent_id || null, course_name || null, intake_year || null]);
    audit(req, 'ADM_PROFILE_CREATE', 'adm_profiles', id, { source_type });
    res.json({ id });
  });

  // ── GET /api/adm-profiles ──
  router.get('/adm-profiles', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const { status, source_type, intake_year } = req.query;
    let sql = `SELECT p.*, ic.review_status, ic.id as intake_case_id_linked
               FROM adm_profiles p
               LEFT JOIN intake_cases ic ON ic.adm_profile_id = p.id
               WHERE 1=1`;
    const params = [];
    if (status)      { sql += ' AND p.status=?';       params.push(status); }
    if (source_type) { sql += ' AND p.source_type=?';  params.push(source_type); }
    if (intake_year) { sql += ' AND p.intake_year=?';  params.push(intake_year); }
    sql += ' ORDER BY p.created_at DESC LIMIT 500';
    res.json(db.all(sql, params));
  });

  // ── GET /api/adm-profiles/:id ──
  router.get('/adm-profiles/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const profile = _admLoadFull(req.params.id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    res.json(profile);
  });

  // ── PUT /api/adm-profiles/:id ──
  router.put('/adm-profiles/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const p = db.get('SELECT id, status FROM adm_profiles WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (p.status === 'submitted') return res.status(400).json({ error: '已提交的表单不可修改，请重新生成文件' });

    const allowed = [
      'course_name','course_code','intake_year','intake_month','study_mode','campus',
      'surname','given_name','chinese_name','gender','dob','birth_country','birth_city',
      'nationality','race','religion','marital_status',
      'passport_type','passport_no','passport_issue_date','passport_expiry','passport_issue_country','passport_issue_place',
      'sg_pass_type','sg_nric_fin','sg_pass_expiry','prior_sg_study','prior_sg_school','prior_sg_year',
      'phone_home','phone_mobile','email','address_line1','address_line2','city','state_province',
      'postal_code','country_of_residence',
      'native_language','english_proficiency','ielts_score','toefl_score','other_lang_test','other_lang_score',
      'financial_source','annual_income','sponsor_name','sponsor_relation','bank_statement_available',
      'antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4','antecedent_remarks',
      'pdpa_consent','pdpa_marketing','pdpa_photo_video',
      'step_completed', 'source_type', 'agent_id',
      'period_applied_from','period_applied_to','school_name','id_photo',
      'alias','birth_certificate_no','occupation','birth_province_state',
      'foreign_identification_no','malaysian_id_no',
      'was_ever_sg_citizen_or_pr','requires_student_pass',
      'sg_address','sg_tel_no','hometown_address',
      'language_proof_file','highest_lang_proficiency','need_english_placement_test',
      'applicant_monthly_income','applicant_current_saving',
      'spouse_monthly_income','spouse_current_saving',
      'father_monthly_income','father_current_saving',
      'mother_monthly_income','mother_current_saving',
      'other_financial_support','other_financial_details','other_financial_amount',
      'bank_statement_file','antecedent_explanation_file',
      'f16_declaration_agreed','v36_declaration_agreed','remarks','commencement_date',
    ];
    const sets = [], vals = [];
    for (const key of allowed) {
      if (key in req.body) { sets.push(`${key}=?`); vals.push(req.body[key]); }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push("updated_at=datetime('now')");
    vals.push(req.params.id);
    db.run(`UPDATE adm_profiles SET ${sets.join(',')} WHERE id=?`, vals);
    res.json({ ok: true });
  });

  // ── POST /api/adm-profiles/:id/submit ──
  router.post('/adm-profiles/:id/submit', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [req.params.id]);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    if (profile.status === 'submitted') return res.status(400).json({ error: '已提交，请勿重复提交' });

    if (!profile.surname || !profile.given_name)
      return res.status(400).json({ error: '缺少申请人姓名 (surname / given_name)' });
    if (!profile.dob)
      return res.status(400).json({ error: '缺少出生日期' });
    if (!profile.course_name)
      return res.status(400).json({ error: '缺少课程名称' });

    let caseId = profile.intake_case_id;
    if (!caseId) {
      caseId = uuidv4();
      db.run(`INSERT INTO intake_cases
        (id, student_name, intake_year, program_name, case_owner_staff_id, source_type, adm_profile_id,
         review_status, submit_mode, submitted_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?, datetime('now'), 'registered')`,
        [caseId,
         `${profile.surname} ${profile.given_name}`,
         profile.intake_year || '',
         profile.course_name || '',
         req.session.user.id,
         profile.source_type || 'staff',
         profile.id,
         req.body.submit_mode || 'manual'
        ]);
      db.run('UPDATE adm_profiles SET intake_case_id=? WHERE id=?', [caseId, profile.id]);
    }

    db.run(`UPDATE adm_profiles SET status='submitted', updated_at=datetime('now') WHERE id=?`, [profile.id]);
    db.run(`UPDATE intake_cases SET review_status='generating_documents', submitted_at=datetime('now') WHERE id=?`, [caseId]);

    audit(req, 'ADM_PROFILE_SUBMIT', 'adm_profiles', profile.id, { caseId });
    _admTriggerGeneration(profile.id);
    res.json({ ok: true, intake_case_id: caseId });
  });

  // ── POST /api/adm-profiles/:id/regenerate-doc ──
  router.post('/adm-profiles/:id/regenerate-doc', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const profile = db.get('SELECT id FROM adm_profiles WHERE id=?', [req.params.id]);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    db.run(`UPDATE intake_cases SET review_status='generating_documents' WHERE adm_profile_id=?`, [req.params.id]);
    _admTriggerGeneration(req.params.id);
    audit(req, 'ADM_REGENERATE_DOCS', 'adm_profiles', req.params.id, {});
    res.json({ ok: true, message: '文件重新生成已触发' });
  });

  // ── GET /api/adm-profiles/:id/documents ──
  router.get('/adm-profiles/:id/documents', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const docs = db.all(
      'SELECT * FROM adm_generated_documents WHERE profile_id=? ORDER BY doc_type, version_no DESC',
      [req.params.id]
    );
    res.json(docs);
  });

  // ── GET /api/adm-docs/:docId/download ──
  router.get('/adm-docs/:docId/download', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const doc = db.get('SELECT * FROM adm_generated_documents WHERE id=?', [req.params.docId]);
    if (!doc || !doc.file_id) return res.status(404).json({ error: 'File not found' });
    const filePath = fileStorage.getFilePath(doc.file_id);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not on disk' });
    const names = { SAF: 'Student_Application_Form', FORM16: 'Form_16', V36: 'V36' };
    const profile = db.get('SELECT surname, given_name FROM adm_profiles WHERE id=?', [doc.profile_id]);
    const nameStr = profile ? `${profile.surname}_${profile.given_name}`.replace(/\s/g,'_') : 'Unknown';
    res.download(filePath, `${names[doc.doc_type] || doc.doc_type}_${nameStr}_v${doc.version_no}.pdf`);
  });

  // ── POST /api/adm-profiles/:id/signature ──
  router.post('/adm-profiles/:id/signature', requireAuth, requireRole(...ADM_ROLES), upload.single('file'), (req, res) => {
    const profile = db.get('SELECT id FROM adm_profiles WHERE id=?', [req.params.id]);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    const { sig_type, signer_name, sig_date, stroke_json } = req.body;
    if (!sig_type) return res.status(400).json({ error: 'sig_type required' });

    if (req.file) moveUploadedFile(req.file.filename, 'signature');
    const existing = db.get('SELECT id FROM adm_signatures WHERE profile_id=? AND sig_type=?', [req.params.id, sig_type]);
    const fileId = req.file ? req.file.filename : (existing?.file_id || null);

    if (existing) {
      db.run(`UPDATE adm_signatures SET signer_name=?, signed_at=datetime('now'), file_id=?, stroke_json=?, sig_date=? WHERE id=?`,
        [signer_name || null, fileId, stroke_json || null, sig_date || null, existing.id]);
    } else {
      db.run(`INSERT INTO adm_signatures (id, profile_id, sig_type, signer_name, signed_at, file_id, stroke_json, sig_date)
              VALUES (?, ?, ?, ?, datetime('now'), ?, ?, ?)`,
        [uuidv4(), req.params.id, sig_type, signer_name || null, fileId, stroke_json || null, sig_date || null]);
    }
    res.json({ ok: true, file_id: fileId });
  });

  // ── PUT /api/adm-profiles/:id/review ──
  router.put('/adm-profiles/:id/review', requireAuth, requireRole('principal', 'intake_staff'), (req, res) => {
    const { decision, note } = req.body;
    const profile = db.get('SELECT id, intake_case_id FROM adm_profiles WHERE id=?', [req.params.id]);
    if (!profile) return res.status(404).json({ error: 'Not found' });

    const statusMap = {
      approve:      'approved',
      reject:       'pending_additional_docs',
      request_docs: 'pending_additional_docs',
    };
    const newStatus = statusMap[decision];
    if (!newStatus) return res.status(400).json({ error: 'Invalid decision' });

    if (profile.intake_case_id) {
      db.run(`UPDATE intake_cases SET review_status=?, reviewed_by=?, reviewed_at=datetime('now'), review_note=? WHERE id=?`,
        [newStatus, req.session.user.id, note || null, profile.intake_case_id]);
    }
    audit(req, 'ADM_REVIEW', 'adm_profiles', profile.id, { decision, note });
    res.json({ ok: true, review_status: newStatus });
  });

  // ── POST /api/adm-profiles/:id/create-case ──
  router.post('/adm-profiles/:id/create-case', requireAuth, requireRole('principal', 'intake_staff'), (req, res) => {
    const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [req.params.id]);
    if (!profile) return res.status(404).json({ error: 'Not found' });

    const ic = profile.intake_case_id
      ? db.get('SELECT * FROM intake_cases WHERE id=?', [profile.intake_case_id])
      : null;
    if (!ic) return res.status(400).json({ error: '未找到关联案例，请先提交申请表' });
    if (ic.review_status !== 'approved') return res.status(400).json({ error: '案例未审核通过，无法创建入学案例' });

    db.run(`UPDATE intake_cases SET review_status='case_created', status='registered', updated_at=datetime('now') WHERE id=?`,
      [ic.id]);
    audit(req, 'ADM_CASE_CREATED', 'intake_cases', ic.id, {});
    res.json({ ok: true, intake_case_id: ic.id });
  });

  // ── 数组子数据 CRUD (family / residence / education / employment) ──────────

  const ALLOWED_TABLES = new Set(['adm_family_members', 'adm_residence_history', 'adm_education_history', 'adm_employment_history']);
  const ALLOWED_SORT_FIELDS = new Set(['sort_order']);
  const ALLOWED_COLUMNS = {
    adm_family_members: new Set(['member_type','surname','given_name','dob','nationality','sg_status','nric_fin','occupation','employer','relationship','is_alive','sort_order','sex','sg_mobile','email','contact_number','passport_no']),
    adm_residence_history: new Set(['country','city','address','date_from','date_to','purpose','sort_order']),
    adm_education_history: new Set(['institution_name','country','qualification','major','date_from','date_to','gpa','award_received','sort_order','state_province','language_of_instruction','educational_cert_no','obtained_pass_english']),
    adm_employment_history: new Set(['employer','country','position','date_from','date_to','is_current','reason_left','sort_order','nature_of_duties']),
  };

  function _admArrayRoutes(entity, table, sortField = 'sort_order') {
    if (!ALLOWED_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
    if (!ALLOWED_SORT_FIELDS.has(sortField)) throw new Error(`Invalid sort field: ${sortField}`);
    const allowedCols = ALLOWED_COLUMNS[table];

    router.get(`/adm-profiles/:id/${entity}`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
      res.json(db.all(`SELECT * FROM ${table} WHERE profile_id=? ORDER BY ${sortField}`, [req.params.id]));
    });

    router.post(`/adm-profiles/:id/${entity}`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
      const profile = db.get('SELECT id FROM adm_profiles WHERE id=?', [req.params.id]);
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      const newId = uuidv4();
      const body  = req.body;

      const cols  = Object.keys(body).filter(k => k !== 'id' && k !== 'profile_id' && k !== 'created_at' && allowedCols.has(k));
      const vals  = cols.map(k => body[k]);
      const placeholders = cols.map(() => '?').join(',');
      if (cols.length === 0) return res.status(400).json({ error: 'No valid columns provided' });
      db.run(
        `INSERT INTO ${table} (id, profile_id, ${cols.join(',')}) VALUES (?, ?, ${placeholders})`,
        [newId, req.params.id, ...vals]
      );
      res.json({ id: newId });
    });

    router.put(`/adm-${entity}/:id`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
      const body = req.body;
      const cols = Object.keys(body).filter(k => !['id','profile_id','created_at'].includes(k) && allowedCols.has(k));
      if (cols.length === 0) return res.json({ ok: true });
      const sets = cols.map(k => `${k}=?`).join(',');
      const vals = [...cols.map(k => body[k]), req.params.id];
      db.run(`UPDATE ${table} SET ${sets} WHERE id=?`, vals);
      res.json({ ok: true });
    });

    router.delete(`/adm-${entity}/:id`, requireAuth, requireRole(...ADM_ROLES), (req, res) => {
      db.run(`DELETE FROM ${table} WHERE id=?`, [req.params.id]);
      res.json({ ok: true });
    });
  }

  _admArrayRoutes('family',     'adm_family_members');
  _admArrayRoutes('residence',  'adm_residence_history');
  _admArrayRoutes('education',  'adm_education_history');
  _admArrayRoutes('employment', 'adm_employment_history');

  // Guardian (single record per profile)
  router.put('/adm-profiles/:id/guardian', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const existing = db.get('SELECT id FROM adm_guardian_info WHERE profile_id=?', [req.params.id]);
    const body = req.body;
    const fields = ['surname','given_name','relation','dob','nationality','sg_status','nric_fin','phone','email','address','occupation','employer'];
    if (existing) {
      const sets = fields.map(f => `${f}=?`).join(',');
      db.run(`UPDATE adm_guardian_info SET ${sets} WHERE profile_id=?`, [...fields.map(f => body[f]||null), req.params.id]);
    } else {
      db.run(`INSERT INTO adm_guardian_info (id, profile_id, ${fields.join(',')}) VALUES (?, ?, ${fields.map(()=>'?').join(',')})`,
        [uuidv4(), req.params.id, ...fields.map(f => body[f]||null)]);
    }
    res.json({ ok: true });
  });

  // Parent PR Additional
  router.post('/adm-profiles/:id/parent-pr', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const id = uuidv4();
    const { family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg } = req.body;
    db.run(`INSERT INTO adm_parent_pr_additional (id, profile_id, family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, family_member_id, arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null]);
    res.json({ id });
  });
  router.put('/adm-parent-pr/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const { arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg } = req.body;
    db.run(`UPDATE adm_parent_pr_additional SET arrival_date=?,pr_cert_no=?,sc_cert_no=?,last_departure=?,is_residing_sg=?,address_sg=? WHERE id=?`,
      [arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null, req.params.id]);
    res.json({ ok: true });
  });
  router.delete('/adm-parent-pr/:id', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    db.run('DELETE FROM adm_parent_pr_additional WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });

  // Spouse PR Additional
  router.put('/adm-profiles/:id/spouse-pr', requireAuth, requireRole(...ADM_ROLES), (req, res) => {
    const existing = db.get('SELECT id FROM adm_spouse_pr_additional WHERE profile_id=?', [req.params.id]);
    const { family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg } = req.body;
    if (existing) {
      db.run(`UPDATE adm_spouse_pr_additional SET family_member_id=?,arrival_date=?,pr_cert_no=?,sc_cert_no=?,last_departure=?,is_residing_sg=?,address_sg=? WHERE id=?`,
        [family_member_id||null, arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null, existing.id]);
    } else {
      db.run(`INSERT INTO adm_spouse_pr_additional (id, profile_id, family_member_id, arrival_date, pr_cert_no, sc_cert_no, last_departure, is_residing_sg, address_sg)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), req.params.id, family_member_id||null, arrival_date||null, pr_cert_no||null, sc_cert_no||null, last_departure||null, is_residing_sg?1:0, address_sg||null]);
    }
    res.json({ ok: true });
  });

  return router;
};
