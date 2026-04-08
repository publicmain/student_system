/**
 * 批量导入学生数据脚本
 * 从 Namelist.xlsx + EquistarStudentList新生/老生.xlsx 合并后导入系统
 *
 * 用法: node scripts/import-students.js [--dry-run]
 *   --dry-run  只打印要导入的数据，不实际写入
 */

const path = require('path');
const XLSX = require('xlsx');

// ── 配置 ──
const DRY_RUN = process.argv.includes('--dry-run');

const DIR = 'C:/Users/yaoke/OneDrive/文档/xwechat_files/wxid_we11okdevjs112_2bfe/msg/file/2026-04';

// ── Excel 日期序列号转 YYYY-MM-DD ──
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel epoch: 1900-01-01, but has the "1900 leap year bug" (+1 day offset)
  const utcDays = Math.floor(serial) - 25569;
  const d = new Date(utcDays * 86400000);
  return d.toISOString().slice(0, 10);
}

// ── 读取文件 ──
function readNamelist() {
  const wb = XLSX.readFile(path.join(DIR, 'Namelist.xlsx'));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['新课号'], { header: 1 });
  const header = rows[0]; // column headers (subject names)

  // Subject column index mapping (0-based)
  // 0: Name, 1: Math, 2: Fmath/Amath, 3: Physics, 4: Chemistry,
  // 5: Chinese, 6: Econ, 7: English, 8: Accounting, 9: Biology, 10: Art, 11: CS, 12: CCA, 13: PE
  const COL_SUBJECTS = [
    { col: 1, code: 'MATH', name: 'Math' },
    { col: 2, code: 'FMATH', name: 'Fmath/Amath' },  // Will differentiate IAL vs OL later
    { col: 3, code: 'PHYS', name: 'Physics' },
    { col: 4, code: 'CHEM', name: 'Chemistry' },
    { col: 5, code: 'CHN', name: 'Chinese' },
    { col: 6, code: 'ECON', name: 'Econ' },
    { col: 7, code: 'ENG', name: 'English' },
    { col: 8, code: 'ACC', name: 'Accounting' },
    { col: 9, code: 'BIO', name: 'Biology' },
    { col: 10, code: 'ART', name: 'Art' },
    { col: 11, code: 'CS', name: 'CS' },
  ];

  // Known classroom prefixes pattern
  const CLASSROOM_RE = /^(IAL|OL|SEC|SGCE|CIE)\d/i;

  const students = [];
  // Row 0 is both header and contains classroom name in first cell
  let currentClass = (rows[0] && rows[0][0]) ? rows[0][0].toString().trim() : null;
  // Only keep it if it matches classroom pattern
  if (currentClass && !CLASSROOM_RE.test(currentClass)) currentClass = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const cell0 = (row[0] || '').toString().trim();
    if (!cell0) continue;

    // Detect classroom header rows by matching known prefix pattern
    if (CLASSROOM_RE.test(cell0)) {
      currentClass = cell0;
      continue;
    }

    // Parse student name
    const nameStr = cell0;
    // Extract Chinese name (if any) and English name
    const cnMatch = nameStr.match(/([\u4e00-\u9fff\u3400-\u4dbf]+)/);
    const chineseName = cnMatch ? cnMatch[1] : null;
    // English name is everything before the Chinese characters (or the whole string)
    const englishName = nameStr.replace(/[\u4e00-\u9fff\u3400-\u4dbf]+/g, '').trim();

    // Collect subjects
    const subjects = [];
    for (const s of COL_SUBJECTS) {
      const val = row[s.col];
      if (val && val.toString().trim()) {
        let code = s.code;
        const cellVal = val.toString().trim();
        // Differentiate FMATH: IALMath/Fmath = Further Math (IAL), FMath = Further Math, FM = Further Math, AM/AMath = Additional Math
        if (s.col === 2) {
          if (cellVal.startsWith('AM') || cellVal.startsWith('AMath')) {
            code = 'AMATH';
          } else {
            code = 'FMATH';
          }
        }
        // ComSci in Physics column → actually CS
        if (cellVal.startsWith('ComSci')) {
          code = 'CS';
        }
        // CLL/CL in Chinese column → Chinese
        if (s.col === 5 && (cellVal.startsWith('CLL') || cellVal.startsWith('CL'))) {
          code = 'CHN';
        }
        subjects.push({ code, courseCode: cellVal });
      }
    }

    students.push({
      englishName,
      chineseName,
      displayName: chineseName || englishName,
      classroom: currentClass,
      subjects,
    });
  }
  return students;
}

