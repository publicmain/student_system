"""
fill_v36.py — V36 / Form 36 (eForm V36) 模板填充器
坐标精确校准：基于 pymupdf label_bottom + 4pt
模板尺寸: 612×792 (US Letter), 2 页
"""
from pdf_utils import OverlayBuilder, merge_overlay, fmt_date, fmt_amount, yn, safe_str, to_bool
import os

def _find_file(upload_dir, file_id):
    if not file_id: return None
    direct = os.path.join(upload_dir, file_id)
    if os.path.exists(direct): return direct
    for sub in ['photos','materials','generated','signatures','exchange','case-files']:
        p = os.path.join(upload_dir, sub, file_id)
        if os.path.exists(p): return p
    return direct


def fill_v36(data, template_path, output_path, upload_dir=None, font_path=None):
    p = data.get('profile', {})
    family = data.get('family', [])
    education = data.get('education', [])
    employment = data.get('employment', [])
    sigs = data.get('signatures', {})
    parents_pr = data.get('parentPrAdditional', [])
    spouse_pr = data.get('spousePrAdditional', {}) or {}

    ob = OverlayBuilder(612, 792, font_path=font_path)

    # ══════════════════════════════════════════════════════
    # PAGE 1
    # ══════════════════════════════════════════════════════

    # ── Part A: Parents/Step-Parents（展开4行）──
    def _fm36(mt): return next((m for m in family if m.get('member_type') == mt), {})
    def _fn36(m): return f"{safe_str(m.get('surname'))} {safe_str(m.get('given_name'))}".strip()

    # 表头 bottom≈108, 数据行间距≈12pt: row1=118, row2=130, row3=142, row4=154
    # Father row (y=118)
    ob.text(30, 118, _fn36(_fm36('father')), 7, max_width=100)           # V36A Father name
    ob.text(140, 118, 'Father', 6)                                        # V36A Father rel
    ob.text(208, 118, safe_str(_fm36('father').get('sex','')), 7)          # V36A Father sex
    ob.text(235, 118, fmt_date(_fm36('father').get('dob')), 6)             # V36A Father dob
    ob.text(290, 118, safe_str(_fm36('father').get('nationality')), 6, max_width=65)  # V36A Father nat
    ob.text(370, 118, safe_str(_fm36('father').get('sg_status')), 6, max_width=50)    # V36A Father sg
    ob.text(433, 118, safe_str(_fm36('father').get('occupation')), 6, max_width=50)   # V36A Father occ
    ob.text(490, 118, safe_str(_fm36('father').get('sg_mobile','')), 6, max_width=75) # V36A Father mobile
    # Mother row (y=130)
    ob.text(30, 130, _fn36(_fm36('mother')), 7, max_width=100)           # V36A Mother name
    ob.text(140, 130, 'Mother', 6)                                        # V36A Mother rel
    ob.text(208, 130, safe_str(_fm36('mother').get('sex','')), 7)          # V36A Mother sex
    ob.text(235, 130, fmt_date(_fm36('mother').get('dob')), 6)             # V36A Mother dob
    ob.text(290, 130, safe_str(_fm36('mother').get('nationality')), 6, max_width=65)  # V36A Mother nat
    ob.text(370, 130, safe_str(_fm36('mother').get('sg_status')), 6, max_width=50)    # V36A Mother sg
    ob.text(433, 130, safe_str(_fm36('mother').get('occupation')), 6, max_width=50)   # V36A Mother occ
    ob.text(490, 130, safe_str(_fm36('mother').get('sg_mobile','')), 6, max_width=75) # V36A Mother mobile
    # Step-father row (y=142) — 只在有数据时显示
    _sf = _fm36('step_father')
    if _sf.get('surname'):
        ob.text(30, 142, _fn36(_sf), 7, max_width=100)                      # V36A StepF name
        ob.text(140, 142, 'Step-Father', 6)                                    # V36A StepF rel
        ob.text(208, 142, safe_str(_sf.get('sex','')), 7)                      # V36A StepF sex
        ob.text(235, 142, fmt_date(_sf.get('dob')), 6)                         # V36A StepF dob
        ob.text(290, 142, safe_str(_sf.get('nationality')), 6, max_width=65)   # V36A StepF nat
        ob.text(370, 142, safe_str(_sf.get('sg_status')), 6, max_width=50)     # V36A StepF sg
        ob.text(433, 142, safe_str(_sf.get('occupation')), 6, max_width=50)    # V36A StepF occ
        ob.text(490, 142, safe_str(_sf.get('sg_mobile','')), 6, max_width=75)  # V36A StepF mobile
    # Step-mother row (y=154) — 只在有数据时显示
    _sm = _fm36('step_mother')
    if _sm.get('surname'):
        ob.text(30, 154, _fn36(_sm), 7, max_width=100)                      # V36A StepM name
        ob.text(140, 154, 'Step-Mother', 6)                                    # V36A StepM rel
        ob.text(208, 154, safe_str(_sm.get('sex','')), 7)                      # V36A StepM sex
        ob.text(235, 154, fmt_date(_sm.get('dob')), 6)                         # V36A StepM dob
        ob.text(290, 154, safe_str(_sm.get('nationality')), 6, max_width=65)   # V36A StepM nat
        ob.text(370, 154, safe_str(_sm.get('sg_status')), 6, max_width=50)     # V36A StepM sg
        ob.text(433, 154, safe_str(_sm.get('occupation')), 6, max_width=50)    # V36A StepM occ
        ob.text(490, 154, safe_str(_sm.get('sg_mobile','')), 6, max_width=75)  # V36A StepM mobile

    # ── Part B: Spouse ──
    spouse = next((m for m in family if m.get('member_type') == 'spouse'), None)
    ob.text(30, 217, _fn36(spouse) if spouse else '', 7, max_width=100)    # V36B Spouse name
    ob.text(145, 217, 'Spouse' if spouse else '', 6)                       # V36B Spouse rel
    ob.text(208, 217, safe_str((spouse or {}).get('sex','')), 7)            # V36B Spouse sex
    ob.text(235, 217, fmt_date((spouse or {}).get('dob')), 6)               # V36B Spouse dob
    ob.text(88.5, 439.5, safe_str((spouse or {}).get('nationality')), 6, max_width=65)  # V36B Spouse nat
    ob.text(370, 217, safe_str((spouse or {}).get('sg_status')), 6, max_width=50)    # V36B Spouse sg
    ob.text(87.5, 451.5, safe_str((spouse or {}).get('occupation')), 6, max_width=50)   # V36B Spouse occ
    ob.text(490, 217, safe_str((spouse or {}).get('sg_mobile','')), 6, max_width=75) # V36B Spouse mobile

    # ── Part C: Siblings（展开12行）──
    siblings = [m for m in family if m.get('member_type') == 'sibling']
    def _sib(i): return siblings[i] if i < len(siblings) else {}
    # 表头 bottom≈262, 行间距≈11pt, 12 data rows
    # 行分隔线: 271,282,293,304,315,326,337,348,359,370,381,392,403
    sib_rows = [272, 283, 294, 305, 316, 327, 338, 349, 360, 371, 382, 393]
    for i, sy in enumerate(sib_rows):
        s = _sib(i)
        ob.text(30, sy, _fn36(s), 6, max_width=130)                       # V36C Sib{i+1} name
        ob.text(195, sy, 'Sibling' if s.get('surname') else '', 6, max_width=65)  # V36C Sib{i+1} rel
        ob.text(285, sy, fmt_date(s.get('dob')), 6)                       # V36C Sib{i+1} dob
        ob.text(340, sy, safe_str(s.get('nationality')), 6, max_width=85)  # V36C Sib{i+1} nat
        ob.text(445, sy, safe_str(s.get('sg_status')), 6, max_width=100)   # V36C Sib{i+1} sg

    # ── Part D: Educational Background（展开5行）──
    # 过滤空记录；如果用户勾选了"无信息"则视为空
    _no_edu = to_bool(p.get('no_education_info'))
    _edu_real = [] if _no_edu else [e for e in education if e.get('institution_name')]
    def _ed36(i): return _edu_real[i] if i < len(_edu_real) else {}
    edu_rows = [458, 469, 480, 491, 502]
    for i, ey in enumerate(edu_rows):
        e = _ed36(i)
        ob.text(30, ey, safe_str(e.get('institution_name')), 5, max_width=90)     # V36D Edu{i+1} school
        ob.text(168, ey, safe_str(e.get('country')), 5, max_width=48)             # V36D Edu{i+1} country
        ob.text(228, ey, safe_str(e.get('state_province')), 5, max_width=38)      # V36D Edu{i+1} state
        ob.text(289, ey, safe_str(e.get('language_of_instruction')), 5, max_width=42)  # V36D Edu{i+1} lang
        ob.text(341, ey, fmt_date(e.get('date_from')), 5)                         # V36D Edu{i+1} from
        ob.text(377, ey, fmt_date(e.get('date_to')), 5)                           # V36D Edu{i+1} to
        ob.text(410, ey, safe_str(e.get('qualification')), 5, max_width=82)       # V36D Edu{i+1} qual
        ob.text(505, ey, safe_str(e.get('educational_cert_no')), 5, max_width=65) # V36D Edu{i+1} cert

    # "Obtained a pass in English"
    if len(_edu_real) > 0:
        has_eng = any(to_bool(e.get('obtained_pass_english')) for e in _edu_real)
        ob.checkbox(383.5, 507, has_eng, size=7, style='check')              # V36D English Yes ✓
        ob.checkbox(405, 506.5, not has_eng, size=7, style='check')          # V36D English No ✓
    # "I do not have any information" checkbox for Part D
    if len(_edu_real) == 0:
        ob.checkbox(29, 520, True, size=8)                             # V36D no info ✓

    # ── Part E: Employment History（展开3行）──
    # 过滤空记录；如果用户勾选了"无信息"则视为空
    _no_emp = to_bool(p.get('no_employment_info'))
    _emp_real = [] if _no_emp else [e for e in employment if e.get('employer')]
    def _emp(i): return _emp_real[i] if i < len(_emp_real) else {}
    emp_rows = [585, 597, 609]
    for i, ey in enumerate(emp_rows):
        e = _emp(i)
        ob.text(30, ey, safe_str(e.get('employer')), 6, max_width=130)     # V36E Emp{i+1} company
        ob.text(175, ey, safe_str(e.get('country')), 6, max_width=65)      # V36E Emp{i+1} country
        ob.text(265, ey, fmt_date(e.get('date_from')), 5)                  # V36E Emp{i+1} from
        ob.text(315, ey, fmt_date(e.get('date_to')) if not to_bool(e.get('is_current')) else 'Present', 5)  # V36E Emp{i+1} to
        ob.text(375, ey, safe_str(e.get('position')), 5, max_width=85)     # V36E Emp{i+1} position
        ob.text(480, ey, safe_str(e.get('nature_of_duties')), 5, max_width=100) # V36E Emp{i+1} duties

    # "I do not have any information" checkbox for Part E
    if len(_emp_real) == 0:
        ob.checkbox(29, 618, True, size=8)                             # V36E no info ✓

    # Remarks/Explanation
    if p.get('remarks') or p.get('antecedent_remarks'):
        rmk = safe_str(p.get('antecedent_remarks') or p.get('remarks',''))
        ob.multiline_text(30, 640, rmk, font_size=6, max_width=540, max_lines=2)

    # ══════════════════════════════════════════════════════
    # PAGE 2
    # ══════════════════════════════════════════════════════
    ob.next_page(612, 792)

    # ── Part F: Financial Support ──
    # "Applicant" row: label top≈65.5, "Average Monthly..." at x≈99.7
    # 值在行尾 x≈250 (SGD 金额)
    ob.text(282, 62.5, fmt_amount(p.get('applicant_monthly_income')), 8)     # Applicant income
    ob.text(280.5, 75.5, fmt_amount(p.get('applicant_current_saving')), 8)     # Applicant saving
    ob.text(527.5, 63, fmt_amount(p.get('spouse_monthly_income')), 8)        # Spouse income
    ob.text(527.5, 74.5, fmt_amount(p.get('spouse_current_saving')), 8)        # Spouse saving
    ob.text(280, 88, fmt_amount(p.get('father_monthly_income')), 8)        # Father income
    ob.text(278, 101, fmt_amount(p.get('father_current_saving')), 8)       # Father saving
    ob.text(528.5, 87.5, fmt_amount(p.get('mother_monthly_income')), 8)        # Mother income
    ob.text(526.5, 100.5, fmt_amount(p.get('mother_current_saving')), 8)       # Mother saving

    # Other financial: label top≈113.6
    if to_bool(p.get('other_financial_support')):
        ob.text(50, 130, safe_str(p.get('other_financial_details')), 7, max_width=260)
        ob.text(266.5, 120.5, fmt_amount(p.get('other_financial_amount')), 8)

    # ── Part G: SC/PR Parents Additional（展开成 3 行 × 3 表）──
    def _pprG(mt):
        mem = _fm36(mt)
        if not mem or not mem.get('id'): return {}
        return next((x for x in parents_pr if x.get('family_member_id') == mem.get('id')), {})

    # 婚姻信息表: 5 行 (行线: 191,201,212,222,233)
    # 可填 father/mother/step_father/step_mother + 1 extra
    g_mar_rows = [192, 202, 213, 223, 234]
    g_mar_types = ['father', 'mother', 'step_father', 'step_mother']
    for i, ry in enumerate(g_mar_rows):
        mt = g_mar_types[i] if i < len(g_mar_types) else None
        ppr = _pprG(mt) if mt else {}
        mem = _fm36(mt) if mt else {}
        label = mt.replace('_',' ').title() if mt else ''
        ob.text(80, ry, _fn36(mem), 5, max_width=88)                          # V36G Mar R{i+1} name
        ob.text(181, ry, label, 5)                                              # V36G Mar R{i+1} rel
        ob.text(235, ry, safe_str(ppr.get('marital_status')), 5, max_width=42) # V36G Mar R{i+1} ms
        ob.text(276, ry, safe_str(ppr.get('marriage_certificate_no')), 4, max_width=40) # V36G Mar R{i+1} mcert
        ob.text(322, ry, fmt_date(ppr.get('marriage_date')), 4)                # V36G Mar R{i+1} mdate
        ob.text(379, ry, safe_str(ppr.get('divorce_certificate_no')), 4, max_width=40) # V36G Mar R{i+1} dcert
        ob.text(426, ry, fmt_date(ppr.get('divorce_date')), 4)                # V36G Mar R{i+1} ddate
        ob.text(490, ry, yn(ppr.get('custody_of_applicant')), 5)              # V36G Mar R{i+1} custody

    # 学历表: 5 行 (行线: 289,299,310,320,330)
    sc_pr_parents = [m for m in family if m.get('member_type') in ('father','mother','step_father','step_mother') and m.get('sg_status') in ('SC','PR')]
    if len(sc_pr_parents) == 0:
        ob.checkbox(245, 250, True, size=7)                                    # V36G Edu N.A. ✓
    g_edu_rows = [290, 300, 311, 321, 331]
    for i, ry in enumerate(g_edu_rows):
        mt = g_mar_types[i] if i < len(g_mar_types) else None
        ppr = _pprG(mt) if mt else {}
        mem = _fm36(mt) if mt else {}
        label = mt.replace('_',' ').title() if mt else ''
        ob.text(86, ry, _fn36(mem), 5, max_width=85)                          # V36G Edu R{i+1} name
        ob.text(185, ry, label, 5)                                              # V36G Edu R{i+1} rel
        ob.text(241, ry, safe_str(ppr.get('school_name')), 5, max_width=72)   # V36G Edu R{i+1} school
        ob.text(329, ry, safe_str(ppr.get('school_country')), 5, max_width=45) # V36G Edu R{i+1} country
        ob.text(390, ry, safe_str(ppr.get('highest_qualification')), 4, max_width=78) # V36G Edu R{i+1} qual
        ob.text(481, ry, safe_str(ppr.get('educational_cert_no')), 4, max_width=80) # V36G Edu R{i+1} cert

    # 工作表: 5 行 (行线: 386,397,407,418,429)
    if len(sc_pr_parents) == 0:
        ob.checkbox(248, 350, True, size=7)                                    # V36G Emp N.A. ✓
    g_emp_rows = [387, 398, 408, 419, 430]
    for i, ry in enumerate(g_emp_rows):
        mt = g_mar_types[i] if i < len(g_mar_types) else None
        ppr = _pprG(mt) if mt else {}
        mem = _fm36(mt) if mt else {}
        label = mt.replace('_',' ').title() if mt else ''
        ob.text(83, ry, _fn36(mem), 5, max_width=85)                          # V36G Emp R{i+1} name
        ob.text(187, ry, label, 5)                                              # V36G Emp R{i+1} rel
        ob.text(256, ry, safe_str(ppr.get('company_name')), 5, max_width=75)  # V36G Emp R{i+1} company
        ob.text(324, ry, fmt_amount(ppr.get('monthly_income')), 5)             # V36G Emp R{i+1} monthly
        ob.text(381, ry, fmt_amount(ppr.get('annual_income')), 5)              # V36G Emp R{i+1} annual
        ob.text(465, ry, fmt_amount(ppr.get('avg_monthly_cpf')), 5)            # V36G Emp R{i+1} CPF

    # ── Part H: SC/PR Spouse Additional ──
    sp = spouse_pr or {}
    # "Marriage Certificate No:" y≈467, "Date of Marriage:" y≈467
    ob.text(133, 470, safe_str(sp.get('marriage_certificate_no')), 8)          # V36H Marriage cert no
    ob.text(347, 470, fmt_date(sp.get('marriage_date')), 8)                    # V36H Marriage date

    # Spouse Edu: 2 行 (行线: 521, 531)
    if not sp.get('school_name'):
        ob.checkbox(195, 490, True, size=7)                                    # V36H Edu N.A. ✓
    ob.text(70, 522, safe_str(sp.get('school_name')), 6, max_width=120)       # V36H Edu1 school
    ob.text(218, 522, safe_str(sp.get('school_country')), 6, max_width=80)    # V36H Edu1 country
    ob.text(316, 522, safe_str(sp.get('highest_qualification')), 5, max_width=110) # V36H Edu1 qual
    ob.text(453, 522, safe_str(sp.get('educational_cert_no')), 5, max_width=100) # V36H Edu1 cert
    # Row 2 (spare)
    ob.text(70, 532, '', 6)                                                    # V36H Edu2 school
    ob.text(218, 532, '', 6)                                                   # V36H Edu2 country
    ob.text(316, 532, '', 5)                                                   # V36H Edu2 qual
    ob.text(453, 532, '', 5)                                                   # V36H Edu2 cert

    # Spouse Employment: 2 行 (行线: 586, 597)
    if not sp.get('company_name'):
        ob.checkbox(192.5, 547, True, size=7)                                    # V36H Emp N.A. ✓
    ob.text(75, 587, safe_str(sp.get('company_name')), 6, max_width=110)      # V36H Emp1 company
    ob.text(218, 587, fmt_amount(sp.get('monthly_income')), 6)                 # V36H Emp1 monthly
    ob.text(328, 587, fmt_amount(sp.get('annual_income')), 6)                  # V36H Emp1 annual
    ob.text(460, 587, fmt_amount(sp.get('avg_monthly_cpf')), 6)                # V36H Emp1 CPF
    # Row 2 (spare)
    ob.text(75, 598, '', 6)                                                    # V36H Emp2 company
    ob.text(218, 598, '', 6)                                                   # V36H Emp2 monthly
    ob.text(328, 598, '', 6)                                                   # V36H Emp2 annual
    ob.text(460, 598, '', 6)                                                   # V36H Emp2 CPF

    # ── Part I: Declaration ──
    # Date + Signature at bottom (y≈710)
    app_sig = sigs.get('applicant', {})
    ob.text(236, 492.5, fmt_date(app_sig.get('sig_date')), 9)

    fn = f"{safe_str(p.get('surname',''))} {safe_str(p.get('given_name',''))}".strip()
    ob.text(298.5, 659, fn, 9)

    if app_sig.get('file_id') and upload_dir:
        sig_path = _find_file(upload_dir, app_sig['file_id'])
        if sig_path and os.path.exists(sig_path):
            ob.image(490, 494, sig_path, 150, 35)

    # ── 保存并合并 ──
    overlay_buf = ob.save()
    merge_overlay(template_path, overlay_buf, output_path)
    return output_path
