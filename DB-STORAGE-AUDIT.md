# 数据库与文件存储架构审查报告

**审查日期**: 2026-03-27

---

## Part 1. 当前数据库架构

### 规模
- **75 张表**，DB 文件 7.5MB
- 核心业务表：intake_cases(12), mat_requests(7), adm_profiles(12), adm_generated_documents(681)

### 关键实体关系
```
intake_cases (入学案例)
  ├── mat_requests (材料收集请求) [intake_case_id]
  │     ├── mat_request_items (材料项) [request_id]
  │     │     └── mat_item_versions (文件版本) [item_id]
  │     ├── mat_uif_submissions (表单数据) [request_id]
  │     ├── mat_uif_versions (表单版本) [request_id]
  │     └── mat_magic_tokens (Magic Link) [request_id]
  ├── adm_profiles (申请档案) [intake_case_id]
  │     ├── adm_family_members [profile_id]
  │     ├── adm_education_history [profile_id]
  │     ├── adm_employment_history [profile_id]
  │     ├── adm_residence_history [profile_id]
  │     ├── adm_guardian_info [profile_id]
  │     ├── adm_signatures [profile_id]
  │     └── adm_generated_documents [profile_id] ← 681行！
  ├── file_exchange_records (文件收发) [case_id]
  ├── visa_cases [case_id]
  ├── arrival_records [case_id]
  └── milestone_tasks [intake_case_id]
```

---

## Part 2. 当前文件存储架构

### 目录结构
```
uploads/                    ← 所有文件扁平存放，无子目录
  ├── {uuid}.pdf            ← 921 个 PDF（生成的 + 上传的）
  ├── {uuid}.png            ← 24 个 PNG
  ├── {uuid}.jpeg           ← 12 个 JPEG
  ├── {uuid}.jpg            ← 2 个 JPG
  └── {uuid}.txt            ← 1 个 TXT
总计: 960 个文件, 225MB
```

### 命名规则
- multer 使用 `uuidv4()` 生成文件名 + 保留原扩展名
- 无路径穿越风险（UUID 不含特殊字符）
- 无重名覆盖风险（UUID 唯一）

### 数据库关联
- `mat_request_items.file_id` → 文件名
- `mat_item_versions.file_id` → 文件名
- `adm_generated_documents.file_id` → 文件名
- `adm_signatures.file_id` → 文件名
- `file_exchange_records.file_path` → 文件名

### 证件照和签名存储方式
- **证件照**: Base64 嵌入 `mat_uif_submissions.data` JSON 中（`_id_photo_data` 字段）
- **签名**: Base64 嵌入 `mat_uif_submissions.data` JSON 中（`_signatures.applicant.sig_data` 字段）
- 平均每条 UIF 记录 192KB，其中照片占 ~374KB（3条有照片，共 1.1MB base64）

---

## Part 3. 数据流转链路

```
代理打开 agent.html
  → GET /api/agent/workspace (加载请求 + 材料项)
  → GET /api/agent/uif (加载已有表单数据)
  → 用户填表 → collect() 收集 DOM 数据到 S.data
  → scheduleSave → 8秒后 PUT /api/agent/uif (saveDraft)
    → 后端: UPDATE mat_uif_submissions SET data=JSON
  → 用户上传文件 → POST /api/agent/upload/:itemId
    → multer 写文件到 uploads/{uuid}.ext
    → UPDATE mat_request_items SET file_id=uuid
    → INSERT mat_item_versions (版本追踪)
  → 用户点提交 → POST /api/agent/uif/submit
    → UPDATE mat_uif_submissions SET status='SUBMITTED'
    → INSERT mat_uif_versions (版本快照)
    → UPDATE mat_requests SET status='SUBMITTED'

Staff 审核
  → GET /api/intake-cases/:id (加载完整案例数据)
  → 审核通过 → POST /api/mat-requests/:id/approve
  → 打回 → POST /api/mat-requests/:id/return
  → 生成 PDF → POST /api/mat-requests/:id/generate-documents
    → 创建/更新 adm_profiles
    → Python 生成 3 份 PDF → 写入 uploads/{uuid}.pdf
    → INSERT adm_generated_documents
```

