#!/usr/bin/env node
/**
 * 迁移脚本：把 UIF JSON 中的 base64 证件照和签名提取为独立文件
 *
 * 用法：
 *   node scripts/migrate-photos.js --dry-run   (预览)
 *   node scripts/migrate-photos.js --execute    (执行)
 */

const db = require('../db');
const storage = require('../file-storage');
const mode = process.argv[2] || '--dry-run';

(async () => {
  await db.init();
  storage.initDirs();

  const uifs = db.all('SELECT id, request_id, data FROM mat_uif_submissions WHERE data IS NOT NULL');
  console.log(`Found ${uifs.length} UIF records to scan\n`);

  let photosMigrated = 0, sigsMigrated = 0, savedBytes = 0;

  for (const uif of uifs) {
    let data;
    try { data = JSON.parse(uif.data); } catch(e) { continue; }
    let changed = false;

    // 1. 迁移证件照
    if (data._id_photo_data && data._id_photo_data.startsWith('data:')) {
      const ext = data._id_photo_data.includes('image/png') ? '.png' : '.jpg';
      const oldSize = data._id_photo_data.length;

      if (mode === '--execute') {
        const result = storage.saveBase64('photo', data._id_photo_data, ext);
        if (result) {
          data._id_photo_file = result.fileId; // 新引用
          delete data._id_photo_data;          // 删除 base64
          changed = true;
          savedBytes += oldSize;
          photosMigrated++;
          console.log(`  ✅ Photo: UIF ${uif.id.slice(0,8)} → ${result.fileId} (${Math.round(result.fileSize/1024)}KB)`);
        }
      } else {
        console.log(`  [DRY] Photo: UIF ${uif.id.slice(0,8)} base64=${Math.round(oldSize/1024)}KB`);
        photosMigrated++;
        savedBytes += oldSize;
      }
    }

    // 2. 迁移签名
    if (data._signatures && typeof data._signatures === 'object') {
      for (const [sigType, sigObj] of Object.entries(data._signatures)) {
        if (sigObj?.sig_data && sigObj.sig_data.startsWith('data:')) {
          const oldSize = sigObj.sig_data.length;

          if (mode === '--execute') {
            const result = storage.saveBase64('signature', sigObj.sig_data, '.png');
            if (result) {
              sigObj.sig_file = result.fileId; // 新引用
              delete sigObj.sig_data;          // 删除 base64
              changed = true;
              savedBytes += oldSize;
              sigsMigrated++;
              console.log(`  ✅ Sig(${sigType}): UIF ${uif.id.slice(0,8)} → ${result.fileId} (${Math.round(result.fileSize/1024)}KB)`);
            }
          } else {
            console.log(`  [DRY] Sig(${sigType}): UIF ${uif.id.slice(0,8)} base64=${Math.round(oldSize/1024)}KB`);
            sigsMigrated++;
            savedBytes += oldSize;
          }
        }
      }
    }

    // 3. 更新 DB
    if (changed && mode === '--execute') {
      db.run('UPDATE mat_uif_submissions SET data=? WHERE id=?', [JSON.stringify(data), uif.id]);
    }
  }

  console.log(`\n=== ${mode === '--execute' ? '执行' : '预览'}结果 ===`);
  console.log(`证件照: ${photosMigrated} 张`);
  console.log(`签名: ${sigsMigrated} 个`);
  console.log(`预计节省 JSON 大小: ${Math.round(savedBytes/1024)}KB`);

  if (mode !== '--execute') {
    console.log('\n运行 `node scripts/migrate-photos.js --execute` 执行迁移');
  }
})();
