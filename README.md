# 内耗账单 · 测评网站

一个纯静态的心理测评网页（HTML + CSS + 原生 JS），30 道题、5 个维度，生成「精神损耗账单」结果页。

## 功能

- 密码门：云端核销，每个密码可测 3 次（换设备/清缓存不重置）
- 30 道题，5 维度计分，支持返回上一题重新选择
- 结果页：内耗小时数账单 + 五维明细 + 5 种内耗人格 + 心理学解读 + 回血处方
- 一键生成结果长图（手机端长按保存 / 电脑端自动下载）
- 结果分享链接（结果编码在 URL 中，无需服务端）
- 再测一次、好评有礼弹窗
- 移动端适配

## 目录结构

```
.
├── index.html            页面结构
├── css/style.css         样式（含移动端适配）
├── js/config.js          云端配置（endpoint / publishableKey）
├── js/data.js            30 道题 + 5 维度 + 结果文案
└── js/app.js             业务逻辑（核销、答题、计分、长图、分享）
```

## 本地运行

不需要构建、不需要安装依赖，任选一种：

**方式一：直接打开**

双击 `index.html` 即可。注意：以 `file://` 打开时云端接口可能因跨域受限，建议用方式二。

**方式二：本地静态服务器（推荐）**

```bash
cd neihao-test
python3 -m http.server 8080
# 浏览器访问 http://localhost:8080
```

或使用 Node：

```bash
npx serve .
```

**方式三：克隆后运行**

```bash
git clone <你的仓库地址>
cd <仓库目录>
python3 -m http.server 8080
```

## 部署

### 方式 A：GitHub Pages（静态托管，免费）

1. 把代码推到 GitHub 仓库
2. 仓库 → Settings → Pages → Source 选择 `Deploy from a branch`，分支 `main`、目录 `/ (root)`，保存
3. 等待 1 分钟，访问 `https://<用户名>.github.io/<仓库名>/`

或使用仓库内置的 Actions 工作流 `.github/workflows/pages.yml`（推送到 `main` 自动发布）。

> ⚠️ **重要限制**：本项目的密码核销调用云端接口，该接口按域名做了白名单校验。GitHub Pages 的域名（`*.github.io`）不在白名单内，因此在该域名下「输入密码开始测试」会返回
> `403 access_denied: the request origin is not allowed for this client`。
> GitHub Pages 适合作为代码演示 / 浏览页面，**正式售卖请使用已部署的 WorkBuddy 域名链接**。

### 方式 B：任意静态托管

Netlify / Vercel / 阿里云 OSS / 腾讯云 COS 等均可，把整个目录作为静态站点根目录上传即可（同样存在上面的域名白名单限制）。

### 方式 C：正式环境（密码校验可用）

当前已部署地址：`https://neihao-test-55278.app.workbuddy.host/?sharecode=SNMDWIRQFV`

## 修改内容

| 想改什么 | 修改文件 |
|---|---|
| 题目、结果类型文案、心理学解读、回血建议 | `js/data.js` |
| 页面元素、按钮文案、弹窗内容 | `index.html` |
| 颜色、字号、布局、手机端表现 | `css/style.css` |
| 计分规则、账单换算、分享链接逻辑 | `js/app.js` |
| 云端环境与密钥 | `js/config.js` |

## 技术说明

- 零依赖、零构建：除云 SDK 与 html2canvas 走 CDN 外无外部依赖
- 结果分享链接把分数编码进 URL hash（`#r=...`），打开即还原结果页，无需存储
- 测评完成后会向云端 `test_records` 表写入一条匿名记录（维度分、总分、类型），用于统计

## 说明

`js/config.js` 中的 `publishableKey` 是前端公开标识符，本身不含权限；服务端会校验请求来源域名，泄露无法被用于其他站点。
