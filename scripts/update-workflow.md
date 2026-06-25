# CompeteInChina 每周三赛事更新工作流

## 执行时间
每周三 10:00 AM (北京时间 UTC+8)

## 更新流程

### Phase 1: 信息抓取 (10:00-10:15)
1. 读取 `scripts/competition_sources.json` 中的赛事来源链接
2. 逐个抓取每个链接的赛事信息：
   - 赛事名称
   - 主办城市
   - 报名截止日期
   - 奖金池
   - 行业领域
   - 参赛条件（重点：是否允许外籍/海外人才参加）
   - 官方报名链接
3. 筛选：排除明确要求"仅限中国籍/中国创业者"的赛事
4. 对比现有数据库，识别新增赛事和已过期赛事

### Phase 2: 企业微信通知 (10:15-10:20)
通过企业微信发送审核通知：
```
📋 本周赛事更新报告 ({{日期}})

🔍 抓取到 {{N}} 个潜在赛事

🆕 新增赛事:
1. [赛事名称] - {{城市}} - 截止 {{日期}} - 奖金 {{金额}}
   链接: {{官方链接}}
   参赛条件: {{简述}}

2. ...

⏰ 即将过期 (7天内):
- [赛事名称] - 截止 {{日期}}

✅ 已过期 (标记但保留):
- [赛事名称] - 已于 {{日期}} 截止

---
请审核，回复"批准"执行更新，或"修改XX"进行调整。
```

### Phase 3: 审核执行 (用户回复后)
1. 批准 → 执行数据库写入
2. 修改 → 按指示调整后重新通知
3. 拒绝 → 不执行

### Phase 4: 更新完成通知
```
✅ 赛事更新完成

📊 更新统计:
- 新增: {{N}} 个赛事
- 更新: {{M}} 个赛事
- 过期标记: {{K}} 个赛事

🔗 后台查看: https://www.competeinchina.com/admin.html
```

## 数据规范
每条赛事记录包含：
- title: 英文标题
- title_cn: 中文标题（如有）
- city: 城市
- deadline: 截止日期 (YYYY-MM-DD)
- prize: 奖金
- prize_category: small/medium/large/huge
- industries: ["AI","Biotech"等]
- level: National/Provincial/City/District
- desc: 英文简介
- highlights: ["亮点1","亮点2"]
- apply_url: 官方报名链接
- english_url: 英文页面链接（如有）
- stage: Registration/Open/Preliminary/Regional Selection/Closed
- featured: 0/1 (是否重点推荐)
- sort_order: 排序序号

## 过期赛事处理规则
- stage 设为 "Closed"
- 不删除数据库记录
- 前台显示为灰色半透明
- 排序靠后但仍可查看
- 用户仍可看到赛事历史信息
