# CompeteInChina 项目交接文档

> **日期**: 2026-06-25
> **GitHub**: `Iceggup/competeinchina`，最新 commit `c2b3cb2`
> **本地**: `/workspace/competeinchina`

---

## 零、启动指令（新对话第一件事）

```bash
cd /workspace && rm -rf competeinchina && git clone https://github.com/Iceggup/competeinchina.git
cd competeinchina && npm install && NODE_OPTIONS="" node init-db.js
NODE_OPTIONS="" node migrate-tracking.js
NODE_OPTIONS="" nohup node server.js > /tmp/server.log 2>&1 &
sleep 3 && curl http://localhost:3300/api/health
```

---

## 一、项目概述

**CompeteInChina** — 面向海外创业团队的国内创新赛事展示平台。
- 线上: https://www.competeinchina.com
- 本地: http://localhost:3300
- 技术栈: Node.js + Express + SQLite | 纯原生 HTML/CSS/JS
- Admin: `admin` / `CompeteInChina2026!`
- GitHub PAT: 存储在环境变量或本地 .git-credentials 中

---

## 二、文件结构

```
/workspace/competeinchina/
├── server.js                          # Express 后端 (~1600行)
├── index.html                         # 前台首页 (~3800行)
├── admin.html                         # 后台面板 (~1400行)
├── registration_form_typeform_en.html # 礼宾注册表单 (8步骤)
├── init-db.js                         # 数据库初始化
├── migrate-tracking.js                # 追踪表迁移脚本
├── package.json
├── db/competeinchina.db               # SQLite 数据库
└── images/
```

---

## 三、数据库表一览

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `users` | 注册用户 | id, email, password_hash, full_name, role |
| `registrations` | 礼宾表单提交 (40列) | id, user_id, team_name, contact_email, passport, resume, website, pitch_deck, status |
| `concierge_applications` | Concierge申请(旧) | id, user_id, company_name, email, status |
| `competitions` | 赛事信息 (17列) | id, title, city, deadline, featured, sort_order |
| `site_config` | CMS配置 | key, value, type |
| **`competition_tracking`** | **赛事追踪(新)** | id, user_id, competition_name, competition_id, current_stage, notes |

---

## 四、全部 API 端点

### 认证
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/send-verify-code` | 无 | 发送邮箱验证码 |
| POST | `/api/verify-code` | 无 | 校验验证码 |
| POST | `/api/users/register` | 无 | 注册 |
| POST | `/api/users/login` | 无 | 登录 |
| POST | `/api/users/auth-for-form` | 无 | 表单专用鉴权 |
| POST | `/api/users/reset-password` | 无 | 忘记密码重置 |
| GET | `/api/users/me` | JWT | 当前用户信息 |
| PATCH | `/api/users/me` | JWT | 更新资料 |
| POST | `/api/users/change-password` | JWT | 修改密码 |
| GET | `/api/users/my-applications` | JWT | 用户的礼宾申请 |

### 礼宾/报名
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/registrations` | JWT | 提交礼宾表单 |
| PATCH | `/api/registrations/:id` | JWT | 用户编辑自己的pending申请 |
| GET | `/api/concierge/my` | JWT | 用户的Concierge申请 |
| POST | `/api/concierge` | optionalAuth | 提交Concierge申请 |

### 赛事追踪（新功能）
| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/api/tracking/my` | JWT | 用户查看追踪记录 |
| POST | `/api/tracking/request` | JWT | 用户请求添加追踪 |
| GET | `/api/admin/tracking` | Admin | 管理员列表 |
| POST | `/api/admin/tracking` | Admin | 管理员创建 |
| PATCH | `/api/admin/tracking/:id` | Admin | 管理员更新阶段 |
| DELETE | `/api/admin/tracking/:id` | Admin | 管理员删除 |
| GET | `/api/admin/tracking/stats` | Admin | 统计 |

### 赛事追踪 — 9 阶段流程
```
registering → submitted → preliminary → advanced_semi → semi_finals
→ advanced_finals → finals → prize_processing → prize_received
(注册中)    (已投递)   (初赛阶段)   (晋级复赛)    (复赛中)
(晋级决赛)   (决赛)    (奖金打款中)  (奖金到账)
```

### Admin CRUD
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | `/api/admin/competitions...` | 竞赛CRUD |
| GET/PATCH | `/api/admin/registrations...` | 报名管理 |
| GET/PATCH | `/api/admin/organizer-submissions...` | 主办方提交 |
| GET | `/api/admin/users` | 用户列表 |
| GET | `/api/admin/concierge` | Concierge列表 |
| GET | `/api/admin/stats` | 统计数据 |
| GET | `/api/admin/expiring` | 即将过期赛事 |
| POST | `/api/admin/auto-close-expired` | 自动关闭过期 |
| GET | `/api/admin/export/registrations` | CSV导出 |
| PUT | `/api/admin/config/:key` | CMS配置 |

### 公开
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/competitions` | 赛事列表 (?featured=true) |
| GET | `/api/config` | 站点配置 |
| POST | `/api/organizer-submission` | 主办方提交 |

