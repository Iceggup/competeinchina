# CompeteInChina 部署架构 & 运维手册

> **最后更新**: 2025-07-14  
> **维护者**: Iceggup  
> **线上地址**: https://www.competeinchina.com

---

## 一、架构总览

```
┌─────────────────────────────────────────────────────┐
│                    用户浏览器                          │
│        www.competeinchina.com / admin.html            │
└───────────────┬─────────────────────────────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
    ▼                       ▼
┌───────────────┐   ┌───────────────────┐
│ Cloudflare    │   │ Cloudflare        │
│ Pages         │   │ Workers           │
│ (静态前端)     │──▶│ (API 后端)         │
│               │   │                   │
│ competeinchina│   │ competeinchina-   │
│ .pages.dev    │   │ api.iceggup.      │
│               │   │ workers.dev       │
└───────────────┘   └───────┬───────────┘
                            │
                    ┌───────┴───────────┐
                    │ Cloudflare D1     │
                    │ (数据库)           │
                    │                   │
                    │ competeinchina-db │
                    └───────────────────┘
```

| 层级 | 平台 | 名称 | 域名 |
|------|------|------|------|
| 前端 | Cloudflare Pages | `competeinchina` | `www.competeinchina.com` |
| 后端 | Cloudflare Workers | `competeinchina-api` | `api.competeinchina.com` |
| 数据库 | Cloudflare D1 | `competeinchina-db` | - |

---

## 二、Cloudflare 资源清单

### 2.1 Cloudflare Pages（前端托管）

| 项目 | 详情 |
|------|------|
| **项目名称** | `competeinchina` |
| **生产分支** | `main` |
| **GitHub 仓库** | `Iceggup/competeinchina` |
| **构建设置** | Framework: None / Build command: 空 / Output dir: `/` |
| **Pages 域名** | `competeinchina.pages.dev` |
| **自定义域名** | `www.competeinchina.com` |
| **部署方式** | Git push → 自动构建部署 |

### 2.2 Cloudflare Workers（API 后端）

| 项目 | 详情 |
|------|------|
| **Worker 名称** | `competeinchina-api` |
| **Worker URL** | `competeinchina-api.iceggup.workers.dev` |
| **自定义域名** | `api.competeinchina.com` (Route 绑定) |
| **代码格式** | 原生 Workers (fetch handler)，无 npm 依赖 |
| **代码位置** | GitHub: `worker/worker-native.js` (1318行) |
| **部署方式** | 手动在 Cloudflare 网页编辑器粘贴代码 → Save and Deploy |

### 2.3 Cloudflare D1（数据库）

| 项目 | 详情 |
|------|------|
| **数据库名** | `competeinchina-db` |
| **Database ID** | `d94794c1-f7de-4ac0-b2be-68fb50c24f63` |
| **Worker 绑定名** | `db` (小写) |
| **Schema** | `worker/migrations/0001_schema.sql` |

---

## 三、数据库 Schema

共 **9 张表**：

| 表名 | 用途 |
|------|------|
| `users` | 用户账户（id, email, password_hash, full_name, role） |
| `registrations` | 赛事报名（team_name, contact_email, industry, status...） |
| `concierge_applications` | Concierge 代报名申请 |
| `competitions` | 竞赛数据（title, city, deadline, prize, featured...） |
| `site_config` | 站点配置（key-value，支持 text/number/boolean） |
| `competition_tracking` | 竞赛追踪（user_id, competition_name, current_stage） |
| `agreement_signatures` | 协议签署记录（service_agreement, nda, marketing_auth） |
| `organizer_submissions` | 组委会提交 |
| `verify_codes` | 邮箱验证码（email, code, expires_at） |

**种子数据**：
- Admin 用户: `admin@competeinchina.com`，密码 SHA-256: `a2c9e853601479aa6bf3bdf4d4a798dff164ad9ebee10686499bdc7cc063711c`
- site_config: `site_title`, `site_description`, `hero_title`, `hero_subtitle`, `stats_competitions`, `stats_cities`, `stats_startups`, `notice_enabled`, `notice_text`

---

## 四、凭据 & 密钥

| 凭据 | 值 | 用途 |
|------|-----|------|
| Admin 用户名 | `admin` | 后台登录 |
| Admin 密码 | `CompeteInChina2026!` | 后台登录 |
| JWT Secret | `competeinchina_jwt_secret_key_2026` | API 认证 Token |
| Resend API Key | `[见 Resend Dashboard → API Keys]` | 发送验证码邮件 |
| 发件邮箱 | `noreply@competeinchina.com` | Resend 发件人 |
| GitHub Token | `[见 .git/config 或 GitHub Settings → Personal Access Tokens]` | 代码推送 |
| GitHub 仓库 | `https://github.com/Iceggup/competeinchina` | 代码仓库 |

