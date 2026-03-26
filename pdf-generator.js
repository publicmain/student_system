/**
 * pdf-generator.js
 * 基于 pdf-lib 从零生成三份正式申请表
 * SAF  = Student Application Form
 * F16  = Form 16
 * V36  = V36
 *
 * 策略：从零创建（不依赖模板 PDF），坐标完全可控
 * 中文内容：表单字段均为英文，中文姓名/备注做 fallback
 */

'use strict';

const { PDFDocument, rgb, StandardFonts, PDFFont } = require('pdf-lib');
const fs   = require('fs');
const path = require('path');

// ─────────────────────────── 工具函数 ──────────────────────────────

/**
 * 将非 WinAnsi (Latin-1) 字符替换为安全表示
 * pdf-lib 的 StandardFonts 只支持 WinAnsi 编码（0x00-0xFF），
 * 中文/日文/韩文等字符会导致 "WinAnsi cannot encode" 错误
 */
function safeWinAnsi(str) {
  if (!str) return '';
  return String(str).replace(/[^\x00-\xFF]/g, (ch) => {
    // 将每个非 Latin-1 字符替换为 Unicode 转义表示 (U+XXXX)
    const code = ch.charCodeAt(0);
    // 常见 CJK 范围：直接用 ? 占位以保持可读性
    return '?';
  });
}

/** 把 undefined/null 转成空字符串，并过滤非 WinAnsi 字符 */
const s = (v) => safeWinAnsi(v == null ? '' : String(v));

/** 格式化日期 YYYY-MM-DD → DD/MM/YYYY */
function fmtDate(d) {
  if (!d) return '';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return s(d);
}

/** 布尔 → Yes / No */
const yn = (v) => (v ? 'Yes' : 'No');

/** 截断超长文本，防止溢出 */
function trunc(str, maxLen = 60) {
  const t = s(str);
  return t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t;
}

// ─────────────────────────── 页面布局常量 ──────────────────────────

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 50;
const LINE_H = 16;
const SECTION_GAP = 10;

// ─────────────────────────── 低层绘图辅助类 ────────────────────────

class PageWriter {
  constructor(doc, fonts) {
    this.doc   = doc;
    this.fonts = fonts;  // { regular, bold }
    this.page  = null;
    this.y     = 0;
    this._newPage();
  }

  _newPage() {
    this.page = this.doc.addPage([A4_W, A4_H]);
    this.y    = A4_H - MARGIN;
  }

  /** 确保剩余空间足够，否则换页 */
  ensureSpace(needed = LINE_H * 2) {
    if (this.y - needed < MARGIN + 20) this._newPage();
  }

