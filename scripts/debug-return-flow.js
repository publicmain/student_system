#!/usr/bin/env node
/**
 * 退回修改流程端到端测试
 * 必须在 server 运行时执行：node scripts/debug-return-flow.js
 */
const http = require('http');

const call = async (m, p, b, c) => new Promise(r => {
  const o = { hostname: 'localhost', port: 3000, path: p, method: m, headers: { 'Content-Type': 'application/json' } };
  if (c) o.headers.Cookie = c;
  const q = http.request(o, s => { let d = ''; s.on('data', x => d += x); s.on('end', () => r({ s: s.statusCode, d: JSON.parse(d || '{}'), h: s.headers })); });
  if (b) q.write(JSON.stringify(b)); q.end();
});

const login = async (u, p) => {
  const r = await new Promise(r => {
    const q = http.request({ hostname: 'localhost', port: 3000, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => r(s.headers['set-cookie']?.map(c => c.split(';')[0]).join('; '))); });
    q.write(JSON.stringify({ username: u, password: p })); q.end();
  });
  return r;
};

(async () => {
  const ck = await login('principal', '123456');
  console.log('Login: OK\n');

  // === SETUP ===
  console.log('=== SETUP ===');
  const newCase = await call('POST', '/api/intake-cases', { student_name: 'DEBUG_' + Date.now(), program_name: 'Test', intake_year: 2026 }, ck);
  const caseId = newCase.d.id;
  console.log('Case:', caseId?.slice(0, 8));

  const companies = await call('GET', '/api/mat-companies', null, ck);
  const co = companies.d[0];
  if (!co) { console.log('ERROR: No company'); return; }
  const contacts = await call('GET', '/api/mat-companies/' + co.id + '/contacts', null, ck);
  const ct = contacts.d[0];
  if (!ct) { console.log('ERROR: No contact'); return; }

  const matRes = await call('POST', '/api/intake-cases/' + caseId + '/mat-request', { company_id: co.id, contact_id: ct.id }, ck);
  const mrId = matRes.d.requestId;
  const token = matRes.d.token;
  console.log('MatRequest:', mrId?.slice(0, 8), 'Token:', token ? 'OK' : 'MISSING');
  if (!token) { console.log('ABORT: no token'); return; }

  const getState = async () => {
    const det = await call('GET', '/api/intake-cases/' + caseId, null, ck);
    return det.d.matRequest;
  };

  // =========================================================
  console.log('\n========== SCENARIO A: Submit v1 → Return → Resubmit v2 ==========');
  // =========================================================

  // Submit v1
  const v1 = { surname: 'CHEN', given_name: 'Wei', passport_no: 'E12345', dob: '2000-01-01', nationality: 'Chinese', email: 't@t.com', phone_mobile: '+86', passport_expiry: '2030-01-01', country_of_residence: 'China' };
  const s1 = await call('POST', '/api/agent/uif/submit?token=' + token, { data: v1 });
  console.log('\n[Submit v1]', s1.d.ok ? 'OK v' + s1.d.version : 'FAIL');
  let st = await getState();
  console.log('  req=' + st?.status + ' v' + st?.current_version + ' | uif=' + st?.uif?.status + ' v' + st?.uif?.version_no);

  // Return
  const r1 = await call('POST', '/api/mat-requests/' + mrId + '/return', { reason: 'Passport wrong', field_notes: { passport_no: 'Number mismatch' } }, ck);
  console.log('\n[Return]', r1.d.ok ? 'OK' : 'FAIL');
  st = await getState();
  console.log('  req=' + st?.status + ' | uif=' + st?.uif?.status);
  console.log('  return_reason:', st?.return_reason?.slice(0, 30));
  console.log('  field_notes:', st?.uif?.field_notes?.slice(0, 50));
  console.log('  reviewActions:', st?.reviewActions?.length);

  // Resubmit v2
  const v2 = { ...v1, passport_no: 'E99999' };
  const s2 = await call('POST', '/api/agent/uif/submit?token=' + token, { data: v2 });
  console.log('\n[Submit v2]', s2.d.ok ? 'OK v' + s2.d.version : 'FAIL');
  st = await getState();
  console.log('  req=' + st?.status + ' v' + st?.current_version + ' | uif=' + st?.uif?.status + ' v' + st?.uif?.version_no);
  console.log('  return_reason cleared:', st?.uif?.return_reason === null ? 'YES' : 'NO');
  console.log('  field_notes cleared:', st?.uif?.field_notes === null ? 'YES' : 'NO');
  console.log('  passport_no:', JSON.parse(st?.uif?.data || '{}').passport_no, '(expect E99999)');

  // =========================================================
  console.log('\n========== SCENARIO D: Multi-round v2→ret→v3→ret→v4 ==========');
  // =========================================================

  // Return v2
  const r2 = await call('POST', '/api/mat-requests/' + mrId + '/return', { reason: 'Photo blurry' }, ck);
  console.log('\n[Return 2]', r2.d.ok ? 'OK' : 'FAIL');

  // Submit v3
  const s3 = await call('POST', '/api/agent/uif/submit?token=' + token, { data: { ...v2, surname: 'V3' } });
  console.log('[Submit v3]', s3.d.ok ? 'OK v' + s3.d.version : 'FAIL');

  // Return v3
  const r3 = await call('POST', '/api/mat-requests/' + mrId + '/return', { reason: 'Address incomplete' }, ck);
  console.log('[Return 3]', r3.d.ok ? 'OK' : 'FAIL');

  // Submit v4
  const s4 = await call('POST', '/api/agent/uif/submit?token=' + token, { data: { ...v2, surname: 'V4_FINAL', address_line1: 'Complete Address' } });
  console.log('[Submit v4]', s4.d.ok ? 'OK v' + s4.d.version : 'FAIL');

  // =========================================================
  console.log('\n========== FINAL STATE ==========');
  // =========================================================
  st = await getState();
  console.log('req=' + st?.status + ' v' + st?.current_version);
  console.log('uif=' + st?.uif?.status + ' v' + st?.uif?.version_no);
  console.log('Versions:', st?.uifVersions?.map(v => 'v' + v.version_no + '(' + v.status + ',cur=' + v.is_current + ')').join(' '));
  console.log('Actions:', st?.reviewActions?.map(a => a.action_type + '@v' + a.version_no).join(' → '));
  console.log('Data surname:', JSON.parse(st?.uif?.data || '{}').surname, '(expect V4_FINAL)');

  // =========================================================
  console.log('\n========== CONSISTENCY CHECKS ==========');
  // =========================================================
  const curVers = st?.uifVersions?.filter(v => v.is_current === 1);
  const checks = [
    ['Single current version', curVers?.length === 1],
    ['current matches request', curVers?.[0]?.version_no === st?.current_version],
    ['Version count = 4', st?.uifVersions?.length === 4],
    ['Review actions = 3', st?.reviewActions?.length === 3],
    ['Latest data = V4_FINAL', JSON.parse(st?.uif?.data || '{}').surname === 'V4_FINAL'],
    ['return_reason null', st?.uif?.return_reason === null],
    ['field_notes null', st?.uif?.field_notes === null],
    ['req status SUBMITTED', st?.status === 'SUBMITTED'],
    ['uif status SUBMITTED', st?.uif?.status === 'SUBMITTED'],
  ];
  let pass = 0, fail = 0;
  checks.forEach(([name, ok]) => { console.log('  ' + (ok ? '✓' : '✗') + ' ' + name); if (ok) pass++; else fail++; });
  console.log('\nResult: ' + pass + ' PASS, ' + fail + ' FAIL');

  // Cleanup
  await call('DELETE', '/api/intake-cases/' + caseId, null, ck);
  console.log('\nCleanup: done');
})().catch(e => console.error('ERROR:', e.message, e.stack?.slice(0, 200)));
