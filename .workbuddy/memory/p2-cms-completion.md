# P2 CMS 完成记忆

**完成日期**: 2026-06-26
**状态**: ✅ 全部完成

## 完成内容

### Step 3 补充完成
- ✅ featured carousel 添加 sort_order 排序 (index.html L2375)
- ✅ 城市筛选下拉动态渲染 (index.html L2566-2586)
- ✅ cityColors 从 const 改 let 支持 CMS 动态追加

### Step 4 E2E 验证
- ✅ 16/16 测试全部通过
- ✅ CMS 保存→前台读取 一致性验证
- ✅ Featured toggle → carousel 显示/隐藏
- ✅ 城市 CMS 动态渲染验证
- ✅ 默认值恢复验证

### Bug 修复
- 🔧 saveAllConfig() 使用原生 fetch 而非 apiFetch → 所有 CMS 写入 403 被拒绝
  - 修复: 改用 apiFetch('/config/...') 带 JWT token
  - admin.html L1148

## 关键文件改动
- index.html: L2375 (sort), L2122 (let cityColors), L2560-2586 (updateCityFilter)
- admin.html: L1148 (fetch→apiFetch)
- test_p2_cms_e2e.js: 新增 E2E 测试 (16 cases)

## 技术备忘
- apiFetch 自动加 `/api/admin` 前缀，传路径时只需 `/config/xxx`
- cityColors 用 let 声明以支持 CMS 动态合并
- CMS 城市 JSON 格式: [{"name":"City","color":"#hex"},...]
- sort_order 字段已存在于 competitions 表，无需 migration
