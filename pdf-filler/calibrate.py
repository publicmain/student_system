#!/usr/bin/env python3
"""
calibrate.py v5 — 真实预览 + 拖拽调整 + 代码编辑器 三合一
"""
import http.server, json, os, sys, re, io
import urllib.parse, urllib.request
import fitz, base64, time, tempfile, importlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

PORT = 5566
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL_DIR = os.path.join(BASE, 'templates')
UPL_DIR = os.path.join(BASE, 'uploads')
TPLS = {'SAF':'2026 Student Application Form.pdf','FORM16':'form-16_application-for-stp_fss_kid_pei.pdf','V36':'Form 36_ICA.pdf'}
FILLS = {'SAF':'fill_saf.py','FORM16':'fill_form16.py','V36':'fill_v36.py'}

SAMPLE = {
  'profile':{'course_name':'Diploma in Business Administration','course_code':'DBA-2026','intake_year':'2026','intake_month':'July','study_mode':'Full-time','campus':'Main Campus','school_name':'Equistar International College','commencement_date':'2026-07-15','period_applied_from':'2026-07-15','period_applied_to':'2028-06-30','requires_student_pass':1,'was_ever_sg_citizen_or_pr':0,'surname':'CHEN','given_name':'Wei Ming','chinese_name':'陈伟明','gender':'Male','dob':'2002-03-15','birth_country':'China','birth_city':'Shanghai','birth_province_state':'Shanghai','birth_certificate_no':'310115200203150012','nationality':'Chinese','race':'Chinese','religion':'None','occupation':'Student','marital_status':'Married','alias':None,'passport_type':'Passport','passport_no':'E12345678','passport_issue_date':'2023-05-10','passport_expiry':'2033-05-09','passport_issue_country':'China','foreign_identification_no':'G1234567A','malaysian_id_no':None,'sg_pass_type':'Student Pass','sg_nric_fin':'G1234567A','sg_pass_expiry':'2026-12-31','prior_sg_study':1,'prior_sg_school':'ABC Language School','prior_sg_year':'2024','phone_mobile':'+65-91234567','phone_home':'+86-21-12345678','email':'chenweiming@gmail.com','address_line1':'Blk 123 Clementi Ave 3','address_line2':'#05-678','city':'Singapore','state_province':'Singapore','postal_code':'120123','country_of_residence':'Singapore','sg_address':'Blk 123 Clementi Ave 3 #05-678 S120123','sg_tel_no':'+65-91234567','hometown_address':'200 Nanjing Rd, Shanghai, China','native_language':'Chinese','english_proficiency':'IELTS','ielts_score':'6.5','toefl_score':None,'highest_lang_proficiency':'Intermediate','need_english_placement_test':0,'financial_source':'Parents','annual_income':'120000','applicant_monthly_income':0,'applicant_current_saving':5000,'spouse_monthly_income':0,'spouse_current_saving':3000,'father_monthly_income':15000,'father_current_saving':280000,'mother_monthly_income':8000,'mother_current_saving':120000,'other_financial_support':0,'bank_statement_available':1,'sponsor_name':'Chen Daming','sponsor_relation':'Father','antecedent_q1':0,'antecedent_q2':0,'antecedent_q3':0,'antecedent_q4':0,'antecedent_remarks':None,'pdpa_consent':1,'pdpa_marketing':1,'pdpa_photo_video':1,'f16_declaration_agreed':1,'v36_declaration_agreed':1,'remarks':None},
  'family':[
    {'id':'f1','member_type':'father','surname':'CHEN','given_name':'Daming','sex':'Male','dob':'1970-08-22','nationality':'Chinese','sg_status':'N/A','occupation':'Business Owner','employer':'Chen Trading','email':'chen@163.com','passport_no':'E88881234','contact_number':'+86-139','nric_fin':'','is_alive':1},
    {'id':'f2','member_type':'mother','surname':'LI','given_name':'Xiulan','sex':'Female','dob':'1972-11-03','nationality':'Chinese','sg_status':'N/A','occupation':'Teacher','email':'li@163.com','passport_no':'E88885678','is_alive':1},
    {'id':'f3','member_type':'spouse','surname':'WANG','given_name':'Xiaoli','sex':'Female','dob':'2003-06-20','nationality':'Chinese','sg_status':'DP','occupation':'Homemaker','sg_mobile':'+65-987','passport_no':'E77776543','nric_fin':'G9876543B','is_alive':1},
  ],
  'residence':[{'country':'China','city':'Shanghai','address':'200 Nanjing Rd','date_from':'2002-03-15','date_to':'2024-06-30','purpose':'Residence'},{'country':'Singapore','city':'Singapore','address':'Blk 123 Clementi','date_from':'2024-07-01','date_to':None,'purpose':'Study'}],
  'education':[{'institution_name':'Shanghai Jianping HS','country':'China','state_province':'Shanghai','qualification':'High School','major':'Science','date_from':'2017-09-01','date_to':'2020-06-30','gpa':'85/100','language_of_instruction':'Chinese','educational_cert_no':'SH-12345','obtained_pass_english':1},{'institution_name':'ABC Language School','country':'Singapore','state_province':'Singapore','qualification':'O-Level Prep','date_from':'2024-07-15','date_to':'2025-12-31','language_of_instruction':'English','obtained_pass_english':1}],
  'employment':[{'employer':'Shanghai Tech','country':'China','position':'QA Intern','date_from':'2021-07-01','date_to':'2021-12-31','is_current':0,'reason_left':'Back to studies','nature_of_duties':'Software testing'}],
  'guardian':None,'parentPrAdditional':[],'spousePrAdditional':None,
  'signatures':{'applicant':{'sig_type':'applicant','signer_name':'CHEN Wei Ming','sig_date':'2026-03-20','file_id':None}},
}

