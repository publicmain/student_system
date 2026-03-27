#!/usr/bin/env node
/**
 * 系统运维工具：备份 / 清理 / 监控
 *
 * 用法：
 *   node scripts/maintenance.js backup     — 备份数据库
 *   node scripts/maintenance.js stats      — 磁盘使用统计
 *   node scripts/maintenance.js orphans    — 扫描孤儿文件（dry run）
 *   node scripts/maintenance.js clean      — 清理孤儿文件（真正删除）
 *   node scripts/maintenance.js old-docs   — 清理旧版本 PDF（dry run）
 *   node scripts/maintenance.js clean-docs — 清理旧版本 PDF（真正删除）
 */

const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'data.sqlite');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const cmd = process.argv[2];

// ── 备份 ──
function backup() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(BACKUP_DIR, `data-${ts}.sqlite`);
  fs.copyFileSync(DB_PATH, dest);
  console.log(`✅ 备份完成: ${dest} (${Math.round(fs.statSync(dest).size / 1024)}KB)`);

  // 保留最近 7 个备份
  const backups = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('data-') && f.endsWith('.sqlite')).sort().reverse();
  if (backups.length > 7) {
    for (let i = 7; i < backups.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
      console.log(`  🗑 删除旧备份: ${backups[i]}`);
    }
  }
}

// ── 磁盘统计 ──
function stats() {
  const dbSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;
  let uploadSize = 0, uploadCount = 0;
  const extStats = {};
  // 递归扫描所有子目录
  const scanStats = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      try {
        const st = fs.statSync(fp);
        if (st.isDirectory()) { scanStats(fp); return; }
        uploadCount++;
        uploadSize += st.size;
        const ext = path.extname(f).toLowerCase() || '.unknown';
        if (!extStats[ext]) extStats[ext] = { count: 0, size: 0 };
        extStats[ext].count++;
        extStats[ext].size += st.size;
      } catch(e) {}
    });
  };
  if (fs.existsSync(UPLOAD_DIR)) scanStats(UPLOAD_DIR);

  // 按子目录统计
  const dirStats = {};
  if (fs.existsSync(UPLOAD_DIR)) {
    fs.readdirSync(UPLOAD_DIR).forEach(f => {
      const fp = path.join(UPLOAD_DIR, f);
      if (!fs.statSync(fp).isDirectory()) return;
      let cnt = 0, sz = 0;
      fs.readdirSync(fp).forEach(ff => { try { cnt++; sz += fs.statSync(path.join(fp, ff)).size; } catch(e) {} });
      dirStats[f] = { count: cnt, size: sz };
    });
  }

  console.log('═══ 磁盘使用统计 ═══');
  console.log(`数据库:    ${formatSize(dbSize)}`);
  console.log(`上传文件:  ${formatSize(uploadSize)} (${uploadCount} 个文件)`);
  console.log(`总计:      ${formatSize(dbSize + uploadSize)}`);
  console.log('');
  console.log('按文件类型:');
  Object.entries(extStats).sort((a, b) => b[1].size - a[1].size).forEach(([ext, s]) => {
    console.log(`  ${ext.padEnd(8)} ${String(s.count).padStart(5)} 个  ${formatSize(s.size).padStart(8)}`);
  });

  // 告警
  const totalMB = (dbSize + uploadSize) / 1024 / 1024;
  if (totalMB > 500) console.log('\n⚠️  警告: 总存储超过 500MB！');
  else if (totalMB > 200) console.log('\n⚠️  注意: 总存储超过 200MB');
  else console.log('\n✅ 存储正常');
}

