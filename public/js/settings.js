async function renderSettings() {
  const mc = document.getElementById('main-content');
  mc.innerHTML = `<div class="page-loading"><div class="spinner-border text-primary"></div></div>`;
  try {
    const [settings, templates] = await Promise.all([GET('/api/settings'), GET('/api/templates')]);
    State.settings = settings;
    // Initialize draft from current settings
    State.settingsDraft = {
      ps_questions: JSON.parse(settings.ps_questions || '[]').map(q => ({...q})),
      assessment_types: JSON.parse(settings.assessment_types || '[]').map(t => ({...t})),
      task_categories: [...(JSON.parse(settings.task_categories || '[]'))],
      app_routes: [...(JSON.parse(settings.app_routes || '[]'))],
      app_tiers: [...(JSON.parse(settings.app_tiers || '[]'))],
      subject_levels: [...(JSON.parse(settings.subject_levels || '[]'))],
      exam_boards: [...(JSON.parse(settings.exam_boards || '[]'))],
      subject_list: JSON.parse(settings.subject_list || '[]').map(s => ({...s})),
      // ── 新增设置 draft ──
      intake_case_statuses: [...(JSON.parse(settings.intake_case_statuses || '[]'))],
      visa_document_types: [...(JSON.parse(settings.visa_document_types || '[]'))],
      arrival_checklist: [...(JSON.parse(settings.arrival_checklist || '[]'))],
      commission_rule_types: [...(JSON.parse(settings.commission_rule_types || '[]'))],
      essay_types: [...(JSON.parse(settings.essay_types || '[]'))],
      essay_statuses: [...(JSON.parse(settings.essay_statuses || '[]'))],
      essay_annotation_statuses: [...(JSON.parse(settings.essay_annotation_statuses || '[]'))],
      activity_categories: [...(JSON.parse(settings.activity_categories || '[]'))],
      activity_impact_levels: [...(JSON.parse(settings.activity_impact_levels || '[]'))],
      material_statuses: [...(JSON.parse(settings.material_statuses || '[]'))],
      valid_grade_levels: [...(JSON.parse(settings.valid_grade_levels || '[]'))],
      valid_student_statuses: [...(JSON.parse(settings.valid_student_statuses || '[]'))],
      reference_task_keywords: [...(JSON.parse(settings.reference_task_keywords || '[]'))],
      application_statuses: [...(JSON.parse(settings.application_statuses || '[]'))],
    };

    const tierColors = { '冲刺':'danger','意向':'primary','保底':'success','通用':'secondary' };
    const routeIcons = { 'UK-UG':'🇬🇧','US':'🇺🇸','CA':'🇨🇦','AU':'🇦🇺','SG':'🇸🇬','通用':'🌐' };

    mc.innerHTML = `
    <div class="page-header">
      <h4><i class="bi bi-gear me-2"></i>系统设置</h4>
    </div>
    <div class="settings-layout">
      <div class="settings-nav">
        <div class="nav flex-column nav-pills" id="settings-tabs" role="tablist">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">基础设置</small>
          <a class="nav-link active" href="#stab-appearance" data-bs-toggle="tab"><i class="bi bi-palette me-1"></i>外观与显示</a>
          <a class="nav-link" href="#stab-system" data-bs-toggle="tab"><i class="bi bi-building me-1"></i>系统信息</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">教学配置</small>
          <a class="nav-link" href="#stab-subject" data-bs-toggle="tab"><i class="bi bi-book me-1"></i>选科配置</a>
          <a class="nav-link" href="#stab-assess" data-bs-toggle="tab"><i class="bi bi-clipboard-data me-1"></i>评估类型</a>
          <a class="nav-link" href="#stab-ps" data-bs-toggle="tab"><i class="bi bi-file-earmark-text me-1"></i>个人陈述</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">申请流程</small>
          <a class="nav-link" href="#stab-appconfig" data-bs-toggle="tab"><i class="bi bi-sliders me-1"></i>申请与任务</a>
          <a class="nav-link" href="#stab-tpl" data-bs-toggle="tab"><i class="bi bi-layout-text-sidebar-reverse me-1"></i>时间线模板</a>
          <a class="nav-link" href="#stab-anchors" data-bs-toggle="tab"><i class="bi bi-calendar-event me-1"></i>锚点事件</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">业务模块</small>
          <a class="nav-link" href="#stab-intake" data-bs-toggle="tab"><i class="bi bi-person-plus me-1"></i>入学管理</a>
          <a class="nav-link" href="#stab-visa" data-bs-toggle="tab"><i class="bi bi-airplane me-1"></i>签证与到校</a>
          <a class="nav-link" href="#stab-finance" data-bs-toggle="tab"><i class="bi bi-currency-dollar me-1"></i>财务配置</a>
          <a class="nav-link" href="#stab-admeval" data-bs-toggle="tab"><i class="bi bi-graph-up me-1"></i>录取评估</a>
          <a class="nav-link" href="#stab-essays" data-bs-toggle="tab"><i class="bi bi-pencil-square me-1"></i>文书管理</a>
          <a class="nav-link" href="#stab-activities" data-bs-toggle="tab"><i class="bi bi-trophy me-1"></i>课外活动</a>
          <a class="nav-link" href="#stab-agents" data-bs-toggle="tab"><i class="bi bi-people me-1"></i>代理与佣金</a>
          <a class="nav-link" href="#stab-materials" data-bs-toggle="tab"><i class="bi bi-folder me-1"></i>材料管理</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">数据管理</small>
          <a class="nav-link" href="#stab-students" data-bs-toggle="tab"><i class="bi bi-mortarboard me-1"></i>学生管理</a>
          <a class="nav-link" href="#stab-notifications" data-bs-toggle="tab"><i class="bi bi-megaphone me-1"></i>通知与审计</a>
          <a class="nav-link" href="#stab-escalation" data-bs-toggle="tab"><i class="bi bi-bell me-1"></i>升级政策</a>
          <hr class="my-1">
          <small class="text-muted px-2 py-1 d-block fw-bold" style="font-size:10px;letter-spacing:1px">安全与高级</small>
          <a class="nav-link" href="#stab-security" data-bs-toggle="tab"><i class="bi bi-shield-lock me-1"></i>安全设置</a>
        </div>
      </div>
      <div class="settings-content">
    <div class="tab-content">

      <!-- ── 外观与显示 ── -->
      <div class="tab-pane fade show active" id="stab-appearance">
        <div class="row g-3">
          <!-- 主题模式 -->
          <div class="col-md-6">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-moon-stars me-1 text-primary"></i>主题模式</div>
              <div class="card-body">
                <p class="small text-muted mb-3">选择界面显示风格，深色模式可减少夜间用眼疲劳。</p>
                <div class="d-flex gap-3 flex-wrap">
                  ${[
                    {v:'light', icon:'bi-sun', label:'浅色'},
                    {v:'dark',  icon:'bi-moon', label:'深色'},
                    {v:'auto',  icon:'bi-circle-half', label:'跟随系统'},
                  ].map(t => `
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="pref-theme" id="theme-${t.v}" value="${t.v}" ${(localStorage.getItem('pref_theme')||'light')===t.v?'checked':''} onchange="applyTheme('${t.v}')">
                    <label class="form-check-label" for="theme-${t.v}"><i class="bi ${t.icon} me-1"></i>${t.label}</label>
                  </div>`).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 主题色 -->
          <div class="col-md-6">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-palette me-1 text-primary"></i>主题色</div>
              <div class="card-body">
                <p class="small text-muted mb-3">选择系统主色调，影响按钮、选中状态等主要颜色。</p>
                <div class="d-flex gap-3 flex-wrap align-items-center" id="accent-swatches">
                  ${[
                    {key:'blue',   color:'#2563eb', label:'蓝色'},
                    {key:'green',  color:'#16a34a', label:'绿色'},
                    {key:'purple', color:'#7c3aed', label:'紫色'},
                    {key:'orange', color:'#ea580c', label:'橙色'},
                    {key:'red',    color:'#dc2626', label:'红色'},
                    {key:'teal',   color:'#0d9488', label:'青色'},
                  ].map(c => {
                    const active = (localStorage.getItem('pref_accent')||'blue') === c.key;
                    return `<div class="text-center" style="cursor:pointer" onclick="applyAccent('${c.key}')">
                      <div style="width:36px;height:36px;border-radius:50%;background:${c.color};margin:0 auto;
                        border:3px solid ${active?'#fff':'transparent'};
                        box-shadow:${active?'0 0 0 2px '+c.color:'0 1px 3px rgba(0,0,0,.2)'};"
                        id="swatch-${c.key}"></div>
                      <div class="small text-muted mt-1" style="font-size:11px">${c.label}</div>
                    </div>`;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 字体大小 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-type me-1 text-info"></i>字体大小</div>
              <div class="card-body">
                <select class="form-select" id="pref-fontsize" onchange="applyFontSize(this.value)">
                  <option value="small"  ${(localStorage.getItem('pref_fontsize')||'normal')==='small' ?'selected':''}>小 (12px)</option>
                  <option value="normal" ${(localStorage.getItem('pref_fontsize')||'normal')==='normal'?'selected':''}>标准 (14px)</option>
                  <option value="large"  ${(localStorage.getItem('pref_fontsize')||'normal')==='large' ?'selected':''}>大 (16px)</option>
                </select>
                <div class="form-text mt-2">立即生效，无需刷新。</div>
              </div>
            </div>
          </div>

          <!-- 信息密度 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-layout-three-columns me-1 text-info"></i>信息密度</div>
              <div class="card-body">
                <select class="form-select" id="pref-density" onchange="applyDensity(this.value)">
                  <option value="compact" ${(localStorage.getItem('pref_density')||'normal')==='compact'?'selected':''}>紧凑</option>
                  <option value="normal"  ${(localStorage.getItem('pref_density')||'normal')==='normal' ?'selected':''}>标准</option>
                  <option value="loose"   ${(localStorage.getItem('pref_density')||'normal')==='loose'  ?'selected':''}>宽松</option>
                </select>
                <div class="form-text mt-2">调整表格、卡片间距。</div>
              </div>
            </div>
          </div>

          <!-- 侧边栏默认 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-layout-sidebar me-1 text-info"></i>侧边栏默认状态</div>
              <div class="card-body">
                <select class="form-select" id="pref-sidebar">
                  <option value="expanded" ${(localStorage.getItem('pref_sidebar')||'expanded')==='expanded'?'selected':''}>默认展开</option>
                  <option value="collapsed" ${(localStorage.getItem('pref_sidebar')||'expanded')==='collapsed'?'selected':''}>默认折叠</option>
                </select>
                <div class="form-text mt-2">下次登录时生效。</div>
              </div>
            </div>
          </div>

          <!-- 每页显示条数 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-card-list me-1 text-warning"></i>每页学生条数</div>
              <div class="card-body">
                <select class="form-select" id="pref-pagesize">
                  <option value="10"  ${(localStorage.getItem('pref_pagesize')||'20')==='10' ?'selected':''}>10 条</option>
                  <option value="20"  ${(localStorage.getItem('pref_pagesize')||'20')==='20' ?'selected':''}>20 条</option>
                  <option value="50"  ${(localStorage.getItem('pref_pagesize')||'20')==='50' ?'selected':''}>50 条</option>
                  <option value="100" ${(localStorage.getItem('pref_pagesize')||'20')==='100'?'selected':''}>100 条</option>
                </select>
                <div class="form-text mt-2">学生列表每次加载条数。</div>
              </div>
            </div>
          </div>

          <!-- 逾期预警阈值 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-exclamation-triangle me-1 text-danger"></i>逾期预警提前天数</div>
              <div class="card-body">
                <input type="number" class="form-control" id="cfg-overdue-threshold" min="1" max="30"
                  value="${settings.overdue_threshold_days||7}" placeholder="7">
                <div class="form-text mt-2">距截止日期少于此天数时标为橙色警告。</div>
              </div>
            </div>
          </div>

          <!-- 会话超时提醒 -->
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold"><i class="bi bi-clock-history me-1 text-warning"></i>会话超时提醒</div>
              <div class="card-body">
                <select class="form-select" id="pref-session-warn">
                  <option value="0"   ${(localStorage.getItem('pref_session_warn')||'30')==='0'  ?'selected':''}>关闭</option>
                  <option value="15"  ${(localStorage.getItem('pref_session_warn')||'30')==='15' ?'selected':''}>15 分钟</option>
                  <option value="30"  ${(localStorage.getItem('pref_session_warn')||'30')==='30' ?'selected':''}>30 分钟</option>
                  <option value="60"  ${(localStorage.getItem('pref_session_warn')||'30')==='60' ?'selected':''}>1 小时</option>
                </select>
                <div class="form-text mt-2">无操作多久后弹出提醒。</div>
              </div>
            </div>
          </div>

          <!-- 重置外观 -->
          <div class="col-12 d-flex gap-2">
            <button class="btn btn-primary" onclick="saveAppearanceSettings()"><i class="bi bi-check-lg me-1"></i>保存外观设置</button>
            <button class="btn btn-outline-secondary" onclick="resetAppearanceSettings()"><i class="bi bi-arrow-counterclockwise me-1"></i>恢复默认</button>
          </div>
        </div>
      </div>

      <!-- ── 个人陈述 ── -->
      <div class="tab-pane fade" id="stab-ps">
        <div class="card">
          <div class="card-header fw-semibold">个人陈述表单设置</div>
          <div class="card-body">
            <div class="row g-3 mb-4">
              <div class="col-md-8">
                <label class="form-label fw-semibold">弹窗标题</label>
                <input class="form-control" id="cfg-ps-title" value="${settings.ps_modal_title||''}">
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">总字符数上限</label>
                <input type="number" class="form-control" id="cfg-ps-charlimit" value="${settings.ps_char_limit||4000}">
              </div>
              <div class="col-md-3">
                <label class="form-label fw-semibold">每问最少字符数 <span class="badge bg-danger ms-1">硬校验</span></label>
                <input type="number" class="form-control" id="cfg-ps-minq" value="${settings.ps_min_chars_per_q||350}">
                <div class="form-text">定稿/提交时强制拦截不足问</div>
              </div>
            </div>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="fw-semibold">问题列表 <span class="text-muted fw-normal small ms-1">（可自定义问题数量与内容）</span></div>
              <button class="btn btn-sm btn-outline-primary" onclick="addPSQuestionDraft()"><i class="bi bi-plus me-1"></i>添加问题</button>
            </div>
            <div id="cfg-ps-questions-list" class="border rounded mb-3" style="min-height:60px">
              <!-- rendered by renderPSQuestionsDraft() -->
            </div>
            <button class="btn btn-primary" onclick="savePSSettings()">
              <i class="bi bi-check-lg me-1"></i>保存个人陈述设置
            </button>
          </div>
        </div>
      </div>

      <!-- ── 评估类型 ── -->
      <div class="tab-pane fade" id="stab-assess">
        <div class="card">
          <div class="card-header fw-semibold">入学评估 / 考试类型</div>
          <div class="card-body">
            <div class="alert alert-info small py-2 mb-3">
              <i class="bi bi-info-circle me-1"></i>
              管理"添加入学评估"弹窗中的考试类型，可自定义每种类型的名称、满分分值，以及是否展示分项成绩输入（如雅思 L/R/W/S）。
            </div>
            <div id="cfg-assess-list" class="border rounded mb-3" style="min-height:60px">
              <!-- rendered by renderAssessTypesDraft() -->
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary" onclick="addAssessTypeDraft()"><i class="bi bi-plus me-1"></i>添加类型</button>
              <button class="btn btn-primary" onclick="saveAssessmentTypes()"><i class="bi bi-check-lg me-1"></i>保存评估类型</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 申请与任务配置 ── -->
      <div class="tab-pane fade" id="stab-appconfig">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">申请通道</div>
              <div class="card-body">
                <div id="cfg-routes-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-route-input" placeholder="新通道名称">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('app_routes','cfg-route-input','cfg-routes-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">申请梯度</div>
              <div class="card-body">
                <div id="cfg-tiers-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-tier-input" placeholder="新梯度名称">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('app_tiers','cfg-tier-input','cfg-tiers-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">任务分类</div>
              <div class="card-body">
                <div id="cfg-cats-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-cat-input" placeholder="新分类名称">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('task_categories','cfg-cat-input','cfg-cats-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-12">
            <button class="btn btn-primary" onclick="saveAppConfig()"><i class="bi bi-check-lg me-1"></i>保存申请与任务配置</button>
          </div>
        </div>
      </div>

      <!-- ── 选科配置 ── -->
      <div class="tab-pane fade" id="stab-subject">
        <div class="row g-3">
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">科目级别</div>
              <div class="card-body">
                <div id="cfg-levels-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-level-input" placeholder="新级别（如 IB HL）">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('subject_levels','cfg-level-input','cfg-levels-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold">考试局</div>
              <div class="card-body">
                <div id="cfg-boards-list" class="mb-2"></div>
                <div class="input-group input-group-sm">
                  <input class="form-control" id="cfg-board-input" placeholder="新考试局（如 WJEC）">
                  <button class="btn btn-outline-primary" onclick="addListItemDraft('exam_boards','cfg-board-input','cfg-boards-list')"><i class="bi bi-plus"></i></button>
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card h-100">
              <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
                <span>科目列表</span>
                <button class="btn btn-outline-primary btn-sm" onclick="openSubjectItemModal(-1)"><i class="bi bi-plus"></i></button>
              </div>
              <div class="card-body p-0">
                <div id="cfg-subjlist-list" style="max-height:300px;overflow-y:auto;"></div>
              </div>
            </div>
          </div>
          <div class="col-12">
            <button class="btn btn-primary" onclick="saveSubjectConfig()"><i class="bi bi-check-lg me-1"></i>保存选科配置</button>
          </div>
        </div>
      </div>

      <!-- ── 系统信息 ── -->
      <div class="tab-pane fade" id="stab-system">
        <div class="row g-3">
          <!-- 基本信息 -->
          <div class="col-12">
            <div class="card">
              <div class="card-header fw-semibold"><i class="bi bi-building me-1 text-primary"></i>机构基本信息</div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-5">
                    <label class="form-label fw-semibold">机构 / 学校名称</label>
                    <input class="form-control" id="cfg-school-name" value="${settings.school_name||''}" placeholder="如：XX国际学校">
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">当前学年</label>
                    <input class="form-control" id="cfg-academic-year" value="${settings.academic_year||''}" placeholder="如：2025-2026">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">系统联系邮箱</label>
                    <input type="email" class="form-control" id="cfg-contact-email" value="${settings.contact_email||''}" placeholder="admin@school.com">
                    <div class="form-text">用于系统通知发件地址（预留）</div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">系统时区</label>
                    <select class="form-select" id="cfg-timezone">
                      ${['Asia/Shanghai','Asia/Hong_Kong','Asia/Singapore','Asia/Tokyo','Europe/London','America/New_York','America/Los_Angeles'].map(tz =>
                        `<option ${(settings.timezone||'Asia/Shanghai')===tz?'selected':''}>${tz}</option>`
                      ).join('')}
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label fw-semibold">打印页脚文字</label>
                    <input class="form-control" id="cfg-print-footer" value="${settings.print_footer||''}" placeholder="如：本报告由升学规划系统生成">
                    <div class="form-text">打印时显示在页面底部</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 默认业务参数 -->
          <div class="col-12">
            <div class="card">
              <div class="card-header fw-semibold"><i class="bi bi-sliders2 me-1 text-success"></i>业务默认参数</div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">默认申请年份</label>
                    <input type="number" class="form-control" id="cfg-default-year" value="${settings.default_cycle_year||new Date().getFullYear()+1}" min="2020" max="2035">
                    <div class="form-text">新建申请时的默认 cycle year</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">默认任务优先级</label>
                    <select class="form-select" id="cfg-default-priority">
                      <option value="high"   ${(settings.default_task_priority||'normal')==='high'  ?'selected':''}>高</option>
                      <option value="normal" ${(settings.default_task_priority||'normal')==='normal'?'selected':''}>普通</option>
                      <option value="low"    ${(settings.default_task_priority||'normal')==='low'   ?'selected':''}>低</option>
                    </select>
                    <div class="form-text">新建任务时的初始优先级</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">每位规划师容量上限</label>
                    <input type="number" class="form-control" id="cfg-counselor-cap" value="${settings.counselor_capacity||20}" min="1" max="100">
                    <div class="form-text">超出时仪表盘高亮显示</div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label fw-semibold">材料审核超时天数</label>
                    <input type="number" class="form-control" id="cfg-material-timeout" value="${settings.material_review_days||7}" min="1" max="30">
                    <div class="form-text">提交后超过此天数未审核则预警</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="col-12">
            <button class="btn btn-primary" onclick="saveSystemInfo()"><i class="bi bi-check-lg me-1"></i>保存系统信息</button>
          </div>
        </div>
      </div>

      <!-- ── 时间线模板 ── -->
      <div class="tab-pane fade" id="stab-tpl">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="alert alert-info small py-2 mb-0 flex-grow-1 me-3">
            <i class="bi bi-info-circle me-1"></i>系统内置模板不可编辑，可"复制"后修改。自定义模板可直接编辑和删除。
          </div>
          <button class="btn btn-primary btn-sm" onclick="openTemplateModal()"><i class="bi bi-plus me-1"></i>新建模板</button>
        </div>
        <div class="row g-3">
          ${templates.map(t => {
            const isSystem = !!t.is_system;
            return `
            <div class="col-md-6 col-lg-4">
              <div class="template-card p-3 h-100 d-flex flex-column">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <div class="fw-bold">${routeIcons[t.route]||'📋'} ${t.name}</div>
                    <div class="d-flex gap-1 mt-1">
                      <span class="badge bg-light text-dark border">${t.route||'—'}</span>
                      <span class="badge bg-${tierColors[t.tier]||'secondary'}">${t.tier||'通用'}</span>
                      ${isSystem ? '<span class="badge bg-secondary">系统内置</span>' : '<span class="badge bg-info">自定义</span>'}
                    </div>
                  </div>
                  <span class="badge bg-light text-dark border">${t.item_count} 项任务</span>
                </div>
                ${t.description ? `<p class="small text-muted mb-2">${t.description}</p>` : ''}
                <div class="mt-auto d-flex gap-1 flex-wrap">
                  <button class="btn btn-sm btn-primary" onclick="openApplyTemplateModal('${t.id}')"><i class="bi bi-magic me-1"></i>应用到学生</button>
                  <button class="btn btn-sm btn-outline-secondary" onclick="previewTemplate('${t.id}')"><i class="bi bi-eye me-1"></i>预览</button>
                  ${isSystem
                    ? `<button class="btn btn-sm btn-outline-secondary" onclick="copyTemplate('${t.id}')"><i class="bi bi-copy me-1"></i>复制</button>`
                    : `<button class="btn btn-sm btn-outline-primary" onclick="openTemplateModal('${t.id}')"><i class="bi bi-pencil me-1"></i>编辑</button>
                       <button class="btn btn-sm btn-outline-danger" onclick="deleteTemplateFromSettings('${t.id}','${t.name}')"><i class="bi bi-trash me-1"></i>删除</button>`}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- ── 锚点事件 ── -->
      <div class="tab-pane fade" id="stab-anchors">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-calendar-event me-1 text-primary"></i>日历锚点事件</div>
          <div class="card-body">
            <p class="small text-muted">锚点事件用于模板中"基于考试局结果日"类型任务的日期计算。内置事件自动填充，可添加自定义事件。</p>
            <div id="anchor-events-container"><div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div></div>
            <hr>
            <div class="fw-semibold small mb-2">添加自定义锚点事件</div>
            <div class="row g-2">
              <div class="col-md-3">
                <input class="form-control form-control-sm" id="new-anchor-type" placeholder="锚点类型（如 CIE_Jun）">
              </div>
              <div class="col-md-4">
                <input class="form-control form-control-sm" id="new-anchor-name" placeholder="事件名称">
              </div>
              <div class="col-md-3">
                <input type="date" class="form-control form-control-sm" id="new-anchor-date">
              </div>
              <div class="col-md-2">
                <button class="btn btn-primary btn-sm w-100" onclick="addAnchorEvent()"><i class="bi bi-plus me-1"></i>添加</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 升级政策 ── -->
      <div class="tab-pane fade" id="stab-escalation">
        <div class="card">
          <div class="card-header fw-semibold"><i class="bi bi-bell me-1 text-warning"></i>通知升级政策</div>
          <div class="card-body">
            <p class="small text-muted">设置在任务截止日前后多少天发送通知提醒，以及通知对象角色。</p>
            <div id="escalation-policy-container"><div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div></div></div>
          </div>
        </div>
      </div>

      <!-- ── 入学管理 ── -->
      <div class="tab-pane fade" id="stab-intake">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-person-plus me-1 text-primary"></i>入学案例状态</div>
          <div class="card-body">
            <p class="small text-muted">配置入学案例的可用状态列表。状态机流转规则在下方配置。</p>
            <div id="cfg-intake-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-intake-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('intake_case_statuses','cfg-intake-statuses-input','cfg-intake-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-diagram-3 me-1 text-info"></i>自动任务天数配置</div>
          <div class="card-body">
            <p class="small text-muted">入学案例状态变更时自动创建任务的截止天数。</p>
            <div class="row g-2" id="cfg-intake-auto-tasks">
              ${(() => {
                const at = JSON.parse(settings.intake_auto_tasks || '{}');
                const labels = { collect_docs_days:'收集材料', visa_submit_days:'签证提交', fee_followup_days:'费用跟进', fee_receipt_days:'收据确认', arrival_confirm_days:'到校确认', accommodation_days:'住宿安排', orientation_days:'入学登记', student_pass_days:'学生准证', survey_days:'满意度问卷' };
                return Object.entries(labels).map(([k,l]) =>
                  '<div class="col-md-4"><label class="form-label small">'+escapeHtml(l)+'</label>' +
                  '<input type="number" class="form-control form-control-sm" id="cfg-at-'+k+'" value="'+(at[k]||'')+'" min="1" max="365"></div>').join('');
              })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-clock me-1 text-warning"></i>IPA 提醒天数 & Token 过期</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-6">
                <label class="form-label small">IPA 到期提醒天数（逗号分隔）</label>
                <input type="text" class="form-control form-control-sm" id="cfg-ipa-reminder" value="${(JSON.parse(settings.intake_ipa_reminder_days||'[]')).join(',')}">
              </div>
              <div class="col-md-3">
                <label class="form-label small">材料 Token 有效期（小时）</label>
                <input type="number" class="form-control form-control-sm" id="cfg-mat-token-hours" value="${settings.mat_token_expiry_hours||72}" min="1">
              </div>
              <div class="col-md-3">
                <label class="form-label small">入学年份范围</label>
                <div class="d-flex gap-1">
                  <input type="number" class="form-control form-control-sm" id="cfg-year-min" value="${JSON.parse(settings.intake_year_range||'{}').min||2000}">
                  <span class="align-self-center">-</span>
                  <input type="number" class="form-control form-control-sm" id="cfg-year-max" value="${JSON.parse(settings.intake_year_range||'{}').max||2100}">
                </div>
              </div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveIntakeSettings()"><i class="bi bi-check-lg me-1"></i>保存入学管理设置</button>
      </div>

      <!-- ── 签证与到校 ── -->
      <div class="tab-pane fade" id="stab-visa">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-file-earmark me-1 text-primary"></i>签证材料类型</div>
          <div class="card-body">
            <div id="cfg-visa-docs-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-visa-docs-input" placeholder="新增材料类型...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('visa_document_types','cfg-visa-docs-input','cfg-visa-docs-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-check2-square me-1 text-success"></i>到校清单</div>
          <div class="card-body">
            <div id="cfg-arrival-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-arrival-input" placeholder="新增清单项...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('arrival_checklist','cfg-arrival-input','cfg-arrival-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveVisaSettings()"><i class="bi bi-check-lg me-1"></i>保存签证设置</button>
      </div>

      <!-- ── 财务配置 ── -->
      <div class="tab-pane fade" id="stab-finance">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-currency-dollar me-1 text-success"></i>财务参数</div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-md-4">
                <label class="form-label small">默认货币</label>
                <input type="text" class="form-control form-control-sm" id="cfg-currency" value="${escapeHtml(settings.default_currency||'SGD')}">
              </div>
              <div class="col-md-4">
                <label class="form-label small">佣金百分比上限</label>
                <input type="number" class="form-control form-control-sm" id="cfg-comm-max" value="${settings.commission_percent_max||1.0}" step="0.01" min="0" max="1">
              </div>
              <div class="col-md-4">
                <label class="form-label small">代理 Token 有效期（小时）</label>
                <input type="number" class="form-control form-control-sm" id="cfg-agent-token-hours" value="${settings.agent_token_expiry_hours||72}" min="1">
              </div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-tags me-1 text-info"></i>佣金规则类型</div>
          <div class="card-body">
            <div id="cfg-comm-types-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-comm-types-input" placeholder="新增类型...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('commission_rule_types','cfg-comm-types-input','cfg-comm-types-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveFinanceSettings()"><i class="bi bi-check-lg me-1"></i>保存财务设置</button>
      </div>

      <!-- ── 录取评估 ── -->
      <div class="tab-pane fade" id="stab-admeval">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-1 text-primary"></i>成绩等级转换 (A-Level)</div>
          <div class="card-body">
            <p class="small text-muted">配置 A-Level 等级与数值分数的映射关系。</p>
            <div class="row g-2" id="cfg-grade-alevel">
              ${(() => { const m = JSON.parse(settings.grade_conversion_alevel||'{}'); return Object.entries(m).map(([g,s]) => '<div class="col-auto"><div class="input-group input-group-sm"><span class="input-group-text" style="min-width:36px">'+escapeHtml(g)+'</span><input type="number" class="form-control" style="width:65px" value="'+s+'" data-grade="'+escapeHtml(g)+'"></div></div>').join(''); })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-1 text-info"></i>成绩等级转换 (IB)</div>
          <div class="card-body">
            <div class="row g-2" id="cfg-grade-ib">
              ${(() => { const m = JSON.parse(settings.grade_conversion_ib||'{}'); return Object.entries(m).map(([g,s]) => '<div class="col-auto"><div class="input-group input-group-sm"><span class="input-group-text" style="min-width:36px">'+escapeHtml(g)+'</span><input type="number" class="form-control" style="width:65px" value="'+s+'" data-grade="'+escapeHtml(g)+'"></div></div>').join(''); })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-sliders2 me-1 text-warning"></i>竞争力权重</div>
          <div class="card-body">
            <p class="small text-muted">各维度权重之和建议为 1.0。</p>
            <div class="row g-2">
              ${(() => { const w = JSON.parse(settings.competitiveness_weights||'{}'); const labels = { academic:'学术', language:'语言', activities:'活动', awards:'奖项', leadership:'领导力' }; return Object.entries(labels).map(([k,l]) => '<div class="col-md-2"><label class="form-label small">'+escapeHtml(l)+'</label><input type="number" class="form-control form-control-sm" id="cfg-cw-'+k+'" value="'+(w[k]||0)+'" step="0.05" min="0" max="1"></div>').join(''); })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-calculator me-1 text-danger"></i>录取评分参数</div>
          <div class="card-body">
            <div class="row g-2">
              ${(() => { const s2 = JSON.parse(settings.admission_scoring||'{}'); return '' +
              '<div class="col-md-3"><label class="form-label small">先验概率</label><input type="number" class="form-control form-control-sm" id="cfg-as-prior" value="'+(s2.prior_rate||0.3)+'" step="0.01" min="0" max="1"></div>' +
              '<div class="col-md-3"><label class="form-label small">样本阈值</label><input type="number" class="form-control form-control-sm" id="cfg-as-sample" value="'+(s2.sample_size||30)+'" min="1"></div>' +
              '<div class="col-md-3"><label class="form-label small">低分系数</label><input type="number" class="form-control form-control-sm" id="cfg-as-lowmult" value="'+(s2.low_pass_multiplier||0.6)+'" step="0.1" min="0" max="1"></div>' +
              '<div class="col-md-3"><label class="form-label small">分数因子（逗号）</label><input type="text" class="form-control form-control-sm" id="cfg-as-factors" value="'+(s2.score_factors||[1.8,1.4,1.0,0.7,0.4]).join(',')+'"></div>'; })()}
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-speedometer me-1 text-secondary"></i>默认权重</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-4"><label class="form-label small">学术权重</label><input type="number" class="form-control form-control-sm" id="cfg-dw-academic" value="${settings.default_weight_academic||0.6}" step="0.05" min="0" max="1"></div>
              <div class="col-md-4"><label class="form-label small">语言权重</label><input type="number" class="form-control form-control-sm" id="cfg-dw-language" value="${settings.default_weight_language||0.25}" step="0.05" min="0" max="1"></div>
              <div class="col-md-4"><label class="form-label small">综合权重</label><input type="number" class="form-control form-control-sm" id="cfg-dw-extra" value="${settings.default_weight_extra||0.15}" step="0.05" min="0" max="1"></div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveAdmEvalSettings()"><i class="bi bi-check-lg me-1"></i>保存录取评估设置</button>
      </div>

      <!-- ── 文书管理 ── -->
      <div class="tab-pane fade" id="stab-essays">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-pencil me-1 text-primary"></i>文书类型</div>
          <div class="card-body">
            <div id="cfg-essay-types-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-essay-types-input" placeholder="新增类型...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('essay_types','cfg-essay-types-input','cfg-essay-types-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-list-check me-1 text-info"></i>文书状态</div>
          <div class="card-body">
            <div id="cfg-essay-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-essay-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('essay_statuses','cfg-essay-statuses-input','cfg-essay-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-chat-dots me-1 text-warning"></i>批注状态</div>
          <div class="card-body">
            <div id="cfg-annotation-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-annotation-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('essay_annotation_statuses','cfg-annotation-statuses-input','cfg-annotation-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveEssaySettings()"><i class="bi bi-check-lg me-1"></i>保存文书设置</button>
      </div>

      <!-- ── 课外活动 ── -->
      <div class="tab-pane fade" id="stab-activities">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-trophy me-1 text-warning"></i>活动类别</div>
          <div class="card-body">
            <div id="cfg-act-categories-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-act-categories-input" placeholder="新增类别...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('activity_categories','cfg-act-categories-input','cfg-act-categories-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-star me-1 text-info"></i>影响力级别</div>
          <div class="card-body">
            <div id="cfg-impact-levels-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-impact-levels-input" placeholder="新增级别...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('activity_impact_levels','cfg-impact-levels-input','cfg-impact-levels-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-sliders2 me-1 text-secondary"></i>影响力权重 & 领导力分值</div>
          <div class="card-body">
            <div class="row g-2">
              ${(() => { const iw = JSON.parse(settings.impact_weight_map||'{}'); const labels = { international:'国际', national:'国家', province:'省级', city:'市级', school:'校级' }; return Object.entries(labels).map(([k,l]) => '<div class="col-md-2"><label class="form-label small">'+escapeHtml(l)+'</label><input type="number" class="form-control form-control-sm" id="cfg-iw-'+k+'" value="'+(iw[k]||0)+'" min="0" max="200"></div>').join(''); })()}
              <div class="col-md-2"><label class="form-label small">领导力/项</label><input type="number" class="form-control form-control-sm" id="cfg-leadership-per" value="${settings.leadership_score_per_item||25}" min="1" max="100"></div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveActivitySettings()"><i class="bi bi-check-lg me-1"></i>保存活动设置</button>
      </div>

      <!-- ── 代理与佣金 ── -->
      <div class="tab-pane fade" id="stab-agents">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-people me-1 text-primary"></i>代理请求默认值</div>
          <div class="card-body">
            <div class="row g-2">
              ${(() => { const ad = JSON.parse(settings.agent_request_defaults||'{}'); return '' +
              '<div class="col-md-4"><label class="form-label small">提前提醒天数</label><input type="number" class="form-control form-control-sm" id="cfg-ard-remind" value="'+(ad.remind_days_before||3)+'" min="1"></div>' +
              '<div class="col-md-4"><label class="form-label small">逾期提醒间隔天数</label><input type="number" class="form-control form-control-sm" id="cfg-ard-interval" value="'+(ad.overdue_interval_days||2)+'" min="1"></div>' +
              '<div class="col-md-4"><label class="form-label small">最大逾期提醒次数</label><input type="number" class="form-control form-control-sm" id="cfg-ard-max" value="'+(ad.max_overdue_reminders||5)+'" min="1"></div>'; })()}
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveAgentSettings()"><i class="bi bi-check-lg me-1"></i>保存代理设置</button>
      </div>

      <!-- ── 材料管理 ── -->
      <div class="tab-pane fade" id="stab-materials">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-folder me-1 text-primary"></i>材料状态列表</div>
          <div class="card-body">
            <p class="small text-muted">配置材料的可选状态。第二项（默认"已提交"）用于自动标记提交时间。</p>
            <div id="cfg-mat-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-mat-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('material_statuses','cfg-mat-statuses-input','cfg-mat-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveMaterialSettings()"><i class="bi bi-check-lg me-1"></i>保存材料设置</button>
      </div>

      <!-- ── 学生管理 ── -->
      <div class="tab-pane fade" id="stab-students">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-mortarboard me-1 text-primary"></i>年级列表</div>
          <div class="card-body">
            <div id="cfg-grade-levels-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-grade-levels-input" placeholder="新增年级...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('valid_grade_levels','cfg-grade-levels-input','cfg-grade-levels-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-toggle-on me-1 text-info"></i>学生状态</div>
          <div class="card-body">
            <div id="cfg-student-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-student-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('valid_student_statuses','cfg-student-statuses-input','cfg-student-statuses-list')">添加</button>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-sliders me-1 text-secondary"></i>其他学生参数</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-4"><label class="form-label small">姓名最大长度</label><input type="number" class="form-control form-control-sm" id="cfg-name-maxlen" value="${settings.student_name_max_length||200}" min="10" max="500"></div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-bar-chart me-1 text-warning"></i>成绩排名映射</div>
          <div class="card-body">
            <p class="small text-muted">用于竞争力评估中的成绩排名计算。</p>
            <div class="row g-2" id="cfg-grade-rank">
              ${(() => { const m = JSON.parse(settings.grade_rank_map||'{}'); return Object.entries(m).map(([g,s]) => '<div class="col-auto"><div class="input-group input-group-sm"><span class="input-group-text" style="min-width:36px">'+escapeHtml(g)+'</span><input type="number" class="form-control" style="width:65px" value="'+s+'" data-grade="'+escapeHtml(g)+'"></div></div>').join(''); })()}
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveStudentSettings()"><i class="bi bi-check-lg me-1"></i>保存学生设置</button>
      </div>

      <!-- ── 通知与审计 ── -->
      <div class="tab-pane fade" id="stab-notifications">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-megaphone me-1 text-warning"></i>通知与审计参数</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-3"><label class="form-label small">自动升级超时（小时）</label><input type="number" class="form-control form-control-sm" id="cfg-esc-hours" value="${settings.auto_escalate_overdue_hours||24}" min="1"></div>
              <div class="col-md-3"><label class="form-label small">审计默认查询量</label><input type="number" class="form-control form-control-sm" id="cfg-audit-default" value="${settings.audit_query_default_limit||200}" min="10"></div>
              <div class="col-md-3"><label class="form-label small">审计最大查询量</label><input type="number" class="form-control form-control-sm" id="cfg-audit-max" value="${settings.audit_query_max_limit||1000}" min="100"></div>
              <div class="col-md-3"><label class="form-label small">审计导出上限</label><input type="number" class="form-control form-control-sm" id="cfg-audit-export" value="${settings.audit_export_max_records||5000}" min="100"></div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveNotificationSettings()"><i class="bi bi-check-lg me-1"></i>保存通知设置</button>
      </div>

      <!-- ── 安全设置 ── -->
      <div class="tab-pane fade" id="stab-security">
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-shield-lock me-1 text-danger"></i>安全与系统参数</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-3"><label class="form-label small">密码最小长度</label><input type="number" class="form-control form-control-sm" id="cfg-pwd-min" value="${settings.password_min_length||6}" min="4" max="32"></div>
              <div class="col-md-3"><label class="form-label small">密码最大长度</label><input type="number" class="form-control form-control-sm" id="cfg-pwd-max" value="${settings.password_max_length||128}" min="32" max="256"></div>
              <div class="col-md-3"><label class="form-label small">Toast 延迟 (ms)</label><input type="number" class="form-control form-control-sm" id="cfg-toast-delay" value="${settings.toast_delay_ms||3000}" min="500" max="10000"></div>
              <div class="col-md-3"><label class="form-label small">批量评估上限</label><input type="number" class="form-control form-control-sm" id="cfg-batch-max" value="${settings.max_batch_programs||50}" min="5" max="200"></div>
            </div>
            <div class="row g-2 mt-2">
              <div class="col-md-4"><label class="form-label small">默认时区</label><input type="text" class="form-control form-control-sm" id="cfg-default-tz" value="${escapeHtml(settings.default_timezone||'Europe/London')}"></div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-signpost-2 me-1 text-info"></i>申请管理默认值</div>
          <div class="card-body">
            <div class="row g-2">
              <div class="col-md-3"><label class="form-label small">默认申请路线</label><input type="text" class="form-control form-control-sm" id="cfg-def-route" value="${escapeHtml(settings.default_application_route||'UK-UG')}"></div>
              <div class="col-md-3"><label class="form-label small">默认成绩类型</label><input type="text" class="form-control form-control-sm" id="cfg-def-grade-type" value="${escapeHtml(settings.default_grade_type_used||'Predicted')}"></div>
              <div class="col-md-3"><label class="form-label small">默认申请状态</label><input type="text" class="form-control form-control-sm" id="cfg-def-app-status" value="${escapeHtml(settings.default_application_status||'Pending')}"></div>
            </div>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header fw-semibold"><i class="bi bi-tags me-1 text-secondary"></i>申请状态列表 & 推荐信关键词</div>
          <div class="card-body">
            <p class="small text-muted mb-2">申请状态</p>
            <div id="cfg-app-statuses-list" class="mb-2"></div>
            <div class="input-group input-group-sm mb-3" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-app-statuses-input" placeholder="新增状态...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('application_statuses','cfg-app-statuses-input','cfg-app-statuses-list')">添加</button>
            </div>
            <p class="small text-muted mb-2">推荐信关键词（用于 UCAS 提交检查）</p>
            <div id="cfg-ref-keywords-list" class="mb-2"></div>
            <div class="input-group input-group-sm" style="max-width:300px">
              <input type="text" class="form-control" id="cfg-ref-keywords-input" placeholder="新增关键词...">
              <button class="btn btn-outline-primary" onclick="addListItemDraft('reference_task_keywords','cfg-ref-keywords-input','cfg-ref-keywords-list')">添加</button>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="saveSecuritySettings()"><i class="bi bi-check-lg me-1"></i>保存安全与高级设置</button>
      </div>

    </div>
      </div>
    </div>`;

    // Render draft editors
    renderPSQuestionsDraft();
    renderAssessTypesDraft();
    renderListDraft('app_routes', 'cfg-routes-list');
    renderListDraft('app_tiers', 'cfg-tiers-list');
    renderListDraft('task_categories', 'cfg-cats-list');
    renderListDraft('subject_levels', 'cfg-levels-list');
    renderListDraft('exam_boards', 'cfg-boards-list');
    renderSubjectListDraft();

    // ── 新增 tab 的列表 draft 渲染 ──
    renderListDraft('intake_case_statuses', 'cfg-intake-statuses-list');
    renderListDraft('visa_document_types', 'cfg-visa-docs-list');
    renderListDraft('arrival_checklist', 'cfg-arrival-list');
    renderListDraft('commission_rule_types', 'cfg-comm-types-list');
    renderListDraft('essay_types', 'cfg-essay-types-list');
    renderListDraft('essay_statuses', 'cfg-essay-statuses-list');
    renderListDraft('essay_annotation_statuses', 'cfg-annotation-statuses-list');
    renderListDraft('activity_categories', 'cfg-act-categories-list');
    renderListDraft('activity_impact_levels', 'cfg-impact-levels-list');
    renderListDraft('material_statuses', 'cfg-mat-statuses-list');
    renderListDraft('valid_grade_levels', 'cfg-grade-levels-list');
    renderListDraft('valid_student_statuses', 'cfg-student-statuses-list');
    renderListDraft('application_statuses', 'cfg-app-statuses-list');
    renderListDraft('reference_task_keywords', 'cfg-ref-keywords-list');

    // Load anchor events and escalation policy on tab activation
    const anchorsTab = document.querySelector('a[href="#stab-anchors"]');
    if (anchorsTab) anchorsTab.addEventListener('shown.bs.tab', renderAnchorEventsList, { once: false });
    const escalTab = document.querySelector('a[href="#stab-escalation"]');
    if (escalTab) escalTab.addEventListener('shown.bs.tab', loadEscalationPolicy, { once: false });

    // ── BUG-M04: Counselor 只读模式 ──
    if (State.user && State.user.role === 'counselor') {
      const settingsArea = mc.querySelector('.settings-layout');
      if (settingsArea) {
        function _applyReadOnly(root) {
          root.querySelectorAll('button[onclick*="save"], button[onclick*="Save"]').forEach(btn => btn.style.display = 'none');
          root.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
          root.querySelectorAll('button[onclick*="add"], button[onclick*="remove"], button[onclick*="Add"], button[onclick*="Remove"], button[onclick*="delete"], button[onclick*="Delete"]').forEach(btn => btn.style.display = 'none');
        }
        _applyReadOnly(settingsArea);
        // 监听动态加载的内容（如升级策略 tab）
        new MutationObserver(() => _applyReadOnly(settingsArea)).observe(settingsArea, { childList: true, subtree: true });
        // 添加只读提示
        const header = mc.querySelector('.page-header');
        if (header) header.insertAdjacentHTML('afterend', '<div class="alert alert-info py-2 mb-3"><i class="bi bi-eye me-1"></i>当前为只读模式，仅校长可修改系统设置</div>');
      }
    }

  } catch(e) {
    mc.innerHTML = errorWithRetry(e.message, "navigate('"+State.currentPage+"')");
  }
}

// ── PS问题草稿编辑器 ──
function renderPSQuestionsDraft() {
  const el = document.getElementById('cfg-ps-questions-list');
  if (!el) return;
  const qs = State.settingsDraft.ps_questions || [];
  if (qs.length === 0) {
    el.innerHTML = '<div class="text-center text-muted py-3 small">暂无问题，点击"添加问题"</div>';
    return;
  }
  el.innerHTML = qs.map((q, i) => `
    <div class="p-2 border-bottom" style="background:${i%2===0?'#fafafa':'#fff'}">
      <div class="d-flex align-items-start gap-2">
        <div class="d-flex flex-column gap-1 pt-1">
          <button class="btn btn-link btn-sm p-0 text-muted" onclick="movePSQuestion(${i},-1)" ${i===0?'disabled':''}><i class="bi bi-chevron-up"></i></button>
          <button class="btn btn-link btn-sm p-0 text-muted" onclick="movePSQuestion(${i},1)" ${i===qs.length-1?'disabled':''}><i class="bi bi-chevron-down"></i></button>
        </div>
        <div class="flex-grow-1">
          <div class="row g-2">
            <div class="col-md-6">
              <label class="form-label mb-1 small text-muted">问题标签</label>
              <input class="form-control form-control-sm" id="cfg-pslabel-${i}" value="${escapeHtml(q.label||'')}" placeholder="问题标签...">
            </div>
            <div class="col-md-6">
              <label class="form-label mb-1 small text-muted">占位提示（placeholder）</label>
              <input class="form-control form-control-sm" id="cfg-pshint-${i}" value="${escapeHtml(q.hint||'')}" placeholder="输入框提示文字...">
            </div>
          </div>
        </div>
        <button class="btn btn-link btn-sm p-0 text-danger mt-1" onclick="removePSQuestion(${i})"><i class="bi bi-trash"></i></button>
      </div>
    </div>`).join('');
}

function addPSQuestionDraft() {
  if (!State.settingsDraft.ps_questions) State.settingsDraft.ps_questions = [];
  State.settingsDraft.ps_questions.push({ label: `第${State.settingsDraft.ps_questions.length+1}问：`, hint: '' });
  renderPSQuestionsDraft();
}

function removePSQuestion(idx) {
  State.settingsDraft.ps_questions.splice(idx, 1);
  renderPSQuestionsDraft();
}

function movePSQuestion(idx, dir) {
  const arr = State.settingsDraft.ps_questions;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  renderPSQuestionsDraft();
}

async function savePSSettings() {
  if (!acquireSubmit('savePSSettings')) return;
  // Read current label/hint values from DOM into draft
  const qs = State.settingsDraft.ps_questions || [];
  qs.forEach((q, i) => {
    const labelEl = document.getElementById(`cfg-pslabel-${i}`);
    const hintEl = document.getElementById(`cfg-pshint-${i}`);
    if (labelEl) q.label = labelEl.value;
    if (hintEl) q.hint = hintEl.value;
  });
  try {
    await PUT('/api/settings/ps_modal_title', { value: document.getElementById('cfg-ps-title')?.value || '' });
    await PUT('/api/settings/ps_char_limit', { value: document.getElementById('cfg-ps-charlimit')?.value || '4000' });
    await PUT('/api/settings/ps_min_chars_per_q', { value: document.getElementById('cfg-ps-minq')?.value || '350' });
    await PUT('/api/settings/ps_questions', { value: JSON.stringify(qs) });
    State.settings = await GET('/api/settings');
    showSuccess('个人陈述设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('savePSSettings'); }
}

// ── 评估类型草稿编辑器 ──
function renderAssessTypesDraft() {
  const el = document.getElementById('cfg-assess-list');
  if (!el) return;
  const types = State.settingsDraft.assessment_types || [];
  if (types.length === 0) {
    el.innerHTML = '<div class="text-center text-muted py-3 small">暂无评估类型</div>';
    return;
  }
  el.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm mb-0">
        <thead class="table-light"><tr>
          <th>评估名称</th><th style="width:100px">满分</th><th style="width:120px">分项成绩</th><th style="width:60px">操作</th>
        </tr></thead>
        <tbody>
          ${types.map((t,i) => `<tr>
            <td><input class="form-control form-control-sm" id="cfg-aname-${i}" value="${escapeHtml(t.name||'')}"></td>
            <td><input type="number" class="form-control form-control-sm" id="cfg-amax-${i}" value="${t.max||100}"></td>
            <td class="text-center align-middle">
              <div class="form-check form-switch d-inline-block">
                <input class="form-check-input" type="checkbox" id="cfg-asubs-${i}" ${t.subs?'checked':''}>
                <label class="form-check-label small" for="cfg-asubs-${i}">启用</label>
              </div>
            </td>
            <td><button class="btn btn-link btn-sm p-0 text-danger" onclick="removeAssessTypeDraft(${i})"><i class="bi bi-trash"></i></button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function addAssessTypeDraft() {
  if (!State.settingsDraft.assessment_types) State.settingsDraft.assessment_types = [];
  State.settingsDraft.assessment_types.push({ name: '新类型', max: 100, subs: false });
  renderAssessTypesDraft();
}

function removeAssessTypeDraft(idx) {
  State.settingsDraft.assessment_types.splice(idx, 1);
  renderAssessTypesDraft();
}

async function saveAssessmentTypes() {
  if (!acquireSubmit('saveAssessmentTypes')) return;
  const types = State.settingsDraft.assessment_types || [];
  types.forEach((t, i) => {
    const nEl = document.getElementById(`cfg-aname-${i}`);
    const mEl = document.getElementById(`cfg-amax-${i}`);
    const sEl = document.getElementById(`cfg-asubs-${i}`);
    if (nEl) t.name = nEl.value;
    if (mEl) t.max = parseFloat(mEl.value) || 100;
    if (sEl) t.subs = sEl.checked;
  });
  try {
    await PUT('/api/settings/assessment_types', { value: JSON.stringify(types) });
    State.settings = await GET('/api/settings');
    showSuccess('评估类型已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAssessmentTypes'); }
}

// ── 通用列表草稿编辑器 ──
function renderListDraft(key, elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const arr = State.settingsDraft[key] || [];
  el.innerHTML = arr.map((item, i) => `
    <span class="badge bg-light text-dark border me-1 mb-1 d-inline-flex align-items-center gap-1" style="font-size:13px;padding:6px 8px">
      ${escapeHtml(item)}
      <button class="btn btn-link p-0 text-danger" style="line-height:1;font-size:14px" onclick="removeListItemDraft('${key}',${i},'${elId}')">×</button>
    </span>`).join('');
}

function addListItemDraft(key, inputId, elId) {
  const input = document.getElementById(inputId);
  const val = input?.value.trim();
  if (!val) return;
  if (!State.settingsDraft[key]) State.settingsDraft[key] = [];
  if (!State.settingsDraft[key].includes(val)) {
    State.settingsDraft[key].push(val);
    renderListDraft(key, elId);
  }
  if (input) input.value = '';
}

function removeListItemDraft(key, idx, elId) {
  State.settingsDraft[key]?.splice(idx, 1);
  renderListDraft(key, elId);
}

async function saveAppConfig() {
  if (!acquireSubmit('saveAppConfig')) return;
  try {
    await PUT('/api/settings/app_routes', { value: JSON.stringify(State.settingsDraft.app_routes || []) });
    await PUT('/api/settings/app_tiers', { value: JSON.stringify(State.settingsDraft.app_tiers || []) });
    await PUT('/api/settings/task_categories', { value: JSON.stringify(State.settingsDraft.task_categories || []) });
    State.settings = await GET('/api/settings');
    showSuccess('申请与任务配置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAppConfig'); }
}

// ── 科目列表草稿编辑器 ──
function renderSubjectListDraft() {
  const el = document.getElementById('cfg-subjlist-list');
  if (!el) return;
  const arr = State.settingsDraft.subject_list || [];
  el.innerHTML = arr.length === 0
    ? '<p class="text-muted small p-2 mb-0">暂无科目</p>'
    : arr.map((s, i) => `
      <div class="d-flex align-items-center justify-content-between px-2 py-1 border-bottom">
        <span class="small"><span class="badge bg-secondary me-1">${s.code}</span>${s.name}</span>
        <div class="d-flex gap-1">
          <button class="btn btn-link btn-sm p-0 text-primary" onclick="openSubjectItemModal(${i})" title="编辑"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-link btn-sm p-0 text-danger" onclick="removeSubjectItem(${i})" title="删除"><i class="bi bi-trash"></i></button>
        </div>
      </div>`).join('');
}

function openSubjectItemModal(idx) {
  const item = idx >= 0 ? (State.settingsDraft.subject_list || [])[idx] : null;
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('subject-item-modal'));
  document.getElementById('subj-item-idx').value = idx;
  document.getElementById('subj-item-code').value = item ? item.code : '';
  document.getElementById('subj-item-name').value = item ? item.name : '';
  modal.show();
}

function saveSubjectItem() {
  const idx = parseInt(document.getElementById('subj-item-idx').value);
  const code = document.getElementById('subj-item-code').value.trim().toUpperCase();
  const name = document.getElementById('subj-item-name').value.trim();
  if (!code || !name) { showError('科目代码和名称不能为空'); return; }
  if (!State.settingsDraft.subject_list) State.settingsDraft.subject_list = [];
  if (idx >= 0) {
    State.settingsDraft.subject_list[idx] = { code, name };
  } else {
    State.settingsDraft.subject_list.push({ code, name });
  }
  bootstrap.Modal.getInstance(document.getElementById('subject-item-modal')).hide();
  renderSubjectListDraft();
}

function removeSubjectItem(idx) {
  State.settingsDraft.subject_list?.splice(idx, 1);
  renderSubjectListDraft();
}

async function saveSubjectConfig() {
  if (!acquireSubmit('saveSubjectConfig')) return;
  try {
    await PUT('/api/settings/subject_levels', { value: JSON.stringify(State.settingsDraft.subject_levels || []) });
    await PUT('/api/settings/exam_boards',    { value: JSON.stringify(State.settingsDraft.exam_boards || []) });
    await PUT('/api/settings/subject_list',   { value: JSON.stringify(State.settingsDraft.subject_list || []) });
    State.settings = await GET('/api/settings');
    showSuccess('选科配置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveSubjectConfig'); }
}

// ════════════════════════════════════════════════════════
//  监护人同意模块
// ════════════════════════════════════════════════════════

function isUnder14(dob) {
  if (!dob) return false;
  const birth = new Date(dob);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear() -
    (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate()) ? 1 : 0);
  return age < 14;
}

async function loadConsentHistory(studentId) {
  const histEl = document.getElementById('consent-history-list');
  if (!histEl) return;
  histEl.innerHTML = '<p class="text-muted small">加载中...</p>';
  try {
    const records = await GET(`/api/students/${studentId}/consents`);
    if (records.length === 0) {
      histEl.innerHTML = '<p class="text-muted small">暂无同意记录</p>';
    } else {
      histEl.innerHTML = `<div class="fw-semibold small mb-2">历史记录</div>` + records.map(r => {
        const scope = (() => { try { return JSON.parse(r.consent_scope||'[]'); } catch(e) { return []; } })();
        return `<div class="d-flex justify-content-between align-items-start border rounded p-2 mb-2 ${r.consented ? 'border-success' : 'border-danger bg-danger bg-opacity-5'}">
          <div>
            <span class="badge ${r.consented ? 'bg-success' : 'bg-danger'} me-2">${r.consented ? '有效' : '已撤回'}</span>
            <strong>${r.guardian_name}</strong>（${r.relation||''}）v${r.consent_version}
            <div class="small text-muted mt-1">同意日期：${r.consent_date} | 范围：${scope.join('、') || '未指定'}</div>
            ${r.revoke_date ? `<div class="small text-danger">撤回于：${r.revoke_date.split('T')[0]} — ${r.revoke_reason||''}</div>` : ''}
          </div>
          ${r.consented ? `<button class="btn btn-sm btn-outline-danger ms-2" onclick="revokeConsent('${r.id}')">撤回</button>` : ''}
        </div>`;
      }).join('');
    }
  } catch(e) { histEl.innerHTML = `<p class="text-danger small">${escapeHtml(e.message)}</p>`; }
}

async function openConsentModal(studentId) {
  document.getElementById('consent-student-id').value = studentId;
  document.getElementById('consent-guardian-name').value = '';
  document.getElementById('consent-relation').value = '父';
  document.getElementById('consent-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('consent-version').value = '1.0';
  document.querySelectorAll('.consent-scope').forEach(cb => { cb.checked = ['data_storage','counseling'].includes(cb.value); });

  bootstrap.Modal.getOrCreateInstance(document.getElementById('consent-modal')).show();
  loadConsentHistory(studentId);
}

async function saveConsent() {
  if (!acquireSubmit('saveConsent')) return;
  const studentId = document.getElementById('consent-student-id').value;
  const scope = [...document.querySelectorAll('.consent-scope:checked')].map(cb => cb.value);
  const body = {
    guardian_name: document.getElementById('consent-guardian-name').value.trim(),
    relation: document.getElementById('consent-relation').value,
    consent_date: document.getElementById('consent-date').value,
    consent_version: document.getElementById('consent-version').value || '1.0',
    consent_scope: scope,
    consented: true,
  };
  if (!body.guardian_name || !body.consent_date) { releaseSubmit('saveConsent'); showError('监护人姓名和同意日期必填'); return; }
  try {
    await POST(`/api/students/${studentId}/consents`, body);
    showSuccess('同意记录已保存');
    document.getElementById('consent-guardian-name').value = '';
    loadConsentHistory(studentId); // 只刷新历史，不重新打开模态框
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveConsent'); }
}

function revokeConsent(consentId) {
  // Use confirmAction with inline reason input instead of window.prompt
  const wrapperId = 'revoke-reason-wrap';
  confirmAction(
    `确认撤回此同意记录？<br><div class="mt-2"><label class="form-label small">撤回原因（可选）</label><input class="form-control form-control-sm" id="${wrapperId}" placeholder="请输入撤回原因..."></div>`,
    async () => {
      const reason = document.getElementById(wrapperId)?.value || '';
      try {
        await PUT(`/api/consents/${consentId}/revoke`, { revoke_reason: reason });
        showSuccess('同意已撤回');
        const sid = document.getElementById('consent-student-id').value;
        loadConsentHistory(sid);
      } catch(e) { showError(e.message); }
    }
  );
}

// ════════════════════════════════════════════════════════
//  考试记录 (ExamSitting)
// ════════════════════════════════════════════════════════
async function loadExamSittings(studentId) {
  const container = document.getElementById('exam-sittings-container');
  if (!container) return;
  try {
    const sittings = await GET(`/api/students/${studentId}/exam-sittings`);
    const canEdit = hasRole('principal','counselor');
    if (sittings.length === 0) {
      container.innerHTML = '<p class="text-center text-muted py-4">暂无考试记录。</p>';
      return;
    }
    container.innerHTML = `<div class="table-responsive">
      <table class="table table-hover">
        <thead class="table-light">
          <tr><th>考试局</th><th>科目</th><th>级别</th><th>考试季/年份</th><th>预期</th><th>实际</th><th>考试日期</th>${canEdit?'<th>操作</th>':''}</tr>
        </thead>
        <tbody>
          ${sittings.map(s => `<tr>
            <td><span class="badge bg-secondary">${escapeHtml(s.exam_board)}</span></td>
            <td>${escapeHtml(s.subject)}</td>
            <td class="small">${escapeHtml(s.component||'—')} ${s.subject_code?`<span class="text-muted">${escapeHtml(s.subject_code)}</span>`:''}</td>
            <td class="small">${escapeHtml(s.series||'')} ${s.year}</td>
            <td>${escapeHtml(s.predicted_grade||'—')}</td>
            <td class="${s.actual_grade?'fw-bold text-success':'text-muted'}">${escapeHtml(s.actual_grade||'—')}</td>
            <td class="small text-muted">${fmtDate(s.sitting_date)||'—'}</td>
            ${canEdit ? `<td>
              <button class="btn btn-link btn-sm p-0 text-secondary me-1" onclick="openExamSittingModal('${studentId}','${s.id}')"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-link btn-sm p-0 text-danger" onclick="deleteExamSitting('${s.id}','${studentId}')"><i class="bi bi-trash"></i></button>
            </td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } catch(e) {
    if (container) container.innerHTML = `<p class="text-danger small">${escapeHtml(e.message)}</p>`;
  }
}

async function openExamSittingModal(studentId, sittingId = '') {
  document.getElementById('es-id').value = sittingId;
  document.getElementById('es-student-id').value = studentId;
  const titleEl = document.getElementById('exam-sitting-modal-title');
  if (sittingId) {
    titleEl.textContent = '编辑考试记录';
    try {
      const sittings = await GET(`/api/students/${studentId}/exam-sittings`);
      const s = sittings.find(x => String(x.id) === String(sittingId));
      if (s) {
        document.getElementById('es-board').value = s.exam_board || 'CIE';
        document.getElementById('es-session').value = s.series || 'May/Jun';
        document.getElementById('es-year').value = s.year || 2025;
        document.getElementById('es-subject').value = s.subject || '';
        document.getElementById('es-level').value = s.component || '';
        document.getElementById('es-paper-code').value = s.subject_code || '';
        document.getElementById('es-predicted').value = s.predicted_grade || '';
        document.getElementById('es-actual').value = s.actual_grade || '';
        document.getElementById('es-exam-date').value = s.sitting_date || '';
        document.getElementById('es-result-date').value = s.results_date || '';
        document.getElementById('es-notes').value = s.notes || '';
      }
    } catch(e) {}
  } else {
    titleEl.textContent = '添加考试记录';
    ['es-subject','es-paper-code','es-predicted','es-actual','es-exam-date','es-result-date','es-notes'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('es-board').value = 'CIE';
    document.getElementById('es-session').value = 'May/Jun';
    document.getElementById('es-year').value = new Date().getFullYear();
    document.getElementById('es-level').value = '';
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('exam-sitting-modal')).show();
}

async function saveExamSitting() {
  if (!acquireSubmit('saveExamSitting')) return;
  const studentId = document.getElementById('es-student-id').value;
  const sittingId = document.getElementById('es-id').value;
  const body = {
    exam_board: document.getElementById('es-board').value,
    series: document.getElementById('es-session').value,
    year: parseInt(document.getElementById('es-year').value),
    subject: document.getElementById('es-subject').value.trim(),
    component: document.getElementById('es-level').value,
    subject_code: document.getElementById('es-paper-code').value.trim(),
    predicted_grade: document.getElementById('es-predicted').value.trim(),
    actual_grade: document.getElementById('es-actual').value.trim(),
    sitting_date: document.getElementById('es-exam-date').value || null,
    results_date: document.getElementById('es-result-date').value || null,
    notes: document.getElementById('es-notes').value.trim(),
  };
  if (!body.subject) { releaseSubmit('saveExamSitting'); showError('科目名称必填'); return; }
  try {
    if (sittingId) {
      await PUT(`/api/exam-sittings/${sittingId}`, body);
    } else {
      await POST(`/api/students/${studentId}/exam-sittings`, body);
    }
    bootstrap.Modal.getInstance(document.getElementById('exam-sitting-modal'))?.hide();
    showSuccess('考试记录已保存');
    loadExamSittings(studentId);
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveExamSitting'); }
}

async function deleteExamSitting(sittingId, studentId) {
  confirmAction('确定删除此考试记录？', async () => {
    try {
      await DEL(`/api/exam-sittings/${sittingId}`);
      showSuccess('已删除');
      loadExamSittings(studentId);
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ════════════════════════════════════════════════════════
//  外观与显示 — 偏好设置（localStorage，立即生效）
// ════════════════════════════════════════════════════════

function applyStoredPrefs() {
  applyTheme(localStorage.getItem('pref_theme') || 'light', false);
  applyAccent(localStorage.getItem('pref_accent') || 'blue', false);
  applyFontSize(localStorage.getItem('pref_fontsize') || 'normal', false);
  applyDensity(localStorage.getItem('pref_density') || 'normal', false);
  // sidebar default on load
  if (localStorage.getItem('pref_sidebar') === 'collapsed') {
    document.querySelector('.sidebar')?.classList.add('collapsed');
    document.getElementById('main-content')?.classList.add('sidebar-collapsed');
  }
  // watch OS theme changes for auto mode
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('pref_theme') || 'light') === 'auto') applyTheme('auto', false);
  });
}

function applyTheme(mode, save = true) {
  if (save) localStorage.setItem('pref_theme', mode);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const useDark = mode === 'dark' || (mode === 'auto' && prefersDark);
  document.body.classList.toggle('dark-mode', useDark);
}

const ACCENT_COLORS = {
  blue:   '#2563eb', green:  '#16a34a', purple: '#7c3aed',
  orange: '#ea580c', red:    '#dc2626', teal:   '#0d9488',
};

function applyAccent(key, save = true) {
  if (save) localStorage.setItem('pref_accent', key);
  document.body.setAttribute('data-accent', key);
  // Update swatch borders if panel is open
  Object.keys(ACCENT_COLORS).forEach(k => {
    const el = document.getElementById(`swatch-${k}`);
    if (!el) return;
    const active = k === key;
    el.style.border = `3px solid ${active ? '#fff' : 'transparent'}`;
    el.style.boxShadow = active ? `0 0 0 2px ${ACCENT_COLORS[k]}` : '0 1px 3px rgba(0,0,0,.2)';
  });
}

function applyFontSize(size, save = true) {
  if (save) localStorage.setItem('pref_fontsize', size);
  document.body.setAttribute('data-fontsize', size);
}

function applyDensity(density, save = true) {
  if (save) localStorage.setItem('pref_density', density);
  document.body.setAttribute('data-density', density);
}

async function saveAppearanceSettings() {
  if (!acquireSubmit('saveAppearanceSettings')) return;
  // Save localStorage prefs (already applied on change)
  const theme    = document.querySelector('input[name="pref-theme"]:checked')?.value || 'light';
  const sidebar  = document.getElementById('pref-sidebar')?.value || 'expanded';
  const pagesize = document.getElementById('pref-pagesize')?.value || '20';
  const sessWarn = document.getElementById('pref-session-warn')?.value || '30';
  localStorage.setItem('pref_theme', theme);
  localStorage.setItem('pref_sidebar', sidebar);
  localStorage.setItem('pref_pagesize', pagesize);
  localStorage.setItem('pref_session_warn', sessWarn);
  applyTheme(theme, false);
  // Save overdue threshold to DB
  const threshold = document.getElementById('cfg-overdue-threshold')?.value || '7';
  try {
    await PUT('/api/settings/overdue_threshold_days', { value: threshold });
    State.settings = await GET('/api/settings');
  } catch(e) {
    // ignore DB errors for appearance settings
  } finally {
    releaseSubmit('saveAppearanceSettings');
  }
  showSuccess('外观设置已保存');
}

function resetAppearanceSettings() {
  confirmAction('确定恢复所有外观设置为默认值？', () => {
    ['pref_theme','pref_accent','pref_fontsize','pref_density','pref_sidebar','pref_pagesize','pref_session_warn'].forEach(k => localStorage.removeItem(k));
    applyTheme('light', false);
    applyAccent('blue', false);
    applyFontSize('normal', false);
    applyDensity('normal', false);
    document.body.removeAttribute('data-accent');
    document.body.removeAttribute('data-fontsize');
    document.body.removeAttribute('data-density');
    showSuccess('已恢复默认外观');
    navigate('settings');
  });
}

async function saveSystemInfo() {
  if (!acquireSubmit('saveSystemInfo')) return;
  try {
    const saves = [
      ['school_name',           document.getElementById('cfg-school-name')?.value || ''],
      ['academic_year',         document.getElementById('cfg-academic-year')?.value || ''],
      ['contact_email',         document.getElementById('cfg-contact-email')?.value || ''],
      ['timezone',              document.getElementById('cfg-timezone')?.value || 'Asia/Shanghai'],
      ['print_footer',          document.getElementById('cfg-print-footer')?.value || ''],
      ['default_cycle_year',    document.getElementById('cfg-default-year')?.value || ''],
      ['default_task_priority', document.getElementById('cfg-default-priority')?.value || 'normal'],
      ['counselor_capacity',    document.getElementById('cfg-counselor-cap')?.value || '20'],
      ['material_review_days',  document.getElementById('cfg-material-timeout')?.value || '7'],
      ['overdue_threshold_days',document.getElementById('cfg-overdue-threshold')?.value || '7'],
    ];
    for (const [key, value] of saves) {
      await PUT(`/api/settings/${key}`, { value });
    }
    State.settings = await GET('/api/settings');
    showSuccess('系统信息已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveSystemInfo'); }
}

// ── 新增设置 Tab 保存函数 ──

async function saveIntakeSettings() {
  if (!acquireSubmit('saveIntakeSettings')) return;
  try {
    await PUT('/api/settings/intake_case_statuses', { value: JSON.stringify(State.settingsDraft.intake_case_statuses || []) });
    // auto tasks
    const atKeys = ['collect_docs_days','visa_submit_days','fee_followup_days','fee_receipt_days','arrival_confirm_days','accommodation_days','orientation_days','student_pass_days','survey_days'];
    const at = {}; atKeys.forEach(k => { at[k] = parseInt(document.getElementById('cfg-at-'+k)?.value) || 0; });
    await PUT('/api/settings/intake_auto_tasks', { value: JSON.stringify(at) });
    // IPA reminder
    const ipaStr = document.getElementById('cfg-ipa-reminder')?.value || '';
    await PUT('/api/settings/intake_ipa_reminder_days', { value: JSON.stringify(ipaStr.split(',').map(s=>parseInt(s.trim())).filter(n=>!isNaN(n))) });
    await PUT('/api/settings/mat_token_expiry_hours', { value: document.getElementById('cfg-mat-token-hours')?.value || '72' });
    await PUT('/api/settings/intake_year_range', { value: JSON.stringify({ min: parseInt(document.getElementById('cfg-year-min')?.value)||2000, max: parseInt(document.getElementById('cfg-year-max')?.value)||2100 }) });
    State.settings = await GET('/api/settings');
    showSuccess('入学管理设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveIntakeSettings'); }
}

async function saveVisaSettings() {
  if (!acquireSubmit('saveVisaSettings')) return;
  try {
    await PUT('/api/settings/visa_document_types', { value: JSON.stringify(State.settingsDraft.visa_document_types || []) });
    await PUT('/api/settings/arrival_checklist', { value: JSON.stringify(State.settingsDraft.arrival_checklist || []) });
    State.settings = await GET('/api/settings');
    showSuccess('签证设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveVisaSettings'); }
}

async function saveFinanceSettings() {
  if (!acquireSubmit('saveFinanceSettings')) return;
  try {
    await PUT('/api/settings/default_currency', { value: document.getElementById('cfg-currency')?.value || 'SGD' });
    await PUT('/api/settings/commission_percent_max', { value: document.getElementById('cfg-comm-max')?.value || '1.0' });
    await PUT('/api/settings/agent_token_expiry_hours', { value: document.getElementById('cfg-agent-token-hours')?.value || '72' });
    await PUT('/api/settings/commission_rule_types', { value: JSON.stringify(State.settingsDraft.commission_rule_types || []) });
    State.settings = await GET('/api/settings');
    showSuccess('财务设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveFinanceSettings'); }
}

async function saveAdmEvalSettings() {
  if (!acquireSubmit('saveAdmEvalSettings')) return;
  try {
    // A-Level grade conversion
    const alevel = {}; document.querySelectorAll('#cfg-grade-alevel input[data-grade]').forEach(el => { alevel[el.dataset.grade] = parseInt(el.value)||0; });
    await PUT('/api/settings/grade_conversion_alevel', { value: JSON.stringify(alevel) });
    // IB grade conversion
    const ib = {}; document.querySelectorAll('#cfg-grade-ib input[data-grade]').forEach(el => { ib[el.dataset.grade] = parseInt(el.value)||0; });
    await PUT('/api/settings/grade_conversion_ib', { value: JSON.stringify(ib) });
    // Competitiveness weights
    const cw = {}; ['academic','language','activities','awards','leadership'].forEach(k => { cw[k] = parseFloat(document.getElementById('cfg-cw-'+k)?.value)||0; });
    await PUT('/api/settings/competitiveness_weights', { value: JSON.stringify(cw) });
    // Admission scoring
    const factorsStr = document.getElementById('cfg-as-factors')?.value || '';
    await PUT('/api/settings/admission_scoring', { value: JSON.stringify({
      prior_rate: parseFloat(document.getElementById('cfg-as-prior')?.value)||0.3,
      sample_size: parseInt(document.getElementById('cfg-as-sample')?.value)||30,
      low_pass_multiplier: parseFloat(document.getElementById('cfg-as-lowmult')?.value)||0.6,
      score_factors: factorsStr.split(',').map(s=>parseFloat(s.trim())).filter(n=>!isNaN(n))
    }) });
    // Default weights
    await PUT('/api/settings/default_weight_academic', { value: document.getElementById('cfg-dw-academic')?.value || '0.6' });
    await PUT('/api/settings/default_weight_language', { value: document.getElementById('cfg-dw-language')?.value || '0.25' });
    await PUT('/api/settings/default_weight_extra', { value: document.getElementById('cfg-dw-extra')?.value || '0.15' });
    State.settings = await GET('/api/settings');
    showSuccess('录取评估设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAdmEvalSettings'); }
}

async function saveEssaySettings() {
  if (!acquireSubmit('saveEssaySettings')) return;
  try {
    await PUT('/api/settings/essay_types', { value: JSON.stringify(State.settingsDraft.essay_types || []) });
    await PUT('/api/settings/essay_statuses', { value: JSON.stringify(State.settingsDraft.essay_statuses || []) });
    await PUT('/api/settings/essay_annotation_statuses', { value: JSON.stringify(State.settingsDraft.essay_annotation_statuses || []) });
    State.settings = await GET('/api/settings');
    showSuccess('文书设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveEssaySettings'); }
}

async function saveActivitySettings() {
  if (!acquireSubmit('saveActivitySettings')) return;
  try {
    await PUT('/api/settings/activity_categories', { value: JSON.stringify(State.settingsDraft.activity_categories || []) });
    await PUT('/api/settings/activity_impact_levels', { value: JSON.stringify(State.settingsDraft.activity_impact_levels || []) });
    // Impact weight map
    const iw = {}; ['international','national','province','city','school'].forEach(k => { iw[k] = parseInt(document.getElementById('cfg-iw-'+k)?.value)||0; });
    await PUT('/api/settings/impact_weight_map', { value: JSON.stringify(iw) });
    await PUT('/api/settings/leadership_score_per_item', { value: document.getElementById('cfg-leadership-per')?.value || '25' });
    State.settings = await GET('/api/settings');
    showSuccess('活动设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveActivitySettings'); }
}

async function saveAgentSettings() {
  if (!acquireSubmit('saveAgentSettings')) return;
  try {
    await PUT('/api/settings/agent_request_defaults', { value: JSON.stringify({
      remind_days_before: parseInt(document.getElementById('cfg-ard-remind')?.value)||3,
      overdue_interval_days: parseInt(document.getElementById('cfg-ard-interval')?.value)||2,
      max_overdue_reminders: parseInt(document.getElementById('cfg-ard-max')?.value)||5
    }) });
    State.settings = await GET('/api/settings');
    showSuccess('代理设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveAgentSettings'); }
}

async function saveMaterialSettings() {
  if (!acquireSubmit('saveMaterialSettings')) return;
  try {
    await PUT('/api/settings/material_statuses', { value: JSON.stringify(State.settingsDraft.material_statuses || []) });
    State.settings = await GET('/api/settings');
    showSuccess('材料设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveMaterialSettings'); }
}

async function saveStudentSettings() {
  if (!acquireSubmit('saveStudentSettings')) return;
  try {
    await PUT('/api/settings/valid_grade_levels', { value: JSON.stringify(State.settingsDraft.valid_grade_levels || []) });
    await PUT('/api/settings/valid_student_statuses', { value: JSON.stringify(State.settingsDraft.valid_student_statuses || []) });
    await PUT('/api/settings/student_name_max_length', { value: document.getElementById('cfg-name-maxlen')?.value || '200' });
    // Grade rank map
    const grm = {}; document.querySelectorAll('#cfg-grade-rank input[data-grade]').forEach(el => { grm[el.dataset.grade] = parseInt(el.value)||0; });
    await PUT('/api/settings/grade_rank_map', { value: JSON.stringify(grm) });
    State.settings = await GET('/api/settings');
    showSuccess('学生设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveStudentSettings'); }
}

async function saveNotificationSettings() {
  if (!acquireSubmit('saveNotificationSettings')) return;
  try {
    await PUT('/api/settings/auto_escalate_overdue_hours', { value: document.getElementById('cfg-esc-hours')?.value || '24' });
    await PUT('/api/settings/audit_query_default_limit', { value: document.getElementById('cfg-audit-default')?.value || '200' });
    await PUT('/api/settings/audit_query_max_limit', { value: document.getElementById('cfg-audit-max')?.value || '1000' });
    await PUT('/api/settings/audit_export_max_records', { value: document.getElementById('cfg-audit-export')?.value || '5000' });
    State.settings = await GET('/api/settings');
    showSuccess('通知设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveNotificationSettings'); }
}

async function saveSecuritySettings() {
  if (!acquireSubmit('saveSecuritySettings')) return;
  try {
    await PUT('/api/settings/password_min_length', { value: document.getElementById('cfg-pwd-min')?.value || '6' });
    await PUT('/api/settings/password_max_length', { value: document.getElementById('cfg-pwd-max')?.value || '128' });
    await PUT('/api/settings/toast_delay_ms', { value: document.getElementById('cfg-toast-delay')?.value || '3000' });
    await PUT('/api/settings/max_batch_programs', { value: document.getElementById('cfg-batch-max')?.value || '50' });
    await PUT('/api/settings/default_timezone', { value: document.getElementById('cfg-default-tz')?.value || 'Europe/London' });
    await PUT('/api/settings/default_application_route', { value: document.getElementById('cfg-def-route')?.value || 'UK-UG' });
    await PUT('/api/settings/default_grade_type_used', { value: document.getElementById('cfg-def-grade-type')?.value || 'Predicted' });
    await PUT('/api/settings/default_application_status', { value: document.getElementById('cfg-def-app-status')?.value || 'Pending' });
    await PUT('/api/settings/application_statuses', { value: JSON.stringify(State.settingsDraft.application_statuses || []) });
    await PUT('/api/settings/reference_task_keywords', { value: JSON.stringify(State.settingsDraft.reference_task_keywords || []) });
    State.settings = await GET('/api/settings');
    showSuccess('安全与高级设置已保存');
  } catch(e) { showError(e.message); }
  finally { releaseSubmit('saveSecuritySettings'); }
}

async function deleteTemplateFromSettings(templateId, name) {
  confirmAction(`确定删除模板"${name}"？`, async () => {
    try {
      await DEL(`/api/templates/${templateId}`);
      showSuccess('模板已删除');
      renderSettings();
      setTimeout(() => activateTab('stab-tpl'), 100);
    } catch(e) { showError(e.message); }
  }, { danger: true });
}

// ════════════════════════════════════════════════════════
//  通知中心
// ════════════════════════════════════════════════════════
async function loadNotificationBadge() {
  try {
    // S5: 优先用轻量 /count 端点，失败则 fallback 到全量列表
    let unread = 0;
    try {
      const res = await GET('/api/notifications/count');
      unread = res.unread || 0;
    } catch(e) {
      // fallback: 拉全量列表计数
      const notifs = await GET('/api/notifications');
      unread = notifs.filter(n => !n.is_read).length;
      // 如果面板已打开，刷新面板内容
      const panel = document.getElementById('notif-panel');
      if (panel && panel.style.display !== 'none') renderNotifList(notifs);
    }
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.textContent = unread > 0 ? (unread > 99 ? '99+' : unread) : '';
      badge.style.display = unread > 0 ? '' : 'none';
    }
  } catch(e) {}
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    panel.setAttribute('aria-modal', 'true');
    _updateBellAria(true);
    loadNotificationsPanel();
    // A11Y-06: 打开时将焦点移到面板内第一个可聚焦元素
    setTimeout(() => {
      const first = panel.querySelector('button, a, [tabindex]:not([tabindex="-1"])');
      if (first) first.focus();
    }, 40);
  } else {
    closeNotifPanel();
  }
}

function closeNotifPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.style.display = 'none';
  panel.removeAttribute('aria-modal');
  _updateBellAria(false);
  // 关闭后把焦点还给铃铛按钮
  const bellBtn = document.getElementById('notif-bell-btn');
  if (bellBtn) bellBtn.focus();
}

// N10修复: 点击面板外部自动关闭通知面板
document.addEventListener('click', function(e) {
  const panel = document.getElementById('notif-panel');
  if (!panel || panel.style.display === 'none') return;
  const bellBtn = document.getElementById('notif-bell-btn');
  // 点击在面板内部或铃铛按钮上，不关闭
  if (panel.contains(e.target) || (bellBtn && bellBtn.contains(e.target))) return;
  panel.style.display = 'none';
  panel.removeAttribute('aria-modal');
  _updateBellAria(false);
});

// A11Y-06: Esc 关闭通知面板 + Tab 焦点陷阱（仅在面板打开时生效）
document.addEventListener('keydown', function(e) {
  const panel = document.getElementById('notif-panel');
  if (!panel || panel.style.display === 'none') return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeNotifPanel();
    return;
  }

  if (e.key === 'Tab') {
    const focusables = panel.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

async function loadNotificationsPanel() {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;
  listEl.innerHTML = '<div class="p-3 text-center text-muted small"><div class="spinner-border spinner-border-sm"></div></div>';
  try {
    const notifs = await GET('/api/notifications');
    renderNotifList(notifs);
  } catch(e) {
    listEl.innerHTML = `<div class="p-3 text-danger small">${escapeHtml(e.message)}</div>`;
  }
}

function renderNotifList(notifs) {
  const listEl = document.getElementById('notif-list');
  if (!listEl) return;
  if (notifs.length === 0) {
    listEl.innerHTML = '<div class="p-3 text-center text-muted small">暂无通知</div>';
    return;
  }
  listEl.innerHTML = notifs.slice(0, 30).map(n => `
    <div class="list-group-item list-group-item-action p-3 ${n.is_read?'':'bg-light'}" style="cursor:default">
      <div class="d-flex justify-content-between align-items-start">
        <div class="flex-grow-1">
          <div class="small fw-semibold ${n.is_read?'text-muted':''}">${escapeHtml(n.title||n.message||'')}</div>
          <div class="small text-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" title="${escapeHtml(n.message||'')}">${escapeHtml(n.message||'')}</div>
          <div class="small text-muted">${fmtDate(n.created_at)||''} · ${n.type||''}</div>
        </div>
        ${!n.is_read ? `<button class="btn btn-link btn-sm p-0 ms-2 text-secondary" onclick="markNotifRead('${n.id}')" title="标为已读"><i class="bi bi-check2"></i></button>` : ''}
      </div>
    </div>`).join('');
}

async function markNotifRead(id) {
  try {
    await PUT(`/api/notifications/${id}/read`, {});
    loadNotificationBadge();
  } catch(e) {}
}

async function markAllNotificationsRead() {
  try {
    await PUT('/api/notifications/read-all', {});
    showSuccess('已全部标记为已读');
    loadNotificationBadge();
  } catch(e) { showError(e.message); }
}

async function generateNotifications() {
  try {
    const btn = document.getElementById('notif-generate-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass"></i>'; }
    const res = await POST('/api/notifications/generate', {});
    showSuccess(`已生成 ${res.created || 0} 条通知`);
    loadNotificationBadge();
  } catch(e) { showError(e.message); }
  finally {
    const btn = document.getElementById('notif-generate-btn');
    // N12修复: 恢复为原始 bi-magic 图标（不是 bi-arrow-clockwise）
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-magic"></i>'; }
  }
}