---

## Part 4. 问题总表

### P0（上线前必须修）

无 P0 问题。

### P1（上线后很快会出问题）

| # | 问题 | 影响 |
|---|------|------|
| **P1-1** | **adm_generated_documents 有 681 行但只有 27 行 is_latest=1**。654 条旧版本占 141MB 磁盘 + 对应文件永不清理 | 磁盘膨胀 |
| **P1-2** | **241 个孤儿文件（63MB）** 在磁盘上无 DB 引用 | 磁盘浪费 |
| **P1-3** | **0 个自定义索引**。所有查询靠全表扫描。intake_case_id、request_id、profile_id 等外键列无索引 | 数据量大后变慢 |
| **P1-4** | **证件照 base64 嵌入 UIF JSON**（每张 ~374KB）。每次 saveDraft/loadWorkspace 都传输整张照片 | 网络/内存浪费 |
| **P1-5** | **mat_review_actions 表不存在**（db.js 中可能没创建），审计链路缺失 | 审计不完整 |

### P2（可运行但架构不优雅）

| # | 问题 |
|---|------|
| P2-1 | 所有文件扁平存放在一个 uploads/ 目录，无按案例/类型分子目录 |
| P2-2 | 无图片压缩/缩放。上传 5MB 照片原样存储 |
| P2-3 | 旧 PDF 版本和旧文件版本永久保留，无过期清理机制 |
| P2-4 | SQLite 无外键约束强制执行（`PRAGMA foreign_keys` 未开启） |
| P2-5 | UIF data JSON 最大可达 500KB+（含 base64），存在单个 TEXT 列中 |

### P3（长期优化）

| # | 问题 |
|---|------|
| P3-1 | 无数据库自动备份脚本 |
| P3-2 | 无磁盘使用量监控/告警 |
| P3-3 | 未来如需迁移对象存储，需要重写所有文件路径逻辑 |

---

## Part 5. 数据库风险分析

### 索引缺失（P1-3）
以下高频查询列没有索引：
- `mat_requests.intake_case_id`
- `mat_request_items.request_id`
- `mat_uif_submissions.request_id`
- `adm_profiles.intake_case_id`
- `adm_generated_documents.profile_id`
- `milestone_tasks.intake_case_id`
- `file_exchange_records.case_id`
- `mat_magic_tokens.token`（Magic Link 查找）
- `mat_magic_tokens.request_id`

**影响**: 12 个案例时没问题，100+ 时查询开始变慢，1000+ 时明显卡顿。

### 事务使用
- 删除案例用了 `db.transaction()` ✓
- 但 generate-documents 的多步写入**没有事务包裹**——如果中途失败会留下部分数据

### SQLite 适用性
- 当前写入量很低（每天几十次），SQLite 完全够用
- 预计 100 用户内无压力，500+ 用户如果同时操作需要考虑 WAL 模式
- sql.js 是**内存数据库**，定期 save 到磁盘——如果进程崩溃可能丢失未保存的数据

---

## Part 6. 文件存储风险分析

### 磁盘膨胀预估

| 用户数 | 每用户文件 | 预估总存储 |
|--------|-----------|-----------|
| 当前(12) | ~19MB | 225MB |
| 100 | ~19MB | ~1.9GB |
| 500 | ~19MB | ~9.5GB |
| 1000 | ~19MB | ~19GB |
| 5000 | ~19MB | ~95GB |

其中：
- 生成的 PDF 每案例 ~1.5MB × 多版本
- 上传材料每案例 ~5MB
- 旧版本文件不清理 → 实际可能 2-3 倍