def render_pg(path, pg, dpi=150):
    fitz.TOOLS.mupdf_display_errors(False)
    d=fitz.open(path);p=d[pg];pw,ph=p.rect.width,p.rect.height
    pix=p.get_pixmap(matrix=fitz.Matrix(dpi/72,dpi/72))
    b=pix.tobytes("png");iw,ih=pix.width,pix.height;d.close()
    return base64.b64encode(b).decode(),iw,ih,pw,ph

def gen_preview(form):
    import fill_saf,fill_form16,fill_v36
    importlib.reload(fill_saf);importlib.reload(fill_form16);importlib.reload(fill_v36)
    t=os.path.join(TPL_DIR,TPLS.get(form,''))
    if not os.path.exists(t):return None
    tmp=tempfile.NamedTemporaryFile(suffix='.pdf',delete=False,dir=UPL_DIR);tmp.close()
    {'SAF':fill_saf.fill_saf,'FORM16':fill_form16.fill_form16,'V36':fill_v36.fill_v36}[form](SAMPLE,t,tmp.name,upload_dir=UPL_DIR)
    return tmp.name

def _expand_loops(lines):
    """展开 for 循环，把循环内的 ob.text() 变成多行虚拟调用，以便 extract_fields 解析每一行。"""
    expanded = []
    # 1. 扫描所有数组定义: var_name = [n1, n2, n3, ...]
    arrays = {}
    for ln, line in enumerate(lines, 1):
        m = re.match(r'\s+(\w+)\s*=\s*\[([0-9,\s.]+)\]', line)
        if m:
            name = m.group(1)
            vals = [v.strip() for v in m.group(2).split(',') if v.strip()]
            try:
                arrays[name] = [float(v) for v in vals]
            except:
                pass

    # 2. 检测 for 循环并展开
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        # 匹配: for i, var in enumerate(array_name):
        # 或:   for i, var in enumerate(array_name[:N]):
        m_for = re.match(r'\s+for\s+(\w+)\s*,\s*(\w+)\s+in\s+enumerate\((\w+)(?:\[:(\d+)\])?\)\s*:', line)
        if m_for:
            idx_var = m_for.group(1)   # i
            row_var = m_for.group(2)   # sy, ry, ey
            arr_name = m_for.group(3)  # sib_rows, edu_rows...
            limit = int(m_for.group(4)) if m_for.group(4) else None
            arr_vals = arrays.get(arr_name)

            if arr_vals:
                if limit:
                    arr_vals = arr_vals[:limit]
                # 收集循环体（缩进 > for 行的缩进）
                for_indent = len(line) - len(line.lstrip())
                body_lines = []
                j = i + 1
                while j < len(lines):
                    bl = lines[j]
                    if bl.strip() == '' or bl.strip().startswith('#'):
                        j += 1; continue
                    bl_indent = len(bl) - len(bl.lstrip())
                    if bl_indent <= for_indent:
                        break
                    body_lines.append((j + 1, bl))  # (original_line_no, content)
                    j += 1

                # 为数组中每个值展开循环体
                for iter_idx, val in enumerate(arr_vals):
                    for orig_ln, bl in body_lines:
                        # 替换循环变量: sy -> 272, ry -> 198, etc.
                        new_line = bl.replace(f', {row_var},', f', {val},')
                        new_line = new_line.replace(f', {row_var} ', f', {val} ')
                        new_line = new_line.replace(f'({row_var},', f'({val},')
                        # 虚拟行号: 原行号 * 1000 + 迭代索引，用于唯一标识
                        virt_ln = orig_ln * 1000 + iter_idx
                        # 在注释里加上迭代信息
                        cmt = f' # [row {iter_idx+1}]'
                        if '#' in new_line:
                            new_line = new_line.rstrip('\n') + f' R{iter_idx+1}\n'
                        else:
                            new_line = new_line.rstrip('\n') + cmt + '\n'
                        expanded.append((virt_ln, new_line))

                i = j  # 跳过循环体
                continue

        expanded.append((i + 1, line))
        i += 1

    return expanded


