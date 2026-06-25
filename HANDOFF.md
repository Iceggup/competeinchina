# CompeteInChina 项目交接文档

> **日期**: 2026-06-25  
> **会话编号**: 92bff6ab-bde4-4da3-bbbb-76e40f34134a  
> **下一任务**: 前台用户系统完整升级（导航栏登录态 + 个人信息页 + 礼宾申请管理）

---

## 一、项目概述

**CompeteInChina** 是一个面向海外创业团队的国内创新赛事展示平台。

- **线上地址**: https://www.competeinchina.com
- **测试地址**: Cloudflare Tunnel 临时地址（需重启）
- **技术栈**: Node.js + Express + SQLite | 纯原生 HTML/CSS/JS
- **GitHub**: `Iceggup/competeinchina`（PAT已配置在环境变量中）

---

## 二、文件结构

```
/workspace/competeinchina/
├── server.js          # Express 后端（~1180行）
├── index.html         # 前台首页（~3400行，单文件巨型HTML）
├── admin.html         # 后台面板（~1000行，单文件HTML）
├── registration_form_typeform_en.html  # 礼宾注册表单（多步骤）
├── init-db.js         # 数据库初始化脚本
├── package.json       # 依赖: express, better-sqlite3, jsonwebtoken, resend, cors, dotenv
├── .env               # PORT=3300, RESEND_API_KEY=..., ADMIN账号
├── db/competeinchina.db  # SQLite 数据库
├── images/wecom-icon.png  # 企业微信图标
├── scripts/
│   ├── competition_sources.json  # 赛事来源 + 微信公众号列表
│   └── update-workflow.md        # 每周三更新流程文档
└── HANDOFF.md         # 本文件
```

---

## 三、数据库结构

### 表一览

| 表名 | 用途 | 记录数 |
|------|------|--------|
| `users` | 注册用户 | 5 |
| `registrations` | 礼宾表单提交（Concierge）| 2 |
| `concierge_applications` | Concierge申请（旧，基本空）| 0 |
| `competitions` | 赛事信息 | 9（其中3个 featured=1）|
| `organizer_submissions` | 赛事主办方提交 | 2 |
| `site_config` | 前台CMS配置 | 若干条 |

### users 表结构
```sql
id INTEGER PRIMARY KEY AUTOINCREMENT,
email TEXT UNIQUE NOT NULL,
password_hash TEXT NOT NULL,  -- SHA256，无salt
full_name TEXT,
role TEXT DEFAULT 'user',    -- 'user' | 'admin'
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- 从未被更新过
```
默认管理员: `admin@competeinchina.com` / `CompeteInChina2026!`

### registrations 表结构（礼宾表单数据）
37个字段，包含: team_name, country, team_size, stage, contact_name, contact_email, contact_phone, contact_linkedin, contact_wechat, industry, product_desc, business_model, funded, funding_round, ip, cn_cities, register_cn, roadmap, support_needed, team_members, pitch_deck, notes, status, competition_ids, submitted_at 等

### competitions 表结构
17个字段，包含: title, city, deadline, prize, prize_category, industries(JSON), level, desc, highlights(JSON), apply_url, english_url, stage, title_cn, featured(INT), sort_order(INT), created_at

---

## 四、现有 API 端点

### 认证相关
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/send-verify-code` | 无 | 发送邮箱验证码（Resend API）|
| POST | `/api/verify-code` | 无 | 校验验证码 |
| POST | `/api/users/register` | 无 | 注册新用户 |
| POST | `/api/users/login` | 无 | 登录（email+password）|
| POST | `/api/users/auth-for-form` | 无 | 表单专用鉴权（仅凭email自动创建/登录）|
| GET | `/api/users/me` | Bearer JWT | 获取当前用户信息 |
| POST | `/api/admin/login` | 无 | 管理员登录 |

### 用户数据相关
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/admin/users` | Bearer + admin | 列出所有用户 |

