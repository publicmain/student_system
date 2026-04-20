/**
 * scripts/import-parents.js
 *
 * 从「家长列表.xlsx」(Seiue 后台导出) 导入家长信息。
 *   - 42 条记录，每生 1 位家长
 *   - 表头：姓名 | 学工号 | 账号 | 性别 | 学生姓名 | 学生账号 | 学生学工号 | 身份 | 账号状态 | 手机号状态 | 手机 | 邮箱
 *
 * 入库到：
 *   - parent_guardians(name, relation='家长', phone, email, wechat=seiue_account)
 *   - student_parents 绑定 (student.id ↔ parent.id)
 *
 * 依赖：students 表已存在对应学生（按 EN/CN 名字 resolve）
 *
 * 用法：
 *   node scripts/import-parents.js --dry-run    # 预演
 *   node scripts/import-parents.js              # 正式导入
 *   XLSX_PATH="<abs>" node scripts/import-parents.js   # 自定义文件路径
 */
'use strict';
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const XLSX_PATH = process.env.XLSX_PATH || 'C:\\Users\\yaoke\\Downloads\\家长列表.xlsx';
const DRY_RUN = process.argv.includes('--dry-run');

// 中文→英文学生名映射（与 import-course-matrix.js 同源）
const CN_TO_EN = {
  '黄裕钛':'Huang Yutai', '苏逸滢':'Su Yiying', '陈佳恩':'Chen Jiaen',
  '周梓昕':'Zhou Zixin', '王子梁':'Wang Ziliang', '刘亦佳':'Liu Yijia',
  '刘钇村':'Liu Yicun', '庄梓越':'Zhuang Ziyue', '陆鑫楠':'Lu Xinnan',
  '林寅嘉':'Lin Yinjia', '王芊芃':'Wang Qianpeng', '孔凡今':'Kong Fanjin',
  '牛星林':'Niu Xinglin', '祝振豪':'Zhu Zhenhao', '王耀星':'Wang Yaoxing',
  '李明阳':'Li Mingyang', '闫雯涵':'Yan Wenhan', '严锦诺':'Yan Jinnuo',
  '郑靖稀':'Zheng Jingxi', '李淳':'Li Chun', '田硕':'Tian Shuo',
  '田昌':'Tian Chang', '毛思琳':'Mao Silin', '郑稀瑜':'Zheng Xiyu',
  '叶书瑞':'Ye Shurui', '李永轩':'Li Yongxuan', '范恩慧':'Fan Enhui',
  '牟歌':'Mu Ge', '刘思璇':'Liu Sixuan', 'HEIN HTET NAING':'Hein Htet Naing',
  '王张欣':'Wang Zhangxin', '雷泽锐':'Lei Zerui',
  // 家长列表里额外出现的老生名
  '杨桐':'Yang Tong', '郑瑞尚':'Zheng Ruishang', '钟睿韬':'Zhong Ruitao',
  '周思源':'Zhou Siyuan', '蒋昕雨':'Jiang Xinyu', '喻耀程':'Yu Yaocheng',
};

function norm(s) { return (s || '').trim(); }
function cleanValue(v) {
  const s = norm(v);
  if (!s || s === '未设置' || s === '-') return '';
  return s;
}
function resolveStudentName(raw) {
  const n = norm(raw);
  return CN_TO_EN[n] || n;
}

(async () => {
  const db = require('../db.js');
  await db.init();

  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const header = rows[0];
  const dataRows = rows.slice(1).filter(r => r[4]); // 需要有学生姓名

  console.log(`\n═══ 家长信息导入 ═══`);
  console.log(`文件: ${XLSX_PATH}`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`数据行: ${dataRows.length}\n`);

  let created = 0, rebound = 0, skipped = 0, missingStu = 0;
  const missingStudents = [];
  const bound = [];

  for (const r of dataRows) {
    const parentName = norm(r[0]);                 // 林寅嘉家长
    const parentAccount = norm(r[2]);              // ylin001A
    const studentRawName = norm(r[4]);             // 林寅嘉
    const parentStatus = norm(r[8]);               // 已激活 / 未激活
    const phone = cleanValue(r[10]);
    const email = cleanValue(r[11]);
    const studentName = resolveStudentName(studentRawName);

    const stu = db.get('SELECT id FROM students WHERE TRIM(name)=? AND status=?', [studentName, 'active']);
    if (!stu) {
      missingStu++;
      missingStudents.push(`${studentRawName} (→ ${studentName})`);
      continue;
    }

    // 查是否已有同 student-name 的 parent（name 里带学生名本身就是 Seiue 命名风格）
    let parent = db.get(`
      SELECT pg.id FROM parent_guardians pg
      JOIN student_parents sp ON sp.parent_id=pg.id
      WHERE sp.student_id=? AND pg.name=?
    `, [stu.id, parentName]);

    if (parent) {
      // 已有 → 只更新联系方式 & 账号
      if (!DRY_RUN) {
        db.run(`UPDATE parent_guardians SET phone=COALESCE(NULLIF(?,''), phone),
                                            email=COALESCE(NULLIF(?,''), email),
                                            wechat=COALESCE(NULLIF(?,''), wechat)
                WHERE id=?`,
          [phone, email, parentAccount, parent.id]);
      }
      skipped++;
      continue;
    }

    // 创建新 parent_guardian
    const pid = uuidv4();
    if (!DRY_RUN) {
      db.run(`INSERT INTO parent_guardians (id, name, relation, phone, email, wechat)
              VALUES (?,?,?,?,?,?)`,
        [pid, parentName, '家长', phone, email, parentAccount]);
      db.run(`INSERT OR IGNORE INTO student_parents (student_id, parent_id) VALUES (?, ?)`,
        [stu.id, pid]);
    }
    created++;
    bound.push(`${studentName.padEnd(18)} ← ${parentName}${phone?' · '+phone:''}${parentAccount?' · '+parentAccount:''}${parentStatus==='已激活'?' [已激活]':''}`);
  }

  if (!DRY_RUN) db.save();

  console.log(`[结果]`);
  console.log(`  新建家长绑定: ${created}`);
  console.log(`  已存在更新:   ${skipped}`);
  console.log(`  学生未找到:   ${missingStu}`);
  if (missingStudents.length > 0) {
    console.log(`\n  ⚠️ 未找到学生:`);
    missingStudents.forEach(n => console.log(`    - ${n}`));
  }
  if (bound.length > 0 && bound.length <= 50) {
    console.log(`\n  ✓ 绑定明细:`);
    bound.forEach(b => console.log(`    ${b}`));
  }
  console.log(DRY_RUN ? `\n⚠️ DRY_RUN — 未实际写库\n` : `\n✅ 已写库\n`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