  /** 画水平分隔线 */
  hr(thickness = 0.5) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end:   { x: A4_W - MARGIN, y: this.y },
      thickness,
      color: rgb(0.6, 0.6, 0.6),
    });
    this.y -= 6;
  }

  /** 画节标题（带深色背景） */
  sectionTitle(text) {
    this.ensureSpace(LINE_H * 2);
    this.y -= SECTION_GAP;
    this.page.drawRectangle({
      x: MARGIN, y: this.y - 14,
      width: A4_W - MARGIN * 2,
      height: 18,
      color: rgb(0.18, 0.38, 0.62),
    });
    this.page.drawText(text, {
      x: MARGIN + 4, y: this.y - 10,
      size: 9,
      font: this.fonts.bold,
      color: rgb(1, 1, 1),
    });
    this.y -= 22;
  }

  /** 普通文本行：label + value，两列布局 */
  field(label, value, opts = {}) {
    this.ensureSpace(LINE_H + 2);
    const { indent = 0, fullWidth = false } = opts;
    const lx = MARGIN + indent;
    const lw = fullWidth ? A4_W - MARGIN * 2 - indent : 180;
    const vx = lx + lw + 4;

    this.page.drawText(s(label), {
      x: lx, y: this.y,
      size: 8, font: this.fonts.bold,
      color: rgb(0.2, 0.2, 0.2),
    });
    if (!fullWidth) {
      this.page.drawText(trunc(s(value), 80), {
        x: vx, y: this.y,
        size: 8, font: this.fonts.regular,
        color: rgb(0, 0, 0),
      });
    } else {
      this.page.drawText(trunc(s(value), 120), {
        x: lx, y: this.y - LINE_H,
        size: 8, font: this.fonts.regular,
        color: rgb(0, 0, 0),
      });
      this.y -= LINE_H;
    }
    this.y -= LINE_H;
  }

  /** 两列并排字段（同一行） */
  fieldRow(pairs) {
    this.ensureSpace(LINE_H + 2);
    const colW = (A4_W - MARGIN * 2) / pairs.length;
    pairs.forEach(([label, value], i) => {
      const x = MARGIN + i * colW;
      this.page.drawText(s(label) + ':', {
        x, y: this.y,
        size: 7, font: this.fonts.bold,
        color: rgb(0.25, 0.25, 0.25),
      });
      this.page.drawText(trunc(s(value), 30), {
        x: x + 70, y: this.y,
        size: 7, font: this.fonts.regular,
        color: rgb(0, 0, 0),
      });
    });
    this.y -= LINE_H;
  }

  /** checkbox Yes/No */
  checkYN(label, isYes) {
    this.ensureSpace(LINE_H + 4);
    // Yes box
    this._box(MARGIN + 180, this.y, isYes);
    this.page.drawText('Yes', { x: MARGIN + 194, y: this.y, size: 8, font: this.fonts.regular, color: rgb(0,0,0) });
    // No box
    this._box(MARGIN + 215, this.y, !isYes);
    this.page.drawText('No',  { x: MARGIN + 229, y: this.y, size: 8, font: this.fonts.regular, color: rgb(0,0,0) });
    this.page.drawText(s(label), { x: MARGIN, y: this.y, size: 8, font: this.fonts.bold, color: rgb(0.2,0.2,0.2) });
    this.y -= LINE_H;
  }

  _box(x, y, checked) {
    this.page.drawRectangle({ x, y: y - 2, width: 10, height: 10,
      borderColor: rgb(0.3,0.3,0.3), borderWidth: 0.8, color: rgb(1,1,1) });
    if (checked) {
      // Draw X mark (WinAnsi safe, Helvetica doesn't support Unicode checkmark)
      this.page.drawLine({ start:{x:x+1,y:y-1}, end:{x:x+9,y:y+8}, thickness:1.2, color:rgb(0,0,0) });
      this.page.drawLine({ start:{x:x+1,y:y+8}, end:{x:x+9,y:y-1}, thickness:1.2, color:rgb(0,0,0) });
    }
  }

  /** 嵌入签字图片 */
  async embedSignature(pngBytes, label) {
    this.ensureSpace(60);
    this.y -= 8;
    if (label) {
      this.page.drawText(s(label), { x: MARGIN, y: this.y, size: 8, font: this.fonts.bold, color: rgb(0.2,0.2,0.2) });
      this.y -= LINE_H;
    }
    if (pngBytes) {
      try {
        const img = await this.doc.embedPng(pngBytes);
        const imgDims = img.scale(0.4);
        const w = Math.min(imgDims.width, 180);
        const h = Math.min(imgDims.height, 50);
        this.page.drawImage(img, { x: MARGIN, y: this.y - h, width: w, height: h });
        this.y -= h + 4;
      } catch(e) {
        this.field('(Signature on file)', '');
      }
    } else {
      // Draw blank signature line
      this.page.drawLine({ start: { x: MARGIN, y: this.y - 30 }, end: { x: MARGIN + 180, y: this.y - 30 }, thickness: 0.5, color: rgb(0,0,0) });
      this.y -= 36;
    }
  }

  /** 多条记录表格（动态行数） */
  table(headers, rows, colWidths) {
    const totalW = colWidths.reduce((a,b) => a+b, 0);
    const rowH   = LINE_H;

    // Header row
    this.ensureSpace(rowH * 2 + 4);
    this.page.drawRectangle({ x: MARGIN, y: this.y - rowH + 4, width: totalW, height: rowH,
      color: rgb(0.88, 0.92, 0.97) });
    let cx = MARGIN;
    headers.forEach((h, i) => {
      this.page.drawText(h, { x: cx + 2, y: this.y - rowH + 8, size: 7, font: this.fonts.bold, color: rgb(0.1,0.1,0.1) });
      cx += colWidths[i];
    });
    this.y -= rowH + 2;

    // Data rows
    rows.forEach((row) => {
      this.ensureSpace(rowH + 4);
      let rx = MARGIN;
      row.forEach((cell, i) => {
        this.page.drawText(trunc(s(cell), Math.floor(colWidths[i] / 5.5)), {
          x: rx + 2, y: this.y,
          size: 7, font: this.fonts.regular,
          color: rgb(0, 0, 0),
        });
        rx += colWidths[i];
      });
      // row divider
      this.page.drawLine({ start: { x: MARGIN, y: this.y - 3 }, end: { x: MARGIN + totalW, y: this.y - 3 },
        thickness: 0.3, color: rgb(0.8,0.8,0.8) });
      this.y -= rowH;
    });

    if (rows.length === 0) {
      this.page.drawText('(None)', { x: MARGIN + 4, y: this.y, size: 7, font: this.fonts.regular, color: rgb(0.5,0.5,0.5) });
      this.y -= rowH;
    }
    this.y -= 6;
  }

  /** 文档标题 */
  docTitle(title, subtitle = '') {
    this.page.drawRectangle({ x: 0, y: A4_H - 70, width: A4_W, height: 70, color: rgb(0.18, 0.38, 0.62) });
    this.page.drawText(title, { x: MARGIN, y: A4_H - 30, size: 16, font: this.fonts.bold, color: rgb(1,1,1) });
    if (subtitle) {
      this.page.drawText(subtitle, { x: MARGIN, y: A4_H - 52, size: 9, font: this.fonts.regular, color: rgb(0.85,0.9,1) });
    }
    this.y = A4_H - 80;
  }

  /** 声明文本块 */
  declarationText(text) {
    const maxW = A4_W - MARGIN * 2;
    const words = text.split(' ');
    let line = '';
    this.ensureSpace(LINE_H * 6);
    this.page.drawRectangle({ x: MARGIN - 4, y: this.y - LINE_H * 5, width: maxW + 8, height: LINE_H * 5 + 4,
      borderColor: rgb(0.7,0.7,0.7), borderWidth: 0.5, color: rgb(0.97,0.97,0.97) });
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      // rough char width: 4.5px per char at size 7.5
      if (test.length * 4.5 > maxW) {
        this.page.drawText(line, { x: MARGIN, y: this.y, size: 7.5, font: this.fonts.regular, color: rgb(0.15,0.15,0.15) });
        this.y -= LINE_H - 2;
        line = word;
      } else { line = test; }
    });
    if (line) {
      this.page.drawText(line, { x: MARGIN, y: this.y, size: 7.5, font: this.fonts.regular, color: rgb(0.15,0.15,0.15) });
      this.y -= LINE_H;
    }
    this.y -= 6;
  }
}