def extract_fields(form):
    fp=os.path.join(os.path.dirname(__file__),FILLS.get(form,''))
    if not os.path.exists(fp):return[]
    LOCAL={'nm':'CHEN Wei Ming','full_name':'CHEN WEI MING','fn':'CHEN Wei Ming','gname':'TAN Ah Kow','sg_addr':'Blk 123 Clementi','pname':'CHEN Daming','sig_date':'20/03/2026','full_gname':'TAN Ah Kow','name':'CHEN Wei Ming','fullNameBlock':'CHEN WEI MING'}
    SD={'course_name':'Diploma in Business','commencement_date':'15/07/2026','surname':'CHEN','given_name':'Wei Ming','chinese_name':'陈伟明','gender':'Male','dob':'15/03/2002','birth_certificate_no':'3101152002','nationality':'Chinese','birth_country':'China','birth_province_state':'Shanghai','passport_no':'E12345678','passport_issue_country':'China','passport_issue_date':'10/05/2023','passport_expiry':'09/05/2033','email':'chen@gmail.com','phone_mobile':'+65-9123','race':'Chinese','religion':'None','occupation':'Student','marital_status':'Married','sg_address':'Blk 123 Clementi','hometown_address':'200 Nanjing Rd','school_name':'Equistar Intl College','period_applied_from':'15/07/2026','period_applied_to':'30/06/2028','foreign_identification_no':'G1234567A','applicant_monthly_income':'0','applicant_current_saving':'5,000','father_monthly_income':'15,000','father_current_saving':'280,000','mother_monthly_income':'8,000','mother_current_saving':'120,000','spouse_monthly_income':'0','spouse_current_saving':'3,000','was_ever_sg_citizen_or_pr':'No','sig_date':'20/03/2026'}
    fields=[];pg=0
    with open(fp,'r',encoding='utf-8') as f:
        raw_lines = f.readlines()

    # 展开 for 循环
    expanded = _expand_loops(raw_lines)

    for ln, line in expanded:
            s=line.strip()
            if 'ob.next_page' in s:pg+=1;continue
            for func in['ob.text(','ob.text_centered(','ob.checkbox(','ob.image(','ob.multiline_text(']:
                if func not in s:continue
                idx=s.index(func)+len(func);parts=s[idx:].split(',')
                try:x=float(parts[0].strip());y=float(parts[1].strip())
                except:break
                ft='text'
                if 'checkbox' in func:ft='checkbox'
                elif 'image' in func:ft='image'
                elif 'multiline' in func:ft='multiline'
                pv=''
                if len(parts)>=3:
                    p3=','.join(parts[2:])
                    m=re.search(r"p\.get\(['\"](\w+)['\"]",p3)
                    if m:pv=SD.get(m.group(1),m.group(1))
                    elif re.search(r"\.get\(['\"](\w+)['\"]",p3):
                        m2=re.search(r"\.get\(['\"](\w+)['\"]",p3);pv=SD.get(m2.group(1),m2.group(1)) if m2 else ''
                    if not pv:
                        cl=p3.strip().split(',')[0].split(')')[0].strip()
                        for w in['safe_str(','fmt_date(','fmt_amount(','s(']:
                            if w in cl:cl=cl.split(w)[-1].rstrip(')')
                        pv=LOCAL.get(cl.strip(),'')
                    if not pv and "'" in p3:
                        m5=re.search(r"'([^']+)'",p3)
                        if m5:pv=m5.group(1)[:25]
                if ft=='checkbox':pv='X'
                elif ft=='image':pv='[Photo/Sig]'
                elif not pv:
                    if '#' in line:pv=line.split('#')[-1].strip()[:25]
                    else:pv=f'L{ln}'
                fs=9
                nums=re.findall(r',\s*(\d+)\s*(?:,|\))',s[idx:])
                for n in nums:
                    v=int(n)
                    if 5<=v<=12:fs=v;break
                # 循环展开的字段标记为不可拖拽（行号 > 1000 = 虚拟行）
                is_virtual = ln >= 1000
                fields.append({'id':f'{form}_p{pg}_L{ln}','page':pg,'x':x,'y':y,'type':ft,'preview':str(pv)[:40],'fontSize':fs,'line_no':ln,'original':s[:120],'virtual':is_virtual})
                break
    return fields

