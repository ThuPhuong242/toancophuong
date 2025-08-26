require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { parse } = require('csv-parse');
const { stringify } = require('csv-stringify/sync');

const app = express();
app.use(express.json());
app.use(cookieParser());

// Serve frontend cùng origin
app.use(express.static(path.join(__dirname, 'public')));

const { JWT_SECRET = 'dev-secret', PORT = 3000 } = process.env;

// ======= SEED DATA (in-memory) =======
const lessons = [
  { id: 'cauchy1', name: 'Cauchy #1', tasks: 10 },
  { id: 'quad',    name: 'Hàm bậc hai', tasks: 8 },
  { id: 'combo',   name: 'Tổ hợp', tasks: 12 }
];

const classes = {
  "10A1": {
    students: [
      {
        code: "10A1-023",
        pin: "1234",
        name: "Nguyễn Minh An",
        grades: [
          { lessonId: 'cauchy1', score: 9.00, rank: 2,  total: 45, status: 'Đã nộp', progress: 100, remark: '' },
          { lessonId: 'quad',    score: null, rank: null,total: 45, status: 'Đang làm', progress: 40,  remark: '' },
          { lessonId: 'combo',   score: null, rank: null,total: 45, status: 'Chưa bắt đầu', progress: 0, remark: '' }
        ]
      },
      {
        code: "10A1-005",
        pin: "5678",
        name: "Trần Thu Hà",
        grades: [
          { lessonId: 'cauchy1', score: 7.75, rank: 12, total: 45, status: 'Đã nộp', progress: 100, remark: '' },
          { lessonId: 'quad',    score: 8.25, rank: 6,  total: 45, status: 'Đã nộp', progress: 100, remark: '' },
          { lessonId: 'combo',   score: null, rank: null,total: 45, status: 'Chưa bắt đầu', progress: 0, remark: '' }
        ]
      }
    ]
  }
};
// =====================================

