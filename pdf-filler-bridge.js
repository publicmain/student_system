/**
 * pdf-filler-bridge.js
 * Node.js → Python PDF 模板填充桥接模块
 *
 * 调用 Python pdf-filler/main.py，传入 JSON 数据，返回生成结果
 * 如果 Python 不可用，fallback 到原有的 pdf-generator.js (从零生成)
 */
'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_SCRIPT = path.join(__dirname, 'pdf-filler', 'main.py');
const TEMPLATE_DIR = path.join(__dirname, 'templates');

// Python 子进程环境变量：确保 UTF-8 输出，不被 Windows cp1252 截断
const PY_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };

/**
 * 检查 Python 环境和模板是否就绪
 */
function checkPythonReady() {
  try {
    // 检查 Python
    const result = require('child_process').execSync('python --version 2>&1', { encoding: 'utf8', timeout: 5000, env: PY_ENV });
    if (!result.includes('Python 3')) return { ready: false, reason: 'Python 3 not found' };

    // 检查模板文件
    const templates = [
      '2026 Student Application Form.pdf',
      'form-16_application-for-stp_fss_kid_pei.pdf',
      'Form 36_ICA.pdf',
    ];
    const missing = templates.filter(t => !fs.existsSync(path.join(TEMPLATE_DIR, t)));
    if (missing.length > 0) return { ready: false, reason: `Missing templates: ${missing.join(', ')}` };

    // 检查 Python 脚本
    if (!fs.existsSync(PYTHON_SCRIPT)) return { ready: false, reason: 'pdf-filler/main.py not found' };

    return { ready: true };
  } catch (e) {
    return { ready: false, reason: e.message };
  }
}

/**
 * 用 Python 模板填充器生成 PDF
 * @param {string} profileId
 * @param {Object} db - 数据库实例
 * @param {string} uploadDir - 上传文件目录
 * @returns {Promise<Array>} 生成结果数组
 */
async function generateWithTemplate(profileId, db, uploadDir) {
  // 加载完整 profile 数据
  const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [profileId]);
  if (!profile) throw new Error('Profile not found: ' + profileId);

  const data = {
    profile,
    family: db.all('SELECT * FROM adm_family_members WHERE profile_id=? ORDER BY sort_order', [profileId]),
    residence: db.all('SELECT * FROM adm_residence_history WHERE profile_id=? ORDER BY sort_order', [profileId]),
    education: db.all('SELECT * FROM adm_education_history WHERE profile_id=? ORDER BY sort_order', [profileId]),
    employment: db.all('SELECT * FROM adm_employment_history WHERE profile_id=? ORDER BY sort_order', [profileId]),
    guardian: db.get('SELECT * FROM adm_guardian_info WHERE profile_id=?', [profileId]),
    parentPrAdditional: db.all('SELECT * FROM adm_parent_pr_additional WHERE profile_id=?', [profileId]),
    spousePrAdditional: db.get('SELECT * FROM adm_spouse_pr_additional WHERE profile_id=?', [profileId]),
  };

  // 签字数据转为 map
  const sigRows = db.all('SELECT * FROM adm_signatures WHERE profile_id=?', [profileId]);
  data.signatures = {};
  sigRows.forEach(s => { data.signatures[s.sig_type] = s; });

  const jsonStr = JSON.stringify(data);

  return new Promise((resolve, reject) => {
    const child = execFile('python', [
      PYTHON_SCRIPT,
      `--profile-id=${profileId}`,
      `--template-dir=${TEMPLATE_DIR}`,
      `--output-dir=${uploadDir}`,
      `--upload-dir=${uploadDir}`,
    ], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: PY_ENV,
    }, (error, stdout, stderr) => {
      if (stderr) console.warn('[pdf-filler] stderr:', stderr);
      if (error) {
        console.error('[pdf-filler] error:', error.message);
        return reject(error);
      }
      try {
        // Python stdout 可能前缀 MuPDF warning，提取第一个 [ 到最后一个 ] 之间的 JSON
        let raw = stdout.trim();
        const jsonStart = raw.indexOf('[');
        const jsonEnd = raw.lastIndexOf(']');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          raw = raw.slice(jsonStart, jsonEnd + 1);
        }
        const results = JSON.parse(raw);
        resolve(results);
      } catch (e) {
        console.error('[pdf-filler] JSON parse error:', stdout);
        reject(new Error('Invalid JSON from pdf-filler: ' + stdout.slice(0, 200)));
      }
    });

    // 通过 stdin 传入 JSON 数据
    child.stdin.write(jsonStr);
    child.stdin.end();
  });
}

/**
 * 完整的生成流程：尝试 Python 模板填充，失败则 fallback
 */
async function generateAllDocuments(profileId, db, uploadDir) {
  const { v4: uuidv4 } = require('uuid');

  const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [profileId]);
  if (!profile) throw new Error('Profile not found: ' + profileId);

  // 检查 Python 是否就绪
  const pyCheck = checkPythonReady();
  let results;

  if (pyCheck.ready) {
    console.log('[pdf-filler] Using Python template filler');
    results = await generateWithTemplate(profileId, db, uploadDir);
  } else {
    // 模板不可用时直接报错，不偷偷降级
    throw new Error('[pdf-filler] Python not ready: ' + pyCheck.reason);
  }

  // 将 Python 结果写入 DB
  const docTypeMap = { SAF: 'SAF', FORM16: 'FORM16', V36: 'V36' };

  for (const r of results) {
    const docType = docTypeMap[r.type] || r.type;

    // 旧版本置为非最新
    db.run('UPDATE adm_generated_documents SET is_latest=0 WHERE profile_id=? AND doc_type=?', [profileId, docType]);

    const lastVer = db.get('SELECT MAX(version_no) as v FROM adm_generated_documents WHERE profile_id=? AND doc_type=?', [profileId, docType]);
    const versionNo = ((lastVer?.v) || 0) + 1;

    const docId = uuidv4();
    db.run(`INSERT INTO adm_generated_documents (id, profile_id, intake_case_id, doc_type, version_no, status, file_id, file_size, generated_at, error_message, is_latest)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 1)`,
      [docId, profileId, profile.intake_case_id || null, docType, versionNo,
       r.status, r.fileName || null, r.fileSize || null, r.error || null]);

    r.docId = docId;
  }

  return results;
}

module.exports = { generateAllDocuments, checkPythonReady, generateWithTemplate };