def apply_xy(form, changes):
    fp=os.path.join(os.path.dirname(__file__),FILLS.get(form,''))
    if not os.path.exists(fp):return 0
    with open(fp,'r',encoding='utf-8') as f:lines=f.readlines()
    n=0
    for fid,ch in changes.items():
        ln=ch.get('line_no');
        if not ln or ln>len(lines):continue
        old=lines[ln-1]
        m=re.search(r'(ob\.(?:text|text_centered|checkbox|image|multiline_text)\()(\s*[\d.]+\s*),(\s*[\d.]+\s*)(,)',old)
        if m:lines[ln-1]=old[:m.start(2)]+str(ch['x'])+', '+str(ch['y'])+old[m.end(3):];n+=1
    if n:
        with open(fp,'w',encoding='utf-8') as f:f.writelines(lines)
    return n

def read_code(form):
    fp=os.path.join(os.path.dirname(__file__),FILLS.get(form,''))
    if os.path.exists(fp):
        with open(fp,'r',encoding='utf-8') as f:return f.read()
    return ''

def write_code(form,code):
    fp=os.path.join(os.path.dirname(__file__),FILLS.get(form,''))
    with open(fp,'w',encoding='utf-8') as f:f.write(code)

def regen_all():
    try:
        d=json.dumps({'username':'principal','password':'123456'}).encode()
        o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
        o.open(urllib.request.Request('http://localhost:3000/api/auth/login',data=d,headers={'Content-Type':'application/json'}),timeout=10).read()
        ps=json.loads(o.open(urllib.request.Request('http://localhost:3000/api/adm-profiles?status=submitted'),timeout=10).read().decode())
        res=[]
        for p in ps:
            pid=p.get('id');nm=((p.get('surname')or'')+' '+(p.get('given_name')or'')).strip()
            try:o.open(urllib.request.Request(f'http://localhost:3000/api/adm-profiles/{pid}/regenerate-doc',data=b'{}',headers={'Content-Type':'application/json'},method='POST'),timeout=30).read();res.append({'name':nm,'ok':True})
            except Exception as e:res.append({'name':nm,'ok':False,'error':str(e)[:80]})
        time.sleep(5);return res
    except Exception as e:return[{'error':str(e)[:150]}]

