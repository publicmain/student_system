/**
 * 鉴权与权限中间件
 */

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: '未登录' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ error: '权限不足' });
    next();
  };
}

function requireAgentModule(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  if (!['principal', 'agent'].includes(req.session.user.role))
    return res.status(403).json({ error: '无权访问代理模块' });
  next();
}

function requireAdmissionModule(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '未登录' });
  if (!['principal', 'intake_staff', 'student_admin'].includes(req.session.user.role))
    return res.status(403).json({ error: '无权访问入学管理模块' });
  next();
}

function stripAgentFields(obj) {
  if (!obj) return obj;
  const safe = { ...obj };
  ['agent_name','agent_id','referral_id','referral_type','source_type',
   'agent_email','agent_phone','agent_status','commission_amount',
   'pending_commission','paid_commission','rule_name','rule_type'].forEach(k => delete safe[k]);
  return safe;
}

module.exports = { requireAuth, requireRole, requireAgentModule, requireAdmissionModule, stripAgentFields };
