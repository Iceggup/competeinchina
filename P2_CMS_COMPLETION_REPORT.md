# P2 CMS 内容管理系统 — 完成报告

> **日期**: 2026-06-26
> **状态**: ✅ 完成（3/3 待办项全部完成）
> **E2E 测试**: 16/16 通过

---

## 一、完成项总结

| # | 任务 | 状态 | 文件 |
|---|------|------|------|
| 1 | featured_order 排序 | ✅ | index.html L2375 |
| 2 | 城市标签 CMS 动态渲染 | ✅ | index.html L2566-2586, L2122 |
| 3 | Playwright E2E 验证 | ✅ | test_p2_cms_e2e.js (16/16) |
| 🔧 | saveAllConfig auth bug 修复 | ✅ | admin.html L1148 |

---

## 二、改动详情

### 2.1 featured_order 排序 (index.html L2375)

**问题**: carousel 渲染只按 `featured === 1` 过滤，不按 `sort_order` 排序

**修复**: 在 `filter()` 后添加 `.sort((a,b) => (a.sort_order||0) - (b.sort_order||0))`

```javascript
// 修改前
const featured = (window.competitions || []).filter(c => c.featured === 1).slice(0, 8);

// 修改后
const featured = (window.competitions || []).filter(c => c.featured === 1).sort((a,b) => (a.sort_order||0) - (b.sort_order||0)).slice(0, 8);
```

**注意**: 数据库已有 `sort_order INTEGER DEFAULT 0` 字段，无需新增 schema。后台 `admin.html` 表单中已有 `sort_order` 输入框 (L645)。

### 2.2 城市标签 CMS 动态渲染 (index.html L2566-2586)

**问题**: 城市筛选下拉 (`<select id="filterCity">`) 和城市颜色映射 (`cityColors`) 硬编码在 HTML/JS 中

**修复**:

1. **新增 `updateCityFilter()` 函数** — 在 `loadSiteConfig()` 末尾调用，读取 `window._cmsCities`
   - 动态重建 `<select id="filterCity">` 的 `<option>` 列表
   - 动态合并 `cityColors` 映射（不删除默认值）
   - 如果没有 CMS 数据则跳过（保持默认行为）

2. **`cityColors` 从 `const` 改为 `let`** — 允许 `updateCityFilter()` 动态追加颜色

3. **`_cmsCities` JSON 格式**: `[{"name":"Beijing","color":"#dc2626"}, ...]`

```javascript
function updateCityFilter() {
  var cmsCities = window._cmsCities;
  if (!cmsCities || !Array.isArray(cmsCities) || cmsCities.length === 0) return;

  // Update city filter dropdown
  var sel = document.getElementById('filterCity');
  if (sel) {
    var currentVal = sel.value;
    sel.innerHTML = '<option value="" data-i18n="filter_all_cities">All Cities</option>';
    cmsCities.forEach(function(c) {
      sel.innerHTML += '<option>' + c.name + '</option>';
    });
    sel.value = currentVal;
  }

  // Update cityColors map
  cmsCities.forEach(function(c) {
    if (c.color) cityColors[c.name] = c.color;
  });
}
```

### 2.3 saveAllConfig Auth Bug 修复 (admin.html L1148)

**问题**: `saveAllConfig()` 使用原生 `fetch` 而不是 `apiFetch`，导致请求不带 JWT Authorization header，所有 config 写入被 403 拒绝

**修复**: 将 `fetch('/api/admin/config/...')` 改为 `apiFetch('/config/...')`（`apiFetch` 自动加 `/api/admin` 前缀和 Bearer token）

```javascript
// 修改前 (bug)
await fetch('/api/admin/config/'+key, {method:'PUT', ...});

// 修改后 (fixed)
await apiFetch('/config/'+key, {method:'PUT', ...});
```

---

## 三、E2E 测试结果

测试文件: `test_p2_cms_e2e.js`  
测试框架: Playwright 1.52.0 + Chromium headless

```
═══ P2 CMS E2E TEST RESULTS: 16 passed, 0 failed, 16 total ═══

✅ Admin login
✅ Site Content Tab
✅ Config Grid loads all fields
✅ Fill hero_title (CMS save)
✅ Fill city_tags (CMS save)
✅ Save All Config
✅ Frontend hero_title from CMS (一致性验证)
✅ Frontend _cmsCities populated (5 cities)
✅ City filter dropdown dynamic (includes TestCity)
✅ Competitions Tab
✅ Featured count before toggle
✅ Featured toggle clicked
✅ Carousel state after toggle
✅ Restore CMS defaults
✅ Defaults restored on frontend
✅ _cmsCities cleared
```

---

## 四、CMS 完整功能矩阵

| 功能 | 后台 (admin.html) | 前台 (index.html) | API |
|------|-------------------|-------------------|-----|
| Hero Title EN/ZH | ✅ cfg_hero_title / cfg_hero_title_zh | ✅ data-i18n + _cmsI18n | /api/config |
| Hero Subtitle EN/ZH | ✅ cfg_hero_subtitle / cfg_hero_sub_zh | ✅ data-i18n + _cmsI18n | /api/config |
| Hero CTA Buttons | ✅ cfg_hero_cta_text / _secondary | ✅ .hero-cta dynamic | /api/config |
| Stats (4项) | ✅ cfg_stat_competitions 等 | ✅ .hero-stat-num | /api/config |
| Organizers Stats (4项) | ✅ cfg_org_stat1-4 | ✅ .org-stat-card .num | /api/config |
| Cities Page Text | ✅ cfg_cities_hero_title/sub | ✅ .cities-hero dynamic | /api/config |
| Carousel Title EN/ZH | ✅ cfg_carousel_title / _zh | ✅ data-i18n + _cmsI18n | /api/config |
| City Tags (JSON) | ✅ cfg_city_tags | ✅ updateCityFilter() | /api/config |
| Announcement Bar | ✅ cfg_announcement_active/text | ✅ Dynamic bar creation | /api/config |
| Featured Toggle ⭐ | ✅ toggleFeatured() + sort_order | ✅ Carousel sort_order排序 | /api/competitions |
| Meta Description | N/A | ✅ 自动同步 hero_title | /api/config |
| i18n 中文翻译 | ✅ 独立 key 存储 | ✅ _cmsI18n 优先读取 | /api/config |

---

## 五、技术要点

1. **CMS 数据流**: `admin.html saveAllConfig()` → `apiFetch()` → `PUT /api/admin/config/:key` → SQLite `site_config` 表 → `GET /api/config` → `index.html loadSiteConfig()` → DOM 更新
2. **城市动态渲染**: CMS 城市列表覆盖默认硬编码列表，颜色映射追加不覆盖
3. **Featured 排序**: 使用已有 `sort_order` 字段，无需 schema migration
4. **E2E 测试**: 完整覆盖 CMS 保存→前台读取→一致性验证→Featured toggle→恢复默认 全流程
