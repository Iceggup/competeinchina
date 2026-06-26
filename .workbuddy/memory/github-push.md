# GitHub Push 工作流

## 标准方案：Personal Access Token + git push

当 CodeBuddy GitHub Connector 权限不足（Contents: Read only）导致 403 时，直接用 Git CLI + HTTPS Token 认证推送：

```bash
git push https://<TOKEN>@github.com/Iceggup/competeinchina.git main
```

### Token 创建
1. 访问 https://github.com/settings/tokens
2. Generate new token (classic)
3. 勾选 `repo` scope
4. 复制 `ghp_xxx` token

### 安全注意
- Token 推送后立即可在 GitHub 上 revoke
- 每次需要 push 时生成新 token 或用之前未过期的
- 不要在代码中硬编码 token

## 上次操作
- 日期: 2025-07-11
- 推送了 10 个提交 (9e6d024..8e4f745)
- 包含: P0测试报告、P1视觉升级Step1-3、5项优化、资源指南、协议签署、注册表修正、后台协议管理、HANDOFF更新