---

## 五、前台功能清单 (index.html)

### 页面导航
- **Competitions** (browse) — 首页赛事浏览，Featured轮播，筛选/搜索
- **Explore Cities** — 城市导航
- **For Organizers** — 主办方入驻表单
- **How It Works** — 礼宾服务说明 + Cost Comparison + LinkedIn Newsletter + sticky CTA按钮
- **Dashboard** — **赛事追踪看板 (Gantt-chart 风格)**
- **My Profile** — 个人信息编辑 + 改密码 + 礼宾申请列表(可编辑)

### Dashboard 赛事追踪看板
- 统计卡片: Total Tracking / In Progress / Prize Received / Latest Update
- 每场比赛: 赛事名称 + 当前阶段徽章 + **9 点进度条**
  - 绿色 = 已完成阶段，蓝色脉冲 = 当前阶段，灰色 = 未来阶段
- 空状态: 插画 + "Start Concierge" 按钮
- 已登录用户: "+ Request Tracking" 按钮

### 导航栏
- 未登录: "Sign Up Free" 按钮
- 已登录: 用户名下拉 (My Profile / Dashboard / Sign Out)
- JWT token: `localStorage.cic_token`
- 用户信息: `localStorage.cic_user`

### 登录/注册弹窗
- Sign Up / Log In 双 Tab
- 注册: Name + Email + Password + Terms
- 登录: Email + Password + "Forgot your password?" 链接
- 忘记密码: 邮箱 → 验证码 → 新密码

### 国际化
- `CURRENT_LANG = 'en'|'zh'`，存储在 `localStorage.cic_lang`
- 中英文切换按钮在导航栏

---

## 六、后台功能清单 (admin.html)

### 5 个 Tab
1. **🏆 Competitions** — 竞赛CRUD，Featured开关，Sort Order，Import/Export JSON
2. **👤 Users** — 用户列表
3. **🤝 Concierge** — 礼宾表单提交管理 (registrations表)，状态更新
4. **📝 Organizers** — 主办方提交管理
5. **📋 赛事追踪** — 追踪记录管理 (competition_tracking表)，Modal添加/编辑
6. **🎨 Site Content** — CMS配置 (Hero文案/统计数据/公告)

### 赛事追踪 Tab 功能
- 统计卡片: 总追踪 / 进行中 / 奖金到账
- 表格: # / 用户 / 赛事名称 / 当前阶段(下拉快速更新) / 更新时间 / 编辑/删除
- Modal: 选择用户 + 赛事来源(赛事库/手动输入) + 阶段 + 备注

---

## 七、待办事项

### 🔴 高优先级
- [ ] **测试 Dashboard 页面** — 以已登录用户身份访问 Dashboard，确认追踪看板显示正常
- [ ] **测试 Admin 赛事追踪** — 后台登录 → 赛事追踪 Tab → 添加/编辑/删除追踪记录
- [ ] **端到端测试** — 注册 → 登录 → Dashboard → 查看追踪 → Admin 更新阶段 → 用户看变化
- [ ] **"开启礼宾服务"按钮** — 当前 Dashboard 空状态按钮调用 `startConcierge()`，但用户反馈点它跳到了 How It Works 页面（这是正确的，因为用户需要先提交礼宾表单才能被追踪）。可能需要调整引导文案

### 🟡 中优先级
- [ ] 密码哈希加 salt（当前裸 SHA256）
- [ ] 注册表单 `registration_form_typeform_en.html` 的 emailVerified 门控在 Playwright 测试中需手动绕过
- [ ] 浏览器缓存问题 — 测试时用 `Ctrl+Shift+R` 或 `/index.html?v=时间戳`

### 🟢 低优先级
- [ ] P3: admin.html UX 全面优化（表格增强、批量操作等）
- [ ] 用户头像支持
- [ ] 移动端导航栏适配

---

## 八、Cloudflare Tunnel（如需外网测试）

```bash
cloudflared tunnel --url http://localhost:3300 > /tmp/cf.log 2>&1 &
sleep 8 && grep -o 'https://[^ ]*trycloudflare\.com' /tmp/cf.log
```

---

## 九、新对话建议的第一步

1. Clone 项目并启动服务器（见第零节）
2. 用 Playwright 跑一遍完整流程测试
3. 确认 Dashboard 赛事追踪看板正常显示
4. 确认 Admin 赛事追踪 Tab 可用
5. 继续处理待办事项中的高优先级任务