function readStudentList(filename) {
  const wb = XLSX.readFile(path.join(DIR, filename));
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue;
    const name = row[1].toString().trim();
    const course = row[2] ? row[2].toString().trim() : '';
    const dobSerial = row[3];
    result.push({
      name,
      course,
      dob: excelDateToISO(dobSerial),
      isNew: filename.includes('新生'),
    });
  }
  return result;
}

// ── 名字匹配 ──
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[\s\-_()（）']+/g, '')
    .replace(/\(dp\)/gi, '')
    .replace(/dp$/i, '')  // remove trailing "(dp)" marker
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf]+/g, '') // remove Chinese chars
    .trim();
}

// Extract surname (first word) and given name parts for fuzzy matching
function nameParts(normalized) {
  // For Chinese pinyin names, surname is typically the first syllable
  // Try to split: "zhengruishang" → we can't easily, so use first N chars
  return normalized;
}

function matchStudents(namelistStudents, equistarStudents) {
  const equiMap = new Map();
  for (const e of equistarStudents) {
    const key = normalizeName(e.name);
    equiMap.set(key, e);
  }

  const merged = [];
  const unmatched = [];

  for (const ns of namelistStudents) {
    const key = normalizeName(ns.englishName);
    let eq = equiMap.get(key);

    // Direct match
    if (eq) {
      merged.push({
        ...ns,
        dob: eq.dob,
        course: eq.course,
        isNew: eq.isNew,
        matchedEnglish: eq.name,
      });
      equiMap.delete(key);
      continue;
    }

    // Try fuzzy match: check if the equistar name is contained in namelist name or vice versa
    // This handles cases like "Austin HEIN HTET NAING" vs "Hein Htet Naing"
    // or "Oliver Li Chenxu" vs "Wang Chenxu"
    let bestMatch = null;
    let bestScore = 0;

    for (const [k, v] of equiMap) {
      // Check containment (longer contains shorter)
      if (key.includes(k) || k.includes(key)) {
        const score = Math.min(key.length, k.length) / Math.max(key.length, k.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = [k, v];
        }
        continue;
      }

      // Check if given name part matches (skip first word which may differ)
      // e.g. "heinhtetnaing" in "austinheinhtetnaing"
      // Split original names by space to get parts
      const nsParts = ns.englishName.toLowerCase().split(/\s+/);
      const eqParts = v.name.toLowerCase().replace(/\(dp\)/gi, '').split(/\s+/).filter(Boolean);

      // Check if all equistar name parts appear in namelist name
      if (eqParts.length >= 2) {
        const allFound = eqParts.every(p => key.includes(p.replace(/[^a-z]/g, '')));
        if (allFound) {
          const score = 0.8;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = [k, v];
          }
        }
      }

      // Check if all namelist parts appear in equistar name
      if (nsParts.length >= 2) {
        const allFound = nsParts.every(p => k.includes(p.replace(/[^a-z]/g, '')));
        if (allFound) {
          const score = 0.8;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = [k, v];
          }
        }
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      merged.push({
        ...ns,
        dob: bestMatch[1].dob,
        course: bestMatch[1].course,
        isNew: bestMatch[1].isNew,
        matchedEnglish: bestMatch[1].name,
      });
      equiMap.delete(bestMatch[0]);
    } else {
      unmatched.push(ns);
    }
  }

  // Remaining equistar students not in namelist
  const unmatchedEquistar = [...equiMap.values()];

  return { merged, unmatched, unmatchedEquistar };
}

// ── 考试局映射 ──
function mapExamBoard(course, classroom) {
  if (!course && classroom) {
    // Infer from classroom name
    if (classroom.startsWith('IAL')) return 'Edexcel IAL';
    if (classroom.startsWith('OL')) return 'GCE O-Level';
    if (classroom.startsWith('SEC')) return 'GCE O-Level';
    if (classroom.startsWith('SGCE')) return 'GCE O-Level';
  }
  if (!course) return '';
  const c = course.toLowerCase();
  if (c.includes('pearson') || c.includes('edexcel')) return 'Edexcel IAL';
  if (c.includes('cie')) return 'CIE A-Level';
  if (c.includes('gce') && c.includes('o')) return 'GCE O-Level';
  if (c.includes('gce') && c.includes('a')) return 'GCE A-Level';
  return course;
}