# ═══════════════ HTML ═══════════════
HTML = r'''<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><title>PDF Calibrate v5</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;background:#0a0a1a;color:#ddd;display:flex;flex-direction:column;height:100vh;overflow:hidden}
.bar{background:#16213e;padding:4px 10px;display:flex;gap:8px;align-items:center;flex-shrink:0;border-bottom:1px solid #333;flex-wrap:wrap}
.bar select,.bar button{padding:4px 10px;border-radius:4px;border:1px solid #444;background:#0f3460;color:#fff;font-size:11px;cursor:pointer}
.bar button:hover{background:#e94560}
.bar .s{flex:1}
.pnav button{padding:3px 8px;font-size:11px}.pnav button.act{background:#e94560}
.mid{display:flex;flex:1;overflow:hidden;min-height:0}
.pane{flex:1;overflow:auto;position:relative}
.pane .lbl{position:sticky;top:0;z-index:10;background:rgba(15,52,96,.95);padding:3px 8px;font-size:10px;color:#888;border-bottom:1px solid #333}
.left-wrap{position:relative;display:inline-block}
.left-wrap img,.left-wrap canvas{position:absolute;top:0;left:0}
.left-wrap img{z-index:1}.left-wrap canvas{z-index:2;cursor:crosshair}
.bot{height:220px;flex-shrink:0;border-top:2px solid #333;display:flex;flex-direction:column;background:#0f0f1f}
.bot .tb{display:flex;background:#16213e;border-bottom:1px solid #333}
.bot .tb button{padding:3px 12px;border:none;background:transparent;color:#888;font-size:11px;cursor:pointer;border-bottom:2px solid transparent}
.bot .tb button.act{color:#e94560;border-bottom-color:#e94560}
.bot textarea{flex:1;background:#0a0a1a;color:#4ecca3;border:none;padding:6px;font:11px 'Cascadia Code','Consolas',monospace;resize:none;outline:none;tab-size:4}
#info{position:fixed;bottom:228px;left:8px;background:rgba(0,0,0,.9);padding:3px 8px;border-radius:4px;font:11px monospace;color:#4ecca3;z-index:100}
#panel{position:fixed;bottom:228px;right:8px;background:#16213e;border:1px solid #e94560;border-radius:6px;padding:8px 12px;z-index:100;display:none;font-size:11px}
#panel.show{display:block}
#panel h4{color:#e94560;margin-bottom:4px;font-size:12px}
#panel input[type=number]{width:55px;padding:2px 4px;background:#0a0a1a;border:1px solid #444;border-radius:3px;color:#fff;font:11px monospace}
.nb{display:inline-block;padding:1px 6px;background:#16213e;border:1px solid #444;border-radius:3px;color:#fff;cursor:pointer;font-size:13px;margin:1px}
.nb:hover{background:#e94560}
.toast{position:fixed;top:36px;right:10px;background:#4ecca3;color:#000;padding:6px 14px;border-radius:5px;font-size:12px;z-index:200;opacity:0;transition:opacity .3s}.toast.show{opacity:1}
</style></head><body>

<div class="bar">
  <select id="sel" onchange="init(this.value)"><option value="SAF">SAF</option><option value="FORM16">Form 16</option><option value="V36">V36</option></select>
  <div class="pnav" id="pnav"></div>
  <label style="font-size:11px;color:#888"><input type="checkbox" id="showDots" checked onchange="draw()"> Show markers</label>
  <div class="s"></div>
  <button onclick="refreshAll()">&#8635; Refresh Preview</button>
  <button onclick="applyRegen()" style="background:#e94560">&#9654; Apply & Regen All</button>
</div>

<div class="mid">
  <div class="pane" id="pL">
    <div class="lbl">FILLED PREVIEW — drag markers to adjust | Ctrl+click = jump field to cursor</div>
    <div class="left-wrap" id="lw">
      <img id="iL"><canvas id="cv"></canvas>
    </div>
  </div>
  <div class="pane" id="pR">
    <div class="lbl">ORIGINAL TEMPLATE</div>
    <img id="iR" style="width:100%">
  </div>
</div>

<div id="info">-</div>
<div id="panel"><h4 id="pn">-</h4>
  <div><label>X:</label><input type="number" id="px" step="0.5" onchange="setXY()">
  <label>Y:</label><input type="number" id="py" step="0.5" onchange="setXY()"></div>
  <div style="margin-top:3px">
    <span class="nb" onclick="mv(-1,0)">&#9664;</span><span class="nb" onclick="mv(1,0)">&#9654;</span>
    <span class="nb" onclick="mv(0,-1)">&#9650;</span><span class="nb" onclick="mv(0,1)">&#9660;</span>
    &nbsp;<span class="nb" onclick="mv(-5,0)">&#8676;</span><span class="nb" onclick="mv(5,0)">&#8677;</span>
    <span class="nb" onclick="mv(0,-5)">&#8673;</span><span class="nb" onclick="mv(0,5)">&#8675;</span>
  </div>
  <div id="pd" style="color:#666;margin-top:3px;font-size:10px"></div>
</div>

<div class="bot">
  <div class="tb" id="tabs"></div>
  <textarea id="ed" spellcheck="false"></textarea>
</div>
<div class="toast" id="toast"></div>

<script>
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
let F='SAF',PG=0,PC=0,SC=1,fields=[],sel=-1,drag=null,hover=-1,changes={},CODE={},DPI=150;

async function init(f){
  F=f;PG=0;
  const info=await(await fetch('/api/info?form='+f)).json();
  PC=info.page_count;
  fields=await(await fetch('/api/fields?form='+f)).json();
  CODE[f]=CODE[f]||(await(await fetch('/api/code?form='+f)).json()).code;
  document.getElementById('ed').value=CODE[f]||'';
  buildNav();buildTabs();await loadPg(0);
}

async function loadPg(n){
  PG=n;sel=-1;hideP();buildNav();
  const[t,p]=await Promise.all([
    fetch('/api/page?form='+F+'&page='+n+'&type=template').then(r=>r.json()),
    fetch('/api/page?form='+F+'&page='+n+'&type=preview').then(r=>r.json()),
  ]);
  document.getElementById('iR').src='data:image/png;base64,'+t.image;
  const iL=document.getElementById('iL');
  if(p.image){
    iL.src='data:image/png;base64,'+p.image;
    iL.onload=()=>{
      SC=p.img_w/p.pdf_w;
      cv.width=p.img_w;cv.height=p.img_h;
      iL.style.width=p.img_w+'px';iL.style.height=p.img_h+'px';
      document.getElementById('lw').style.width=p.img_w+'px';
      document.getElementById('lw').style.height=p.img_h+'px';
      draw();
    };
  }
  if(p.error)toast('Error: '+p.error);
}

function buildNav(){const e=document.getElementById('pnav');e.innerHTML='';for(let i=0;i<PC;i++){const b=document.createElement('button');b.textContent='P'+(i+1);b.className=i===PG?'act':'';b.onclick=()=>loadPg(i);e.appendChild(b);}}
function buildTabs(){const e=document.getElementById('tabs');e.innerHTML='';['SAF','FORM16','V36'].forEach(f=>{const b=document.createElement('button');b.textContent=f;b.className=f===F?'act':'';b.onclick=()=>{document.getElementById('sel').value=f;init(f);};e.appendChild(b);});}

function fieldBox(f){
  const fs=f.fontSize||9,cw=fs*0.55;
  if(f.type==='checkbox')return{x:f.x,y:f.y,w:10,h:10};
  if(f.type==='image')return{x:f.x,y:f.y,w:80,h:30};
  return{x:f.x,y:f.y,w:Math.max(f.preview.length*cw,20),h:fs*1.2};
}
function hitTest(mx,my){
  let best=-1;
  fields.filter(f=>f.page===PG).forEach(f=>{
    const gi=fields.indexOf(f),b=fieldBox(f);
    if(mx>=b.x-5&&mx<=b.x+b.w+5&&my>=b.y-5&&my<=b.y+b.h+5)best=gi;
  });
  return best;
}

function draw(){
  ctx.clearRect(0,0,cv.width,cv.height);
  if(!document.getElementById('showDots').checked)return;
  const s=SC;
  fields.filter(f=>f.page===PG).forEach(f=>{
    const gi=fields.indexOf(f),sx=f.x*s,sy=f.y*s,isSel=gi===sel,isHov=gi===hover;
    const fs=Math.round((f.fontSize||9)*s*0.7);
    // highlight box
    if(isSel||isHov){
      ctx.save();
      const b=fieldBox(f);
      ctx.strokeStyle=isSel?'#e94560':'rgba(78,204,163,0.6)';
      ctx.lineWidth=isSel?2:1;
      ctx.setLineDash(isSel?[]:[3,2]);
      ctx.strokeRect(b.x*s-2,b.y*s-2,(b.w+4)*s,(b.h+4)*s);
      ctx.setLineDash([]);
      if(isSel){
        ctx.fillStyle='rgba(255,255,200,0.3)';
        ctx.fillRect(b.x*s-2,b.y*s-2,(b.w+4)*s,(b.h+4)*s);
        // crosshair
        ctx.strokeStyle='rgba(233,69,96,0.15)';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(cv.width,sy);ctx.moveTo(sx,0);ctx.lineTo(sx,cv.height);ctx.stroke();
      }
      ctx.restore();
    }
    // small anchor dot at (x,y) origin
    ctx.save();
    ctx.fillStyle=isSel?'#e94560':isHov?'#4ecca3':'rgba(233,69,96,0.5)';
    ctx.beginPath();ctx.arc(sx,sy,isSel?4:2.5,0,Math.PI*2);ctx.fill();
    ctx.restore();
  });
}

// mouse
cv.addEventListener('mousemove',e=>{
  const r=cv.getBoundingClientRect(),mx=(e.clientX-r.left)/SC,my=(e.clientY-r.top)/SC;
  document.getElementById('info').textContent=`PDF: x=${mx.toFixed(1)}, y=${my.toFixed(1)}`;
  if(drag){
    const f=fields[drag.idx];
    f.x=Math.round((mx-drag.ox)*2)/2;f.y=Math.round((my-drag.oy)*2)/2;
    document.getElementById('px').value=f.x;document.getElementById('py').value=f.y;
    changes[f.id]={x:f.x,y:f.y,line_no:f.line_no};
    draw();return;
  }
  const h=hitTest(mx,my);
  if(h!==hover){hover=h;cv.style.cursor=h>=0?'grab':'crosshair';draw();}
});
cv.addEventListener('mousedown',e=>{
  const r=cv.getBoundingClientRect(),mx=(e.clientX-r.left)/SC,my=(e.clientY-r.top)/SC;
  const hit=hitTest(mx,my);
  if(e.ctrlKey&&sel>=0){
    // Ctrl+click: jump selected field to cursor position
    const f=fields[sel];f.x=Math.round(mx*2)/2;f.y=Math.round(my*2)/2;
    document.getElementById('px').value=f.x;document.getElementById('py').value=f.y;
    changes[f.id]={x:f.x,y:f.y,line_no:f.line_no};
    draw();return;
  }
  if(hit>=0){
    sel=hit;const f=fields[hit];
    drag={idx:hit,ox:mx-f.x,oy:my-f.y};cv.style.cursor='grabbing';
    showP(f);draw();
  }else{sel=-1;hideP();draw();}
});
cv.addEventListener('mouseup',()=>{
  if(drag){const f=fields[drag.idx];changes[f.id]={x:f.x,y:f.y,line_no:f.line_no};}
  drag=null;cv.style.cursor=hover>=0?'grab':'crosshair';
});
document.addEventListener('keydown',e=>{
  if(sel<0||document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA')return;
  const st=e.shiftKey?5:1;
  switch(e.key){
    case'ArrowLeft':e.preventDefault();mv(-st,0);break;case'ArrowRight':e.preventDefault();mv(st,0);break;
    case'ArrowUp':e.preventDefault();mv(0,-st);break;case'ArrowDown':e.preventDefault();mv(0,st);break;
    case'Escape':sel=-1;hideP();draw();break;
  }
});

function mv(dx,dy){if(sel<0)return;const f=fields[sel];f.x=Math.round((f.x+dx)*2)/2;f.y=Math.round((f.y+dy)*2)/2;document.getElementById('px').value=f.x;document.getElementById('py').value=f.y;changes[f.id]={x:f.x,y:f.y,line_no:f.line_no};draw();}
function setXY(){if(sel<0)return;const f=fields[sel];f.x=parseFloat(document.getElementById('px').value)||0;f.y=parseFloat(document.getElementById('py').value)||0;changes[f.id]={x:f.x,y:f.y,line_no:f.line_no};draw();}
function showP(f){document.getElementById('panel').classList.add('show');document.getElementById('pn').textContent=f.preview;document.getElementById('px').value=f.x;document.getElementById('py').value=f.y;document.getElementById('pd').textContent='Line '+f.line_no+' | '+f.type;}
function hideP(){document.getElementById('panel').classList.remove('show');}

async function refreshAll(){
  // save drag changes to code file first
  const n=Object.keys(changes).length;
  if(n>0){
    await fetch('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({form:F,changes})});
    changes={};
    // reload code in editor
    CODE[F]=(await(await fetch('/api/code?form='+F)).json()).code;
    document.getElementById('ed').value=CODE[F];
  }
  // also save editor content if user edited manually
  const edCode=document.getElementById('ed').value;
  if(edCode!==CODE[F]){
    CODE[F]=edCode;
    await fetch('/api/code_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({form:F,code:edCode})});
  }
  toast('Generating preview...');
  fields=await(await fetch('/api/fields?form='+F)).json();
  await loadPg(PG);
  toast('Preview updated');
}

async function applyRegen(){
  await refreshAll(); // save everything first
  if(!confirm('Regenerate all student PDFs in main system?'))return;
  toast('Regenerating...');
  const r=await(await fetch('/api/regen',{method:'POST'})).json();
  let msg='';(r.results||[]).forEach(x=>{msg+=(x.ok?'OK ':'FAIL ')+x.name+'\n';});
  toast('Done!');if(msg)alert(msg+'\nRefresh localhost:3000 to download.');
  await loadPg(PG);
}

function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

// sync scroll
const pL=document.getElementById('pL'),pR=document.getElementById('pR');
pL.onscroll=()=>{pR.scrollTop=pL.scrollTop;};pR.onscroll=()=>{pL.scrollTop=pR.scrollTop;};

// editor Tab
document.getElementById('ed').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const t=e.target,s=t.selectionStart;t.value=t.value.substring(0,s)+'    '+t.value.substring(t.selectionEnd);t.selectionStart=t.selectionEnd=s+4;}});

init('SAF');
</script></body></html>'''

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def do_GET(self):
        p=urllib.parse.urlparse(self.path);q=urllib.parse.parse_qs(p.query)
        if p.path in('/','index.html'):self._s(200,'text/html',HTML.encode())
        elif p.path=='/api/info':
            f=q.get('form',['SAF'])[0];t=os.path.join(TPL_DIR,TPLS.get(f,''))
            if os.path.exists(t):
                fitz.TOOLS.mupdf_display_errors(False);d=fitz.open(t);self._j({'page_count':len(d),'pages':[{'width':pg.rect.width,'height':pg.rect.height}for pg in d]});d.close()
            else:self._j({'error':'not found'},404)
        elif p.path=='/api/page':
            f=q.get('form',['SAF'])[0];pg=int(q.get('page',['0'])[0]);tp=q.get('type',['template'])[0]
            if tp=='template':
                t=os.path.join(TPL_DIR,TPLS.get(f,''));
                if os.path.exists(t):b,iw,ih,pw,ph=render_pg(t,pg);self._j({'image':b,'img_w':iw,'img_h':ih,'pdf_w':pw,'pdf_h':ph})
                else:self._j({'error':'not found'},404)
            else:
                try:
                    pp=gen_preview(f)
                    if pp:b,iw,ih,pw,ph=render_pg(pp,pg);os.unlink(pp);self._j({'image':b,'img_w':iw,'img_h':ih,'pdf_w':pw,'pdf_h':ph})
                    else:self._j({'error':'gen failed'})
                except Exception as e:self._j({'error':str(e)[:200]})
        elif p.path=='/api/fields':self._j(extract_fields(q.get('form',['SAF'])[0]))
        elif p.path=='/api/code':self._j({'code':read_code(q.get('form',['SAF'])[0])})
        else:self.send_error(404)
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))) if int(self.headers.get('Content-Length',0))>0 else {}
        if self.path=='/api/apply':
            n=apply_xy(body.get('form'),body.get('changes',{}));self._j({'ok':True,'applied':n})
        elif self.path=='/api/code_save':
            write_code(body['form'],body['code']);self._j({'ok':True})
        elif self.path=='/api/regen':
            self._j({'results':regen_all()})
        else:self.send_error(404)
    def _j(self,d,s=200):self._s(s,'application/json',json.dumps(d,ensure_ascii=False).encode())
    def _s(self,s,c,b):self.send_response(s);self.send_header('Content-Type',c);self.send_header('Content-Length',len(b));self.end_headers();self.wfile.write(b)

if __name__=='__main__':
    if sys.platform=='win32':sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8',errors='replace');sys.stderr=io.TextIOWrapper(sys.stderr.buffer,encoding='utf-8',errors='replace')
    print(f'PDF Calibrate v5 | http://localhost:{PORT}')
    print('Left=Preview+Drag | Right=Template | Bottom=Code Editor')
    s=http.server.HTTPServer(('0.0.0.0',PORT),H)
    try:s.serve_forever()
    except KeyboardInterrupt:s.server_close()