// ── 孤儿文件扫描 ──
async function orphans(dryRun = true) {
  const db = require('../db');
  await db.init();

  const dbFiles = new Set();
  const tables = [
    ['mat_request_items', 'file_id'],
    ['mat_item_versions', 'file_id'],
    ['adm_generated_documents', 'file_id'],
    ['adm_signatures', 'file_id'],
    ['file_exchange_records', 'file_path'],
    ['case_files', 'filename'],
    ['material_items', 'file_path'],
  ];
  for (const [table, col] of tables) {
    try { db.all(`SELECT ${col} FROM ${table} WHERE ${col} IS NOT NULL`).forEach(r => dbFiles.add(r[col])); } catch(e) {}
  }
  // UIF 中的照片和签名文件引用
  try {
    db.all('SELECT data FROM mat_uif_submissions WHERE data IS NOT NULL').forEach(r => {
      try {
        const d = JSON.parse(r.data);
        if (d._id_photo_file) dbFiles.add(d._id_photo_file);
        if (d._signatures) Object.values(d._signatures).forEach(sig => { if (sig.sig_file) dbFiles.add(sig.sig_file); });
      } catch(e) {}
    });
  } catch(e) {}

  // 扫描所有子目录（不只是 root）
  let diskFiles = [];
  const scanDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      if (fs.statSync(fp).isFile()) diskFiles.push(f);
      else if (fs.statSync(fp).isDirectory()) scanDir(fp);
    });
  };
  scanDir(UPLOAD_DIR);
  const orphanFiles = diskFiles.filter(f => !dbFiles.has(f));
  let totalSize = 0;
  orphanFiles.forEach(f => { try { totalSize += fs.statSync(path.join(UPLOAD_DIR, f)).size; } catch(e) {} });

  console.log(`DB 引用: ${dbFiles.size} 个文件`);
  console.log(`磁盘:    ${diskFiles.length} 个文件`);
  console.log(`孤儿:    ${orphanFiles.length} 个 (${formatSize(totalSize)})`);

  if (orphanFiles.length === 0) { console.log('✅ 无孤儿文件'); return; }

  if (dryRun) {
    console.log('\n[DRY RUN] 以下文件将被删除:');
    orphanFiles.slice(0, 20).forEach(f => console.log(`  ${f}`));
    if (orphanFiles.length > 20) console.log(`  ...还有 ${orphanFiles.length - 20} 个`);
    console.log('\n运行 `node scripts/maintenance.js clean` 执行真正删除');
  } else {
    let cleaned = 0;
    orphanFiles.forEach(f => {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); cleaned++; } catch(e) {}
    });
    console.log(`✅ 已删除 ${cleaned} 个孤儿文件，释放 ${formatSize(totalSize)}`);
  }
}

// ── 旧版本 PDF 清理 ──
async function oldDocs(dryRun = true) {
  const db = require('../db');
  await db.init();

  const old = db.all('SELECT id, file_id, file_size, doc_type, version_no FROM adm_generated_documents WHERE is_latest != 1 OR is_latest IS NULL');
  let totalSize = 0;
  old.forEach(d => totalSize += d.file_size || 0);

  console.log(`旧版本 PDF 记录: ${old.length} 条 (${formatSize(totalSize)})`);

  if (old.length === 0) { console.log('✅ 无旧版本'); return; }

  if (dryRun) {
    console.log('\n[DRY RUN] 以下记录和文件将被清理:');
    old.slice(0, 10).forEach(d => console.log(`  ${d.doc_type} v${d.version_no} ${d.file_id?.slice(0, 8) || 'no-file'} ${formatSize(d.file_size || 0)}`));
    if (old.length > 10) console.log(`  ...还有 ${old.length - 10} 条`);
    console.log('\n运行 `node scripts/maintenance.js clean-docs` 执行真正删除');
  } else {
    let cleaned = 0;
    old.forEach(d => {
      if (d.file_id) { try { fs.unlinkSync(path.join(UPLOAD_DIR, d.file_id)); } catch(e) {} }
      db.run('DELETE FROM adm_generated_documents WHERE id=?', [d.id]);
      cleaned++;
    });
    console.log(`✅ 已清理 ${cleaned} 条旧版本记录，释放 ${formatSize(totalSize)}`);
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

// ── 主入口 ──
(async () => {
  switch (cmd) {
    case 'backup': backup(); break;
    case 'stats': stats(); break;
    case 'orphans': await orphans(true); break;
    case 'clean': await orphans(false); break;
    case 'old-docs': await oldDocs(true); break;
    case 'clean-docs': await oldDocs(false); break;
    default:
      console.log('用法: node scripts/maintenance.js <command>');
      console.log('  backup     — 备份数据库');
      console.log('  stats      — 磁盘使用统计');
      console.log('  orphans    — 扫描孤儿文件 (dry run)');
      console.log('  clean      — 清理孤儿文件');
      console.log('  old-docs   — 扫描旧版本 PDF (dry run)');
      console.log('  clean-docs — 清理旧版本 PDF');
  }
})();