### 礼宾/报名相关
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/registrations` | Bearer JWT | 提交礼宾表单 |
| GET | `/api/registrations` | Bearer + admin | 列出所有报名 |
| PATCH | `/api/registrations/:id/status` | Bearer + admin | 更新状态 |
| POST | `/api/concierge` | optionalAuth | 提交Concierge申请 |
| GET | `/api/concierge` | Bearer + admin | 列出所有Concierge申请 |
| **GET** | **`/api/concierge/my`** | **⚠️ 不存在！** | **前端在调用但404** |

### Admin 别名路由（admin.html 用 /api/admin 前缀）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户列表 |
| GET | `/api/admin/registrations` | 报名列表 |
| PATCH | `/api/admin/registrations/:id/status` | 更新状态 |
| GET | `/api/admin/concierge` | Concierge列表 |
| GET | `/api/admin/competitions` | 赛事列表 |
| POST/PUT/DELETE | `/api/admin/competitions...` | 赛事CRUD |
| GET | `/api/admin/organizer-submissions` | 主办方提交 |
| PATCH | `/api/admin/organizer-submissions/:id/status` | 状态更新 |
| GET | `/api/admin/expiring` | 即将过期/已过期赛事 |
| POST | `/api/admin/auto-close-expired` | 自动标记过期 |
| GET | `/api/admin/export/registrations` | CSV导出 |
| GET | `/api/admin/stats` | 统计数据 |
| PUT | `/api/admin/config/:key` | 站点配置 |

### 公开 API
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/competitions` | 赛事列表（支持 ?city= & ?featured=true）|
| GET | `/api/config` | 站点配置（CMS）|
| POST | `/api/organizer-submission` | 主办方提交赛事 |

---

## 五、已完成的功能（14个Task全部完成）

### P0: 前后端注册流程全链路打通 ✅
- auth-for-form 端点修复了重复提交Auth failed的问题
- SQL INSERT 列数不匹配修复
- 全链路测试通过

### P1: 前台视觉升级 ✅
- CSS变量体系重构
- Hero区 38px标题 + 渐变 + CTA按钮
- 卡片悬停效果 + 胶囊标签
- 按钮现代化

### P2: CMS内容管理系统 ✅
- Site Content Tab 可编辑 Hero文案/统计数据/公告栏
- 前台从 /api/config 动态读取

### P3: 后台管理面板UX优化 ✅
- 5-Tab导航: Competitions / Users / Concierge / Organizers / Site Content
- 登录机制（Login弹窗 + JWT Token）
- 表格斑马纹 + 搜索 + CSV导出
- 键盘快捷键

### 附加功能
- LinkedIn链接修复为 `tech-in-bridge/?viewAsMember=true`
- Organizers表单增加手机号+微信号
- 企业微信客服按钮（白底圆形图标）
- Featured重点推荐功能
- 每周三赛事自动更新机制
- 过期赛事不删除、灰显保留

---

## 六、⚠️ 待解决的核心问题：前台用户系统升级

### 问题描述
1. **导航栏无登录态** — 注册/登录后右上角仍然是"Sign Up Free"，没有用户名显示
2. **无用户信息页** — 用户无法查看/编辑个人资料
3. **Dashboard 简陋** — 仅显示Concierge申请，无个人信息
4. **`/api/concierge/my` 端点缺失** — 前端调用404，Dashboard实际依赖localStorage
5. **无用户资料更新API** — 没有 PUT/PATCH 用户端点
6. **登录机制脆弱** — 前端仅存 `cic_user={name,email}` 明文，无JWT token

### 当前前端认证现状

#### index.html 登录流程（`submitSignup()` 函数，约第2691行）
```javascript
// 当前流程：
1. 用户填写 Name + Email + Password
2. 先尝试 POST /api/auth/signup（但server.js没有这个路由！实际是/users/register）
3. 失败则回退 POST /api/auth/login
4. 成功存储: localStorage.setItem('cic_user', JSON.stringify({name, email}))
5. ⚠️ 不存储 token！不更新导航栏！
```

#### 导航栏按钮（第1008-1025行）
```html
<!-- 永远显示 Sign Up Free，登录后不变 -->
<button class="nav-cta" onclick="openSignup()">Sign Up Free</button>
```

#### Dashboard（renderDashboard() 第2793行）
```javascript
// 从 localStorage 读取用户
var user = localStorage.getItem('cic_user');
var userEmail = user ? JSON.parse(user).email : '';
// 调用不存在的端点！
var resp = await fetch('/api/concierge/my?email=' + encodeURIComponent(userEmail));
// 404 → 回退到 localStorage cic_concierge_applications
```

### 详细实现方案

#### 方案文件位置
`/root/.codebuddy/plans/radiant-nebula-turing.md`

#### 后端需要新增的 API（server.js）

**1. GET /api/concierge/my**（行号建议：在 /api/concierge 之后）
```javascript
app.get('/api/concierge/my', verifyToken, (req, res) => {
  try {
    const db = getDb();
    const apps = db.prepare(`SELECT * FROM concierge_applications WHERE user_id = ? ORDER BY created_at DESC`)
      .all(req.user.userId);
    db.close();
    res.json({ success: true, applications: apps });
  } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});
```

**2. PATCH /api/users/me** — 更新用户资料
```javascript
app.patch('/api/users/me', verifyToken, (req, res) => {
  // 可更新: full_name, email（需唯一性校验）
  // 同步更新 updated_at
});
```