---

## 五、API 端点清单

### 公开端点（无需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + 数据库状态 |
| GET | `/api/test-db` | 数据库连接测试 |
| GET | `/api/config` | 获取站点配置 |
| GET | `/api/competitions` | 竞赛列表（支持 ?city= & ?featured=true） |
| GET | `/api/competitions/:id` | 竞赛详情 |
| POST | `/api/send-verify-code` | 发送邮箱验证码 |
| POST | `/api/verify-code` | 校验邮箱验证码 |
| POST | `/api/users/register` | 用户注册 |
| POST | `/api/users/login` | 用户登录 |
| POST | `/api/users/auth-for-form` | 表单自动认证 |
| POST | `/api/users/reset-password` | 重置密码 |
| POST | `/api/concierge` | 提交 Concierge 申请 |
| POST | `/api/organizer-submission` | 组委会提交 |

### 用户端点（需 Bearer Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users/me` | 获取个人信息 |
| PATCH | `/api/users/me` | 更新个人信息 |
| POST | `/api/users/change-password` | 修改密码 |
| GET | `/api/users/my-applications` | 我的报名 |
| POST | `/api/registrations` | 提交报名 |
| PATCH | `/api/registrations/:id` | 编辑报名 |
| GET | `/api/concierge/my` | 我的 Concierge 申请 |
| GET | `/api/agreements/status` | 协议签署状态 |
| POST | `/api/agreements/sign` | 签署协议 |
| GET | `/api/tracking/my` | 我的竞赛追踪 |
| POST | `/api/tracking/request` | 请求追踪 |

### Admin 端点（需 Admin Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | Admin 登录 |
| GET | `/api/admin/stats` | 统计数据 |
| GET | `/api/admin/users` | 用户列表 |
| GET | `/api/admin/registrations` | 所有报名 |
| PATCH | `/api/admin/registrations/:id/status` | 更新报名状态 |
| GET | `/api/admin/competitions` | 竞赛管理列表 |
| POST | `/api/admin/competitions` | 添加竞赛 |
| PUT | `/api/admin/competitions/:id` | 更新竞赛 |
| DELETE | `/api/admin/competitions/:id` | 删除竞赛 |
| GET | `/api/admin/concierge` | Concierge 列表 |
| PUT | `/api/admin/config/:key` | 更新站点配置 |
| GET | `/api/admin/expiring` | 即将过期竞赛 |
| POST | `/api/admin/auto-close-expired` | 自动关闭过期竞赛 |
| GET | `/api/admin/tracking` | 追踪记录列表 |
| POST | `/api/admin/tracking` | 创建追踪记录 |
| PATCH | `/api/admin/tracking/:id` | 更新追踪记录 |
| DELETE | `/api/admin/tracking/:id` | 删除追踪记录 |
| GET | `/api/admin/tracking/stats` | 追踪统计 |
| GET | `/api/admin/agreements` | 协议签署列表 |
| DELETE | `/api/admin/agreements/:userId/:type` | 撤销协议 |
| GET | `/api/admin/organizer-submissions` | 组委会提交列表 |
| PATCH | `/api/admin/organizer-submissions/:id/status` | 更新提交状态 |
| GET | `/api/admin/export/registrations` | 导出报名 CSV |

---

## 六、前端文件 & API 适配机制

### 文件列表

| 文件 | 用途 |
|------|------|
| `index.html` | 前台首页（~3300行） |
| `admin.html` | 后台管理面板（~1000行） |
| `registration_form_typeform_en.html` | 多步骤注册表单 |

### API 地址自动适配逻辑

每个 HTML 文件头部都包含以下代码：

```javascript
(function() {
  var host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    window.API_BASE = ''; // 本地开发用相对路径
  } else {
    window.API_BASE = 'https://api.competeinchina.com'; // 生产环境
  }
  // 拦截所有 fetch 请求，自动添加 API_BASE 前缀
  var _fetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string' && url.startsWith('/api/') && window.API_BASE) {
      url = window.API_BASE + url;
    }
    return _fetch.call(window, url, opts);
  };
})();
```

> **注意**: 本地开发时访问 `localhost`，API 走相对路径；线上所有环境统一走 `https://api.competeinchina.com`

---

## 七、部署 & 更新流程

### 7.1 更新前端（Pages — 自动部署）

1. 修改 `index.html` / `admin.html` / `registration_form_typeform_en.html`
2. `git add` → `git commit` → `git push origin main`
3. Cloudflare Pages 自动检测 GitHub push，自动构建部署
4. 约 1-2 分钟生效