// ===== Helpers auth & role =====
function sign(res, payload){
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // bật secure khi chạy HTTPS
    maxAge: 2 * 60 * 60 * 1000
  });
}
function authRequired(req, res, next){
  const token = req.cookies.token;
  if(!token) return res.status(401).json({ error: 'Unauthenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}
function requireTeacher(req, res, next){
  if(req.user?.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  next();
}
function requireStudent(req, res, next){
  if(req.user?.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
  next();
}

function ensureClass(classId){
  if(!classes[classId]) classes[classId] = { students: [] };
  return classes[classId];
}
function ensureStudent(classId, studentCode, attrs = {}){
  const cl = ensureClass(classId);
  let stu = cl.students.find(s => s.code === studentCode);
  if(!stu){
    stu = { code: studentCode, pin: attrs.pin || '', name: attrs.name || '', grades: [] };
    cl.students.push(stu);
  } else {
    if(attrs.name) stu.name = attrs.name;
    if(attrs.pin)  stu.pin  = attrs.pin;
  }
  return stu;
}
function findStudent(classId, studentCode){
  const cl = classes[classId];
  if(!cl) return null;
  return cl.students.find(s => s.code === studentCode) || null;
}
function flattenClassToRows(classId){
  const cl = classes[classId];
  if(!cl) return [];
  const rows = [];
  cl.students.forEach(stu=>{
    if(!stu.grades || !stu.grades.length){
      rows.push({ classId, studentCode: stu.code, pin: stu.pin || '', name: stu.name || '',
        lessonId: '', score: '', rank: '', total: '', status: '', progress: '', remark: '' });
      return;
    }
    stu.grades.forEach(g=>{
      rows.push({
        classId,
        studentCode: stu.code,
        pin: stu.pin || '',
        name: stu.name || '',
        lessonId: g.lessonId || '',
        score: g.score ?? '',
        rank: g.rank ?? '',
        total: g.total ?? '',
        status: g.status || '',
        progress: typeof g.progress === 'number' ? g.progress : '',
        remark: g.remark || ''
      });
    });
  });
  return rows;
}

// ===== AUTH =====
app.get('/auth/me', (req,res)=>{
  try{
    const token = req.cookies.token;
    if(!token) return res.json({ role: 'guest' });
    const user = jwt.verify(token, JWT_SECRET);
    res.json({ role: user.role, class: user.class, studentCode: user.studentCode, teacherId: user.teacherId });
  }catch{ res.json({ role: 'guest' }); }
});
app.post('/auth/login-teacher', (req,res)=>{
  const { user, pass } = req.body || {};
  if(user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS){
    sign(res, { role:'teacher', teacherId:user });
    return res.json({ ok:true, role:'teacher' });
  }
  res.status(401).json({ error: 'Sai thông tin giáo viên' });
});
app.post('/auth/login-student', (req,res)=>{
  const { class:clazz, code, pin } = req.body || {};
  if(!clazz || !code) return res.status(400).json({ error: 'Thiếu lớp hoặc mã học sinh' });
  const stu = findStudent(clazz, code);
  if(!stu) return res.status(401).json({ error: 'Không tìm thấy mã học sinh' });
  if(stu.pin && pin && pin !== stu.pin) return res.status(401).json({ error: 'Sai PIN' });
  sign(res, { role:'student', class:clazz, studentCode:code });
  res.json({ ok:true, role:'student' });
});
app.post('/auth/logout', (req,res)=>{
  res.clearCookie('token', { httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV === 'production' });
  res.json({ ok:true });
});

// ===== STUDENT =====
app.get('/student/grades', authRequired, requireStudent, (req,res)=>{
  const { class:clazz, studentCode } = req.user;
  const stu = findStudent(clazz, studentCode);
  if(!stu) return res.status(404).json({ error:'Not found' });
  res.json({ student: { code: stu.code, name: stu.name, class: clazz }, lessons, grades: stu.grades });
});
app.get('/student/progress', authRequired, requireStudent, (req,res)=>{
  const { class:clazz, studentCode } = req.user;
  const stu = findStudent(clazz, studentCode);
  if(!stu) return res.status(404).json({ error:'Not found' });
  const avg = Math.round((stu.grades.reduce((s,g)=>s+(g.progress||0),0) / (stu.grades.length||1)));
  res.json({ progress: avg });
});

// ===== ADMIN =====
app.get('/admin/class/:classId/grades', authRequired, requireTeacher, (req,res)=>{
  const { classId } = req.params;
  const cl = classes[classId];
  if(!cl) return res.status(404).json({ error:'Không có lớp' });
  const rows = [];
  cl.students.forEach(stu=>{
    stu.grades.forEach(g=>{
      rows.push({
        studentCode: stu.code,
        studentName: stu.name,
        lessonId: g.lessonId,
        score: g.score,
        rank: g.rank,
        total: g.total,
        remark: g.remark,
        status: g.status
      });
    });
  });
  res.json({ classId, rows });
});
app.post('/admin/grade', authRequired, requireTeacher, (req,res)=>{
  const { classId, studentCode, lessonId, score, remark, status, progress } = req.body || {};
  if(!classId || !studentCode || !lessonId) return res.status(400).json({ error:'Thiếu tham số' });
  const stu = findStudent(classId, studentCode);
  if(!stu) return res.status(404).json({ error:'Không thấy học sinh' });
  let g = stu.grades.find(x=>x.lessonId===lessonId);
  if(!g){
    g = { lessonId, score:null, rank:null, total:(classes[classId]?.students?.length||0), status:'Chưa bắt đầu', progress:0, remark:'' };
    stu.grades.push(g);
  }
  if(score !== undefined) g.score = score;
  if(typeof remark === 'string') g.remark = remark;
  if(status) g.status = status;
  if(typeof progress === 'number') g.progress = progress;
  res.json({ ok:true, grade:g });
});

// ===== IMPORT CSV =====
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
app.post('/admin/import-students', authRequired, requireTeacher, upload.single('file'), async (req,res) => {
  if(!req.file) return res.status(400).json({ error: 'Thiếu file CSV (field name: file)' });

  const results = { createdStudents: 0, updatedStudents: 0, createdGrades: 0, updatedGrades: 0, rows: 0, errors: [] };
  try {
    const rows = [];
    await new Promise((resolve, reject) => {
      parse(req.file.buffer, { bom:true, columns:true, skip_empty_lines:true, trim:true })
        .on('readable', function(){ let r; while((r=this.read())) rows.push(r); })
        .on('error', reject)
        .on('end', resolve);
    });

    const validLessonIds = new Set(lessons.map(l=>l.id));

    for (const [i, r] of rows.entries()) {
      results.rows++;
      const classId = (r.classId||'').trim();
      const studentCode = (r.studentCode||'').trim();
      if(!classId || !studentCode){ results.errors.push(`Dòng ${i+2}: thiếu classId hoặc studentCode`); continue; }
      const pin  = (r.pin||'').trim();
      const name = (r.name||'').trim();

      const cl = ensureClass(classId);
      const existed = !!cl.students.find(s => s.code === studentCode);
      const stu = ensureStudent(classId, studentCode, { pin, name });
      if(existed) results.updatedStudents++; else results.createdStudents++;

      const lessonId = (r.lessonId||'').trim();
      if(lessonId){
        if(!validLessonIds.has(lessonId)){ results.errors.push(`Dòng ${i+2}: lessonId không hợp lệ (${lessonId})`); continue; }
        const score    = r.score === '' ? null : Number(r.score);
        const rank     = r.rank  === '' ? null : Number(r.rank);
        const total    = r.total === '' ? null : Number(r.total);
        const status   = (r.status||'').trim() || undefined;
        const progress = r.progress === '' ? undefined : Number(r.progress);
        const remark   = (r.remark||'').trim();

        let g = stu.grades.find(x => x.lessonId === lessonId);
        if(!g){ g = { lessonId, score:null, rank:null, total:null, status:'Chưa bắt đầu', progress:0, remark:'' }; stu.grades.push(g); results.createdGrades++; }
        else { results.updatedGrades++; }

        if(score !== null) g.score = score;
        if(rank  !== null) g.rank  = rank;
        if(total !== null) g.total = total;
        if(typeof status === 'string') g.status = status;
        if(typeof progress === 'number' && !Number.isNaN(progress)) g.progress = progress;
        if(remark) g.remark = remark;
      }
    }

    res.json({ ok:true, ...results });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'CSV không hợp lệ hoặc lỗi khi đọc file.' });
  }
});

// ===== EXPORT CSV & TEMPLATE =====
app.get('/admin/export-students', authRequired, requireTeacher, (req,res)=>{
  const { classId } = req.query;
  if(!classId) return res.status(400).json({ error: 'Thiếu classId' });
  if(!classes[classId]) return res.status(404).json({ error: 'Không có lớp' });
  const rows = flattenClassToRows(classId);
  const csv = stringify(rows, { header:true, columns:['classId','studentCode','pin','name','lessonId','score','rank','total','status','progress','remark'] });
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="students_${classId}.csv"`);
  res.send(csv);
});
app.get('/admin/template-students', authRequired, requireTeacher, (req,res)=>{
  const csv = 'classId,studentCode,pin,name,lessonId,score,rank,total,status,progress,remark\n';
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="students_template.csv"');
  res.send(csv);
});

// ===== Fallback SPA =====
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, ()=> console.log(`Server running on http://localhost:${PORT}`));
