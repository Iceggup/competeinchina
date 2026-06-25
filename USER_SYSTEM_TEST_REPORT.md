# 前台用户系统升级 — 测试报告

> **日期**: 2026-06-25  
> **基于 Commit**: 018b409  
> **测试工具**: Playwright (Chromium Headless Shell)

---

## 一、改动清单

### 后端新增 API（server.js）

| # | 端点 | 方法 | 鉴权 | 说明 |
|---|------|------|------|------|
| 1 | `/api/concierge/my` | GET | Bearer JWT | 获取当前用户的 Concierge 申请列表 |
| 2 | `/api/users/me` | PATCH | Bearer JWT | 更新用户资料（full_name, email）|
| 3 | `/api/users/change-password` | POST | Bearer JWT | 修改密码（需当前密码验证）|
| 4 | `/api/users/my-applications` | GET | Bearer JWT | 获取当前用户的礼宾报名记录 |

### 前端改造（index.html）

| # | 改动 | 说明 |
|---|------|------|
| 1 | **导航栏登录态** | 未登录显示 "Sign Up Free"，已登录显示用户名 + 下拉菜单（My Profile / Dashboard / Sign Out）|
| 2 | **Signup Modal 重构** | 新增 Sign Up / Log In 双 Tab 切换，修复调用不存在的 `/api/auth/signup` bug |
| 3 | **JWT Token 管理** | `submitSignup()` 和 `submitLogin()` 成功后存储 `cic_token` 到 localStorage |
| 4 | **新增 Profile 页面** | 个人信息查看/编辑、修改密码、我的礼宾申请列表 |
| 5 | **Dashboard 增强** | 欢迎语显示用户名，API 使用 JWT token 调用 `/api/concierge/my` |
| 6 | **CSS 新增** | `.nav-user`、`.nav-user-menu`、`.auth-tabs`、`.auth-form-panel` 等样式 |

---

## 二、全链路测试结果（13/13 通过 ✅）

| 步骤 | 测试内容 | 结果 |
|------|---------|------|
| 1 | 首页加载，导航栏 CTA 按钮可见 | ✅ |
| 2 | 点击 Sign Up Free，弹窗打开 | ✅ |
| 3 | 填写注册表单，按钮启用 | ✅ |
| 4 | 提交注册，JWT token 存储到 localStorage | ✅ |
| 5 | 导航栏显示用户名（登录态） | ✅ |
| 6 | GET /api/users/me 返回用户信息 | ✅ |
| 7 | PATCH /api/users/me 更新用户名成功 | ✅ |
| 8 | POST /api/users/change-password 修改密码成功 | ✅ |
| 9 | GET /api/concierge/my 不再 404，正常返回空数组 | ✅ |
| 10 | GET /api/users/my-applications 正常返回空数组 | ✅ |
| 11 | 用新密码登录成功 | ✅ |
| 12 | Profile 页面渲染正常（显示 "Updated Test User"） | ✅ |
| 13 | 登出后 token 清除，导航栏恢复 "Sign Up Free" | ✅ |

---

## 三、修复的 Bug

1. **`/api/auth/signup` 不存在** — 原 `submitSignup()` 调用不存在的路由，已改为正确的 `/api/users/register`
2. **`/api/auth/login` 不存在** — 同上，已改为 `/api/users/login`
3. **`/api/concierge/my` 404** — 新增端点，前端 Dashboard 不再依赖 localStorage fallback
4. **导航栏不更新登录态** — 新增 `updateNavAuth()` 函数，页面加载和登录/登出时自动更新
5. **localStorage 不存储 token** — 改为存储 `cic_token`（JWT），`cic_user`（用户对象含 id/email/full_name/role）

---

## 四、遗留注意事项

- 密码哈希仍为 SHA256 无 salt（低优先级改进项）
- `registration_form_typeform_en.html` 的 auth.js 可能需要同步更新 token 存取方式
- 建议后续添加：用户头像、邮箱修改后的验证流程
