
# VIP视频破解

各大视频网站、世界杯直播（CCTV5）免费观看 。付费电影，VIP会员剧等，去广告播放。自用看电影网站，CCTV世界杯等电视播放，爱奇艺、腾讯视频、芒果视频、bilibili、美剧、韩剧、日剧、网易云音乐、腾讯音乐，酷狗音乐

---

## 更新日志

| 更新日期 | 更新内容 |
| ---- | --- |
|2026-07-27| 1. 加入了外框及VIP圆球隐藏功能|
|2026-05-07| 1. 1.1.6版本发布 2. 解决bilibili多次弹框后没有“vip”入口问题 </br> |
|2026-01-17| 1. 修复“编辑”渠道后保存不了问题 2.渠道过多，增加筛选功能 </br> |
|2025-11-17| 1. 保存自定义增加密码功能 </br> |
|2025-11-10| 1. 新增支持自定义播放列表和播放源的能力 </br> 2.新增优酷源 </br> |
|2025-08-27| 1. 增加windows支持VIP播放功能 </br> 2.解决网易云音乐不能播放和后台时自动停止问题 </br> |
|2025-02-14| 1. 新增抖音、快手等短视频渠道</br> 2.新增腾讯音乐、网易云音乐等音乐渠道 </br> 3.关闭编辑面板自动修正能力 </br>  |
|2025-02-10| 1. 支持vip源自定义能力</br> 2.支持添加新平台可编辑或排序 </br> 3.更新一些vip解析源 </br>  |
|2023-01-17| 1. 修复腾讯视频不能使用VIP问题</br> 2.替换部分失效导航网站 </br> 3. pkg支持Mac M1安装 |
|2022-11-08| 1. 删除不可用视VIP源，添加新的VIP源</br> 2.删除抖音网页版源 </br> 3. 解决一些不友好操作，并更新安装包。 |
|2020-05-26| 1. 移除部分视频源</br> 2.增加抖音网页版源 </br> 3. 并更新包。 |
|2020-04-02|  修改证书问题 |
|2020-04-01| 1. 修复某些网站点击出现空白页面问题 </br> 2. 增加一个数据源 </br>3.CCTV直播放入第一位|
| 2020-01 |  1. 视频网站入口改为CollectionView显示</br> 2. 优化UI </br>3. 增加历史记录功能 </br> 4.历史记录存储顺序调整 |
| 2019-12-23  |  1. 新增VIP解析源  </br> 2. 完成调用本地播放器进行播放视频(利用<font color='red'>MPV</font>软件和<font color='red'>FFPlay</font>软件)  </br>3. 增加一列"更新日志”  </br>4. dmg文件更新 |
| 2019-8-24 |  1. 试部分源，失效源优先级挪低。</br> 2. 更新icon </br> 3. "转换接口"改为"破解接口" </br> 4. 新增音乐破解地址</br>
| 2019-2-21 | 新增2个电视直播源 |
| 2019-2-15 | 全屏时隐藏底部按钮 |
| 2019-1-7 | 修正dmg地址 |
| 2018-7-26 | 更新解析接口 |

----

## 概述

本软件不做破解，只是破解地址的搬运工

1. 支持各大网站vip视频免费观看。
2. 集合自用视频或者电影URL
3. 集合自用音乐破解URL
4. 集合CCTV等电视播放URL。

* 本软件仅供学习参考，切勿商业使用。接口数据均来源于互联网。如有侵权，请联系删除。

## 开发、运行与打包

当前可发布版本为 Electron 应用，源码位于 `VipVideo/VipVideo-electron/`。项目中的 Xcode 工程为早期 macOS 实现；日常开发、运行和发布应使用 Electron 工程。

### 技术栈与目录说明

| 位置 | 用途 |
| --- | --- |
| `VipVideo/VipVideo-electron/main.js` | Electron 主进程：创建窗口、系统托盘、IPC、历史记录和用户配置读写。 |
| `VipVideo/VipVideo-electron/renderer.js` | 主窗口界面逻辑：平台按钮、筛选、编辑、历史记录及窗口置顶控制。 |
| `VipVideo/VipVideo-electron/index.html`、`styles.css` | 主窗口结构与样式。 |
| `VipVideo/VipVideo-electron/vipWindow.js` | 处理网页打开的新窗口，并注入返回和 VIP 解析入口。 |
| `VipVideo/VipVideo-electron/vlist.json` | 随应用发布的默认平台与解析线路配置。 |
| `VipVideo/VipVideo-electron/package.json` | npm 脚本以及 electron-builder 打包配置。 |

