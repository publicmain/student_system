/**
 * scripts/rollback-course-matrix.js
 *
 * 回滚 import-course-matrix.js 的导入，删除该批次创建的所有行。
 *
 * 用法：
 *   node scripts/rollback-course-matrix.js                              # 列出所有可回滚批次
 *   node scripts/rollback-course-matrix.js --batch-key=<key>            # 按 batch_key 回滚
 *   node scripts/rollback-course-matrix.js --batch-key=<key> --dry-run  # 预览
 *   node scripts/rollback-course-matrix.js --latest                     # 回滚最近一次
 *
 * 会按依赖顺序删除 (子表 → 父表)：
 *   exam_sittings → subject_enrollments → course_enrollments → course_staff → courses → classrooms → students → subjects
 *
 * 不会删除批次外的数据。
 */
'use strict';

const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const LATEST  = process.argv.includes('--latest');
const argBatch = (process.argv.find(a => a.startsWith('--batch-key=')) || '').split('=')[1];

// 删除依赖顺序（子表先删 → 父表后删）
const DELETE_ORDER = [
  'exam_sittings',
  'subject_enrollments',
  'course_enrollments',
  'course_staff',
  'courses',
  'classrooms',
  'students',       // 注意：只删该批次创建的 student，不删老 student
  'subjects',
];

async function main() {
  const db = require(path.join(__dirname, '..', 'db.js'));
  await db.init();

  // 列出批次
  if (!argBatch && !LATEST) {
    console.log('\n═══ 所有导入批次 ═══\n');
    const batches = db.all(`SELECT batch_key, label, status, item_count, created_at, rolled_back_at
                            FROM import_batches ORDER BY created_at DESC`);
    if (batches.length === 0) { console.log('(无批次记录)'); return; }
    for (const b of batches) {
      console.log(`  [${b.status === 'active' ? '●' : '○'}] ${b.batch_key}`);
      console.log(`      ${b.label}  ·  ${b.item_count} 行  ·  ${b.created_at}`);
      if (b.rolled_back_at) console.log(`      ↩ rolled back at ${b.rolled_back_at}`);
    }
    console.log('\n用法: node scripts/rollback-course-matrix.js --batch-key=<key>');
    console.log('     或: node scripts/rollback-course-matrix.js --latest');
    return;
  }

  // 选择批次
  let batch;
  if (LATEST) {
    batch = db.get(`SELECT * FROM import_batches WHERE status='active' ORDER BY created_at DESC LIMIT 1`);
    if (!batch) { console.log('❌ 无 active 批次'); return; }
  } else {
    batch = db.get('SELECT * FROM import_batches WHERE batch_key=?', [argBatch]);
    if (!batch) { console.log(`❌ batch_key="${argBatch}" 不存在`); return; }
  }

  if (batch.status === 'rolled_back') {
    console.log(`⚠️ 批次 "${batch.batch_key}" 已在 ${batch.rolled_back_at} 回滚过`);
    return;
  }

  console.log(`\n═══ 回滚批次 "${batch.batch_key}" ═══`);
  console.log(`     ${batch.label}`);
  console.log(`     导入时间: ${batch.created_at}, 记录条目: ${batch.item_count}\n`);

  // 按表统计
  const byTable = db.all(`SELECT table_name, COUNT(*) as cnt FROM import_batch_items WHERE batch_id=? GROUP BY table_name`,
    [batch.id]);
  console.log('待删除:');
  for (const bt of byTable) console.log(`   · ${bt.table_name.padEnd(25)} ${bt.cnt} 行`);

  if (DRY_RUN) { console.log('\n【DRY-RUN】未执行删除'); return; }

  // 实际执行删除（按依赖顺序）
  console.log('\n[执行] 按依赖顺序删除 ...');
  let totalDeleted = 0;

  for (const table of DELETE_ORDER) {
    const ids = db.all(`SELECT row_id FROM import_batch_items WHERE batch_id=? AND table_name=?`,
      [batch.id, table]).map(r => r.row_id);
    if (ids.length === 0) continue;
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM ${table} WHERE id IN (${placeholders})`, ids);
    console.log(`  · 删除 ${table}: ${ids.length} 行`);
    totalDeleted += ids.length;
  }

  // 清理 batch_items + 标记 batch 为 rolled_back
  db.run('DELETE FROM import_batch_items WHERE batch_id=?', [batch.id]);
  db.run(`UPDATE import_batches SET status='rolled_back', rolled_back_at=datetime('now') WHERE id=?`, [batch.id]);

  // 同步 courses.num_students（删完后残余课程的计数）
  try {
    db.run(`UPDATE courses SET num_students = (SELECT COUNT(*) FROM course_enrollments WHERE course_id=courses.id AND status='active')`);
  } catch(e) {}

  console.log(`\n✅ 回滚完成，共删除 ${totalDeleted} 行，batch 已标记为 rolled_back`);
}

main().catch(e => { console.error('\n❌ 回滚失败:', e); process.exit(1); });