**3. POST /api/users/change-password**
```javascript
app.post('/api/users/change-password', verifyToken, (req, res) => {
  // 校验 currentPassword → 更新 password_hash
});
```

**4. GET /api/users/my-applications** — 用户的礼宾申请
```javascript
app.get('/api/users/my-applications', verifyToken, (req, res) => {
  // 查询 registrations 表中 user_id = req.user.userId 的记录
});
```

**5. PATCH /api/users/my-applications/:id** — 编辑自己的申请
```javascript
app.patch('/api/users/my-applications/:id', verifyToken, (req, res) => {
  // 仅允许 pending 状态的申请被编辑
  // 校验申请属于当前用户
});
```

#### 前端需要改造的部分（index.html）

**改造1: 导航栏登录态**
```
未登录: [Sign Up Free] 按钮
已登录: [👤 用户名 ▼] 下拉菜单
  ├── My Profile
  ├── Dashboard  
  ├── My Concierge
  └── Sign Out
```

CSS需要新增下拉菜单样式：
```css
.nav-user { position: relative; display: flex; align-items: center; gap: 8px; }
.nav-user-menu { display: none; position: absolute; top: 100%; right: 0; ... }
.nav-user:hover .nav-user-menu { display: block; }
```

JS需要新增函数：
- `updateNavAuth()` — 根据 `cic_token` 存在与否切换导航栏
- `logout()` — 清除 token + user，刷新导航栏
- `showProfile()` — 打开个人信息页
- 修改 `openSignup()` / `submitSignup()` — 成功后存储token并调用 updateNavAuth()

**改造2: 个人信息页**
新增 `<div id="page-profile">` 页面，包含：
- 个人信息卡片（Full Name, Email, Role, Registered Date）
- 编辑按钮 → 内联编辑模式
- 修改密码表单
- 下方：我的礼宾申请列表（带状态标签、查看/编辑按钮）

**改造3: Dashboard 增强**
- 顶部显示 "Welcome back, {name}"
- 使用 JWT token 调用 `/api/users/my-applications`
- 申请列表可点击查看详情弹窗

---

## 七、关键技术细节

### 启动方式
```bash
cd /workspace/competeinchina
NODE_OPTIONS="" node server.js    # 必须设置 NODE_OPTIONS=""
```

### Cloudflare Tunnel
```bash
cloudflared tunnel --url http://localhost:3300 &
# 从日志提取URL: grep -o 'https://[^ ]*trycloudflare\.com' /tmp/cloudflared.log
```

### 浏览器缓存
index.html 和 admin.html 修改后浏览器缓存极其顽固。
- 测试时用 Ctrl+Shift+R 强制刷新
- 或用 `/index.html?v=时间戳` 绕过缓存

### 数据库备份
```bash
cp db/competeinchina.db db/competeinchina.db.bak
```

---

## 八、未完成任务清单（供下一个对话使用）

### 🔴 高优先级：前台用户系统升级
- [ ] **后端**: 新增 GET /api/concierge/my
- [ ] **后端**: 新增 PATCH /api/users/me
- [ ] **后端**: 新增 POST /api/users/change-password  
- [ ] **后端**: 新增 GET /api/users/my-applications
- [ ] **后端**: 新增 PATCH /api/users/my-applications/:id
- [ ] **前端**: 导航栏登录态改造（用户名下拉菜单 + 登出）
- [ ] **前端**: 登录/注册流程改为存储JWT token
- [ ] **前端**: 新增个人信息页（Profile Page）
- [ ] **前端**: Dashboard 增强（用户问候 + 真实API数据）
- [ ] **前端**: 礼宾申请查看/编辑功能

### 🟡 中优先级
- [ ] 修复 signup 弹窗调用不存在的 /api/auth/signup 路由
- [ ] 密码哈希加 salt（当前裸 SHA256）
- [ ] 用户注册后自动更新导航栏

### 🟢 低优先级
- [ ] 移动端导航栏适配
- [ ] 用户头像支持
- [ ] 邮箱验证后自动填充注册表单

---

## 九、快速参考

| 项目 | 值 |
|------|-----|
| 项目路径 | `/workspace/competeinchina` |
| 本地端口 | `3300` |
| 管理员 | `admin@competeinchina.com` / `CompeteInChina2026!` |
| Resend API Key | 已配置在 .env 中 |
| GitHub | `Iceggup/competeinchina` |
| 计划文件 | `/root/.codebuddy/plans/radiant-nebula-turing.md` |
| 赛事来源配置 | `scripts/competition_sources.json` |
| 每周三更新流程 | `scripts/update-workflow.md` |