### 孤儿文件（P1-2）
- 241 个文件（63MB）在磁盘上但无 DB 引用
- 来源：之前删除案例/测试时没有完整清理物理文件

### 旧版本累积（P1-1）
- 681 条 adm_generated_documents 中 654 条是旧版本
- 占 141MB 磁盘
- 每次"重新生成"会创建新版本但不删旧文件

---

## Part 7. 压缩/节省空间/归档建议

### 应该压缩的
| 文件类型 | 建议 | 节省比例 |
|---------|------|---------|
| 证件照（JPG/PNG）| 上传时缩放到 800×1000px，质量 80% | 60-80% |
| 扫描件（JPG/PNG）| 上传时缩放到 2000px 宽，质量 85% | 40-60% |
| 签名 canvas PNG | 转 JPEG 质量 60% 或保持 PNG（已经小） | 20-30% |

### 不应该压缩的
| 文件类型 | 原因 |
|---------|------|
| 生成的 PDF | 已经是模板叠加，再压缩效果小且可能损坏 |
| 上传的 PDF 原件 | 可能需要保持原始质量用于官方提交 |
| Word/Excel 文件 | 已经是压缩格式 |

### 证件照存储方式优化
当前：base64 嵌入 UIF JSON（每张 ~374KB base64 ≈ 280KB 原图）
建议：改为独立文件存储，UIF 中只存文件 ID 引用

### 旧版本清理策略
建议保留策略：
- 保留最新 2 个版本的 PDF
- 超过 2 个版本的旧文件移到 `uploads/archive/` 或直接删除
- 定期运行清理脚本（每周/每月）

---

## Part 8. 上线前必须处理的事项

### 必修项（P1）

| # | 事项 | 工作量 |
|---|------|--------|
| 1 | 添加数据库索引（8-10 个关键索引） | 10 分钟 |
| 2 | 清理 241 个孤儿文件（63MB） | 5 分钟 |
| 3 | 清理 654 条旧版本 ADM 文档记录 + 对应文件 | 10 分钟 |

### 建议项（上线后第一周）

| # | 事项 |
|---|------|
| 1 | 证件照从 base64 改为文件存储 |
| 2 | 添加数据库自动备份脚本（每天 cron） |
| 3 | 创建 mat_review_actions 表 |
| 4 | 生成 PDF 流程加事务包裹 |

### 可以以后做的项

| # | 事项 |
|---|------|
| 1 | 上传时图片自动压缩/缩放 |
| 2 | 文件按 case_id 分子目录存放 |
| 3 | 旧版本文件自动归档/清理脚本 |
| 4 | 磁盘使用量监控 |

---

## Part 9. 推荐目标架构

在不推翻现有系统的前提下：

```
uploads/
  ├── current/          ← 当前有效文件
  │     ├── {case_id}/  ← 按案例分目录
  │     │     ├── materials/   ← 代理上传
  │     │     ├── generated/   ← 生成的 PDF
  │     │     └── exchange/    ← 文件收发
  │     └── ...
  └── archive/          ← 旧版本冷存储
        └── {date}/

data.sqlite             ← 主数据库
data.sqlite.bak         ← 每日备份
```

### 数据库优化
- 开启 WAL 模式（提高并发读写）
- 添加关键索引
- 开启 `PRAGMA foreign_keys = ON`
- 证件照/签名从 JSON 提取为独立文件

---

## Part 10. 实施建议

### Phase 1: 上线前（立即做）
1. 添加索引
2. 清理孤儿文件和旧版本

### Phase 2: 上线后第一周
1. 添加备份脚本
2. 证件照提取为独立文件
3. 添加旧版本清理逻辑

### Phase 3: 用户量增长后
1. 文件分目录存储
2. 图片上传压缩
3. 考虑对象存储迁移（如果超过 50GB）
4. 考虑 SQLite → PostgreSQL（如果超过 1000 并发用户）

---

*报告生成时间: 2026-03-27*