// ─────────────────────────── 年龄计算 ─────────────────────────────

function _calcAge(dobStr) {
  if (!dobStr) return 99;
  const dob = new Date(dobStr);
  if (isNaN(dob)) return 99;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** 格式化金额为 S$X,XXX.XX */
function fmtAmt(v) {
  if (v == null || v === '') return '';
  const n = parseFloat(v);
  if (isNaN(n)) return s(v);
  return n.toLocaleString('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** 嵌入照片 */
async function _embedPhoto(doc, pw, fileId, uploadDir) {
  if (!fileId) return;
  try {
    const fp = path.join(uploadDir, fileId);
    if (!fs.existsSync(fp)) return;
    const bytes = fs.readFileSync(fp);
    let img;
    if (fileId.toLowerCase().endsWith('.png')) img = await doc.embedPng(bytes);
    else img = await doc.embedJpg(bytes);
    const dims = img.scale(0.3);
    const w = Math.min(dims.width, 90);
    const h = Math.min(dims.height, 110);
    pw.ensureSpace(h + 10);
    pw.page.drawImage(img, { x: 495 - w, y: pw.y - h, width: w, height: h });
  } catch(e) { /* photo embed failed silently */ }
}

// ─────────────────────────── SAF 生成器 ────────────────────────────

async function generateSAF(profile, subs, sigMap, uploadDir) {
  const doc   = await PDFDocument.create();
  const bold  = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg   = await doc.embedFont(StandardFonts.Helvetica);
  const pw    = new PageWriter(doc, { bold, regular: reg });

  pw.docTitle('Student Application Form', profile.course_name || 'Admission Application');

  // ── 1. Course Details ──────────────────────────────────────────────
  pw.sectionTitle('1. Course Details');
  pw.fieldRow([['Course', profile.course_name], ['Code', profile.course_code]]);
  pw.fieldRow([['Intake Year', profile.intake_year], ['Intake Month', profile.intake_month]]);
  pw.fieldRow([['Study Mode', profile.study_mode], ['Campus', profile.campus]]);
  if (profile.school_name) pw.field('School / Institute', s(profile.school_name));
  if (profile.commencement_date) pw.field('Commencement Date', fmtDate(profile.commencement_date));
  pw.fieldRow([['Period From', fmtDate(profile.period_applied_from)], ['Period To', fmtDate(profile.period_applied_to)]]);

  // ── ID Photo ──────────────────────────────────────────────────────
  await _embedPhoto(doc, pw, profile.id_photo, uploadDir);

  // ── 2. Pass Type ───────────────────────────────────────────────────
  pw.sectionTitle('2. Pass Type in Singapore');
  pw.field('Pass Type', s(profile.sg_pass_type));
  if (profile.sg_nric_fin) pw.field('NRIC / FIN No.', s(profile.sg_nric_fin));
  if (profile.sg_pass_expiry) pw.field('Pass Expiry', fmtDate(profile.sg_pass_expiry));
  pw.checkYN('Was ever SG Citizen or PR', !!profile.was_ever_sg_citizen_or_pr);
  if (profile.prior_sg_study) {
    pw.checkYN('Previously Studied in Singapore', true);
    pw.fieldRow([['Previous School', profile.prior_sg_school], ['Year', profile.prior_sg_year]]);
  }

  // ── 3. Personal Details ───────────────────────────────────────────
  pw.sectionTitle('3. Personal Details');
  pw.fieldRow([['Surname', profile.surname], ['Given Name', profile.given_name]]);
  pw.field('Name in Chinese / Other Script', s(profile.chinese_name));
  if (profile.alias) pw.field('Alias / Other Name', s(profile.alias));
  pw.fieldRow([['Gender', profile.gender], ['Date of Birth', fmtDate(profile.dob)]]);
  pw.field('Birth Certificate No.', s(profile.birth_certificate_no));
  pw.fieldRow([['Country of Birth', profile.birth_country], ['Province/State of Birth', profile.birth_province_state || profile.birth_city]]);
  pw.fieldRow([['Nationality', profile.nationality], ['Race', profile.race]]);
  pw.fieldRow([['Religion', profile.religion], ['Marital Status', profile.marital_status]]);
  pw.field('Occupation', s(profile.occupation));
  pw.hr();
  pw.field('Mobile Phone', s(profile.phone_mobile));
  pw.field('Home Phone', s(profile.phone_home));
  pw.field('Email Address', s(profile.email));
  pw.field('Residential Address', s(profile.address_line1) + (profile.address_line2 ? ', ' + profile.address_line2 : ''));
  pw.fieldRow([['City', profile.city], ['Postal Code', profile.postal_code]]);
  pw.fieldRow([['State / Province', profile.state_province], ['Country', profile.country_of_residence]]);
  if (profile.hometown_address) pw.field('Hometown Address', s(profile.hometown_address));
  if (profile.sg_address) pw.field('Singapore Address', s(profile.sg_address));

  // ── 4. Family Members ─────────────────────────────────────────────
  pw.sectionTitle("4. Family Member's Particulars");
  const familyRows = (subs.family || []).map(m => [
    m.member_type || '', `${m.surname||''} ${m.given_name||''}`.trim(),
    m.sex||'', fmtDate(m.dob), m.nationality||'', m.sg_status||'', m.occupation||'', m.sg_mobile||m.contact_number||''
  ]);
  pw.table(
    ['Relation','Full Name','Sex','DOB','Nationality','SG Status','Occupation','Contact'],
    familyRows,
    [55,90,30,55,60,55,70,70]
  );

  // ── 5. Educational Background ──────────────────────────────────────
  pw.sectionTitle('5. Educational Background');
  const eduRows = (subs.education || []).map(e => [
    e.institution_name||'', e.country||'', e.qualification||'',
    `${fmtDate(e.date_from)}–${fmtDate(e.date_to)||'present'}`, e.language_of_instruction||'', e.gpa||''
  ]);
  pw.table(
    ['Institution','Country','Qualification','Period','Lang of Instruction','GPA'],
    eduRows,
    [110,55,85,80,75,50]
  );

  // ── 6. Language Proficiency ───────────────────────────────────────
  pw.sectionTitle('6. Language Proficiency');
  pw.field('Native Language', s(profile.native_language));
  pw.fieldRow([['English Proficiency', profile.english_proficiency], ['IELTS', profile.ielts_score]]);
  pw.fieldRow([['TOEFL', profile.toefl_score], [s(profile.other_lang_test) || 'Other Test', profile.other_lang_score]]);

  // ── 7. Financial Support ──────────────────────────────────────────
  pw.sectionTitle('7. Bank Statement / Financial Support');
  pw.field('Financial Source', s(profile.financial_source));
  pw.field('Annual Income (or Sponsor)', s(profile.annual_income));
  pw.field('Sponsor Name', s(profile.sponsor_name));
  pw.field('Sponsor Relationship', s(profile.sponsor_relation));
  pw.checkYN('Bank Statement Available', !!profile.bank_statement_available);

  // ── 8. Guardian Info (age < 18) ───────────────────────────────────
  const g = subs.guardian;
  const applicantAge = _calcAge(profile.dob);
  if (applicantAge < 18 && g) {
    pw.sectionTitle('8. Guardian Information (Applicant Under 18)');
    pw.fieldRow([['Surname', g.surname], ['Given Name', g.given_name]]);
    pw.fieldRow([['Relation to Applicant', g.relation], ['Date of Birth', fmtDate(g.dob)]]);
    pw.fieldRow([['Nationality', g.nationality], ['NRIC / FIN', g.nric_fin]]);
    pw.fieldRow([['Passport No.', g.passport_no], ['SG Status', g.sg_status]]);
    pw.field('Phone', s(g.phone));
    pw.field('Email', s(g.email));
    pw.field('Address', s(g.address));
    pw.fieldRow([['Occupation', g.occupation], ['Employer', g.employer]]);
    if (g.marital_status) {
      pw.fieldRow([['Marital Status', g.marital_status], ['Marriage Cert No.', g.marriage_certificate_no]]);
      if (g.marriage_date) pw.field('Marriage Date', fmtDate(g.marriage_date));
      if (g.divorce_certificate_no) pw.fieldRow([['Divorce Cert No.', g.divorce_certificate_no], ['Divorce Date', fmtDate(g.divorce_date)]]);
      pw.checkYN('Has Custody of Applicant', !!g.custody_of_applicant);
    }
  }

  // ── 9. Antecedent ─────────────────────────────────────────────────
  pw.sectionTitle('9. Antecedent');
  const antQ = [
    'Have you ever been refused a visa or entry, or been required to leave any country?',
    'Have you ever been deported from or required to leave any country?',
    'Do you have any criminal record in any country?',
    'Are you currently suffering from any infectious or communicable disease?',
  ];
  [profile.antecedent_q1, profile.antecedent_q2, profile.antecedent_q3, profile.antecedent_q4].forEach((v,i) => {
    pw.checkYN(`${i+1}. ${antQ[i]}`, !!v);
  });
  const anyAnt = profile.antecedent_q1 || profile.antecedent_q2 || profile.antecedent_q3 || profile.antecedent_q4;
  if (anyAnt) pw.field('Antecedent Remarks', s(profile.antecedent_remarks), { fullWidth: true });

  // ── 10. PDPA Consent ─────────────────────────────────────────────
  pw.sectionTitle('10. PDPA Consent');
  pw.declarationText(
    'I consent to the collection, use and disclosure of my personal data by the institution for the purposes of processing my application, administering my studies, and communicating with me regarding institution matters.'
  );
  pw.checkYN('I consent to the use of my data for marketing and publicity purposes', !!profile.pdpa_marketing);
  pw.checkYN('I consent to the use of my photos/videos for marketing and publicity purposes', !!profile.pdpa_photo_video);

  // ── 11. Residence History ─────────────────────────────────────────
  pw.sectionTitle('11. Residence History (Last 5 Years)');
  const resRows = (subs.residence || []).map(r => [
    r.country||'', r.city||'', r.address||'', fmtDate(r.date_from), fmtDate(r.date_to)||'present', r.purpose||''
  ]);
  pw.table(['Country','City','Address','From','To','Purpose'], resRows, [65,60,120,55,55,60]);

  // ── 12. Declarations ─────────────────────────────────────────────
  pw.sectionTitle('12. Declaration');
  pw.declarationText(
    'I declare that the information given in this application form is true, correct and complete to the best of my knowledge and belief. ' +
    'I understand that any false or misleading information or suppression of any material fact may result in the rejection of this application ' +
    'or dismissal from the institution if discovered at a later date.'
  );

  // ── 13. Signatures ────────────────────────────────────────────────
  pw.sectionTitle('13. Signatures');
  pw.ensureSpace(120);

  const appSig = sigMap['applicant'];
  const appSigPng = appSig?.file_id ? _loadSigPng(appSig.file_id, uploadDir) : null;
  await pw.embedSignature(appSigPng, 'Signature of Student');
  pw.fieldRow([['Name', `${profile.surname||''} ${profile.given_name||''}`.trim()], ['Date', s(appSig?.sig_date || fmtDate(new Date().toISOString().split('T')[0]))]]);

  if (applicantAge < 18 && g) {
    pw.y -= 10;
    const gdnSig = sigMap['guardian'];
    const gdnSigPng = gdnSig?.file_id ? _loadSigPng(gdnSig.file_id, uploadDir) : null;
    await pw.embedSignature(gdnSigPng, 'Signature of Guardian');
    pw.fieldRow([['Guardian Name', `${g.surname||''} ${g.given_name||''}`.trim()], ['Date', s(gdnSig?.sig_date || '')]]);
  }

  return doc.save();
}

// ─────────────────────────── Form 16 生成器 ────────────────────────

async function generateForm16(profile, subs, sigMap, uploadDir) {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const pw   = new PageWriter(doc, { bold, regular: reg });

  pw.docTitle('Form 16', 'Application for Student\'s Pass');

  // ── Photo ─────────────────────────────────────────────────────────
  await _embedPhoto(doc, pw, profile.id_photo, uploadDir);

  // ── 1. Particulars of Applicant (Part A) ──────────────────────────
  pw.sectionTitle('Part A — Particulars of Applicant');
  // F16 requires BLOCK LETTERS
  const fullNameBlock = (`${profile.surname||''} ${profile.given_name||''}`).trim().toUpperCase();
  pw.field('Full Name (BLOCK LETTERS)', fullNameBlock);
  if (profile.alias) pw.field('Alias', s(profile.alias));
  pw.field('Birth Certificate No.', s(profile.birth_certificate_no));
  pw.fieldRow([['Sex', profile.gender], ['Date of Birth', fmtDate(profile.dob)]]);
  pw.fieldRow([['Race', profile.race], ['Religion', profile.religion]]);
  pw.field('Email', s(profile.email));
  pw.fieldRow([['Nationality / Citizenship', profile.nationality], ['Occupation', profile.occupation]]);
  pw.fieldRow([['Country/Place of Birth', profile.birth_country], ['Province/State', profile.birth_province_state || profile.birth_city]]);
  pw.field('Marital Status', s(profile.marital_status));

  // ── FIN / Malaysian IC / NRIC ─────────────────────────────────────
  pw.hr();
  pw.field('Foreign Identification No. (FIN)', s(profile.foreign_identification_no || profile.sg_nric_fin));
  if (profile.malaysian_id_no) pw.field('Malaysian IC No.', s(profile.malaysian_id_no));
  pw.field('Expiry of EP/DP (if applicable)', fmtDate(profile.sg_pass_expiry));

  // ── 2. Travel Document ────────────────────────────────────────────
  pw.sectionTitle('2. Travel Document / Passport Information');
  pw.fieldRow([['Document Type', profile.passport_type], ['Serial No.', profile.passport_no]]);
  pw.fieldRow([['Issue Date', fmtDate(profile.passport_issue_date)], ['Expiry Date', fmtDate(profile.passport_expiry)]]);
  pw.field('Country / Place of Issue', s(profile.passport_issue_country));

  // ── 3. School / Course / Period ───────────────────────────────────
  pw.sectionTitle('3. School / Institute / Course / Period');
  pw.field('School / Institute', s(profile.school_name || profile.campus || ''));
  pw.field('Course', s(profile.course_name));
  pw.fieldRow([['Period From', fmtDate(profile.period_applied_from)], ['Period To', fmtDate(profile.period_applied_to)]]);

  // ── 4. Parents' Residential Status ───────────────────────────────
  pw.sectionTitle("4. Parents' Residential Status in Singapore");
  const parents = (subs.family || []).filter(m => ['father','mother','step_father','step_mother'].includes(m.member_type));
  const parentRows = parents.map(m => [
    m.member_type||'', `${m.surname||''} ${m.given_name||''}`.trim(), m.nationality||'', m.sg_status||'', m.nric_fin||''
  ]);
  pw.table(['Relation','Name','Nationality','SG Status','NRIC / FIN'], parentRows, [70,120,80,80,90]);

  // ── 5. Residential Address in Singapore ──────────────────────────
  pw.sectionTitle('5. Residential Address in Singapore');
  const sgAddr = profile.sg_address || (profile.country_of_residence === 'Singapore' ? profile.address_line1 : '');
  if (sgAddr) {
    pw.field('Address', s(sgAddr));
    pw.fieldRow([['Postal Code', profile.postal_code], ['Tel No.', profile.sg_tel_no || profile.phone_mobile]]);
  } else {
    pw.field('', 'Applicant does not currently reside in Singapore.');
  }

  // ── 6. Residence History ──────────────────────────────────────────
  pw.sectionTitle('6. Residence History for the Last 5 Years');
  const resRows = (subs.residence || []).map(r => [
    r.country||'', r.city||'', r.address||'', fmtDate(r.date_from), fmtDate(r.date_to)||'present', r.purpose||''
  ]);
  pw.table(['Country','City','Address','From','To','Purpose'], resRows, [65,60,120,55,55,60]);

  // ── 7. Antecedent ─────────────────────────────────────────────────
  pw.sectionTitle('7. Antecedent');
  const antQ = [
    'Have you ever been refused a visa or entry, or been required to leave any country?',
    'Have you ever been deported from or required to leave any country?',
    'Do you have any criminal record in any country?',
    'Are you currently suffering from any infectious or communicable disease?',
  ];
  [profile.antecedent_q1, profile.antecedent_q2, profile.antecedent_q3, profile.antecedent_q4].forEach((v,i) => {
    pw.checkYN(`${i+1}. ${antQ[i]}`, !!v);
  });
  const anyAnt = profile.antecedent_q1 || profile.antecedent_q2 || profile.antecedent_q3 || profile.antecedent_q4;
  if (anyAnt) pw.field('Antecedent Remarks', s(profile.antecedent_remarks), { fullWidth: true });

  // ── 8. Declaration ────────────────────────────────────────────────
  pw.sectionTitle('Part B — Declaration by Applicant');
  pw.declarationText(
    'I declare that the information given in this form is correct and complete to the best of my knowledge and ' +
    'I have not withheld any relevant information. I understand that the submission of false information ' +
    'or documents may lead to disqualification of my application or cancellation of my Student\'s Pass.'
  );
  if (profile.remarks) pw.field('Remarks / Explanation', s(profile.remarks), { fullWidth: true });

  // ── 9. Signature ─────────────────────────────────────────────────
  pw.sectionTitle('9. Signature of Applicant');
  const appSig = sigMap['applicant'];
  const appSigPng = appSig?.file_id ? _loadSigPng(appSig.file_id, uploadDir) : null;
  await pw.embedSignature(appSigPng, 'Signature of Applicant');
  pw.fieldRow([['Full Name', fullNameBlock], ['Date', s(appSig?.sig_date || '')]]);

  return doc.save();
}

// ─────────────────────────── V36 生成器 ───────────────────────────

async function generateV36(profile, subs, sigMap, uploadDir) {
  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const pw   = new PageWriter(doc, { bold, regular: reg });

  pw.docTitle('V36', 'Applicant\'s Personal Particulars Form');

  // ── Part A: Parents and Step-Parents ──────────────────────────────
  pw.sectionTitle("Part A — Applicant's Parents and/or Step Parents");
  const parents = (subs.family||[]).filter(m => ['father','mother','step_father','step_mother'].includes(m.member_type));
  const parentRows = parents.map(m => [
    m.member_type, `${m.surname||''} ${m.given_name||''}`.trim(), m.sex||'',
    fmtDate(m.dob), m.nationality||'', m.sg_status||'', m.occupation||'', m.sg_mobile||''
  ]);
  pw.table(
    ['Relation','Full Name','Sex','DOB','Nationality','SG Status','Occupation','SG Mobile'],
    parentRows,
    [55,90,28,55,60,55,70,55]
  );

  // ── Part B: Spouse ────────────────────────────────────────────────
  pw.sectionTitle("Part B — Applicant's Spouse");
  const spouse = (subs.family||[]).find(m => m.member_type === 'spouse');
  if (spouse) {
    pw.fieldRow([['Full Name', `${spouse.surname||''} ${spouse.given_name||''}`.trim()], ['Sex', spouse.sex]]);
    pw.fieldRow([['Date of Birth', fmtDate(spouse.dob)], ['Nationality', spouse.nationality]]);
    pw.fieldRow([['SG Status', spouse.sg_status], ['Occupation', spouse.occupation]]);
    pw.fieldRow([['NRIC / FIN', spouse.nric_fin], ['SG Mobile', spouse.sg_mobile]]);
  } else {
    pw.field('Marital Status', s(profile.marital_status) || 'Single');
  }

  // ── Part C: Siblings ──────────────────────────────────────────────
  pw.sectionTitle("Part C — Applicant's Natural Siblings");
  const siblings = (subs.family||[]).filter(m => m.member_type === 'sibling');
  const sibRows = siblings.map(m => [
    m.relationship || m.member_type||'sibling', `${m.surname||''} ${m.given_name||''}`.trim(),
    fmtDate(m.dob), m.nationality||'', m.sg_status||''
  ]);
  pw.table(['Relation','Full Name','DOB','Nationality','SG Status'], sibRows, [70,120,65,80,80]);

  // ── Part D: Educational Background ────────────────────────────────
  pw.sectionTitle('Part D — Educational Background');
  const education = subs.education || [];
  if (education.length === 0) {
    pw.field('', 'I do not have any information to declare for this section.');
  } else {
    const eduRows = education.map(e => [
      e.institution_name||'', e.country||'', e.state_province||'',
      e.language_of_instruction||'', `${fmtDate(e.date_from)}–${fmtDate(e.date_to)||'present'}`,
      e.qualification||'', e.educational_cert_no||'', e.obtained_pass_english ? 'Yes' : 'No'
    ]);
    pw.table(
      ['Institution','Country','State','Lang','Period','Qualification','Cert No.','English Pass'],
      eduRows,
      [80,45,40,40,70,65,50,45]
    );
  }

  // ── Part E: Employment History ────────────────────────────────────
  pw.sectionTitle('Part E — Employment History / Other Activities');
  const employment = subs.employment || [];
  if (employment.length === 0) {
    pw.field('', 'I do not have any information to declare for this section.');
  } else {
    const empRows = employment.map(e => [
      e.employer||'', e.country||'', e.position||'', e.nature_of_duties||'',
      `${fmtDate(e.date_from)}–${e.is_current ? 'Present' : fmtDate(e.date_to)}`
    ]);
    pw.table(
      ['Company','Country','Position','Nature of Duties','Period'],
      empRows,
      [100,55,80,100,80]
    );
  }
  if (profile.remarks) pw.field('Remarks / Explanation', s(profile.remarks), { fullWidth: true });

  // ── Part F: Financial Support ─────────────────────────────────────
  pw.sectionTitle('Part F — Financial Support');
  pw.field('Financial Source', s(profile.financial_source));
  pw.fieldRow([['Applicant Monthly Income', fmtAmt(profile.applicant_monthly_income)], ['Applicant Current Saving', fmtAmt(profile.applicant_current_saving)]]);
  if (profile.marital_status === 'Married') {
    pw.fieldRow([['Spouse Monthly Income', fmtAmt(profile.spouse_monthly_income)], ['Spouse Current Saving', fmtAmt(profile.spouse_current_saving)]]);
  }
  pw.fieldRow([['Father Monthly Income', fmtAmt(profile.father_monthly_income)], ['Father Current Saving', fmtAmt(profile.father_current_saving)]]);
  pw.fieldRow([['Mother Monthly Income', fmtAmt(profile.mother_monthly_income)], ['Mother Current Saving', fmtAmt(profile.mother_current_saving)]]);
  if (profile.other_financial_support) {
    pw.checkYN('Other Financial Support', true);
    pw.field('Details', s(profile.other_financial_details));
    pw.field('Amount', fmtAmt(profile.other_financial_amount));
  }

  // ── Part G: SC/PR Parents Additional Info ─────────────────────────
  const parentPrRec = subs.parentPrAdditional || [];
  if (parentPrRec.length > 0) {
    pw.sectionTitle("Part G — SC/PR Parents'/Step Parents' Additional Information");
    parentPrRec.forEach((ppr, i) => {
      const fm = (subs.family||[]).find(m => m.id === ppr.family_member_id);
      pw.field(`Parent ${i+1}`, fm ? `${fm.member_type} — ${fm.surname||''} ${fm.given_name||''}` : '');
      pw.fieldRow([['Marital Status', ppr.marital_status], ['Marriage Cert No.', ppr.marriage_certificate_no]]);
      if (ppr.marriage_date) pw.field('Marriage Date', fmtDate(ppr.marriage_date));
      if (ppr.divorce_certificate_no) {
        pw.fieldRow([['Divorce Cert No.', ppr.divorce_certificate_no], ['Divorce Date', fmtDate(ppr.divorce_date)]]);
      }
      pw.checkYN('Custody of Applicant', !!ppr.custody_of_applicant);
      pw.hr();
      pw.fieldRow([['School Name', ppr.school_name], ['School Country', ppr.school_country]]);
      pw.fieldRow([['Highest Qualification', ppr.highest_qualification], ['Cert No.', ppr.educational_cert_no]]);
      pw.hr();
      pw.field('Company / Employer', s(ppr.company_name));
      pw.fieldRow([['Monthly Income', fmtAmt(ppr.monthly_income)], ['Annual Income', fmtAmt(ppr.annual_income)]]);
      pw.field('Avg Monthly CPF (past 1 year)', fmtAmt(ppr.avg_monthly_cpf));
      pw.hr();
      pw.fieldRow([['Arrival Date in SG', fmtDate(ppr.arrival_date)], ['PR Cert No.', ppr.pr_cert_no || '—']]);
      pw.fieldRow([['SC Cert No.', ppr.sc_cert_no || '—'], ['Last Departure', fmtDate(ppr.last_departure)]]);
      pw.checkYN('Currently residing in Singapore', !!ppr.is_residing_sg);
      if (ppr.address_sg) pw.field('SG Address', s(ppr.address_sg));
      pw.y -= 6;
    });
  }

  // ── Part H: SC/PR Spouse Additional Info ──────────────────────────
  const spouseAdditional = subs.spousePrAdditional;
  if (spouseAdditional) {
    pw.sectionTitle("Part H — SC/PR Spouse's Additional Information");
    pw.fieldRow([['Marriage Cert No.', spouseAdditional.marriage_certificate_no], ['Date of Marriage', fmtDate(spouseAdditional.marriage_date)]]);
    pw.hr();
    pw.fieldRow([['School Name', spouseAdditional.school_name], ['School Country', spouseAdditional.school_country]]);
    pw.fieldRow([['Highest Qualification', spouseAdditional.highest_qualification], ['Cert No.', spouseAdditional.educational_cert_no]]);
    pw.hr();
    pw.field('Company / Employer', s(spouseAdditional.company_name));
    pw.fieldRow([['Monthly Income', fmtAmt(spouseAdditional.monthly_income)], ['Annual Income', fmtAmt(spouseAdditional.annual_income)]]);
    pw.field('Avg Monthly CPF (past 1 year)', fmtAmt(spouseAdditional.avg_monthly_cpf));
    pw.hr();
    pw.fieldRow([['Arrival Date in SG', fmtDate(spouseAdditional.arrival_date)], ['PR Cert No.', spouseAdditional.pr_cert_no || '—']]);
    pw.fieldRow([['SC Cert No.', spouseAdditional.sc_cert_no || '—'], ['Last Departure', fmtDate(spouseAdditional.last_departure)]]);
    pw.checkYN('Currently residing in Singapore', !!spouseAdditional.is_residing_sg);
    if (spouseAdditional.address_sg) pw.field('SG Address', s(spouseAdditional.address_sg));
  }

  // ── Part I: Declaration ───────────────────────────────────────────
  pw.sectionTitle('Part I — Declaration');
  pw.declarationText(
    'I declare that all information given in this form is true, accurate and complete. I am aware that ' +
    'giving false information is an offence. I consent to the relevant authorities verifying my particulars ' +
    'with the relevant organisations as part of the visa processing.'
  );

  // ── Name and Signature ────────────────────────────────────────────
  pw.sectionTitle('Name and Signature of Applicant');
  const appSig = sigMap['applicant'];
  const appSigPng = appSig?.file_id ? _loadSigPng(appSig.file_id, uploadDir) : null;
  await pw.embedSignature(appSigPng, 'Signature of Applicant');
  pw.fieldRow([['Full Name', `${profile.surname||''} ${profile.given_name||''}`.trim()], ['Date', s(appSig?.sig_date || '')]]);

  return doc.save();
}

// ─────────────────────────── 辅助函数 ─────────────────────────────

function _loadSigPng(fileId, uploadDir) {
  try {
    const fp = path.join(uploadDir, fileId);
    if (fs.existsSync(fp)) return fs.readFileSync(fp);
  } catch(e) {}
  return null;
}

// ─────────────────────────── 主入口 ───────────────────────────────

/**
 * generateAllDocuments(profileId, db, uploadDir)
 * → 生成 SAF / Form16 / V36，保存到 UPLOAD_DIR
 * → 更新 adm_generated_documents 表状态
 */
async function generateAllDocuments(profileId, db, uploadDir) {
  const { v4: uuidv4 } = require('uuid');  // 复用项目已有依赖

  const profile = db.get('SELECT * FROM adm_profiles WHERE id=?', [profileId]);
  if (!profile) throw new Error('Profile not found: ' + profileId);

  // 加载所有子数据
  const subs = {
    family:              db.all('SELECT * FROM adm_family_members WHERE profile_id=? ORDER BY sort_order', [profileId]),
    residence:           db.all('SELECT * FROM adm_residence_history WHERE profile_id=? ORDER BY sort_order', [profileId]),
    education:           db.all('SELECT * FROM adm_education_history WHERE profile_id=? ORDER BY sort_order', [profileId]),
    employment:          db.all('SELECT * FROM adm_employment_history WHERE profile_id=? ORDER BY sort_order', [profileId]),
    guardian:            db.get('SELECT * FROM adm_guardian_info WHERE profile_id=?', [profileId]),
    parentPrAdditional:  db.all('SELECT * FROM adm_parent_pr_additional WHERE profile_id=?', [profileId]),
    spousePrAdditional:  db.get('SELECT * FROM adm_spouse_pr_additional WHERE profile_id=?', [profileId]),
  };

  // 加载签字
  const sigRows = db.all('SELECT * FROM adm_signatures WHERE profile_id=?', [profileId]);
  const sigMap  = Object.fromEntries(sigRows.map(r => [r.sig_type, r]));

  const docTypes = [
    { type: 'SAF',    gen: () => generateSAF(profile, subs, sigMap, uploadDir) },
    { type: 'FORM16', gen: () => generateForm16(profile, subs, sigMap, uploadDir) },
    { type: 'V36',    gen: () => generateV36(profile, subs, sigMap, uploadDir) },
  ];

  const results = [];

  for (const { type, gen } of docTypes) {
    // 将旧的 is_latest 置为 0
    db.run(`UPDATE adm_generated_documents SET is_latest=0 WHERE profile_id=? AND doc_type=?`, [profileId, type]);

    // 获取版本号
    const lastVer = db.get(
      `SELECT MAX(version_no) as v FROM adm_generated_documents WHERE profile_id=? AND doc_type=?`,
      [profileId, type]
    );
    const versionNo = ((lastVer?.v) || 0) + 1;

    const docId = uuidv4();
    db.run(`INSERT INTO adm_generated_documents (id, profile_id, intake_case_id, doc_type, version_no, status, is_latest)
            VALUES (?, ?, ?, ?, ?, 'generating', 1)`,
      [docId, profileId, profile.intake_case_id || null, type, versionNo]);

    try {
      const pdfBytes = await gen();
      const fileName = `${uuidv4()}.pdf`;
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, pdfBytes);

      db.run(`UPDATE adm_generated_documents SET status='done', file_id=?, file_size=?, generated_at=datetime('now'), error_message=NULL
              WHERE id=?`,
        [fileName, pdfBytes.length, docId]);

      results.push({ type, docId, fileName, status: 'done' });
    } catch(err) {
      db.run(`UPDATE adm_generated_documents SET status='failed', error_message=? WHERE id=?`,
        [err.message, docId]);
      results.push({ type, docId, status: 'failed', error: err.message });
    }
  }

  return results;
}

module.exports = { generateAllDocuments };