Electron 版本使用 `webview` 加载各平台网页；主进程与界面进程通过 IPC 交换历史记录、配置和窗口状态。发布包会把默认 `vlist.json` 一并带上；用户通过“编辑”保存的配置会写入系统的应用数据目录，不会覆盖源码中的默认文件。

### 准备环境

建议使用 Node.js 20 或更高版本，以及 npm。macOS 打包请在 macOS 上执行；Windows 安装包建议在 Windows 上构建；Linux 包建议在 Linux 上构建，以避免跨平台工具链、签名或安装器兼容性问题。

```bash
git clone https://github.com/iodefog/VipVideo.git
cd VipVideo/VipVideo-electron
npm install
```

如果只是在已有源码中更新依赖，进入同一目录后执行 `npm install` 即可。项目已经提交 `yarn.lock`，也可以统一使用 Yarn，但不要在同一工作副本中混用包管理器并提交两套锁文件。

### 本地运行与调试

Electron 的 JavaScript 不需要单独编译；安装依赖后直接启动即可。

```bash
cd VipVideo/VipVideo-electron
npm start
```

修改 `main.js`、`renderer.js`、HTML 或 CSS 后，关闭并重新执行 `npm start` 以加载主进程改动。仅修改网页界面时也可在应用窗口中刷新，但涉及 IPC、窗口和托盘逻辑时必须重启整个应用。

提交前可做基础语法检查：

```bash
node --check main.js
node --check renderer.js
node --check vipWindow.js
git diff --check
```

### 打包发布

所有打包命令均在 `VipVideo/VipVideo-electron/` 目录执行。它们使用 electron-builder，且带有 `--publish never`，因此只生成本地安装包，不会自动上传或发布。

```bash
# 按当前操作系统默认目标打包
npm run build

# macOS：同时生成 Intel（x64）与 Apple Silicon（arm64）ZIP 包
npm run build:mac

# Windows：生成 NSIS 安装程序与 portable 免安装程序（x64、ia32）
npm run build:win

# Linux：生成 AppImage、deb、rpm（x64）
npm run build:linux
```

打包产物统一输出到 `VipVideo/VipVideo-electron/dist/`。macOS 配置目前生成 ZIP，Windows 生成安装程序和免安装程序，Linux 生成 AppImage、deb 与 rpm。应用图标与打包目标在 `package.json` 的 `build` 字段中配置；修改版本号时同步更新其中的 `version` 字段，再重新运行打包命令。

当前配置未包含正式的代码签名和公证发布流程。macOS 用户首次打开未签名开发包时，可能需要在“隐私与安全性”中确认打开；面向外部用户正式发布前，应补充 Apple Developer 签名与公证配置。Windows 正式分发同样建议配置代码签名证书，减少 SmartScreen 提示。

### 配置与功能开发注意事项

- 默认平台和 VIP 解析线路维护在 `vlist.json`。发布后优先读取用户数据目录中的配置；开发环境中若源码配置文件更新较新，会优先使用源码配置，便于调试。
- `platformlist` 中的 `canvip: 1` 控制主窗口是否显示 VIP 入口；未配置或设为 `0` 时会隐藏。`configVersion` 用于对已有用户配置执行一次性兼容迁移。
- 主工具栏只展示 `category: "video"` 且 `canvip: 1` 的平台；音乐、AI、小说、漫画及不支持解析的平台仍可保留在配置中，但不会被创建为界面按钮或自动恢复加载。
- 新增主窗口功能时，界面事件放在 `renderer.js`，涉及系统窗口、文件或托盘能力的操作通过 IPC 交给 `main.js`。不要直接在渲染进程中调用主进程 API。
- 网页发起的 `target="_blank"` 或 `window.open` 请求会被拦截，并复用当前主播放窗口加载链接；新增网页入口时应保持这一行为，不要创建新的 `BrowserWindow`。
- “置顶”和“半透明置顶”由主进程设置窗口属性；半透明模式仅在窗口失焦时生效，重新获得焦点会恢复不透明。
- `build.sh` 只是旧的 Yarn 启动辅助脚本；`build-electron-optimized.sh` 会删除 `dist/`、`node_modules/` 以及部分 Electron 资源，不适合作为常规打包流程。除非明确测试精简包体，否则请使用上述 `npm run build*` 命令。

