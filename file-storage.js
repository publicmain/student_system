/**
 * 统一文件存储服务层
 *
 * 所有文件操作通过此模块，为未来迁移对象存储（S3/R2/OSS）预留接口。
 * 当前实现：本地文件系统 + 按类型分子目录
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const BASE_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');

// 子目录分类
const SUBDIRS = {
  material: 'materials',     // 代理上传的材料
  generated: 'generated',   // 系统生成的 PDF
  exchange: 'exchange',     // 文件收发
  photo: 'photos',          // 证件照
  signature: 'signatures',  // 签名图片
  case: 'case-files',       // 案例内部文件
  temp: 'temp',             // 临时文件
};

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 初始化所有子目录
function initDirs() {
  ensureDir(BASE_DIR);
  Object.values(SUBDIRS).forEach(sub => ensureDir(path.join(BASE_DIR, sub)));
}

/**
 * 获取文件的完整磁盘路径
 * 兼容旧文件（直接在 uploads/ 下）和新文件（在子目录下）
 */
function getFilePath(fileId) {
  if (!fileId) return null;
  // 防止路径遍历：只取文件名部分
  fileId = path.basename(fileId);

  // 新路径：检查子目录
  for (const sub of Object.values(SUBDIRS)) {
    const p = path.join(BASE_DIR, sub, fileId);
    if (fs.existsSync(p)) return p;
  }

  // 旧路径兼容：直接在 uploads/ 下
  const legacyPath = path.join(BASE_DIR, fileId);
  if (fs.existsSync(legacyPath)) return legacyPath;

  return legacyPath; // 返回旧路径作为默认（即使不存在）
}

/**
 * 保存文件到指定类别目录
 * @param {string} category - 文件类别 (material/generated/exchange/photo/signature/case)
 * @param {string} fileId - 文件名（通常是 uuid.ext）
 * @param {Buffer|string} content - 文件内容
 * @returns {string} 保存的文件名（不含目录前缀，保持 DB 兼容）
 */
function saveFile(category, fileId, content) {
  const subDir = SUBDIRS[category] || '';
  const targetDir = subDir ? path.join(BASE_DIR, subDir) : BASE_DIR;
  ensureDir(targetDir);
  fileId = path.basename(fileId);
  const fullPath = path.join(targetDir, fileId);
  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(fullPath, content);
  } else if (typeof content === 'string' && content.startsWith('data:')) {
    // Base64 data URL
    const base64Data = content.replace(/^data:[^;]+;base64,/, '');
    fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));
  } else {
    fs.writeFileSync(fullPath, content);
  }
  return fileId;
}

/**
 * 从 base64 data URL 保存为文件
 * @returns {{ fileId: string, fileSize: number }}
 */
function saveBase64(category, dataUrl, ext = '.png') {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;
  const fileId = uuidv4() + ext;
  const base64Data = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(base64Data, 'base64');
  saveFile(category, fileId, buf);
  return { fileId, fileSize: buf.length };
}

/**
 * 读取文件内容
 */
function readFile(fileId) {
  const fp = getFilePath(fileId);
  if (!fp || !fs.existsSync(fp)) return null;
  return fs.readFileSync(fp);
}

/**
 * 删除文件（安全删除，不报错）
 */
function deleteFile(fileId) {
  if (!fileId) return false;
  const fp = getFilePath(fileId);
  if (fp && fs.existsSync(fp)) {
    try { fs.unlinkSync(fp); return true; } catch(e) { return false; }
  }
  return false;
}

/**
 * 移动旧文件到子目录（迁移用）
 */
function migrateFile(fileId, category) {
  if (!fileId) return false;
  const oldPath = path.join(BASE_DIR, fileId);
  if (!fs.existsSync(oldPath)) return false;
  const subDir = SUBDIRS[category];
  if (!subDir) return false;
  const newDir = path.join(BASE_DIR, subDir);
  ensureDir(newDir);
  const newPath = path.join(newDir, fileId);
  if (fs.existsSync(newPath)) return true; // 已迁移
  try { fs.renameSync(oldPath, newPath); return true; } catch(e) { return false; }
}

/**
 * 获取文件大小
 */
function getFileSize(fileId) {
  const fp = getFilePath(fileId);
  if (!fp || !fs.existsSync(fp)) return 0;
  try { return fs.statSync(fp).size; } catch(e) { return 0; }
}

/**
 * 获取磁盘统计
 */
function getStats() {
  const stats = { total: 0, byCategory: {} };
  for (const [cat, sub] of Object.entries(SUBDIRS)) {
    const dir = path.join(BASE_DIR, sub);
    if (!fs.existsSync(dir)) { stats.byCategory[cat] = { count: 0, size: 0 }; continue; }
    const files = fs.readdirSync(dir);
    let size = 0;
    files.forEach(f => { try { size += fs.statSync(path.join(dir, f)).size; } catch(e) {} });
    stats.byCategory[cat] = { count: files.length, size };
    stats.total += size;
  }
  // 旧文件（直接在 uploads/ 下）
  const rootFiles = fs.readdirSync(BASE_DIR).filter(f => {
    const fp = path.join(BASE_DIR, f);
    return fs.statSync(fp).isFile();
  });
  let rootSize = 0;
  rootFiles.forEach(f => { try { rootSize += fs.statSync(path.join(BASE_DIR, f)).size; } catch(e) {} });
  stats.byCategory['legacy'] = { count: rootFiles.length, size: rootSize };
  stats.total += rootSize;
  return stats;
}

module.exports = {
  initDirs,
  getFilePath,
  saveFile,
  saveBase64,
  readFile,
  deleteFile,
  migrateFile,
  getFileSize,
  getStats,
  BASE_DIR,
  SUBDIRS,
};