### 7.2 更新后端（Worker — 手动部署）

1. 修改 `/workspace/competeinchina/worker/worker-native.js`
2. 打开 Cloudflare Dashboard → Workers & Pages → `competeinchina-api`
3. 点击 **Edit code**
4. 全选删除旧代码，粘贴新代码
5. 点击 **Save and Deploy**
6. 测试: `https://api.competeinchina.com/api/health`

> **重要**: Worker 代码必须使用原生格式（`export default { async fetch(request, env, ctx) {...} }`），不支持 `import` npm 模块

### 7.3 更新数据库（D1 — 手动执行 SQL）

1. 打开 Cloudflare Dashboard → D1 → `competeinchina-db`
2. 点击 **Console**
3. 逐条执行 SQL 语句
4. 注意：D1 Console 不支持多条 SQL 一起执行，必须逐条执行

---

## 八、故障排查

### 8.1 前端无法访问 (522/Timeout)

1. 检查 Cloudflare Pages 部署状态：Dashboard → Pages → `competeinchina` → Deployments
2. 如果显示 Failed，查看构建日志
3. 如果 DNS 问题，检查 `www.competeinchina.com` 的 CNAME 记录

### 8.2 后台登录报 "Connection error"

1. 确认 API Worker 是否运行：访问 `https://api.competeinchina.com/api/health`
2. 如果 API 正常但登录失败，检查浏览器控制台的 fetch 请求地址
3. 确认 `admin.html` 中的 API_BASE 指向 `https://api.competeinchina.com`

### 8.3 API 返回 "API endpoint not found"

1. 确认 Worker 代码是最新版本（`worker-native.js`）
2. 确认代码已保存并部署（Save and Deploy）
3. 确认 D1 数据库绑定名是 `db`（小写）

### 8.4 API 返回数据库错误

1. 检查 D1 数据库是否存在：Dashboard → D1 → `competeinchina-db`
2. 检查 Worker 的 D1 绑定：Worker Settings → Variables → D1 Database Bindings，Variable name 必须是 `db`
3. 测试：`https://api.competeinchina.com/api/test-db`

### 8.5 邮件验证码发送失败

1. 检查 Resend API 额度：https://resend.com → API Keys
2. 确认 API Key: `re_dw1bVA9M_9z2T2hoN5h82W1UnScaF77r6`
3. 确认发件域名 `competeinchina.com` 已在 Resend 中验证

### 8.6 DNS 相关

| 记录 | 类型 | 值 |
|------|------|-----|
| `www.competeinchina.com` | CNAME | `competeinchina.pages.dev` |
| `api.competeinchina.com` | CNAME | `competeinchina-api.iceggup.workers.dev` |

> DNS 在 Cloudflare 管理，Proxy 状态应为 ✅ Proxied（橙色云朵）

---

## 九、GitHub 信息

| 项目 | 详情 |
|------|------|
| 仓库地址 | `https://github.com/Iceggup/competeinchina` |
| 分支 | `main` |
| 最新 Commit | `17b16d4` — Fix API_BASE |
| Token | `[见 GitHub Settings → Personal Access Tokens]` |

### 关键文件结构

```
competeinchina/
├── index.html                          # 前台首页
├── admin.html                          # 后台面板
├── registration_form_typeform_en.html  # 注册表单
├── server.js                           # 旧 Express 后端（已废弃，保留参考）
├── package.json                        # 旧依赖（已不用）
├── worker/
│   ├── worker-native.js                # ★ 当前 Workers 代码（1318行）
│   ├── worker.js                       # Hono 版本（不兼容网页编辑器）
│   ├── wrangler.toml                   # Workers 配置
│   └── migrations/
│       └── 0001_schema.sql             # D1 数据库 Schema
└── DEPLOYMENT_GUIDE.md                 # ★ 本文档
```

---

## 十、快速恢复检查清单

如果网站完全挂了，按以下顺序排查：

1. ☐ `https://www.competeinchina.com` — 前端是否可访问？
2. ☐ `https://api.competeinchina.com/api/health` — API 是否正常？
3. ☐ Cloudflare Pages → competeinchina → 最后部署状态是否为 Success？
4. ☐ Cloudflare Workers → competeinchina-api → 代码是否完整？
5. ☐ Cloudflare D1 → competeinchina-db → Console 能否执行 `SELECT 1`？
6. ☐ DNS: `www` CNAME → `competeinchina.pages.dev`, `api` CNAME → `competeinchina-api.iceggup.workers.dev`
7. ☐ Resend API 额度是否用完？
8. ☐ GitHub Token 是否过期？
