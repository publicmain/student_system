/**
 * adm-field-mapping.js
 * ────────────────────────────────────────────────────────────────────────
 * Master Schema、字段映射、校验函数
 * 覆盖三份表：Student Application Form (SAF)、Form 16、V36
 * ────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════
// PART A — MASTER SCHEMA DEFINITION
// ═══════════════════════════════════════════════════════════════════════

/**
 * 每个字段定义:
 *   key:           master field key (DB column / JSON key)
 *   label:         英文标签
 *   type:          string | date | boolean | integer | number | enum | file
 *   required:      true/false (基础必填)
 *   source:        哪些表需要 (SAF/F16/V36)
 *   enumValues:    enum 可选值
 *   conditional:   条件规则描述
 *   transform:     导出到 PDF 时的转换规则
 *   validation:    校验规则
 *   repeatable:    是否数组
 *   dbTable:       存储的数据库表
 *   dbColumn:      数据库列名 (若与 key 不同)
 */
const MASTER_FIELDS = [
  // ═══════════════ 1. APPLICATION / COURSE ═══════════════════════════
  { key: 'course_name',            label: 'Course Title / Name',                       type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles', dbColumn: 'course_name' },
  { key: 'course_code',            label: 'Course Code',                               type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles', dbColumn: 'course_code' },
  { key: 'intake_year',            label: 'Intake Year',                               type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'intake_month',           label: 'Intake Month / Commencement',               type: 'enum',    required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles',
    enumValues: ['January','February','March','April','May','June','July','August','September','October','November','December'] },
  { key: 'study_mode',             label: 'Study Mode (Full-time / Part-time)',         type: 'enum',    required: false, source: ['SAF'],            dbTable: 'adm_profiles',
    enumValues: ['Full-time','Part-time'] },
  { key: 'campus',                 label: 'Campus',                                    type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  // ── MISSING: period_applied_from / period_applied_to (F16 需要课程起止日期)
  { key: 'period_applied_from',    label: 'Course Period From',                        type: 'date',    required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'period_applied_to',      label: 'Course Period To',                          type: 'date',    required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: school/institute applied for (F16 要求学校名，不仅是课程名)
  { key: 'school_name',            label: 'School / Institute Applied For',            type: 'string',  required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: id_photo (SAF 需要贴照片)
  { key: 'id_photo',               label: 'Passport-size Photo',                       type: 'file',    required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },

  // ═══════════════ 2. APPLICANT IDENTITY ═════════════════════════════
  { key: 'surname',                label: 'Family Name / Surname',                     type: 'string',  required: true,  source: ['SAF','F16','V36'], dbTable: 'adm_profiles' },
  { key: 'given_name',             label: 'Given Name / First Name',                   type: 'string',  required: true,  source: ['SAF','F16','V36'], dbTable: 'adm_profiles' },
  { key: 'chinese_name',           label: 'Chinese Character Name',                    type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles',
    transform: 'WinAnsi 不支持中文，PDF 中以 ? 替代；建议后续嵌入中文字体' },
  // ── MISSING: alias (Form 16 有 alias 字段)
  { key: 'alias',                  label: 'Alias (if any)',                             type: 'string',  required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'gender',                 label: 'Gender / Sex',                              type: 'enum',    required: true,  source: ['SAF','F16','V36'], dbTable: 'adm_profiles',
    enumValues: ['Male','Female','Other'],
    transform: 'F16 用 Sex，SAF 用 Gender — 同义复用' },
  { key: 'dob',                    label: 'Date of Birth',                             type: 'date',    required: true,  source: ['SAF','F16','V36'], dbTable: 'adm_profiles',
    transform: 'DB 存 YYYY-MM-DD，PDF 输出 DD/MM/YYYY' },
  { key: 'birth_country',          label: 'Country / Place of Birth',                  type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'birth_city',             label: 'City / Province of Birth',                  type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles',
    transform: 'F16 字段名是 Province/State, SAF 是 City of Birth — 合并存储' },
  // ── MISSING: birth_certificate_no (SAF + F16 都有)
  { key: 'birth_certificate_no',   label: 'Birth Certificate No.',                     type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'nationality',            label: 'Nationality / Citizenship',                 type: 'string',  required: true,  source: ['SAF','F16','V36'], dbTable: 'adm_profiles' },
  { key: 'race',                   label: 'Race',                                      type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'religion',               label: 'Religion',                                  type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  // ── MISSING: occupation of applicant (F16 有此字段)
  { key: 'occupation',             label: 'Occupation of Applicant',                   type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'marital_status',         label: 'Marital Status',                            type: 'enum',    required: true,  source: ['SAF','F16','V36'], dbTable: 'adm_profiles',
    enumValues: ['Single','Married','Divorced','Widowed'] },
  { key: 'email',                  label: 'Email Address',                             type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles',
    validation: 'email format' },
  { key: 'phone_mobile',           label: 'Mobile / Contact Number',                   type: 'string',  required: true,  source: ['SAF','F16','V36'], dbTable: 'adm_profiles' },
  { key: 'phone_home',             label: 'Home Telephone',                            type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },

  // ═══════════════ 3. TRAVEL DOCUMENT / PASS ═════════════════════════
  { key: 'passport_type',          label: 'Travel Document Type',                      type: 'enum',    required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles',
    enumValues: ['Passport','Travel Document','IC'] },
  { key: 'passport_no',            label: 'Passport / Serial No. of Travel Document',  type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'passport_issue_date',    label: 'Issue Date of Travel Document',             type: 'date',    required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'passport_expiry',        label: 'Expiry Date of Travel Document',            type: 'date',    required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'passport_issue_country', label: 'Country / Place of Issue',                  type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  // ── MISSING: foreign_identification_no_fin (F16 有 FIN 字段，独立于 NRIC)
  { key: 'foreign_identification_no', label: 'Foreign Identification No. (FIN)',       type: 'string',  required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true,
    transform: '当前 sg_nric_fin 混用了 NRIC 和 FIN，F16 明确只要 FIN' },
  // ── MISSING: malaysian_id_no (F16 有此字段)
  { key: 'malaysian_id_no',        label: 'Malaysian IC No. (if applicable)',          type: 'string',  required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true,
    conditional: '仅马来西亚国籍适用' },

  // ═══════════════ 4. SINGAPORE STATUS ═══════════════════════════════
  { key: 'sg_pass_type',           label: 'Pass Type / Residential Status in Singapore', type: 'enum',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles',
    enumValues: ['SC','PR','EP','S Pass','DP','Student Pass','LTVP','None'] },
  { key: 'sg_nric_fin',            label: 'NRIC / FIN No.',                            type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'sg_pass_expiry',         label: 'Pass Expiry Date',                          type: 'date',    required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles',
    conditional: 'F16 问的是 EP/DP expiry，SAF 问的是 pass expiry — 同字段' },
  // ── MISSING: was_ever_sg_citizen_or_pr (SAF 问：是否曾经是 SC/PR)
  { key: 'was_ever_sg_citizen_or_pr', label: 'Was Applicant ever a SG Citizen or PR?', type: 'boolean', required: false, source: ['SAF'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: requires_student_pass (是否需要申请 Student Pass)
  { key: 'requires_student_pass',  label: 'Requires Student Pass Application?',        type: 'boolean', required: false, source: ['F16','V36'],      dbTable: 'adm_profiles', dbColumn: null, _MISSING: true,
    conditional: '若 No → F16/V36 可能不需要生成' },
  { key: 'prior_sg_study',         label: 'Previously Studied in Singapore?',          type: 'boolean', required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'prior_sg_school',        label: 'Previous School in Singapore',              type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles',
    conditional: 'prior_sg_study === true' },
  { key: 'prior_sg_year',          label: 'Year of Previous Study',                    type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles',
    conditional: 'prior_sg_study === true' },

  // ═══════════════ 5. ADDRESS ════════════════════════════════════════
  { key: 'address_line1',          label: 'Residential Address Line 1',                type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'address_line2',          label: 'Residential Address Line 2',                type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'city',                   label: 'City',                                      type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'state_province',         label: 'State / Province',                          type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'postal_code',            label: 'Postal Code',                               type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'country_of_residence',   label: 'Country of Residence',                      type: 'string',  required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  // ── MISSING: sg_address 独立字段 (F16 有 "Residential Address in Singapore" 单独一节)
  { key: 'sg_address',             label: 'Singapore Residential Address (if different)', type: 'string', required: false, source: ['F16'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true,
    conditional: 'country_of_residence !== "Singapore" 时可能需要填写新加坡住址' },
  // ── MISSING: sg_tel_no (F16 有新加坡电话号)
  { key: 'sg_tel_no',              label: 'Tel No. in Singapore',                      type: 'string',  required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: hometown_address (SAF 有家乡地址，不同于新加坡地址)
  { key: 'hometown_address',       label: 'Hometown Address (if different from current)', type: 'string', required: false, source: ['SAF'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },

  // ═══════════════ 6. LANGUAGE ═══════════════════════════════════════
  { key: 'native_language',        label: 'Native Language',                           type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'english_proficiency',    label: 'English Proficiency Level / Test Type',     type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'ielts_score',            label: 'IELTS Score',                               type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'toefl_score',            label: 'TOEFL Score',                               type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'other_lang_test',        label: 'Other Language Test Name',                  type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'other_lang_score',       label: 'Other Language Test Score',                 type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  // ── MISSING: language_proof_attachment (语言成绩证明附件)
  { key: 'language_proof_file',    label: 'Language Proficiency Proof (attachment)',    type: 'file',    required: false, source: ['SAF'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: highest_language_proficiency / obtained_pass_in_english (V36 Part D)
  { key: 'highest_lang_proficiency', label: 'Highest Language Proficiency',            type: 'string',  required: false, source: ['V36'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: need_english_placement_test
  { key: 'need_english_placement_test', label: 'Need English Placement Test?',        type: 'boolean', required: false, source: ['SAF'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },

  // ═══════════════ 7. FINANCIAL SUPPORT ══════════════════════════════
  { key: 'financial_source',       label: 'Financial Source / Sponsor Type',           type: 'enum',    required: true,  source: ['SAF','V36'],      dbTable: 'adm_profiles',
    enumValues: ['Self','Parents','Sponsor','Scholarship','Loan'] },
  { key: 'annual_income',          label: 'Annual Income / Disposable Funds',          type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles',
    validation: '应存为 number，当前存为 string — 需修复',
    transform: 'V36 要求的是 average monthly income + current saving，与 SAF 的 annual_income 语义不同' },
  { key: 'sponsor_name',           label: 'Sponsor / Supporter Name',                  type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'sponsor_relation',       label: 'Sponsor Relationship',                      type: 'string',  required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'bank_statement_available', label: 'Bank Statement Available?',               type: 'boolean', required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  // ── MISSING: 细化的 V36 财务字段
  { key: 'applicant_monthly_income',  label: 'Applicant Avg Monthly Income (past 6m)', type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'applicant_current_saving',  label: 'Applicant Current Saving',               type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'spouse_monthly_income',     label: 'Spouse Avg Monthly Income',              type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true,
    conditional: 'marital_status === "Married"' },
  { key: 'spouse_current_saving',     label: 'Spouse Current Saving',                  type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true,
    conditional: 'marital_status === "Married"' },
  { key: 'father_monthly_income',     label: 'Father Avg Monthly Income',              type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'father_current_saving',     label: 'Father Current Saving',                  type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'mother_monthly_income',     label: 'Mother Avg Monthly Income',              type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'mother_current_saving',     label: 'Mother Current Saving',                  type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'other_financial_support',    label: 'Other Financial Support Exists?',       type: 'boolean', required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'other_financial_details',    label: 'Other Financial Support Details',       type: 'string',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'other_financial_amount',     label: 'Other Financial Support Amount',        type: 'number',  required: false, source: ['V36'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: bank_statement_attachment
  { key: 'bank_statement_file',    label: 'Bank Statement (attachment)',                type: 'file',    required: false, source: ['SAF'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },

  // ═══════════════ 8. ANTECEDENT ═════════════════════════════════════
  { key: 'antecedent_q1',          label: 'Refused entry / required to leave?',        type: 'boolean', required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'antecedent_q2',          label: 'Deported from any country?',                type: 'boolean', required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'antecedent_q3',          label: 'Criminal record in any country?',           type: 'boolean', required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'antecedent_q4',          label: 'Infectious / communicable disease?',        type: 'boolean', required: true,  source: ['SAF','F16'],      dbTable: 'adm_profiles' },
  { key: 'antecedent_remarks',     label: 'Antecedent Explanation / Remarks',          type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles',
    conditional: '任一 antecedent 为 YES 时必填' },
  // ── MISSING: antecedent_explanation_attachment
  { key: 'antecedent_explanation_file', label: 'Antecedent Explanation (attachment)',   type: 'file',    required: false, source: ['F16'],           dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },

  // ═══════════════ 9. PDPA / CONSENT ═════════════════════════════════
  { key: 'pdpa_consent',           label: 'PDPA Data Protection Consent',              type: 'boolean', required: true,  source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'pdpa_marketing',         label: 'Marketing Consent',                         type: 'boolean', required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  { key: 'pdpa_photo_video',       label: 'Photo/Video Publicity Consent',             type: 'boolean', required: false, source: ['SAF'],            dbTable: 'adm_profiles' },
  // ── MISSING: F16/V36 各自有 declaration_agreed
  { key: 'f16_declaration_agreed', label: 'Form 16 Declaration Agreed',                type: 'boolean', required: false, source: ['F16'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  { key: 'v36_declaration_agreed', label: 'V36 Declaration Agreed',                    type: 'boolean', required: false, source: ['V36'],            dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
  // ── MISSING: remarks (SAF/F16 通用备注)
  { key: 'remarks',                label: 'General Remarks',                           type: 'string',  required: false, source: ['SAF','F16'],      dbTable: 'adm_profiles', dbColumn: null, _MISSING: true },
];

// ═══════════════════════════════════════════════════════════════════════
// REPEATABLE SECTION SCHEMAS (数组型字段定义)
// ═══════════════════════════════════════════════════════════════════════

const FAMILY_MEMBER_FIELDS = [
  { key: 'member_type',   label: 'Relationship Type',          type: 'enum',    required: true,  enumValues: ['father','mother','step_father','step_mother','sibling','spouse'],
    transform: 'V36 Part A = parents/step-parents, Part B = spouse, Part C = siblings' },
  { key: 'surname',       label: 'Family Name / Surname',      type: 'string',  required: true  },
  { key: 'given_name',    label: 'Given Name',                 type: 'string',  required: true  },
  { key: 'dob',           label: 'Date of Birth',              type: 'date',    required: false },
  { key: 'nationality',   label: 'Nationality / Citizenship',  type: 'string',  required: false },
  { key: 'sg_status',     label: 'Residential Status in SG',   type: 'string',  required: false },
  { key: 'nric_fin',      label: 'NRIC / FIN No.',             type: 'string',  required: false },
  { key: 'occupation',    label: 'Occupation',                 type: 'string',  required: false },
  { key: 'employer',      label: 'Employer',                   type: 'string',  required: false },
  { key: 'relationship',  label: 'Relationship Description',   type: 'string',  required: false,
    transform: 'SAF 用 relationship，V36 用 member_type — 冗余但保留以兼容' },
  { key: 'is_alive',      label: 'Is Alive?',                  type: 'boolean', required: false },
  // ── MISSING fields that V36 requires ──
  { key: 'sex',           label: 'Sex (for V36 Part A)',        type: 'enum',    required: false, enumValues: ['Male','Female'], _MISSING: true,
    transform: 'V36 Part A 要求父母的 sex，当前 family_members 无此字段' },
  { key: 'sg_mobile',     label: 'SG Mobile No. (V36)',        type: 'string',  required: false, _MISSING: true,
    transform: 'V36 Part A/B 要求 SG mobile number' },
  { key: 'email',         label: 'Email (SAF)',                type: 'string',  required: false, _MISSING: true,
    transform: 'SAF Family 表有 email 列' },
  { key: 'contact_number', label: 'Contact Number',           type: 'string',  required: false, _MISSING: true },
  { key: 'passport_no',   label: 'Passport / NRIC (SAF)',     type: 'string',  required: false, _MISSING: true,
    transform: 'SAF Family 要求护照号，当前只有 nric_fin' },
];

const RESIDENCE_HISTORY_FIELDS = [
  { key: 'country',    label: 'Country / Place',   type: 'string',  required: true  },
  { key: 'city',       label: 'City',              type: 'string',  required: false },
  { key: 'address',    label: 'Address',           type: 'string',  required: false },
  { key: 'date_from',  label: 'From',              type: 'date',    required: true  },
  { key: 'date_to',    label: 'To',                type: 'date',    required: false, transform: 'null/empty = present' },
  { key: 'purpose',    label: 'Purpose',           type: 'string',  required: false },
];

const EDUCATION_HISTORY_FIELDS = [
  { key: 'institution_name', label: 'School / Institution Name', type: 'string',  required: true  },
  { key: 'country',          label: 'Country / Place',           type: 'string',  required: false },
  { key: 'qualification',    label: 'Qualification Obtained',    type: 'string',  required: false },
  { key: 'major',            label: 'Major / Field',             type: 'string',  required: false },
  { key: 'date_from',        label: 'Period From',               type: 'date',    required: false },
  { key: 'date_to',          label: 'Period To',                 type: 'date',    required: false },
  { key: 'gpa',              label: 'GPA / Grade',               type: 'string',  required: false },
  { key: 'award_received',   label: 'Award Received',            type: 'string',  required: false },
  // ── MISSING: V36 Part D extras ──
  { key: 'state_province',       label: 'State / Province',                 type: 'string',  required: false, _MISSING: true },
  { key: 'language_of_instruction', label: 'Language of Instruction',       type: 'string',  required: false, _MISSING: true },
  { key: 'educational_cert_no',    label: 'Educational Certificate No.',    type: 'string',  required: false, _MISSING: true },
  { key: 'obtained_pass_english',  label: 'Obtained Pass in English?',     type: 'boolean', required: false, _MISSING: true },
];

const EMPLOYMENT_HISTORY_FIELDS = [
  { key: 'employer',     label: 'Company / Employer Name',  type: 'string',  required: true  },
  { key: 'country',      label: 'Country / Place',          type: 'string',  required: false },
  { key: 'position',     label: 'Position Held',            type: 'string',  required: false },
  { key: 'date_from',    label: 'Period From',              type: 'date',    required: false },
  { key: 'date_to',      label: 'Period To',                type: 'date',    required: false },
  { key: 'is_current',   label: 'Currently Employed?',      type: 'boolean', required: false },
  { key: 'reason_left',  label: 'Reason for Leaving',       type: 'string',  required: false },
  // ── MISSING: V36 Part E extras ──
  { key: 'nature_of_duties', label: 'Nature of Duties',    type: 'string',  required: false, _MISSING: true },
];

const GUARDIAN_FIELDS = [
  { key: 'surname',      label: 'Guardian Surname',       type: 'string',  required: true  },
  { key: 'given_name',   label: 'Guardian Given Name',    type: 'string',  required: true  },
  { key: 'relation',     label: 'Relationship',           type: 'string',  required: true  },
  { key: 'dob',          label: 'Date of Birth',          type: 'date',    required: false },
  { key: 'nationality',  label: 'Nationality',            type: 'string',  required: false },
  { key: 'sg_status',    label: 'SG Residential Status',  type: 'string',  required: false },
  { key: 'nric_fin',     label: 'NRIC / FIN',             type: 'string',  required: false },
  { key: 'phone',        label: 'Phone',                  type: 'string',  required: true  },
  { key: 'email',        label: 'Email',                  type: 'string',  required: false },
  { key: 'address',      label: 'Address',                type: 'string',  required: false },
  { key: 'occupation',   label: 'Occupation',             type: 'string',  required: false },
  { key: 'employer',     label: 'Employer',               type: 'string',  required: false },
  // ── MISSING: SAF guardian section extras ──
  { key: 'marital_status',          label: 'Guardian Marital Status',      type: 'string',  required: false, _MISSING: true },
  { key: 'marriage_certificate_no', label: 'Marriage Certificate No.',     type: 'string',  required: false, _MISSING: true },
  { key: 'marriage_date',           label: 'Date of Marriage',             type: 'date',    required: false, _MISSING: true },
  { key: 'divorce_certificate_no',  label: 'Divorce Certificate No.',     type: 'string',  required: false, _MISSING: true },
  { key: 'divorce_date',            label: 'Date of Divorce',             type: 'date',    required: false, _MISSING: true },
  { key: 'custody_of_applicant',    label: 'Has Custody of Applicant?',   type: 'boolean', required: false, _MISSING: true },
  { key: 'passport_no',             label: 'Guardian Passport / NRIC',    type: 'string',  required: false, _MISSING: true },
];

const PARENT_PR_ADDITIONAL_FIELDS = [
  { key: 'family_member_id', label: 'Linked Family Member',     type: 'string',  required: true  },
  { key: 'arrival_date',     label: 'Date First Arrived in SG', type: 'date',    required: false },
  { key: 'pr_cert_no',       label: 'PR Certificate No.',       type: 'string',  required: false },
  { key: 'sc_cert_no',       label: 'SC Certificate No.',       type: 'string',  required: false },
  { key: 'last_departure',   label: 'Last Departure from SG',   type: 'date',    required: false },
  { key: 'is_residing_sg',   label: 'Currently Residing in SG', type: 'boolean', required: false },
  { key: 'address_sg',       label: 'SG Address',               type: 'string',  required: false },
  // ── MISSING: V36 Part G extras ──
  { key: 'marital_status',          label: 'Parent Marital Status',              type: 'string',  required: false, _MISSING: true },
  { key: 'marriage_certificate_no', label: 'Marriage Certificate No.',           type: 'string',  required: false, _MISSING: true },
  { key: 'marriage_date',           label: 'Date of Marriage',                   type: 'date',    required: false, _MISSING: true },
  { key: 'divorce_certificate_no',  label: 'Divorce Certificate No.',           type: 'string',  required: false, _MISSING: true },
  { key: 'divorce_date',            label: 'Date of Divorce',                   type: 'date',    required: false, _MISSING: true },
  { key: 'custody_of_applicant',    label: 'Has Custody of Applicant?',         type: 'boolean', required: false, _MISSING: true },
  { key: 'school_name',             label: 'Parent School Name',                type: 'string',  required: false, _MISSING: true },
  { key: 'school_country',          label: 'Parent School Country',             type: 'string',  required: false, _MISSING: true },
  { key: 'highest_qualification',   label: 'Highest Educational Qualification', type: 'string',  required: false, _MISSING: true },
  { key: 'educational_cert_no',     label: 'Educational Certificate No.',       type: 'string',  required: false, _MISSING: true },
  { key: 'company_name',            label: 'Employer / Company Name',           type: 'string',  required: false, _MISSING: true },
  { key: 'monthly_income',          label: 'Monthly Income',                    type: 'number',  required: false, _MISSING: true },
  { key: 'annual_income',           label: 'Annual Income (past 1 year)',       type: 'number',  required: false, _MISSING: true },
  { key: 'avg_monthly_cpf',         label: 'Avg Monthly CPF (past 1 year)',     type: 'number',  required: false, _MISSING: true },
];

const SPOUSE_PR_ADDITIONAL_FIELDS = [
  { key: 'family_member_id', label: 'Linked Family Member',     type: 'string',  required: false },
  { key: 'arrival_date',     label: 'Date First Arrived in SG', type: 'date',    required: false },
  { key: 'pr_cert_no',       label: 'PR Certificate No.',       type: 'string',  required: false },
  { key: 'sc_cert_no',       label: 'SC Certificate No.',       type: 'string',  required: false },
  { key: 'last_departure',   label: 'Last Departure from SG',   type: 'date',    required: false },
  { key: 'is_residing_sg',   label: 'Currently Residing in SG', type: 'boolean', required: false },
  { key: 'address_sg',       label: 'SG Address',               type: 'string',  required: false },
  // ── MISSING: V36 Part H extras ──
  { key: 'marriage_certificate_no', label: 'Marriage Certificate No.',                 type: 'string',  required: false, _MISSING: true },
  { key: 'marriage_date',           label: 'Date of Marriage',                         type: 'date',    required: false, _MISSING: true },
  { key: 'school_name',             label: 'Spouse School Name',                       type: 'string',  required: false, _MISSING: true },
  { key: 'school_country',          label: 'Spouse School Country / Place',            type: 'string',  required: false, _MISSING: true },
  { key: 'highest_qualification',   label: 'Spouse Highest Qualification',             type: 'string',  required: false, _MISSING: true },
  { key: 'educational_cert_no',     label: 'Spouse Educational Certificate No.',       type: 'string',  required: false, _MISSING: true },
  { key: 'company_name',            label: 'Spouse Employer / Company Name',           type: 'string',  required: false, _MISSING: true },
  { key: 'monthly_income',          label: 'Spouse Monthly Income',                    type: 'number',  required: false, _MISSING: true },
  { key: 'annual_income',           label: 'Spouse Annual Income (past 1 year)',       type: 'number',  required: false, _MISSING: true },
  { key: 'avg_monthly_cpf',         label: 'Spouse Avg Monthly CPF (past 1 year)',     type: 'number',  required: false, _MISSING: true },
];

const SIGNATURE_FIELDS = [
  { key: 'sig_type',    label: 'Signature Type',     type: 'enum',   required: true, enumValues: ['applicant','guardian'] },
  { key: 'signer_name', label: 'Signer Full Name',   type: 'string', required: true  },
  { key: 'file_id',     label: 'Signature Image',    type: 'file',   required: false },
  { key: 'stroke_json', label: 'Signature Strokes',  type: 'string', required: false },
  { key: 'sig_date',    label: 'Date of Signature',  type: 'date',   required: true  },
];


// ═══════════════════════════════════════════════════════════════════════
// PART B — FORM → FIELD MAPPING (每份表需要哪些 master 字段)
// ═══════════════════════════════════════════════════════════════════════

const SAF_REQUIRED_FIELDS = [
  'course_name','intake_year','intake_month','study_mode','campus','id_photo',
  'surname','given_name','chinese_name','gender','dob','birth_country','birth_city',
  'nationality','race','religion','marital_status','email','phone_mobile','phone_home',
  'passport_type','passport_no','passport_issue_date','passport_expiry','passport_issue_country',
  'sg_pass_type','sg_nric_fin','sg_pass_expiry','prior_sg_study','prior_sg_school','prior_sg_year',
  'address_line1','address_line2','city','state_province','postal_code','country_of_residence',
  'native_language','english_proficiency','ielts_score','toefl_score','other_lang_test','other_lang_score',
  'financial_source','annual_income','sponsor_name','sponsor_relation','bank_statement_available',
  'antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4','antecedent_remarks',
  'pdpa_consent','pdpa_marketing','pdpa_photo_video',
  // arrays
  '_family_members','_residence_history','_education_history',
  // conditional
  '_guardian_info','_parent_pr_additional',
  // signatures
  '_sig_applicant','_sig_guardian',
];

const F16_REQUIRED_FIELDS = [
  'surname','given_name','alias','gender','dob','birth_country','birth_city','birth_certificate_no',
  'nationality','race','religion','occupation','marital_status','email',
  'passport_type','passport_no','passport_issue_date','passport_expiry','passport_issue_country',
  'foreign_identification_no','malaysian_id_no',
  'sg_pass_type','sg_nric_fin','sg_pass_expiry',
  'school_name','course_name','period_applied_from','period_applied_to',
  'address_line1','city','postal_code','country_of_residence','sg_address','sg_tel_no',
  'antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4','antecedent_remarks',
  'id_photo',
  // arrays
  '_family_members','_residence_history',
  // signatures
  '_sig_applicant',
];

const V36_REQUIRED_FIELDS = [
  'surname','given_name','dob','nationality','marital_status','phone_mobile',
  'financial_source','applicant_monthly_income','applicant_current_saving',
  'spouse_monthly_income','spouse_current_saving',
  'father_monthly_income','father_current_saving',
  'mother_monthly_income','mother_current_saving',
  // arrays
  '_family_members','_education_history','_employment_history',
  // conditional
  '_parent_pr_additional','_spouse_pr_additional',
  // signatures
  '_sig_applicant',
];


// ═══════════════════════════════════════════════════════════════════════
// PART C — GAP REPORT (MISSING / CONFLICTS)
// ═══════════════════════════════════════════════════════════════════════

function generateGapReport() {
  const report = { missing: [], conflicts: [], warnings: [] };

  // 1. Check main table missing fields
  MASTER_FIELDS.filter(f => f._MISSING).forEach(f => {
    report.missing.push({
      key: f.key, label: f.label, type: f.type, source: f.source,
      severity: f.required ? 'HIGH' : 'MEDIUM',
      detail: `字段 "${f.key}" 在 ${f.source.join('+')} 中需要，但当前 DB schema 缺少此列`,
    });
  });

  // 2. Check array sub-field missing
  const arraySections = [
    { name: 'adm_family_members',       fields: FAMILY_MEMBER_FIELDS },
    { name: 'adm_education_history',    fields: EDUCATION_HISTORY_FIELDS },
    { name: 'adm_employment_history',   fields: EMPLOYMENT_HISTORY_FIELDS },
    { name: 'adm_guardian_info',        fields: GUARDIAN_FIELDS },
    { name: 'adm_parent_pr_additional', fields: PARENT_PR_ADDITIONAL_FIELDS },
    { name: 'adm_spouse_pr_additional', fields: SPOUSE_PR_ADDITIONAL_FIELDS },
  ];

  arraySections.forEach(sec => {
    sec.fields.filter(f => f._MISSING).forEach(f => {
      report.missing.push({
        key: `${sec.name}.${f.key}`, label: f.label, type: f.type,
        severity: f.required ? 'HIGH' : 'LOW',
        detail: `表 "${sec.name}" 缺少列 "${f.key}" (${f.label})`,
      });
    });
  });

  // 3. Conflict: annual_income stored as string
  report.conflicts.push({
    key: 'annual_income',
    detail: 'SAF 存的是 annual_income (string)，V36 需要的是 applicant_monthly_income + applicant_current_saving (number)。语义不同，不能直接复用。',
    fix: '增加 V36 专用的 8 个 financial 数字字段，annual_income 保留给 SAF 使用',
  });

  // 4. Conflict: sg_nric_fin 混用
  report.conflicts.push({
    key: 'sg_nric_fin',
    detail: 'F16 有独立的 FIN 字段和 Malaysian IC 字段，当前 sg_nric_fin 混合了 NRIC/FIN/Malaysian IC。',
    fix: '增加 foreign_identification_no 和 malaysian_id_no，sg_nric_fin 保留作为 NRIC/FIN 通用字段',
  });

  // 5. Conflict: address 混用
  report.conflicts.push({
    key: 'address_line1',
    detail: 'F16 区分了 "hometown address" 和 "SG residential address"，当前只有一组 address 字段',
    fix: '增加 sg_address 和 hometown_address 字段',
  });

  // 6. Warning: chinese_name WinAnsi
  report.warnings.push({
    key: 'chinese_name',
    detail: 'pdf-lib StandardFonts 不支持中文，chinese_name 在 PDF 中会显示为 "???"。需要嵌入中文字体才能正确渲染。',
  });

  // 7. Warning: employment no_information_declared
  report.warnings.push({
    key: 'employment_history',
    detail: 'V36 Part E 在无工作经历时需要勾选 "I do not have any information to declare"。当前 PDF 生成器未处理此场景。',
  });

  // 8. Warning: education language_of_instruction
  report.warnings.push({
    key: 'education_history.language_of_instruction',
    detail: 'V36 Part D 要求每条教育记录的 "Language of Instruction" 和 "Obtained Pass in English"，当前 DB 和 PDF 均未包含。',
  });

  return report;
}


// ═══════════════════════════════════════════════════════════════════════
// PART D — validateApplicationMapping(masterData)
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ValidationResult
 * @property {string[]} errors       - 阻塞提交的错误
 * @property {string[]} warnings     - 不阻塞但应修正的警告
 * @property {Object} normalizedData - 格式化后的数据
 * @property {Object} formReadiness  - 三份表的就绪状态
 */

// ── helpers ──

/** 计算年龄 */
function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob)) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** 日期标准化: 任意输入 → YYYY-MM-DD (存储) 或 DD/MM/YYYY (显示) */
function normalizeDate(val, outputFormat = 'iso') {
  if (!val) return null;
  const s = String(val).trim();

  // Try YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    if (outputFormat === 'display') return `${d.padStart(2,'0')}/${mo.padStart(2,'0')}/${y}`;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // Try DD/MM/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    if (outputFormat === 'display') return `${d.padStart(2,'0')}/${mo.padStart(2,'0')}/${y}`;
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }

  // Try Date parse fallback
  const parsed = new Date(s);
  if (!isNaN(parsed)) {
    const y = parsed.getFullYear();
    const mo = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    if (outputFormat === 'display') return `${d}/${mo}/${y}`;
    return `${y}-${mo}-${d}`;
  }

  return null; // 无法解析
}

/** 金额标准化: 去掉货币符号、逗号，转为 number */
function normalizeAmount(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** 布尔标准化 */
function normalizeBool(val) {
  if (val === true || val === 1 || val === '1' || val === 'true' || val === 'yes' || val === 'Yes' || val === 'YES') return true;
  if (val === false || val === 0 || val === '0' || val === 'false' || val === 'no' || val === 'No' || val === 'NO') return false;
  return !!val;
}

/** email 校验 */
function isValidEmail(v) {
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** 枚举校验 */
function isValidEnum(val, allowed) {
  if (!val) return true; // empty is OK for non-required
  return allowed.includes(val);
}


/**
 * validateApplicationMapping(masterData)
 *
 * masterData 结构:
 * {
 *   profile: { ...adm_profiles row },
 *   family: [ ...adm_family_members rows ],
 *   residence: [ ...adm_residence_history rows ],
 *   education: [ ...adm_education_history rows ],
 *   employment: [ ...adm_employment_history rows ],
 *   guardian: { ...adm_guardian_info row } | null,
 *   parentPrAdditional: [ ...rows ],
 *   spousePrAdditional: { ...row } | null,
 *   signatures: [ ...adm_signatures rows ],
 * }
 */
function validateApplicationMapping(masterData) {
  const errors = [];
  const warnings = [];
  const normalized = JSON.parse(JSON.stringify(masterData)); // deep clone
  const p = normalized.profile || {};

  // ── 1. REQUIRED FIELD PRESENCE ─────────────────────────────────────
  const requiredProfile = [
    ['surname',       '英文姓 (Surname)'],
    ['given_name',    '英文名 (Given Name)'],
    ['dob',           '出生日期'],
    ['nationality',   '国籍'],
    ['gender',        '性别'],
    ['marital_status','婚姻状况'],
    ['course_name',   '课程名称'],
    ['intake_year',   '入学年'],
    ['passport_no',   '护照号码'],
    ['passport_expiry','护照到期日'],
    ['email',         '电子邮箱'],
    ['phone_mobile',  '手机号码'],
    ['address_line1', '地址'],
    ['city',          '城市'],
    ['country_of_residence','居住国家'],
    ['sg_pass_type',  '新加坡 Pass 类型'],
    ['financial_source','财务来源'],
  ];

  requiredProfile.forEach(([key, label]) => {
    if (!p[key] && p[key] !== 0 && p[key] !== false) {
      errors.push(`[必填缺失] ${label} (${key})`);
    }
  });

  // ── 2. DATE VALIDATION & NORMALIZATION ─────────────────────────────
  const dateFields = [
    'dob','passport_issue_date','passport_expiry','sg_pass_expiry',
    'period_applied_from','period_applied_to',
  ];
  dateFields.forEach(key => {
    if (p[key]) {
      const nd = normalizeDate(p[key]);
      if (!nd) {
        errors.push(`[日期格式错误] ${key} = "${p[key]}" — 无法解析为有效日期`);
      } else {
        p[key] = nd; // 标准化为 YYYY-MM-DD
      }
    }
  });

  // passport expiry should be in the future
  if (p.passport_expiry) {
    const expiry = new Date(p.passport_expiry);
    if (expiry < new Date()) {
      errors.push(`[护照过期] passport_expiry = ${p.passport_expiry} 已过期`);
    }
  }

  // ── 3. ENUM VALIDATION ─────────────────────────────────────────────
  const enumChecks = [
    ['gender', ['Male','Female','Other']],
    ['marital_status', ['Single','Married','Divorced','Widowed']],
    ['passport_type', ['Passport','Travel Document','IC']],
    ['sg_pass_type', ['SC','PR','EP','S Pass','DP','Student Pass','LTVP','None']],
    ['study_mode', ['Full-time','Part-time']],
    ['financial_source', ['Self','Parents','Sponsor','Scholarship','Loan']],
  ];
  enumChecks.forEach(([key, allowed]) => {
    if (p[key] && !isValidEnum(p[key], allowed)) {
      warnings.push(`[枚举值非标准] ${key} = "${p[key]}"，合法值: ${allowed.join('/')}`);
    }
  });

  // ── 4. EMAIL VALIDATION ────────────────────────────────────────────
  if (p.email && !isValidEmail(p.email)) {
    errors.push(`[邮箱格式错误] email = "${p.email}"`);
  }

  // ── 5. BOOLEAN NORMALIZATION ───────────────────────────────────────
  const boolFields = [
    'prior_sg_study','bank_statement_available',
    'antecedent_q1','antecedent_q2','antecedent_q3','antecedent_q4',
    'pdpa_consent','pdpa_marketing','pdpa_photo_video',
  ];
  boolFields.forEach(key => {
    if (p[key] !== undefined) p[key] = normalizeBool(p[key]);
  });

  // ── 6. ANTECEDENT CONDITIONAL ──────────────────────────────────────
  const anyAntecedentYes = p.antecedent_q1 || p.antecedent_q2 || p.antecedent_q3 || p.antecedent_q4;
  if (anyAntecedentYes && !p.antecedent_remarks) {
    errors.push('[条件必填] Antecedent 有任一"是"，但 antecedent_remarks（解释说明）为空');
  }

  // ── 7. AGE-BASED: GUARDIAN ─────────────────────────────────────────
  const age = calcAge(p.dob);
  const isMinor = age !== null && age < 18;

  if (isMinor) {
    const g = normalized.guardian;
    if (!g) {
      errors.push('[条件必填] 申请人未满 18 岁，但未填写监护人信息');
    } else {
      if (!g.surname) errors.push('[条件必填] 未成年申请人：监护人 surname 缺失');
      if (!g.given_name) errors.push('[条件必填] 未成年申请人：监护人 given_name 缺失');
      if (!g.relation) errors.push('[条件必填] 未成年申请人：监护人关系 (relation) 缺失');
      if (!g.phone) errors.push('[条件必填] 未成年申请人：监护人电话 (phone) 缺失');
    }

    // Guardian signature required
    const guardianSig = (normalized.signatures || []).find(s => s.sig_type === 'guardian');
    if (!guardianSig) {
      errors.push('[条件必填] 未成年申请人需要监护人签字，但未找到 guardian 签字记录');
    }
  }

  // ── 8. MARITAL STATUS CONDITIONALS ─────────────────────────────────
  const isMarried = p.marital_status === 'Married';
  const spouse = (normalized.family || []).find(m => m.member_type === 'spouse');

  if (isMarried && !spouse) {
    warnings.push('[条件字段] 婚姻状况为 Married，但 family_members 中无 spouse 记录');
  }
  if (!isMarried && spouse) {
    warnings.push('[条件字段] 婚姻状况不是 Married，但 family_members 中存在 spouse 记录 — 可能误填');
  }

  // Spouse PR additional should only exist if spouse is SC/PR
  const spousePr = normalized.spousePrAdditional;
  if (spousePr && (!spouse || !['SC','PR'].includes(spouse.sg_status))) {
    warnings.push('[条件字段] 配偶 PR/SC 附加信息已填写，但配偶不是 SC/PR — 可能误填');
  }
  if (isMarried && spouse && ['SC','PR'].includes(spouse.sg_status) && !spousePr) {
    warnings.push('[条件字段] 配偶为 SC/PR，但未填写 V36 Part H 配偶附加信息');
  }

  // ── 9. PARENT PR ADDITIONAL CONDITIONALS ───────────────────────────
  const parents = (normalized.family || []).filter(m =>
    ['father','mother','step_father','step_mother'].includes(m.member_type)
  );
  const scPrParents = parents.filter(m => ['SC','PR'].includes(m.sg_status));

  if (scPrParents.length > 0) {
    const pprRecords = normalized.parentPrAdditional || [];
    scPrParents.forEach(parent => {
      const found = pprRecords.find(r => r.family_member_id === parent.id);
      if (!found) {
        warnings.push(`[条件字段] ${parent.member_type} "${parent.surname} ${parent.given_name}" 为 ${parent.sg_status}，但未填写 V36 Part G 附加信息`);
      }
    });
  }

  // ── 10. ARRAY STRUCTURE VALIDATION ─────────────────────────────────

  // Family members
  (normalized.family || []).forEach((m, i) => {
    if (!m.member_type) errors.push(`[数组结构] family_members[${i}] 缺少 member_type`);
    if (!m.surname && !m.given_name) warnings.push(`[数组结构] family_members[${i}] 姓名为空`);
    if (m.dob) {
      const nd = normalizeDate(m.dob);
      if (!nd) warnings.push(`[日期格式] family_members[${i}].dob = "${m.dob}" 无法解析`);
      else m.dob = nd;
    }
    if (!isValidEnum(m.member_type, ['father','mother','step_father','step_mother','sibling','spouse'])) {
      warnings.push(`[枚举值] family_members[${i}].member_type = "${m.member_type}" 非标准值`);
    }
  });

  // Residence history
  (normalized.residence || []).forEach((r, i) => {
    if (!r.country) warnings.push(`[数组结构] residence_history[${i}] 缺少 country`);
    if (!r.date_from) warnings.push(`[数组结构] residence_history[${i}] 缺少 date_from`);
    ['date_from','date_to'].forEach(key => {
      if (r[key]) {
        const nd = normalizeDate(r[key]);
        if (!nd) warnings.push(`[日期格式] residence_history[${i}].${key} = "${r[key]}" 无法解析`);
        else r[key] = nd;
      }
    });
  });

  // Education history
  (normalized.education || []).forEach((e, i) => {
    if (!e.institution_name) warnings.push(`[数组结构] education_history[${i}] 缺少 institution_name`);
    ['date_from','date_to'].forEach(key => {
      if (e[key]) {
        const nd = normalizeDate(e[key]);
        if (!nd) warnings.push(`[日期格式] education_history[${i}].${key} = "${e[key]}" 无法解析`);
        else e[key] = nd;
      }
    });
  });

  // Employment history
  const employment = normalized.employment || [];
  employment.forEach((e, i) => {
    if (!e.employer) warnings.push(`[数组结构] employment_history[${i}] 缺少 employer`);
    ['date_from','date_to'].forEach(key => {
      if (e[key]) {
        const nd = normalizeDate(e[key]);
        if (!nd) warnings.push(`[日期格式] employment_history[${i}].${key} = "${e[key]}" 无法解析`);
        else e[key] = nd;
      }
    });
    if (e.is_current !== undefined) e.is_current = normalizeBool(e.is_current);
  });

  // ── 11. EMPLOYMENT: V36 Part E "no information" ────────────────────
  const noEmployment = employment.length === 0;
  if (noEmployment) {
    // V36 Part E 需要标记 "I do not have any information to declare"
    normalized._v36_no_employment_declared = true;
  }

  // ── 12. SIGNATURE CHECKS ──────────────────────────────────────────
  const sigs = normalized.signatures || [];
  const appSig = sigs.find(s => s.sig_type === 'applicant');
  if (!appSig) {
    errors.push('[签字缺失] 申请人签字 (applicant) 未找到');
  } else {
    if (!appSig.sig_date) warnings.push('[签字] 申请人签字日期为空');
  }

  // ── 13. PDPA CONSENT ──────────────────────────────────────────────
  if (!p.pdpa_consent) {
    errors.push('[同意书] PDPA 个人数据保护同意书未勾选');
  }

  // ── 14. AMOUNT NORMALIZATION ──────────────────────────────────────
  const amountFields = [
    'annual_income','applicant_monthly_income','applicant_current_saving',
    'spouse_monthly_income','spouse_current_saving',
    'father_monthly_income','father_current_saving',
    'mother_monthly_income','mother_current_saving',
    'other_financial_amount',
  ];
  amountFields.forEach(key => {
    if (p[key] !== undefined && p[key] !== null && p[key] !== '') {
      const num = normalizeAmount(p[key]);
      if (num === null) {
        warnings.push(`[金额格式] ${key} = "${p[key]}" 无法转为数字`);
      } else {
        p[key] = num;
      }
    }
  });

  // ── 15. PRIOR_SG_STUDY conditional ────────────────────────────────
  if (p.prior_sg_study && !p.prior_sg_school) {
    warnings.push('[条件字段] prior_sg_study=true 但 prior_sg_school 为空');
  }

  // ── 16. REQUIRES_STUDENT_PASS logic ───────────────────────────────
  if (p.sg_pass_type === 'SC' || p.sg_pass_type === 'PR') {
    normalized._f16_not_needed = true;
    normalized._v36_not_needed = true;
    warnings.push('[提示] 申请人为 SC/PR，通常不需要 Form 16 和 V36');
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORM READINESS CHECK
  // ═══════════════════════════════════════════════════════════════════

  const missingForSAF = [];
  const missingForF16 = [];
  const missingForV36 = [];

  // SAF checks
  const safMust = ['surname','given_name','dob','gender','nationality','marital_status',
    'course_name','passport_no','passport_expiry','email','phone_mobile',
    'address_line1','city','country_of_residence','sg_pass_type','financial_source'];
  safMust.forEach(k => { if (!p[k] && p[k] !== 0) missingForSAF.push(k); });
  if (!appSig) missingForSAF.push('applicant_signature');
  if (isMinor && !normalized.guardian) missingForSAF.push('guardian_info');
  if (isMinor && !sigs.find(s => s.sig_type === 'guardian')) missingForSAF.push('guardian_signature');
  if (!p.pdpa_consent) missingForSAF.push('pdpa_consent');

  // F16 checks
  const f16Must = ['surname','given_name','dob','gender','nationality','race','marital_status',
    'passport_no','passport_expiry','passport_issue_country',
    'email','address_line1','city','country_of_residence'];
  f16Must.forEach(k => { if (!p[k] && p[k] !== 0) missingForF16.push(k); });
  if (!appSig) missingForF16.push('applicant_signature');
  // Missing schema fields
  if (!p.school_name) missingForF16.push('school_name (DB缺失)');
  if (!p.birth_certificate_no) missingForF16.push('birth_certificate_no (DB缺失)');

  // V36 checks
  const v36Must = ['surname','given_name','dob','nationality','marital_status'];
  v36Must.forEach(k => { if (!p[k] && p[k] !== 0) missingForV36.push(k); });
  if (!appSig) missingForV36.push('applicant_signature');
  if (parents.length === 0) missingForV36.push('family_members (至少需要父母信息)');
  if (scPrParents.length > 0) {
    const pprRecords = normalized.parentPrAdditional || [];
    scPrParents.forEach(par => {
      if (!pprRecords.find(r => r.family_member_id === par.id)) {
        missingForV36.push(`parent_pr_additional for ${par.member_type} ${par.surname}`);
      }
    });
  }

  const formReadiness = {
    studentApplicationFormReady: missingForSAF.length === 0 && errors.length === 0,
    form16Ready: missingForF16.length === 0 && errors.length === 0 && !normalized._f16_not_needed,
    form36Ready: missingForV36.length === 0 && errors.length === 0 && !normalized._v36_not_needed,
    missingForStudentApplicationForm: missingForSAF,
    missingForForm16: missingForF16,
    missingForForm36: missingForV36,
  };

  return { errors, warnings, normalizedData: normalized, formReadiness };
}


// ═══════════════════════════════════════════════════════════════════════
// PART E — PREFLIGHT CHECKLIST
// ═══════════════════════════════════════════════════════════════════════

/**
 * preflightChecklist(masterData) — 在生成 PDF 前执行的最终检查
 * 返回 { pass: boolean, checks: Array<{item, status, detail}> }
 */
function preflightChecklist(masterData) {
  const result = validateApplicationMapping(masterData);
  const checks = [];

  // 1. No blocking errors
  checks.push({
    item: '无阻塞性错误',
    status: result.errors.length === 0 ? 'PASS' : 'FAIL',
    detail: result.errors.length === 0 ? '所有必填校验通过' : `${result.errors.length} 个错误: ${result.errors[0]}...`,
  });

  // 2. Applicant signature exists
  const appSig = (masterData.signatures || []).find(s => s.sig_type === 'applicant');
  checks.push({
    item: '申请人签字',
    status: appSig ? 'PASS' : 'FAIL',
    detail: appSig ? `签字人: ${appSig.signer_name}, 日期: ${appSig.sig_date}` : '缺少申请人签字',
  });

  // 3. Guardian sig (if minor)
  const age = calcAge(masterData.profile?.dob);
  if (age !== null && age < 18) {
    const gSig = (masterData.signatures || []).find(s => s.sig_type === 'guardian');
    checks.push({
      item: '监护人签字（未成年）',
      status: gSig ? 'PASS' : 'FAIL',
      detail: gSig ? `签字人: ${gSig.signer_name}` : '未成年申请人缺少监护人签字',
    });
  }

  // 4. PDPA consent
  checks.push({
    item: 'PDPA 同意',
    status: masterData.profile?.pdpa_consent ? 'PASS' : 'FAIL',
    detail: masterData.profile?.pdpa_consent ? 'PDPA 已同意' : 'PDPA 未同意',
  });

  // 5. Family members exist
  checks.push({
    item: '家庭成员',
    status: (masterData.family || []).length > 0 ? 'PASS' : 'WARN',
    detail: `${(masterData.family || []).length} 条家庭成员记录`,
  });

  // 6. Education history
  checks.push({
    item: '教育经历',
    status: (masterData.education || []).length > 0 ? 'PASS' : 'WARN',
    detail: `${(masterData.education || []).length} 条教育记录`,
  });

  // 7. Residence history
  checks.push({
    item: '居住史',
    status: (masterData.residence || []).length > 0 ? 'PASS' : 'WARN',
    detail: `${(masterData.residence || []).length} 条居住记录`,
  });

  // 8. SAF ready
  checks.push({
    item: 'Student Application Form 就绪',
    status: result.formReadiness.studentApplicationFormReady ? 'PASS' : 'FAIL',
    detail: result.formReadiness.missingForStudentApplicationForm.length === 0
      ? '所有字段就绪' : `缺失: ${result.formReadiness.missingForStudentApplicationForm.join(', ')}`,
  });

  // 9. Form 16 ready
  checks.push({
    item: 'Form 16 就绪',
    status: result.formReadiness.form16Ready ? 'PASS' : (result.normalizedData._f16_not_needed ? 'SKIP' : 'FAIL'),
    detail: result.normalizedData._f16_not_needed
      ? 'SC/PR 不需要 Form 16'
      : (result.formReadiness.missingForForm16.length === 0
          ? '所有字段就绪' : `缺失: ${result.formReadiness.missingForForm16.join(', ')}`),
  });

  // 10. V36 ready
  checks.push({
    item: 'V36 就绪',
    status: result.formReadiness.form36Ready ? 'PASS' : (result.normalizedData._v36_not_needed ? 'SKIP' : 'FAIL'),
    detail: result.normalizedData._v36_not_needed
      ? 'SC/PR 不需要 V36'
      : (result.formReadiness.missingForForm36.length === 0
          ? '所有字段就绪' : `缺失: ${result.formReadiness.missingForForm36.join(', ')}`),
  });

  const pass = checks.every(c => c.status === 'PASS' || c.status === 'WARN' || c.status === 'SKIP');
  return { pass, checks };
}


// ═══════════════════════════════════════════════════════════════════════
// PART F — TEST CASES
// ═══════════════════════════════════════════════════════════════════════

function getTestCases() {
  return [
    // ── TC1: 完整成年已婚案例（应全部通过）──────────────────────
    {
      name: 'TC1: 完整成年已婚申请人（中国，有配偶，有工作经历）',
      data: {
        profile: {
          surname:'CHEN', given_name:'Wei Ming', chinese_name:'陈伟明', gender:'Male',
          dob:'2002-03-15', birth_country:'China', birth_city:'Shanghai',
          nationality:'Chinese', race:'Chinese', religion:'None', marital_status:'Married',
          passport_type:'Passport', passport_no:'E12345678', passport_issue_date:'2023-05-10',
          passport_expiry:'2033-05-09', passport_issue_country:'China',
          sg_pass_type:'Student Pass', sg_nric_fin:'G1234567A',
          phone_mobile:'+65-91234567', email:'chen@gmail.com',
          address_line1:'Blk 123 Clementi Ave 3', city:'Singapore', postal_code:'120123',
          country_of_residence:'Singapore',
          native_language:'Chinese', english_proficiency:'IELTS', ielts_score:'6.5',
          course_name:'Diploma in Business', intake_year:'2026', intake_month:'July',
          financial_source:'Parents', annual_income:'120000',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1, pdpa_marketing:1, pdpa_photo_video:1,
        },
        family: [
          { id:'f1', member_type:'father', surname:'CHEN', given_name:'Daming', dob:'1970-08-22', nationality:'Chinese', sg_status:'N/A', occupation:'Business Owner' },
          { id:'f2', member_type:'mother', surname:'LI', given_name:'Xiulan', dob:'1972-11-03', nationality:'Chinese', sg_status:'N/A', occupation:'Teacher' },
          { id:'f3', member_type:'spouse', surname:'WANG', given_name:'Xiaoli', dob:'2003-06-20', nationality:'Chinese', sg_status:'Dependent Pass', occupation:'Homemaker' },
        ],
        residence: [
          { country:'China', city:'Shanghai', date_from:'2002-03-15', date_to:'2024-06-30', purpose:'Residence' },
          { country:'Singapore', city:'Singapore', date_from:'2024-07-01', date_to:null, purpose:'Study' },
        ],
        education: [
          { institution_name:'Shanghai High School', country:'China', qualification:'High School', date_from:'2017-09', date_to:'2020-06', gpa:'85/100' },
        ],
        employment: [
          { employer:'Tech Co', country:'China', position:'Intern', date_from:'2021-07', date_to:'2021-12', is_current:0, reason_left:'Returned to studies' },
        ],
        guardian: null,
        parentPrAdditional: [],
        spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'CHEN Wei Ming', sig_date:'2026-03-20' }],
      },
      expectedErrors: 0,
    },

    // ── TC2: 未成年无监护人（应报错）────────────────────────────
    {
      name: 'TC2: 未成年申请人，缺少监护人信息和签字',
      data: {
        profile: {
          surname:'LIU', given_name:'Jiayi', gender:'Female',
          dob:'2010-11-28', birth_country:'China', nationality:'Chinese',
          marital_status:'Single',
          passport_type:'Passport', passport_no:'E98765432', passport_expiry:'2034-01-14',
          sg_pass_type:'Student Pass',
          phone_mobile:'+86-13912345678', email:'liu@qq.com',
          address_line1:'88 Chaoyang Ave', city:'Beijing', country_of_residence:'China',
          course_name:'Certificate in English', intake_year:'2026',
          financial_source:'Parents',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [
          { id:'f1', member_type:'father', surname:'LIU', given_name:'Jianguo', nationality:'Chinese' },
          { id:'f2', member_type:'mother', surname:'ZHAO', given_name:'Mei', nationality:'Chinese' },
        ],
        residence: [], education: [], employment: [],
        guardian: null, // 缺失！
        parentPrAdditional: [], spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'LIU Jiayi', sig_date:'2026-03-20' }],
        // 缺少 guardian signature!
      },
      expectedErrors: 2, // guardian info + guardian signature
    },

    // ── TC3: 未成年有完整监护人（应通过）─────────────────────────
    {
      name: 'TC3: 未成年申请人，监护人信息完整',
      data: {
        profile: {
          surname:'LIU', given_name:'Jiayi', gender:'Female',
          dob:'2010-11-28', birth_country:'China', nationality:'Chinese',
          marital_status:'Single',
          passport_type:'Passport', passport_no:'E98765432', passport_expiry:'2034-01-14',
          sg_pass_type:'Student Pass',
          phone_mobile:'+86-139', email:'liu@qq.com',
          address_line1:'88 Ave', city:'Beijing', country_of_residence:'China',
          course_name:'Cert English', intake_year:'2026',
          financial_source:'Parents',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [{ id:'f1', member_type:'father', surname:'LIU', given_name:'Jianguo', nationality:'Chinese' }],
        residence: [], education: [], employment: [],
        guardian: { surname:'TAN', given_name:'Ah Kow', relation:'Legal Guardian', phone:'+65-987' },
        parentPrAdditional: [], spousePrAdditional: null,
        signatures: [
          { sig_type:'applicant', signer_name:'LIU Jiayi', sig_date:'2026-03-20' },
          { sig_type:'guardian', signer_name:'TAN Ah Kow', sig_date:'2026-03-20' },
        ],
      },
      expectedErrors: 0,
    },

    // ── TC4: Antecedent YES 无解释（应报错）──────────────────────
    {
      name: 'TC4: Antecedent Q1=Yes 但无 explanation',
      data: {
        profile: {
          surname:'PARK', given_name:'Jinhee', gender:'Female',
          dob:'1998-05-20', nationality:'Korean', marital_status:'Single',
          passport_type:'Passport', passport_no:'M12345678', passport_expiry:'2030-01-01',
          sg_pass_type:'Student Pass',
          phone_mobile:'+82-10', email:'park@naver.com',
          address_line1:'123 Gangnam', city:'Seoul', country_of_residence:'Korea',
          course_name:'Diploma IT', intake_year:'2026',
          financial_source:'Self',
          antecedent_q1:1, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          antecedent_remarks: '', // 缺失！
          pdpa_consent:1, birth_country:'Korea',
        },
        family: [{ id:'f1', member_type:'father', surname:'PARK', given_name:'Sung', nationality:'Korean' }],
        residence: [], education: [], employment: [],
        guardian: null, parentPrAdditional: [], spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'PARK Jinhee', sig_date:'2026-03-20' }],
      },
      expectedErrors: 1, // antecedent_remarks required
    },

    // ── TC5: SC/PR 申请人（F16/V36 不需要）─────────────────────
    {
      name: 'TC5: Singapore Citizen 申请人 — F16/V36 should be skipped',
      data: {
        profile: {
          surname:'TAN', given_name:'Wei Lin', gender:'Male',
          dob:'2000-01-15', nationality:'Singaporean', marital_status:'Single',
          passport_type:'IC', passport_no:'S9012345A', passport_expiry:'2030-12-31',
          sg_pass_type:'SC', sg_nric_fin:'S9012345A',
          phone_mobile:'+65-9876', email:'tan@gmail.com',
          address_line1:'Blk 10 Toa Payoh', city:'Singapore', country_of_residence:'Singapore',
          course_name:'Diploma Accounting', intake_year:'2026',
          financial_source:'Self', birth_country:'Singapore',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [{ id:'f1', member_type:'father', surname:'TAN', given_name:'Ah Beng', nationality:'Singaporean', sg_status:'SC' }],
        residence: [{ country:'Singapore', city:'Singapore', date_from:'2000-01-15', purpose:'Residence' }],
        education: [{ institution_name:'TP', country:'Singapore', qualification:'O-Level' }],
        employment: [],
        guardian: null, parentPrAdditional: [], spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'TAN Wei Lin', sig_date:'2026-03-20' }],
      },
      expectedErrors: 0,
      expectedWarnings: ['F16 not needed', 'V36 not needed'],
    },

    // ── TC6: 有 SC/PR 父母（需要 Part G）────────────────────────
    {
      name: 'TC6: 父亲为 PR，需要 V36 Part G — 但未填写',
      data: {
        profile: {
          surname:'KIM', given_name:'Minjae', gender:'Male',
          dob:'2003-07-01', nationality:'Korean', marital_status:'Single',
          passport_type:'Passport', passport_no:'M87654321', passport_expiry:'2033-07-01',
          sg_pass_type:'Student Pass',
          phone_mobile:'+65-8765', email:'kim@gmail.com',
          address_line1:'10 Orchard Rd', city:'Singapore', country_of_residence:'Singapore',
          course_name:'Diploma Business', intake_year:'2026',
          financial_source:'Parents', birth_country:'Korea',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [
          { id:'f1', member_type:'father', surname:'KIM', given_name:'Youngho', nationality:'Korean', sg_status:'PR' },
          { id:'f2', member_type:'mother', surname:'LEE', given_name:'Soyeon', nationality:'Korean', sg_status:'N/A' },
        ],
        residence: [{ country:'Singapore', city:'Singapore', date_from:'2020-01-01', purpose:'Residence' }],
        education: [{ institution_name:'SIS', country:'Singapore', qualification:'Secondary' }],
        employment: [],
        guardian: null,
        parentPrAdditional: [], // Missing! Father is PR
        spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'KIM Minjae', sig_date:'2026-03-20' }],
      },
      expectedErrors: 0,
      expectedWarnings: 1, // parent PR additional missing
    },

    // ── TC7: 无工作经历（V36 Part E should flag "no info"）─────
    {
      name: 'TC7: 无工作经历 — V36 应标记 "no information to declare"',
      data: {
        profile: {
          surname:'NGUYEN', given_name:'Van Huy', gender:'Male',
          dob:'2005-01-10', nationality:'Vietnamese', marital_status:'Single',
          passport_type:'Passport', passport_no:'C12345678', passport_expiry:'2033-05-31',
          sg_pass_type:'Student Pass',
          phone_mobile:'+84-908', email:'nguyen@gmail.com',
          address_line1:'123 Le Loi', city:'HCMC', country_of_residence:'Vietnam',
          course_name:'Diploma IT', intake_year:'2026',
          financial_source:'Parents', birth_country:'Vietnam',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [{ id:'f1', member_type:'father', surname:'NGUYEN', given_name:'Van Thanh', nationality:'Vietnamese' }],
        residence: [], education: [{ institution_name:'High School', country:'Vietnam' }],
        employment: [], // empty!
        guardian: null, parentPrAdditional: [], spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'NGUYEN Van Huy', sig_date:'2026-03-20' }],
      },
      expectedV36NoEmployment: true,
    },

    // ── TC8: 已婚无配偶记录（应有 warning）──────────────────────
    {
      name: 'TC8: Married 但 family_members 无 spouse — warning',
      data: {
        profile: {
          surname:'ZHANG', given_name:'Li', gender:'Female',
          dob:'1995-06-15', nationality:'Chinese', marital_status:'Married',
          passport_type:'Passport', passport_no:'E11111111', passport_expiry:'2032-06-15',
          sg_pass_type:'Student Pass',
          phone_mobile:'+86-138', email:'zhang@gmail.com',
          address_line1:'100 Nanjing Rd', city:'Shanghai', country_of_residence:'China',
          course_name:'MBA', intake_year:'2026',
          financial_source:'Self', birth_country:'China',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [{ id:'f1', member_type:'father', surname:'ZHANG', given_name:'Wei', nationality:'Chinese' }],
        residence: [], education: [], employment: [],
        guardian: null, parentPrAdditional: [], spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'ZHANG Li', sig_date:'2026-03-20' }],
      },
      expectedWarnings: 1, // Married but no spouse
    },

    // ── TC9: 多段教育+多段工作+多兄弟姐妹 ──────────────────────
    {
      name: 'TC9: 多段教育(3)、多段工作(2)、多个兄弟姐妹(2)',
      data: {
        profile: {
          surname:'WIJAYA', given_name:'Putri', gender:'Female',
          dob:'2004-07-22', nationality:'Indonesian', marital_status:'Single',
          passport_type:'Passport', passport_no:'B7654321', passport_expiry:'2032-07-31',
          sg_pass_type:'Student Pass',
          phone_mobile:'+62-812', email:'putri@yahoo.com',
          address_line1:'Jl. Sudirman 88', city:'Jakarta', country_of_residence:'Indonesia',
          course_name:'Hospitality', intake_year:'2026',
          financial_source:'Parents', birth_country:'Indonesia',
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [
          { id:'f1', member_type:'father', surname:'WIJAYA', given_name:'Budi', nationality:'Indonesian' },
          { id:'f2', member_type:'mother', surname:'WIJAYA', given_name:'Siti', nationality:'Indonesian' },
          { id:'f3', member_type:'sibling', surname:'WIJAYA', given_name:'Adi', dob:'2008-09-12', nationality:'Indonesian' },
          { id:'f4', member_type:'sibling', surname:'WIJAYA', given_name:'Dewi', dob:'2010-03-05', nationality:'Indonesian' },
        ],
        residence: [
          { country:'Indonesia', city:'Jakarta', date_from:'2004-07-22', date_to:'2024-03-31', purpose:'Residence' },
          { country:'Singapore', city:'Singapore', date_from:'2024-04-01', purpose:'Study' },
        ],
        education: [
          { institution_name:'SMA Negeri 8', country:'Indonesia', qualification:'High School', date_from:'2019-07', date_to:'2022-06' },
          { institution_name:'ABC Language School', country:'Singapore', qualification:'English Cert', date_from:'2024-04', date_to:'2025-04' },
          { institution_name:'ESIC College', country:'Singapore', qualification:'Diploma', date_from:'2025-05' },
        ],
        employment: [
          { employer:'Wijaya Restaurant', country:'Indonesia', position:'Waitress', date_from:'2022-07', date_to:'2024-03', reason_left:'Moving to SG' },
          { employer:'Part-time Tutor', country:'Singapore', position:'Tutor', date_from:'2024-06', is_current:1 },
        ],
        guardian: null, parentPrAdditional: [], spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'WIJAYA Putri', sig_date:'2026-03-20' }],
      },
      expectedErrors: 0,
    },

    // ── TC10: 护照过期+日期格式混乱+邮箱错误 ───────────────────
    {
      name: 'TC10: 数据质量差 — 护照过期、日期格式错、邮箱无效',
      data: {
        profile: {
          surname:'BAD', given_name:'Data', gender:'Male',
          dob:'15/03/1990', // DD/MM/YYYY 格式
          birth_country:'India', nationality:'Indian', marital_status:'Single',
          passport_type:'Passport', passport_no:'J99999999',
          passport_expiry:'2020-01-01', // 已过期！
          sg_pass_type:'Student Pass',
          phone_mobile:'+91-999', email:'not-an-email', // 无效邮箱
          address_line1:'123 MG Road', city:'Mumbai', country_of_residence:'India',
          course_name:'Test Course', intake_year:'2026',
          financial_source:'Self',
          annual_income:'S$2,500.50', // 带货币符号
          antecedent_q1:0, antecedent_q2:0, antecedent_q3:0, antecedent_q4:0,
          pdpa_consent:1,
        },
        family: [], residence: [], education: [], employment: [],
        guardian: null, parentPrAdditional: [], spousePrAdditional: null,
        signatures: [{ sig_type:'applicant', signer_name:'BAD Data', sig_date:'2026-03-20' }],
      },
      expectedErrors: 2, // passport expired + invalid email
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════
// SELF-TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════

function runSelfTest() {
  const cases = getTestCases();
  console.log('═══════════════════════════════════════════════════');
  console.log('  ADM Field Mapping — Validation Self-Test');
  console.log('═══════════════════════════════════════════════════\n');

  let passed = 0, failed = 0;

  cases.forEach((tc, i) => {
    const result = validateApplicationMapping(tc.data);
    const preflight = preflightChecklist(tc.data);

    const errCount = result.errors.length;
    const warnCount = result.warnings.length;
    const ready = result.formReadiness;

    console.log(`── ${tc.name} ──`);
    console.log(`   Errors: ${errCount}  Warnings: ${warnCount}`);
    console.log(`   SAF Ready: ${ready.studentApplicationFormReady}  F16 Ready: ${ready.form16Ready}  V36 Ready: ${ready.form36Ready}`);
    if (result.errors.length) console.log(`   Errors: ${result.errors.join(' | ')}`);
    if (result.warnings.length) console.log(`   Warnings: ${result.warnings.slice(0,3).join(' | ')}${result.warnings.length > 3 ? '...' : ''}`);

    // Check V36 no employment flag
    if (tc.expectedV36NoEmployment) {
      if (result.normalizedData._v36_no_employment_declared) {
        console.log(`   ✓ V36 no-employment flag set correctly`);
      } else {
        console.log(`   ✗ V36 no-employment flag NOT set`);
        failed++;
        return;
      }
    }

    // Verify normalized date (TC10)
    if (tc.data.profile.dob === '15/03/1990') {
      const normDob = result.normalizedData.profile.dob;
      if (normDob === '1990-03-15') {
        console.log(`   ✓ Date normalized: DD/MM/YYYY → ${normDob}`);
      } else {
        console.log(`   ✗ Date normalization failed: got ${normDob}`);
      }
    }

    // Verify amount normalization (TC10)
    if (tc.data.profile.annual_income === 'S$2,500.50') {
      const normAmt = result.normalizedData.profile.annual_income;
      if (normAmt === 2500.50) {
        console.log(`   ✓ Amount normalized: "S$2,500.50" → ${normAmt}`);
      } else {
        console.log(`   ✗ Amount normalization: got ${normAmt}`);
      }
    }

    if (tc.expectedErrors !== undefined && errCount !== tc.expectedErrors) {
      console.log(`   ✗ FAIL: Expected ${tc.expectedErrors} errors, got ${errCount}`);
      failed++;
    } else {
      console.log(`   ✓ PASS`);
      passed++;
    }
    console.log('');
  });

  // Gap report
  console.log('═══════════════════════════════════════════════════');
  console.log('  GAP REPORT (Missing Fields)');
  console.log('═══════════════════════════════════════════════════\n');
  const gaps = generateGapReport();
  console.log(`Missing fields: ${gaps.missing.length}`);
  gaps.missing.forEach(g => console.log(`  [${g.severity}] ${g.key}: ${g.detail}`));
  console.log(`\nConflicts: ${gaps.conflicts.length}`);
  gaps.conflicts.forEach(c => console.log(`  ${c.key}: ${c.detail}`));
  console.log(`\nWarnings: ${gaps.warnings.length}`);
  gaps.warnings.forEach(w => console.log(`  ${w.key}: ${w.detail}`));

  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`═══════════════════════════════════════════════════`);

  return { passed, failed };
}


// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Schema definitions
  MASTER_FIELDS,
  FAMILY_MEMBER_FIELDS,
  RESIDENCE_HISTORY_FIELDS,
  EDUCATION_HISTORY_FIELDS,
  EMPLOYMENT_HISTORY_FIELDS,
  GUARDIAN_FIELDS,
  PARENT_PR_ADDITIONAL_FIELDS,
  SPOUSE_PR_ADDITIONAL_FIELDS,
  SIGNATURE_FIELDS,

  // Form field requirements
  SAF_REQUIRED_FIELDS,
  F16_REQUIRED_FIELDS,
  V36_REQUIRED_FIELDS,

  // Functions
  validateApplicationMapping,
  preflightChecklist,
  generateGapReport,
  getTestCases,
  runSelfTest,

  // Helpers
  normalizeDate,
  normalizeAmount,
  normalizeBool,
  calcAge,
};

// ── Run self-test if executed directly ──
if (require.main === module) {
  runSelfTest();
}
