#!/usr/bin/env node
/**
 * 迁移脚本：把扁平 uploads/ 中的文件按类型移到子目录
 *
 * 用法：
 *   node scripts/migrate-files.js --dry-run   (预览)
 *   node scripts/migrate-files.js --execute    (执行)
 */

const db = require('../db');
const storage = require('../file-storage');
const mode = process.argv[2] || '--dry-run';

(async () => {
  await db.init();
  storage.initDirs();

  // 1. 收集所有文件引用及其类别
  const fileCategories = {};

  // 代理上传材料 → materials
  db.all('SELECT file_id FROM mat_request_items WHERE file_id IS NOT NULL').forEach(r => fileCategories[r.file_id] = 'material');
  db.all('SELECT file_id FROM mat_item_versions WHERE file_id IS NOT NULL').forEach(r => fileCategories[r.file_id] = 'material');

  // 生成的 PDF → generated
  db.all('SELECT file_id FROM adm_generated_documents WHERE file_id IS NOT NULL').forEach(r => fileCategories[r.file_id] = 'generated');

  // 签名 → signature
  db.all('SELECT file_id FROM adm_signatures WHERE file_id IS NOT NULL').forEach(r => fileCategories[r.file_id] = 'signature');

  // 文件收发 → exchange
  try { db.all('SELECT file_path FROM file_exchange_records WHERE file_path IS NOT NULL').forEach(r => fileCategories[r.file_path] = 'exchange'); } catch(e) {}

  // 案例文件 → case
  try { db.all('SELECT filename FROM case_files WHERE filename IS NOT NULL').forEach(r => fileCategories[r.filename] = 'case'); } catch(e) {}

  console.log(`Found ${Object.keys(fileCategories).length} files to categorize\n`);

  let moved = 0, skipped = 0, notFound = 0;

  for (const [fileId, category] of Object.entries(fileCategories)) {
    if (mode === '--execute') {
      const ok = storage.migrateFile(fileId, category);
      if (ok) { moved++; console.log(`  ✅ ${fileId.slice(0,12)} → ${category}/`); }
      else { notFound++; }
    } else {
      const fs = require('fs');
      const path = require('path');
      const exists = fs.existsSync(path.join(storage.BASE_DIR, fileId));
      const alreadyMigrated = !exists && fs.existsSync(storage.getFilePath(fileId));
      if (alreadyMigrated) { skipped++; }
      else if (exists) { moved++; console.log(`  [DRY] ${fileId.slice(0,12)} → ${category}/`); }
      else { notFound++; console.log(`  [MISSING] ${fileId.slice(0,12)}`); }
    }
  }

  console.log(`\n=== ${mode === '--execute' ? '执行' : '预览'}结果 ===`);
  console.log(`移动: ${moved}`);
  console.log(`已迁移: ${skipped}`);
  console.log(`未找到: ${notFound}`);

  if (mode !== '--execute') {
    console.log('\n运行 `node scripts/migrate-files.js --execute` 执行迁移');
  }
})();
