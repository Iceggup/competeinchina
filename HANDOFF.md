# CompeteInChina 项目交接指令

> **日期**: 2025-07-11
> **最新 commit**: `8e4f745` (更新项目交接文档 HANDOFF.md)
> **GitHub**: `Iceggup/competeinchina`（已推送，与 origin/main 同步）

---

## 一、快速启动（新对话第一步）

```bash
cd /workspace && rm -rf competeinchina && git clone https://github.com/Iceggup/competeinchina.git
cd competeinchina && npm install && NODE_OPTIONS="" node init-db.js
NODE_OPTIONS="" node migrate-tracking.js
NODE_OPTIONS="" nohup node server.js > /tmp/server.log 2>&1 &
sleep 3 && curl http://localhost:3300/api/health
```

---

## 二、当前项目状态

### 已完成 ✅
| 任务域 | 状态 | 说明 |
|--------|------|------|
| 🔴 P0 注册全链路 | ✅ | 测试通过，8步表单→提交→数据库全链路正常 |
| 🟠 P1 视觉升级 | ✅ | Step 1-3 全部完成（配色/Hero/卡片/按钮） |
| 📋 Dashboard 追踪看板 | ✅ | 9阶段进度条 + 空状态优化 |
| 📋 赛事添加弹窗 | ✅ | Modal弹窗（赛事库下拉+手动添加+官方链接） |
| 📋 注册表必填项 | ✅ | 25个必填字段 + 逐字段校验 |
| 📋 PDF→云盘引导 | ✅ | CV/PitchDeck 改为云盘链接引导 |
| 📋 Organizers 页面 | ✅ | 手机号/微信号必填，英文免责声明 |
| 📋 赛事指南模块 | ✅ | 8篇公众号文章，6大模块卡片 |
| 📋 协议签署(前台) | ✅ | 3份协议（服务/保密/营销授权），电子签名 |
| 📋 协议签署(后台) | ✅ | 新增Tab，用户状态表格，取消签署 |
| 📋 注册表 Step 7 | ✅ | 已删除，8步→7步 |

### 待做 ⬜
| 任务域 | 说明 |
|--------|------|
| 🟡 P2 CMS | 后台内容管理系统（Hero文案/Featured赛事/公告） |
| 🟢 P3 后台UX | admin.html 空间重构/表格增强/表单优化 |

---

## 三、文件改动清单

```
index.html                              — 前台（大量改动）
registration_form_typeform_en.html      — 注册表单（7步，25必填项）
admin.html                              — 后台（新增协议签署Tab）
server.js                               — 后端（新增agreement APIs）
db/competeinchina.db                    — SQLite（新增agreement_signatures表）
```

---

## 四、凭据

| 用途 | 账号 | 密码 |
|------|------|------|
| 前台登录 | admin@competeinchina.com | CompeteInChina2026! |
| 后台登录 | admin | CompeteInChina2026! |
| Resend API | re_dw1bVA9M_9z2T2hoN5h82W1UnScaF77r6 | 已配置在 server.js |

---

## 五、重要注意事项

1. **浏览器缓存** — 测试时用 `?v=时间戳` 参数或 `Ctrl+Shift+R`
2. **GitHub push** — 当前需要手动认证（`gh auth login`）
3. **Cloudflare tunnel** — 如需外网测试：`cloudflared tunnel --url http://localhost:3300`
4. **Resend 额度** — 3000封/月，测试验证码时注意
5. **数据库备份** — 修改 schema 前先备份 `db/competeinchina.db`

---

## 六、GitHub Push

**标准方案**：Personal Access Token + git push（CodeBuddy GitHub Connector 权限不足时使用）

```bash
# 1. 在 https://github.com/settings/tokens 创建 token（勾选 repo scope）
# 2. 用 token 直接推送：
git push https://<TOKEN>@github.com/Iceggup/competeinchina.git main
# 3. 推送后可在 GitHub 上 revoke token
```

> 详细记录见 `.workbuddy/memory/github-push.md`
