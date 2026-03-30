"""
fill_form16.py — Form 16 (eForm 16 / IMM16) 模板填充器
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


def fill_form16(data, template_path, output_path, upload_dir=None, font_path=None):
    p = data.get('profile', {})
    family = data.get('family', [])
    residence = data.get('residence', [])
    sigs = data.get('signatures', {})

    ob = OverlayBuilder(612, 792, font_path=font_path)

    # ══════════════════════════════════════════════════════
    # PAGE 1 — PART A
    # ══════════════════════════════════════════════════════

    # Photo (右上角 "PHOTO PREVIEW HERE" 区域)
    if p.get('id_photo') and upload_dir:
        photo_path = _find_file(upload_dir, p['id_photo'])
        if photo_path and os.path.exists(photo_path):
            ob.image(482, 47, photo_path, 80, 95)

    # FIN: label "Foreign Identification No. (FIN)" bottom≈176 → 值 y=182
    ob.text(68, 186, safe_str(p.get('foreign_identification_no') or p.get('sg_nric_fin','')), 9, max_width=270)
    # Malaysian ID: label bottom≈176
    ob.text(359, 182, safe_str(p.get('malaysian_id_no')), 9, max_width=200)

    # Full Name BLOCK LETTERS: label bottom≈213 → 值 y=219
    full_name = f"{safe_str(p.get('surname',''))} {safe_str(p.get('given_name',''))}".strip().upper()
    ob.text(63, 213.5, full_name, 10, bold=True, max_width=280)
    # Alias: 同行 x≈359
    ob.text(361.5, 213, safe_str(p.get('alias')), 9, max_width=90)
    # Birth Cert No: x≈458
    ob.text(458, 219, safe_str(p.get('birth_certificate_no')), 8, max_width=105)

    # Race/Religion/Sex/DOB: label bottom≈242 → 值 y=248
    ob.text(64, 242, safe_str(p.get('race')), 9, max_width=120)
    ob.text(197, 243.5, safe_str(p.get('religion')), 9, max_width=100)
    ob.text(326.5, 241.5, safe_str(p.get('gender')), 9)
    ob.text(409.5, 243.5, fmt_date(p.get('dob')), 9)

    # Email/Nationality/Province/Country: label bottom≈269 → 值 y=275
    ob.text(64, 270, safe_str(p.get('email')), 8, max_width=250)
    ob.text(325, 272.5, safe_str(p.get('nationality')), 8, max_width=75)
    ob.text(410, 271.5, safe_str(p.get('birth_province_state') or p.get('birth_city','')), 7, max_width=60)
    ob.text(481, 271.5, safe_str(p.get('birth_country')), 7, max_width=85)

    # EP/DP Expiry/Occupation/Marital: label bottom≈301 → 值 y=310
    ob.text(68.5, 312, fmt_date(p.get('sg_pass_expiry')), 8)
    ob.text(195, 310, safe_str(p.get('occupation')), 8, max_width=190)
    ob.text(410, 310, safe_str(p.get('marital_status')), 8)

    # Travel Document: label bottom≈340 → 值 y=348
    ob.text(65, 348, safe_str(p.get('passport_type')), 8, max_width=120)
    ob.text(195, 348, safe_str(p.get('passport_no')), 9, max_width=190)
    ob.text(410, 348, fmt_date(p.get('passport_issue_date')), 8)

    # Country of Issue / Expiry: label bottom≈375 → 值 y=382
    ob.text(65, 382, safe_str(p.get('passport_issue_country')), 8, max_width=320)
    ob.text(410, 382, fmt_date(p.get('passport_expiry')), 8)

    # School/Course/Period: label bottom≈410 → 值 y=416
    ob.text(69.5, 411, safe_str(p.get('school_name','Equistar International College')), 8, max_width=120)
    ob.text(198, 412.5, safe_str(p.get('course_name')), 8, max_width=200)
    ob.text(429.5, 410, fmt_date(p.get('period_applied_from')), 8)
    ob.text(487, 412, fmt_date(p.get('period_applied_to')), 8)

    # Parents' Residential Status: label bottom≈437
    # Father/Mother lines
    father = next((m for m in family if m.get('member_type') == 'father'), {})
    mother = next((m for m in family if m.get('member_type') == 'mother'), {})
    ob.text(88.5, 439.5, f"Father:  {safe_str(father.get('sg_status',''))}", 8)
    ob.text(365.5, 443, safe_str(father.get('nric_fin') or father.get('passport_no','')), 8)
    ob.text(87.5, 451.5, f"Mother:  {safe_str(mother.get('sg_status',''))}", 8)
    ob.text(366, 454, safe_str(mother.get('nric_fin') or mother.get('passport_no','')), 8)

    # Residential Address in SG + Tel
    sg_addr = p.get('sg_address') or (p.get('address_line1','') if p.get('country_of_residence') == 'Singapore' else '')
    ob.text(62, 480, safe_str(sg_addr), 7, max_width=380)
    ob.text(413.5, 473.5, safe_str(p.get('sg_tel_no') or p.get('phone_mobile','')), 8, max_width=110)

    # "Have you resided..." YES/NO — "YES/NO" at x=337-364, y≈490
    has_res = len(residence) > 0
    ob.checkbox(339, 487, has_res, size=7, style='check')          # F16 Resided Yes ✓
    ob.checkbox(355, 488, not has_res, size=7, style='check')      # F16 Resided No ✓

    # Residence History table（展开）
    def _r16(i): return residence[i] if i < len(residence) else {}
    ob.text(63.5, 537.5, safe_str(_r16(0).get('country')), 7, max_width=105)    # F16 Res1 country
    ob.text(172, 537, safe_str(_r16(0).get('address')), 7, max_width=230)   # F16 Res1 addr
    ob.text(361.5, 536.5, fmt_date(_r16(0).get('date_from')), 7)                # F16 Res1 from
    ob.text(429.5, 538, fmt_date(_r16(0).get('date_to')) or 'present', 7)     # F16 Res1 to
    ob.text(63, 548.5, safe_str(_r16(1).get('country')), 7, max_width=105)    # F16 Res2 country
    ob.text(172, 547.5, safe_str(_r16(1).get('address')), 7, max_width=230)   # F16 Res2 addr
    ob.text(361.5, 547.5, fmt_date(_r16(1).get('date_from')), 7)                # F16 Res2 from
    ob.text(429, 547.5, fmt_date(_r16(1).get('date_to')) or 'present', 7)     # F16 Res2 to
    ob.text(63.5, 561, safe_str(_r16(2).get('country')), 7, max_width=105)    # F16 Res3 country
    ob.text(171.5, 560, safe_str(_r16(2).get('address')), 7, max_width=230)   # F16 Res3 addr
    ob.text(361.5, 560.5, fmt_date(_r16(2).get('date_from')), 7)                # F16 Res3 from
    ob.text(429, 560.5, fmt_date(_r16(2).get('date_to')) or 'present', 7)     # F16 Res3 to

    # Antecedent Q1-Q4 — "YES/NO" at x=429-457
    # Q1 y≈593, Q2 y≈613, Q3 y≈633, Q4 y≈653
    q1 = to_bool(p.get('antecedent_q1'))
    ob.checkbox(429.5, 588.5, bool(q1), size=7, style='check')        # F16 Ant Q1 Yes ✓
    ob.checkbox(449, 588, not q1, size=7, style='check')           # F16 Ant Q1 No ✓
    q2 = to_bool(p.get('antecedent_q2'))
    ob.checkbox(428.5, 608.5, bool(q2), size=7, style='check')        # F16 Ant Q2 Yes ✓
    ob.checkbox(448.5, 607, not q2, size=7, style='check')           # F16 Ant Q2 No ✓
    q3 = to_bool(p.get('antecedent_q3'))
    ob.checkbox(428, 626.5, bool(q3), size=7, style='check')        # F16 Ant Q3 Yes ✓
    ob.checkbox(447, 625.5, not q3, size=7, style='check')           # F16 Ant Q3 No ✓
    q4 = to_bool(p.get('antecedent_q4'))
    ob.checkbox(428, 646, bool(q4), size=7, style='check')        # F16 Ant Q4 Yes ✓
    ob.checkbox(447, 646, not q4, size=7, style='check')           # F16 Ant Q4 No ✓

    # Antecedent Remarks: label bottom≈755 → 值 y=760
    if p.get('antecedent_remarks'):
        ob.multiline_text(62, 702.5, safe_str(p.get('antecedent_remarks')), font_size=7, max_width=530, max_lines=4)

    # ══════════════════════════════════════════════════════
    # PAGE 2 — PART B: DECLARATION
    # ══════════════════════════════════════════════════════
    ob.next_page(612, 792)

    # Remarks/Explanation
    if p.get('remarks'):
        ob.multiline_text(62.5, 406, safe_str(p.get('remarks')), font_size=8, max_width=530, max_lines=4)

    # "I have read and agreed" checkbox
    ob.checkbox(63.5, 444, to_bool(p.get('f16_declaration_agreed', True)), size=9)

    # Date + Signature: bottom area
    app_sig = sigs.get('applicant', {})
    ob.text(74.5, 470.5, fmt_date(app_sig.get('sig_date')), 9)

    if app_sig.get('file_id') and upload_dir:
        sig_path = _find_file(upload_dir, app_sig['file_id'])
        if sig_path and os.path.exists(sig_path):
            ob.image(313.5, 450, sig_path, 150, 40)

    # ── 保存并合并 ──
    overlay_buf = ob.save()
    merge_overlay(template_path, overlay_buf, output_path)
    return output_path