**GitHub:** [https://github.com/iodefog/VipVideo](https://github.com/iodefog/VipVideo)

---

## 下载安装地址：

**v1.1.5** 版本 (支持自定义源和顺序)
* [Mac(Apple芯片)](https://github.com/iodefog/VipVideo/releases/download/1.1.6/VipVideo-1.1.6-arm64-mac.zip)
* [Mac(Inter)](https://github.com/iodefog/VipVideo/releases/download/1.1.6/VipVideo-1.1.6-mac.zip)
* [Windows版本](https://github.com/iodefog/VipVideo/releases/download/1.1.6/VipVideo-Setup-1.1.6.exe.zip)

百度网盘下载地址：
* 链接: https://pan.baidu.com/s/1wcpReZs2-UG71g1idPyPmA?pwd=nkye 提取码: nkye 

## 软件功能介绍：
* 破解接口
* 展示窗口
* 新建窗口
* GoBack
* GoFoward
* 切换下一个接口（支持快捷键）
* 切换上一个接口（支持快捷键）
* Safari中打开
* 复制链接（用于分享或者浏览器播放）
* 启用本地播放（VIP接口已支持，其他网站待TODO）
* 退出
* 历史记录


---

### 主页
![](./images/home-v2.jpg)

VIP 使用方法：先进入某一集或某个视频的具体播放页面，再点击“VIP”选择解析线路。如果停留在首页、搜索页、会员页或账号页，应用会阻止解析并提示先打开具体视频。

“VIP”并不是应用内置的解密播放器。它会把当前具体播放页的 URL 拼接到所选第三方解析服务后面，由第三方服务尝试识别并返回视频。解析服务可能失效、匹配错误、插入广告或无法处理平台最新页面；遇到片名不符时应立即返回并更换线路。应用会阻止第三方页面通过新窗口跳转到非启用平台，但无法删除已经嵌入第三方视频画面中的内容。

主工具栏默认显示的平台：

| 分类 | 平台名称 | VIP解析 | 网址 |
|-----|---------|---------|------|
| 视频网站 | 爱奇艺 | ✅ | https://www.iqiyi.com/ |
| 视频网站 | 腾讯视频 | ✅ | https://v.qq.com/ |
| 视频网站 | 芒果TV | ✅ | https://www.mgtv.com/ |
| 视频网站 | 优酷 | ✅ | https://www.youku.com/ |
| 视频网站 | bilibili | ✅ | https://www.bilibili.com/ |

其他平台仍可保留在 `vlist.json` 中作为配置备份，但不会显示，也不会在启动时自动加载。

### 如果MAC软件提示已损坏，需要移到废纸篓的解决方法

<b>解决方法一： </b>
允许任何来源的应用。在系统偏好设置里，打开“安全性和隐私”，将“允许从以下位置下载的应用程序”设置为“任何来源“。当然，这个设置已经无法在Mac OS Sierra上完成了。
在Mac OS Sierra上，应该进行以下操作：

1. 打开终端（Terminal），输入以下命令后回车，输入密码 </br>

	``` 
	sudo spctl --master-disable 
	```

2. 重新运行下载的应用程序

<b>解决方法二：</b>
移除这个应用的安全隔离属性，操作如下：

1. 打开终端（Terminal），输入以下命令后回车，如需要，请输入密码</br>
格式：``` tr -r -d com.apple.quarantine <path> ``` </br>
<path> 是你下载的应用程序的路径，一般在/Applications/应用程序名字 </br>
示例：

	```
	xattr -r -d com.apple.quarantine /Applications/VIPVideo.app
	```
</br>

2. 重新运行下载的应用程序。

---

----------------------

如有其他问题，请发送邮件 [592658688@qq.com](mailto:592658688@qq.com)

QQ群：2群：786219580; 1群：567503018[已满]

个人QQ: 592658688；


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=iodefog/VipVideo&type=date&legend=top-left)](https://www.star-history.com/#iodefog/VipVideo&type=date&legend=top-left)
