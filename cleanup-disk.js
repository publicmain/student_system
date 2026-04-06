/**
 * cleanup-disk.js — 磁盘空间清理工具
 * 在服务器启动时运行，清理：
 * 1. 损坏的数据库备份文件 (*.corrupt.*)
 * 2. 数据库中无引用的孤立上传文件
 * 3. temp 目录中超过24小时的临时文件
 * 4. 过期的 session 数据
 */

const path = require('path');
const fs = require('fs');

function runCleanup(db) {
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname);
  const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
  let totalFreed = 0;
  let filesDeleted = 0;

  console.log('[cleanup] 开始磁盘清理...');

  // ═══════════════════════════════════════════════════════
  //  1. 删除损坏的数据库备份文件
  // ═══════════════════════════════════════════════════════
  try {
    const dataFiles = fs.readdirSync(DATA_DIR);
    for (const f of dataFiles) {
      if (f.includes('.corrupt.') || f.endsWith('.bak')) {
        const fp = path.join(DATA_DIR, f);
        try {
          const stat = fs.statSync(fp);
          fs.unlinkSync(fp);
          totalFreed += stat.size;
          filesDeleted++;
          console.log(`  [cleanup] 删除损坏备份: ${f} (${(stat.size / 1024).toFixed(1)}KB)`);
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) {
    console.warn('[cleanup] 扫描 DATA_DIR 失败:', e.message);
  }

  // ═══════════════════════════════════════════════════════
  //  2. 清理 temp 目录（超过24小时的文件）
  // ═══════════════════════════════════════════════════════
  const tempDir = path.join(UPLOAD_DIR, 'temp');
  try {
    if (fs.existsSync(tempDir)) {
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const tempFiles = fs.readdirSync(tempDir);
      for (const f of tempFiles) {
        const fp = path.join(tempDir, f);
        try {
          const stat = fs.statSync(fp);
          if (now - stat.mtimeMs > ONE_DAY) {
            fs.unlinkSync(fp);
            totalFreed += stat.size;
            filesDeleted++;
          }
        } catch (e) { /* ignore */ }
      }
      if (tempFiles.length > 0) console.log(`  [cleanup] temp 目录清理完成`);
    }
  } catch (e) {
    console.warn('[cleanup] temp 清理失败:', e.message);
  }

  // ═══════════════════════════════════════════════════════
  //  3. 删除孤立上传文件（数据库中无引用）
  // ═══════════════════════════════════════════════════════
  try {
    // 收集数据库中所有被引用的文件ID
    const referencedFiles = new Set();

    const queries = [
      // material_items.file_path
      "SELECT file_path AS fid FROM material_items WHERE file_path IS NOT NULL AND file_path != ''",
      // file_exchange_records.file_path
      "SELECT file_path AS fid FROM file_exchange_records WHERE file_path IS NOT NULL AND file_path != ''",
      // case_files.filename
      "SELECT filename AS fid FROM case_files WHERE filename IS NOT NULL AND filename != ''",
      // mat_request_items.file_id
      "SELECT file_id AS fid FROM mat_request_items WHERE file_id IS NOT NULL AND file_id != ''",
      // mat_item_versions.file_id
      "SELECT file_id AS fid FROM mat_item_versions WHERE file_id IS NOT NULL AND file_id != ''",
      // student_honors.certificate_file_id
      "SELECT certificate_file_id AS fid FROM student_honors WHERE certificate_file_id IS NOT NULL AND certificate_file_id != ''",
    ];

    // 有些表可能不存在（看部署时有没有创建），用 try 包裹
    const optionalQueries = [
      // adm_signatures.file_id
      "SELECT file_id AS fid FROM adm_signatures WHERE file_id IS NOT NULL AND file_id != ''",
      // adm_generated_documents.file_id
      "SELECT file_id AS fid FROM adm_generated_documents WHERE file_id IS NOT NULL AND file_id != ''",
    ];

    for (const sql of queries) {
      try {
        const rows = db.all(sql);
        for (const r of rows) {
          if (r.fid) referencedFiles.add(r.fid);
        }
      } catch (e) { /* table might not exist */ }
    }

    for (const sql of optionalQueries) {
      try {
        const rows = db.all(sql);
        for (const r of rows) {
          if (r.fid) referencedFiles.add(r.fid);
        }
      } catch (e) { /* table might not exist */ }
    }

    // 也要解析 file_exchange_records.upload_items (JSON) 中的文件引用
    try {
      const uploadItemRows = db.all("SELECT upload_items FROM file_exchange_records WHERE upload_items IS NOT NULL AND upload_items != ''");
      for (const r of uploadItemRows) {
        try {
          const items = JSON.parse(r.upload_items);
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.filename) referencedFiles.add(item.filename);
              if (item.file_id) referencedFiles.add(item.file_id);
            }
          }
        } catch (e) { /* invalid JSON */ }
      }
    } catch (e) { /* table error */ }

    console.log(`  [cleanup] 数据库引用文件数: ${referencedFiles.size}`);

    // 扫描所有上传目录
    const dirsToScan = [UPLOAD_DIR];
    const subdirs = ['materials', 'generated', 'exchange', 'photos', 'signatures', 'case-files'];
    for (const sub of subdirs) {
      const subPath = path.join(UPLOAD_DIR, sub);
      if (fs.existsSync(subPath)) dirsToScan.push(subPath);
    }

    let orphanCount = 0;
    let orphanSize = 0;

    for (const dir of dirsToScan) {
      let files;
      try { files = fs.readdirSync(dir); } catch (e) { continue; }

      for (const f of files) {
        const fp = path.join(dir, f);

        // 跳过子目录
        try {
          if (fs.statSync(fp).isDirectory()) continue;
        } catch (e) { continue; }

        // 跳过非上传文件（如 .gitkeep）
        if (f.startsWith('.')) continue;

        // 提取文件ID（去掉扩展名）
        const fileId = f; // 完整文件名作为引用
        const fileIdNoExt = path.parse(f).name; // 不带扩展名

        // 如果数据库中没有引用这个文件
        if (!referencedFiles.has(fileId) && !referencedFiles.has(fileIdNoExt)) {
          try {
            const stat = fs.statSync(fp);
            // 安全措施：只删除超过1小时的文件（避免删除刚上传还没写入DB的）
            if (Date.now() - stat.mtimeMs > 60 * 60 * 1000) {
              fs.unlinkSync(fp);
              orphanCount++;
              orphanSize += stat.size;
            }
          } catch (e) { /* ignore */ }
        }
      }
    }

    totalFreed += orphanSize;
    filesDeleted += orphanCount;
    if (orphanCount > 0) {
      console.log(`  [cleanup] 删除孤立文件: ${orphanCount} 个 (${(orphanSize / 1024 / 1024).toFixed(2)}MB)`);
    }

  } catch (e) {
    console.warn('[cleanup] 孤立文件清理失败:', e.message);
  }

  // ═══════════════════════════════════════════════════════
  //  4. 清理过期 session 数据
  // ═══════════════════════════════════════════════════════
  try {
    const before = db.get("SELECT COUNT(*) as cnt FROM sessions");
    const expiredTs = Math.floor(Date.now() / 1000);
    db.run("DELETE FROM sessions WHERE expired < ?", [expiredTs]);
    const after = db.get("SELECT COUNT(*) as cnt FROM sessions");
    const cleaned = (before?.cnt || 0) - (after?.cnt || 0);
    if (cleaned > 0) {
      console.log(`  [cleanup] 清理过期session: ${cleaned} 条`);
    }
  } catch (e) { /* sessions table might not exist yet */ }

  // ═══════════════════════════════════════════════════════
  //  5. SQLite VACUUM（压缩数据库文件）
  // ═══════════════════════════════════════════════════════
  // 注意：sql.js 的 VACUUM 可能不稳定，仅在释放大量空间时执行
  // 由于 sql.js 是内存数据库定期写入文件，VACUUM 通过重新导出即可实现
  // db.js 的 save() 会自动导出紧凑数据，无需额外操作

  // ═══════════════════════════════════════════════════════
  //  汇总
  // ═══════════════════════════════════════════════════════
  if (filesDeleted > 0 || totalFreed > 0) {
    console.log(`[cleanup] ✅ 清理完成: 删除 ${filesDeleted} 个文件, 释放 ${(totalFreed / 1024 / 1024).toFixed(2)}MB`);
  } else {
    console.log('[cleanup] ✅ 磁盘状态良好，无需清理');
  }

  return { filesDeleted, totalFreed };
}

module.exports = runCleanup;
