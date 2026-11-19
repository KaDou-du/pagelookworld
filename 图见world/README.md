# 图见world

可拖动的 2D 世界史地图。按年代浏览 1804—2000 年间的世界近代史事件，点地图上的小点即可查看事件详情、考点、照片与视频；另有主题课件、答题模式、考前复习与答疑助手「史鉴」。

## 目录结构

```
图见world/
├── index.html          # 页面结构（打开这个文件即可使用）
├── css/
│   └── style.css       # 全部样式
├── js/
│   ├── data.js         # 数据层：事件、考点、知识点、视频、课件、地图册、年代疆域
│   └── main.js         # 交互层：地图绘制、弹窗、答题、复习、课件、AI 答疑
├── assets/
│   └── favicon.svg     # 站点图标
└── README.md
```

## 本地打开

双击 `index.html` 即可，无需安装任何依赖。地图边界数据与 d3 从 CDN 加载，首次打开需要联网。

如果浏览器对本地文件限制较多，可在目录内启动一个静态服务：

```bash
python3 -m http.server 8000
# 然后访问 http://localhost:8000
```

## 发布到 GitHub Pages

```bash
git init
git add .
git commit -m "feat: 图见world 世界近代史地图"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

推送后在仓库 `Settings → Pages`，Source 选择 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存后等待一两分钟即可通过
`https://<你的用户名>.github.io/<仓库名>/` 访问。

`.nojekyll` 文件保持原样，用于跳过 Jekyll 处理，避免静态资源路径被改写。

## 内容维护

- 增删事件、改写考点与知识点：只改 `js/data.js`。
- 调整界面、交互、地图投影与绘制：改 `js/main.js`。
- 改配色、字体、布局：改 `css/style.css`。

## AI 答疑说明

答疑助手「史鉴」默认接豆包大模型（火山方舟）：在页面右上角「答疑设置」里填入自己的 API Key 即可，模型与接口地址可留空使用默认值。密钥只保存在本机浏览器 localStorage，不会上传到仓库；未配置或调用失败时自动回退到内置知识库作答。

## 素材与版权

地图边界来自 Natural Earth（world-atlas 110m）；疆域色块为教材示意，非精确历史边界；史料插图与课件配图为页面内置的内联 SVG 与史料图；视频为 B 站相关历史投稿的外链。内容仅供学习参考。