// ── 入学日期推算 ──
function inferEnrolDate(isNew, classroom) {
  // 新生: 2026 年入学; 老生根据 classroom 年份推断
  if (classroom) {
    // IAL26S1 → 2026, IAL27M → 2027, OL26W → 2026
    const yearMatch = classroom.match(/(\d{2})/);
    if (yearMatch) {
      const year = 2000 + parseInt(yearMatch[1]);
      // S=semester1(Jan), W=winter(Jan), M=mid-year(Jul)
      const sem = classroom.match(/\d{2}([SWMJ])/i);
      if (sem) {
        const s = sem[1].toUpperCase();
        if (s === 'M') return `${year}-07-01`;
        if (s === 'W') return `${year}-01-01`;
        if (s === 'S') return `${year}-01-01`;
      }
      return `${year}-01-01`;
    }
  }
  return isNew ? '2026-01-01' : '2025-01-01';
}

// ── API 调用 ──
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOGIN_USER = process.env.LOGIN_USER || 'principal';
const LOGIN_PASS = process.env.LOGIN_PASS || '123456';
let cookie = '';

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: LOGIN_USER, password: LOGIN_PASS }),
    redirect: 'manual',
  });
  // Node.js fetch: use getSetCookie() or fallback to headers.get('set-cookie')
  let setCookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    setCookies = res.headers.getSetCookie();
  } else {
    const raw = res.headers.get('set-cookie');
    if (raw) setCookies = raw.split(/,(?=\s*\w+=)/);
  }
  cookie = setCookies.map(c => c.split(';')[0]).join('; ');
  console.log('  Cookie:', cookie ? cookie.slice(0, 40) + '...' : '(empty)');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${JSON.stringify(body)}`);
  console.log('✓ Logged in as', LOGIN_USER);
}

async function apiPost(path, body) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function apiGet(path) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: { Cookie: cookie },
  });
  return res.json();
}

// ── 主流程 ──
async function main() {
  console.log('读取 Excel 文件...\n');

  // 1. Read all files
  const namelistStudents = readNamelist();
  const newStudents = readStudentList('EquistarStudentList新生.xlsx');
  const oldStudents = readStudentList('EquistarStudentList老生.xlsx');
  const allEquistar = [...newStudents, ...oldStudents];

  console.log(`Namelist: ${namelistStudents.length} 名学生`);
  console.log(`新生名单: ${newStudents.length} 名`);
  console.log(`老生名单: ${oldStudents.length} 名`);

  // 2. Merge
  const { merged, unmatched, unmatchedEquistar } = matchStudents(namelistStudents, allEquistar);

  // Print match details
  console.log('\n── 匹配详情 ──');
  for (const m of merged) {
    if (m.englishName !== m.matchedEnglish) {
      console.log(`  ${m.englishName} ↔ ${m.matchedEnglish}`);
    }
  }

  console.log(`\n匹配成功: ${merged.length} 名`);
  if (unmatched.length) {
    console.log(`\n⚠ Namelist中未匹配 (${unmatched.length}):`);
    unmatched.forEach(s => console.log(`  - ${s.englishName} ${s.chineseName || ''} [${s.classroom}]`));
  }
  if (unmatchedEquistar.length) {
    console.log(`\n⚠ 新生/老生名单中未匹配 (${unmatchedEquistar.length}):`);
    unmatchedEquistar.forEach(s => console.log(`  - ${s.name} (${s.course}) DOB:${s.dob}`));
  }

  // 3. Build import list
  const importList = [];

  // Merged students (have both name+subjects and DOB+course)
  for (const s of merged) {
    importList.push({
      name: s.displayName,
      englishName: s.englishName,
      date_of_birth: s.dob,
      enrol_date: inferEnrolDate(s.isNew, s.classroom),
      exam_board: mapExamBoard(s.course, s.classroom),
      classroom: s.classroom,
      subjects: s.subjects,
      notes: `英文名: ${s.englishName}; 班级: ${s.classroom || ''}${s.isNew ? '; 新生' : '; 老生'}`,
    });
  }

  // Unmatched namelist students (no DOB/course info)
  for (const s of unmatched) {
    importList.push({
      name: s.displayName,
      englishName: s.englishName,
      date_of_birth: null,
      enrol_date: inferEnrolDate(false, s.classroom),
      exam_board: mapExamBoard(null, s.classroom),
      classroom: s.classroom,
      subjects: s.subjects,
      notes: `英文名: ${s.englishName}; 班级: ${s.classroom || ''}; 未匹配出生日期`,
    });
  }

  // Unmatched equistar students (have DOB but no subjects from namelist)
  for (const s of unmatchedEquistar) {
    importList.push({
      name: s.name,
      englishName: s.name,
      date_of_birth: s.dob,
      enrol_date: s.isNew ? '2026-01-01' : '2025-01-01',
      exam_board: mapExamBoard(s.course, null),
      classroom: null,
      subjects: [],
      notes: `${s.isNew ? '新生' : '老生'}; 未在Namelist中找到选课信息`,
    });
  }

  // 4. Print summary
  console.log('\n' + '═'.repeat(80));
  console.log(`  准备导入 ${importList.length} 名学生`);
  console.log('═'.repeat(80));

  for (let i = 0; i < importList.length; i++) {
    const s = importList[i];
    const subjectStr = s.subjects.map(x => x.code).join(', ') || '(无)';
    console.log(`\n${i + 1}. ${s.name} (${s.englishName})`);
    console.log(`   出生日期: ${s.date_of_birth || '未知'} | 入学: ${s.enrol_date} | 考试局: ${s.exam_board}`);
    console.log(`   班级: ${s.classroom || '未知'} | 科目: ${subjectStr}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 不执行实际导入。去掉 --dry-run 参数来执行导入。');
    return;
  }

  // 5. Login and import via API
  console.log('\n开始导入...\n');
  await login();

  // 5a. Ensure subjects exist
  const newSubjects = [
    { code: 'FMATH', name: '高等数学 Further Mathematics', category: '理科' },
    { code: 'AMATH', name: '附加数学 Additional Mathematics', category: '理科' },
    { code: 'CHN', name: '中文 Chinese', category: '文科' },
    { code: 'ACC', name: '会计 Accounting', category: '文科' },
    { code: 'ART', name: '艺术 Art & Design', category: '艺术' },
  ];

  for (const sub of newSubjects) {
    try {
      await apiPost('/subjects', sub);
      console.log(`  ✓ 新增科目: ${sub.code} (${sub.name})`);
    } catch (e) {
      if (e.message.includes('409')) {
        console.log(`  ⏭ 科目已存在: ${sub.code}`);
      } else {
        console.log(`  ⚠ 科目 ${sub.code}: ${e.message}`);
      }
    }
  }

  // Build subject map
  const allSubjects = await apiGet('/subjects');
  const subjectMap = new Map();
  for (const s of (allSubjects || [])) {
    subjectMap.set(s.code, s.id);
  }
  console.log(`  科目总数: ${allSubjects.length}`);

  // 5b. Create students and enroll subjects
  let created = 0, skipped = 0, errors = 0;

  for (const s of importList) {
    try {
      // Check if student already exists (by name)
      const searchRes = await apiGet(`/students?search=${encodeURIComponent(s.name)}`);
      const students = searchRes.students || searchRes || [];
      const found = students.find(st => st.name === s.name || st.name === s.englishName);

      let studentId;
      if (found) {
        console.log(`  ⏭ 跳过已有学生: ${s.name} (${found.id.slice(0,8)})`);
        studentId = found.id;
        skipped++;
      } else {
        const result = await apiPost('/students', {
          name: s.name,
          enrol_date: s.enrol_date,
          exam_board: s.exam_board,
          date_of_birth: s.date_of_birth,
          notes: s.notes,
          status: 'active',
        });
        studentId = result.id;
        console.log(`  ✓ 创建学生: ${s.name} → ${studentId.slice(0,8)}`);
        created++;
      }

      // Enroll subjects
      if (studentId && s.subjects.length > 0) {
        for (const sub of s.subjects) {
          const subjectId = subjectMap.get(sub.code);
          if (!subjectId) {
            console.log(`    ⚠ 未找到科目: ${sub.code}`);
            continue;
          }
          try {
            await apiPost(`/students/${studentId}/subjects`, {
              subject_id: subjectId,
              level: s.exam_board.includes('O-Level') ? 'O-Level' : 'A2',
              exam_board: s.exam_board,
            });
            console.log(`    + ${sub.code}`);
          } catch (e) {
            // May already be enrolled
          }
        }
      }
    } catch (e) {
      console.log(`  ✗ 失败: ${s.name} - ${e.message}`);
      errors++;
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`  导入完成: 新增 ${created}, 跳过 ${skipped}, 失败 ${errors}`);
  console.log('═'.repeat(80));
}

main().catch(e => {
  console.error('导入失败:', e);
  process.exit(1);
});
