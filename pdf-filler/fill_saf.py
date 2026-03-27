"""
fill_saf.py — Student Application Form 模板填充器
坐标精确校准：值 y = label_bottom + 4pt
模板尺寸: 595×842 (A4), 3 页
"""
from pdf_utils import OverlayBuilder, merge_overlay, fmt_date, fmt_amount, yn, safe_str, to_bool
import os

def _find_file(upload_dir, file_id):
    """在 upload_dir 及其子目录中查找文件（兼容分层目录结构）"""
    if not file_id:
        return None
    # 直接在根目录
    direct = os.path.join(upload_dir, file_id)
    if os.path.exists(direct):
        return direct
    # 搜索子目录
    for sub in ['photos', 'materials', 'generated', 'signatures', 'exchange', 'case-files']:
        p = os.path.join(upload_dir, sub, file_id)
        if os.path.exists(p):
            return p
    return direct  # fallback

def fill_saf(data, template_path, output_path, upload_dir=None, font_path=None):
    p = data.get('profile', {})
    family = data.get('family', [])
    education = data.get('education', [])
    residence = data.get('residence', [])
    guardian = data.get('guardian', {}) or {}
    sigs = data.get('signatures', {})
    parents_pr = data.get('parentPrAdditional', [])

    ob = OverlayBuilder(595, 842, font_path=font_path)

    # ══════════════════════════════════════════════════════
    # PAGE 1
    # ══════════════════════════════════════════════════════

    # ── ID Photo (右上角) ──
    if p.get('id_photo') and upload_dir:
        photo_path = _find_file(upload_dir, p['id_photo'])
        if photo_path and os.path.exists(photo_path):
            ob.image(493.5, 51, photo_path, 75, 95)

    # ── 1. Course Details ──
    # "Course Title 申请课程：" label_bottom=172.9  →  值 y=177
    # "Commencement Date" 在同一行, x 起始于 ~294
    ob.text(105, 166, safe_str(p.get('course_name')), 9, max_width=268)
    ob.text(407, 166, fmt_date(p.get('commencement_date')), 9)

    # ── 2. Pass Type ──
    # "SC/SPR" 行 top=197.6 → checkbox 在 y≈200 左右
    pt = safe_str(p.get('sg_pass_type'))
    ob.checkbox(23, 199.5, pt in ('SC','PR'), size=8)            # SC/SPR
    ob.checkbox(168.5, 197, pt == 'LTVP', size=8)                # LTVP
    ob.checkbox(367, 198.5, pt == 'DP', size=8)                  # DP
    # "Student Pass" 行 top=212.7
    ob.checkbox(24.5, 213.5, pt == 'Student Pass', size=8)          # Student Pass
    ob.checkbox(170, 213.5, to_bool(p.get('requires_student_pass')), size=8)  # Require

    # "Were you ever SG Citizen/PR?" — Yes x≈490, No x≈519, y≈228
    was_sg = to_bool(p.get('was_ever_sg_citizen_or_pr'))
    ob.checkbox(504, 225, bool(was_sg), size=7, style='check')     # SG Citizen Yes ✓
    ob.checkbox(521, 226, not was_sg, size=7, style='check')       # SG Citizen No ✓

    # ── 3. Personal Details ──
    # "Family Name 姓氏..." label_bottom=276.7 → 值 y=281
    ob.text(53, 281, safe_str(p.get('surname')), 9, max_width=105)
    ob.text(195, 281, safe_str(p.get('given_name')), 9, max_width=105)
    nm = f"{safe_str(p.get('surname'))} {safe_str(p.get('given_name'))}".strip()
    ob.text(307, 281, nm, 8, max_width=145)
    ob.text(483, 279, safe_str(p.get('chinese_name')), 8, max_width=100)

    # "Gender..." label_bottom=300.7 → checkboxes y≈305
    # "Male" at x=56.7, "Female" at ~120
    ob.checkbox(45.5, 301, p.get('gender') == 'Male', size=9)
    ob.checkbox(110, 301.5, p.get('gender') == 'Female', size=9)
    # DOB at x≈222, 值 y=305
    ob.text(230, 305, fmt_date(p.get('dob')), 9)
    # Birth Cert No at x≈420
    ob.text(420, 305, safe_str(p.get('birth_certificate_no')), 8, max_width=140)

    # "Nationality...Country of Birth...Province/State" label_bottom=324.6 → 值 y=329
    ob.text(75, 329, safe_str(p.get('nationality')), 9, max_width=160)
    ob.text(251, 329, safe_str(p.get('birth_country')), 8, max_width=170)
    ob.text(441, 329, safe_str(p.get('birth_province_state') or p.get('birth_city','')), 8, max_width=120)

    # "Passport Number...Country of Issue...Place of Issue...Issue Date...Expiry Date"
    # label_bottom=348.2 → 值 y=353
    ob.text(22, 353, safe_str(p.get('passport_no')), 8, max_width=100)
    ob.text(131, 353, safe_str(p.get('passport_issue_country')), 7, max_width=110)
    ob.text(255, 353, safe_str(p.get('passport_issue_place') or p.get('passport_issue_country','')), 7, max_width=100)
    ob.text(373, 353, fmt_date(p.get('passport_issue_date')), 8)
    ob.text(475, 353, fmt_date(p.get('passport_expiry')), 8)

    # "Email Address...Contact Number" label_bottom=372.4 → 值 y=377
    ob.text(119, 377, safe_str(p.get('email')), 8, max_width=250)
    ob.text(382, 377, safe_str(p.get('phone_mobile')), 8, max_width=175)

    # "Race...Religion...Occupation...Marital Status" label_bottom=396.3 → 值 y=401
    ob.text(50, 401, safe_str(p.get('race')), 8, max_width=80)
    ob.text(148, 401, safe_str(p.get('religion')), 8, max_width=80)
    ob.text(245, 401, safe_str(p.get('occupation')), 8, max_width=130)
    # Marital Status: checkbox 勾选对应选项
    # "Single / Married / Divorced" 文字位于 x=398-496, y=399-408
    ms = p.get('marital_status','')
    ob.checkbox(402, 398, ms == 'Single', size=8, style='check')       # ✓ Single
    ob.checkbox(434, 399, ms == 'Married', size=8, style='check')      # ✓ Married
    ob.checkbox(471.5, 397.5, ms == 'Divorced', size=8, style='check')     # ✓ Divorced

    # "Singapore Address...Hometown Address" label_bottom=420.3 → 值 y=430
    sg_addr = safe_str(p.get('sg_address') or p.get('address_line1',''))
    ob.text(98, 430, sg_addr, 7, max_width=250)
    ob.text(376, 430, safe_str(p.get('hometown_address','')), 7, max_width=195)

    # ── Residence History 表格（每行独立坐标，可拖拽）──
    def _res(i): return residence[i] if i < len(residence) else {}
    ob.text(34, 518, safe_str(_res(0).get('country')), 7, max_width=130)    # Res1 country
    ob.text(200, 518, safe_str(_res(0).get('address')), 7, max_width=240)   # Res1 address
    ob.text(449, 518, fmt_date(_res(0).get('date_from')), 7)                # Res1 from
    ob.text(510, 518, fmt_date(_res(0).get('date_to')) or 'present', 7)     # Res1 to
    ob.text(35.5, 566.5, safe_str(_res(1).get('country')), 7, max_width=130)    # Res2 country
    ob.text(200.5, 570, safe_str(_res(1).get('address')), 7, max_width=240)   # Res2 address
    ob.text(448, 569.5, fmt_date(_res(1).get('date_from')), 7)                # Res2 from
    ob.text(510, 566, fmt_date(_res(1).get('date_to')) or 'present', 7)     # Res2 to
    ob.text(34.5, 602.5, safe_str(_res(2).get('country')), 7, max_width=130)    # Res3 country
    ob.text(202.5, 602.5, safe_str(_res(2).get('address')), 7, max_width=240)   # Res3 address
    ob.text(449, 603, fmt_date(_res(2).get('date_from')), 7)                # Res3 from
    ob.text(511, 603.5, fmt_date(_res(2).get('date_to')) or 'present', 7)     # Res3 to

    # ── 4. Family Members 表格（展开成静态坐标）──
    def _fm(mt):
        # Support multiple member_types: _fm('step_father') also checks 'step_mother'
        if mt == 'step_father':
            return next((m for m in family if m.get('member_type') in ('step_father','step_mother')), {})
        return next((m for m in family if m.get('member_type') == mt), {})
    def _fn(m): return f"{safe_str(m.get('surname'))} {safe_str(m.get('given_name'))}".strip()

    # Father 列 (x=140)
    ob.text(164, 637.5, _fn(_fm('father')), 6, max_width=108)                            # Father name
    ob.text(163, 656, fmt_date(_fm('father').get('dob')), 6)                            # Father dob
    ob.text(161.5, 675, safe_str(_fm('father').get('nationality')), 6, max_width=100)     # Father nationality
    ob.text(160.5, 694, safe_str(_fm('father').get('passport_no') or _fm('father').get('nric_fin','')), 6, max_width=100)  # Father passport
    ob.text(160.5, 712.5, safe_str(_fm('father').get('email','')), 5, max_width=100)        # Father email
    ob.text(160, 730, safe_str(_fm('father').get('contact_number') or _fm('father').get('sg_mobile','')), 6, max_width=100)  # Father contact
    ob.text(159, 748, safe_str(_fm('father').get('sg_status','')), 6, max_width=100)    # Father sg_status
    ob.text(160, 764.5, safe_str(_fm('father').get('occupation','')), 6, max_width=100)   # Father occupation

    # Mother 列 (x=264)
    ob.text(261.5, 637.5, _fn(_fm('mother')), 6, max_width=108)                            # Mother name
    ob.text(261.5, 658, fmt_date(_fm('mother').get('dob')), 6)                            # Mother dob
    ob.text(262.5, 674.5, safe_str(_fm('mother').get('nationality')), 6, max_width=100)     # Mother nationality
    ob.text(262, 694, safe_str(_fm('mother').get('passport_no') or _fm('mother').get('nric_fin','')), 6, max_width=100)  # Mother passport
    ob.text(263, 712.5, safe_str(_fm('mother').get('email','')), 5, max_width=100)        # Mother email
    ob.text(263, 729.5, safe_str(_fm('mother').get('contact_number') or _fm('mother').get('sg_mobile','')), 6, max_width=100)  # Mother contact
    ob.text(264, 747, safe_str(_fm('mother').get('sg_status','')), 6, max_width=100)    # Mother sg_status
    ob.text(264, 765, safe_str(_fm('mother').get('occupation','')), 6, max_width=100)   # Mother occupation

    # Step-parent 列 (x=380)
    ob.text(369.5, 638, _fn(_fm('step_father')), 6, max_width=108)                       # Step name
    ob.text(367, 657, fmt_date(_fm('step_father').get('dob')), 6)                       # Step dob
    ob.text(368, 674.5, safe_str(_fm('step_father').get('nationality')), 6, max_width=100)  # Step nationality
    ob.text(368.5, 692.5, safe_str(_fm('step_father').get('passport_no','')), 6, max_width=100)  # Step passport
    ob.text(368.5, 711, safe_str(_fm('step_father').get('email','')), 5, max_width=100)   # Step email
    ob.text(368, 729.5, safe_str(_fm('step_father').get('contact_number','')), 6, max_width=100)  # Step contact
    ob.text(368.5, 746, safe_str(_fm('step_father').get('sg_status','')), 6, max_width=100)  # Step sg_status
    ob.text(368.5, 764, safe_str(_fm('step_father').get('occupation','')), 6, max_width=100)  # Step occupation

    # Sibling 列 (x=490) — 显示所有 siblings 的名字，详细信息用第一个
    _sibs = [m for m in family if m.get('member_type') == 'sibling']
    _sib1 = _sibs[0] if _sibs else {}
    # 如果多个 sibling，名字行拼合所有名字（缩小字号）
    sib_names = '; '.join(_fn(s) for s in _sibs) if _sibs else ''
    sib_fs = 5 if len(_sibs) > 2 else 6
    ob.text(469.5, 637.5, sib_names, sib_fs, max_width=100)                               # Sibling name(s)
    ob.text(468.5, 655, fmt_date(_sib1.get('dob')), 6)                                    # Sibling1 dob
    ob.text(469, 674.5, safe_str(_sib1.get('nationality')), 6, max_width=80)              # Sibling1 nationality
    ob.text(470, 692, safe_str(_sib1.get('passport_no','')), 6, max_width=80)             # Sibling1 passport
    ob.text(470.5, 710, safe_str(_sib1.get('email','')), 5, max_width=80)                 # Sibling1 email
    ob.text(469, 728, safe_str(_sib1.get('contact_number') or _sib1.get('sg_mobile','')), 6, max_width=80)  # Sibling1 contact
    ob.text(469.5, 746, safe_str(_sib1.get('sg_status','')), 6, max_width=80)             # Sibling1 sg_status
    ob.text(470, 765, safe_str(_sib1.get('occupation','')), 6, max_width=80)              # Sibling1 occupation

    # ══════════════════════════════════════════════════════
    # PAGE 2
    # ══════════════════════════════════════════════════════
    ob.next_page()

    # ── 5. Educational Background（展开成静态行）──
    def _ed(i): return education[i] if i < len(education) else {}
    # Row 1
    ob.text(40, 93, safe_str(_ed(0).get('institution_name')), 6, max_width=95)    # Edu1 school
    ob.text(141, 93, safe_str(_ed(0).get('country')), 6, max_width=45)            # Edu1 country
    ob.text(197, 93, safe_str(_ed(0).get('state_province')), 6, max_width=45)     # Edu1 state
    ob.text(275, 93, fmt_date(_ed(0).get('date_from')), 6)                        # Edu1 from
    ob.text(330, 93, fmt_date(_ed(0).get('date_to')), 6)                          # Edu1 to
    ob.text(407, 93, safe_str(_ed(0).get('qualification')), 6, max_width=75)      # Edu1 qual
    ob.text(489, 93, safe_str(_ed(0).get('educational_cert_no')), 5, max_width=70)  # Edu1 cert
    # Row 2
    ob.text(40, 111, safe_str(_ed(1).get('institution_name')), 6, max_width=95)   # Edu2 school
    ob.text(141, 111, safe_str(_ed(1).get('country')), 6, max_width=45)           # Edu2 country
    ob.text(197, 111, safe_str(_ed(1).get('state_province')), 6, max_width=45)    # Edu2 state
    ob.text(275, 111, fmt_date(_ed(1).get('date_from')), 6)                       # Edu2 from
    ob.text(330, 111, fmt_date(_ed(1).get('date_to')), 6)                         # Edu2 to
    ob.text(407, 111, safe_str(_ed(1).get('qualification')), 6, max_width=75)     # Edu2 qual
    ob.text(489, 111, safe_str(_ed(1).get('educational_cert_no')), 5, max_width=70)  # Edu2 cert
    # Row 3
    ob.text(40, 129, safe_str(_ed(2).get('institution_name')), 6, max_width=95)   # Edu3 school
    ob.text(141, 129, safe_str(_ed(2).get('country')), 6, max_width=45)           # Edu3 country
    ob.text(197, 129, safe_str(_ed(2).get('state_province')), 6, max_width=45)    # Edu3 state
    ob.text(275, 129, fmt_date(_ed(2).get('date_from')), 6)                       # Edu3 from
    ob.text(330, 129, fmt_date(_ed(2).get('date_to')), 6)                         # Edu3 to
    ob.text(407, 129, safe_str(_ed(2).get('qualification')), 6, max_width=75)     # Edu3 qual
    ob.text(489, 129, safe_str(_ed(2).get('educational_cert_no')), 5, max_width=70)  # Edu3 cert

    # ── 6. Language Proficiency ──
    # "Highest Language Proficiency" label_bottom=174 → 值 y=178
    ob.text(232, 163.5, safe_str(p.get('highest_lang_proficiency') or p.get('english_proficiency','')), 8, max_width=350)
    # "Grade Attained" label_bottom=189 → 值 y=193
    ob.text(231.5, 178, safe_str(p.get('ielts_score','') or p.get('toefl_score','')), 8, max_width=350)
    # "Need English Placement Test?" — Yes x≈361, No x≈391, y≈194
    nept = to_bool(p.get('need_english_placement_test'))
    ob.checkbox(376.5, 192, bool(nept), size=7, style='check')       # Placement Yes ✓
    ob.checkbox(406, 191.5, not nept, size=7, style='check')         # Placement No ✓

    # ── 7. Bank Statement ──
    # Applicant row: "Average Monthly Income" label top=229.4, bottom=239
    # 值区域在 label 右侧 (x≈225 for amount)
    ob.text(269.5, 230, fmt_amount(p.get('applicant_monthly_income')), 8)    # Applicant income
    ob.text(217, 242.5, fmt_amount(p.get('applicant_current_saving')), 8)    # Applicant saving
    ob.text(543, 227.5, fmt_amount(p.get('mother_monthly_income')), 8)       # Mother income
    ob.text(490.5, 243.5, fmt_amount(p.get('mother_current_saving')), 8)       # Mother saving
    ob.text(269.5, 259, fmt_amount(p.get('father_monthly_income')), 8)       # Father income
    ob.text(217.5, 273.5, fmt_amount(p.get('father_current_saving')), 8)       # Father saving
    ob.text(543, 258, fmt_amount(p.get('spouse_monthly_income')), 8)       # Spouse income
    ob.text(493, 276, fmt_amount(p.get('spouse_current_saving')), 8)       # Spouse saving
    # Other financial: "Yes" x≈294 y≈289, "No" x≈294 y≈303
    has_other = to_bool(p.get('other_financial_support'))
    ob.checkbox(330, 289, has_other, size=7, style='check')         # ✓ Yes
    ob.checkbox(329, 301, not has_other, size=7, style='check')     # ✓ No
    if has_other:
        ob.text(434.5, 288, fmt_amount(p.get('other_financial_amount')), 8)  # Amount

    # ── 8. Guardian Information ──
    # "Passport Full Name" label_bottom=344.9 → 值 y=350
    if guardian and guardian.get('surname'):
        gname = f"{safe_str(guardian.get('surname'))} {safe_str(guardian.get('given_name'))}".strip()
        ob.text(51, 345, gname, 8, max_width=160)
        ob.text(220, 346, safe_str(guardian.get('passport_no') or guardian.get('nric_fin','')), 8, max_width=140)
        ob.text(442, 346, safe_str(guardian.get('nationality')), 8, max_width=90)
        # Email/Contact label_bottom=369.3 → 值 y=375
        ob.text(101, 370, safe_str(guardian.get('email')), 7, max_width=240)
        ob.text(382.5, 369.5, safe_str(guardian.get('phone')), 8, max_width=175)
        # Address label_bottom=393.7 → 值 y=400
        ob.text(22, 400, safe_str(guardian.get('address')), 7, max_width=540)

    # ── 9. Additional Info for Parents (SC/PR)（条件显示：仅 SC/PR 父母）──
    def _ppr(mt):
        mem = _fm(mt)
        if not mem or not mem.get('id'): return {}
        return next((x for x in parents_pr if x.get('family_member_id') == mem.get('id')), {})
    def _is_scpr(mt):
        mem = _fm(mt)
        return safe_str(mem.get('sg_status','')).upper() in ('SC','PR') if mem.get('surname') else False

    # 上半部 婚姻表: Father y=504, Mother y=519, Step y=534
    if _is_scpr('father'):
        ob.text(95, 494.5, _fn(_fm('father')), 6, max_width=95)                         # S9 Father name
        ob.text(195, 504, safe_str(_ppr('father').get('marital_status')), 6, max_width=55)  # S9 Father marital
        ob.text(229.5, 496, safe_str(_ppr('father').get('marriage_certificate_no')), 5, max_width=55)  # S9 Father marriage cert
        ob.text(316.5, 497, fmt_date(_ppr('father').get('marriage_date')), 5)            # S9 Father marriage date
        ob.text(402.5, 496, safe_str(_ppr('father').get('divorce_certificate_no')), 5, max_width=45)  # S9 Father divorce cert
        ob.text(470.5, 494.5, fmt_date(_ppr('father').get('divorce_date')), 5)             # S9 Father divorce date

    if _is_scpr('mother'):
        ob.text(95.5, 508, _fn(_fm('mother')), 6, max_width=95)                         # S9 Mother name
        ob.text(195, 519, safe_str(_ppr('mother').get('marital_status')), 6, max_width=55)  # S9 Mother marital
        ob.text(227, 510.5, safe_str(_ppr('mother').get('marriage_certificate_no')), 5, max_width=55)  # S9 Mother marriage cert
        ob.text(315.5, 512, fmt_date(_ppr('mother').get('marriage_date')), 5)            # S9 Mother marriage date
        ob.text(401.5, 510.5, safe_str(_ppr('mother').get('divorce_certificate_no')), 5, max_width=45)  # S9 Mother divorce cert
        ob.text(469.5, 509.5, fmt_date(_ppr('mother').get('divorce_date')), 5)             # S9 Mother divorce date

    if _is_scpr('step_father'):
        ob.text(95.5, 522, _fn(_fm('step_father')), 6, max_width=95)                    # S9 Step name
        ob.text(195, 534, safe_str(_ppr('step_father').get('marital_status')), 6, max_width=55)  # S9 Step marital
        ob.text(225, 524, safe_str(_ppr('step_father').get('marriage_certificate_no')), 5, max_width=55)  # S9 Step marriage cert
        ob.text(315.5, 526, fmt_date(_ppr('step_father').get('marriage_date')), 5)       # S9 Step marriage date
        ob.text(401.5, 526, safe_str(_ppr('step_father').get('divorce_certificate_no')), 5, max_width=45)  # S9 Step divorce cert
        ob.text(469, 525, fmt_date(_ppr('step_father').get('divorce_date')), 5)        # S9 Step divorce date

    # 下半部 学历/工作表: Father y=623, Mother y=638, Step y=653
    if _is_scpr('father'):
        ob.text(103, 614, safe_str(_ppr('father').get('school_name')), 5, max_width=70)   # S9 Father school
        ob.text(190.5, 613, safe_str(_ppr('father').get('school_country')), 5, max_width=35)  # S9 Father school country
        ob.text(232.5, 614, safe_str(_ppr('father').get('highest_qualification')), 5, max_width=60)  # S9 Father qual
        ob.text(314, 617, safe_str(_ppr('father').get('company_name')), 5, max_width=55)  # S9 Father company
        ob.text(397.5, 614.5, fmt_amount(_ppr('father').get('monthly_income')), 5)         # S9 Father monthly
        ob.text(435, 614, fmt_amount(_ppr('father').get('annual_income')), 5)          # S9 Father annual
        ob.text(507, 615, fmt_amount(_ppr('father').get('avg_monthly_cpf')), 5)        # S9 Father CPF

    if _is_scpr('mother'):
        ob.text(102.5, 631, safe_str(_ppr('mother').get('school_name')), 5, max_width=70)   # S9 Mother school
        ob.text(190.5, 630, safe_str(_ppr('mother').get('school_country')), 5, max_width=35)  # S9 Mother school country
        ob.text(232, 629, safe_str(_ppr('mother').get('highest_qualification')), 5, max_width=60)  # S9 Mother qual
        ob.text(313, 630, safe_str(_ppr('mother').get('company_name')), 5, max_width=55)  # S9 Mother company
        ob.text(397, 630.5, fmt_amount(_ppr('mother').get('monthly_income')), 5)         # S9 Mother monthly
        ob.text(435.5, 630, fmt_amount(_ppr('mother').get('annual_income')), 5)          # S9 Mother annual
        ob.text(508, 630.5, fmt_amount(_ppr('mother').get('avg_monthly_cpf')), 5)        # S9 Mother CPF

    if _is_scpr('step_father'):
        ob.text(103, 645.5, safe_str(_ppr('step_father').get('school_name')), 5, max_width=70)   # S9 Step school
        ob.text(190.5, 644.5, safe_str(_ppr('step_father').get('school_country')), 5, max_width=35)  # S9 Step school country
        ob.text(232, 645.5, safe_str(_ppr('step_father').get('highest_qualification')), 5, max_width=60)  # S9 Step qual
        ob.text(315, 644.5, safe_str(_ppr('step_father').get('company_name')), 5, max_width=55)  # S9 Step company
        ob.text(396.5, 646.5, fmt_amount(_ppr('step_father').get('monthly_income')), 5)    # S9 Step monthly
        ob.text(435.5, 646, fmt_amount(_ppr('step_father').get('annual_income')), 5)     # S9 Step annual
        ob.text(507, 646, fmt_amount(_ppr('step_father').get('avg_monthly_cpf')), 5)   # S9 Step CPF

    # ── 10. Antecedent — checkbox 勾选 Yes 或 No ──
    # 模板中 Yes 在 x≈457, No 在 x≈527
    # Q1 y≈677, Q2 y≈695, Q3 y≈713, Q4 y≈731
    q1 = to_bool(p.get('antecedent_q1'))
    ob.checkbox(455, 677, q1, size=7, style='check')         # Q1 Yes ✓
    ob.checkbox(525, 677, not q1, size=7, style='check')     # Q1 No ✓
    q2 = to_bool(p.get('antecedent_q2'))
    ob.checkbox(455, 695, q2, size=7, style='check')         # Q2 Yes ✓
    ob.checkbox(525, 695, not q2, size=7, style='check')     # Q2 No ✓
    q3 = to_bool(p.get('antecedent_q3'))
    ob.checkbox(455, 713, q3, size=7, style='check')         # Q3 Yes ✓
    ob.checkbox(525, 713, not q3, size=7, style='check')     # Q3 No ✓
    q4 = to_bool(p.get('antecedent_q4'))
    ob.checkbox(455, 731, q4, size=7, style='check')         # Q4 Yes ✓
    ob.checkbox(525, 731, not q4, size=7, style='check')     # Q4 No ✓

    # ══════════════════════════════════════════════════════
    # PAGE 3
    # ══════════════════════════════════════════════════════
    ob.next_page()

    # PDPA opt-out checkbox: "☐ I do not consent..." at top=189.7
    if not to_bool(p.get('pdpa_photo_video')):
        ob.checkbox(19.5, 191, True, size=9)

    # Remarks 区域不填写（模板上有 "Remarks 备注" 标签但无需填入内容）

    # Signatures: "Signature of Student" at top=364.1
    app_sig = sigs.get('applicant', {})
    if app_sig.get('file_id') and upload_dir:
        sig_path = _find_file(upload_dir, app_sig['file_id'])
        if sig_path and os.path.exists(sig_path):
            ob.image(76, 328, sig_path, 100, 35)
    elif app_sig.get('signer_name'):
        # 无签名图片时用文字代替
        ob.text(76, 340, safe_str(app_sig.get('signer_name')), 9)

    gdn_sig = sigs.get('guardian', {})
    if gdn_sig.get('file_id') and upload_dir:
        sig_path = _find_file(upload_dir, gdn_sig['file_id'])
        if sig_path and os.path.exists(sig_path):
            ob.image(247, 325.5, sig_path, 100, 35)
    elif gdn_sig.get('signer_name'):
        ob.text(247, 340, safe_str(gdn_sig.get('signer_name')), 9)

    # Date
    sig_date = app_sig.get('sig_date') or gdn_sig.get('sig_date') or ''
    ob.text(426.5, 340, fmt_date(sig_date), 9)

    # ── 保存并合并 ──
    overlay_buf = ob.save()
    merge_overlay(template_path, overlay_buf, output_path)
    return output_path
