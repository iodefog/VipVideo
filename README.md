
# VipVideo

----

各大网站vip视频免费观看

* 本软件仅供学习参考，切勿商业使用。接口数据均来源于互联网。如有侵权，请联系删除。

---

### 禁止商业使用
### 禁止商业使用
### 禁止商业使用

重要的事情说三遍

### 发现有人开始改代码加广告了，请尊重作者和尊重开源精神，别为了几块钱就把尊严扔掉

---

## 更新
* 内容
	* 2018-7-26 更新解析接口

---
## VipVideo For iPhone

[https://github.com/iodefog/VipVideo-iPhone.git](https://github.com/iodefog/VipVideo-iPhone.git)

## dmg地址：

https://iodefog.github.io/dmg/MVideo.dmg

---

## 解析源（需要代码自行配置）

1.VipURLManager.m

```
#import "VipURLManager.h"
#import "AppDelegate.h"
#import "JSONKit.h"

#warning 这里是否需要线上 vipurl，可直接用本地“mviplist.json”

#define OnlineVipUrl @"https://iodefog.github.io/text/viplist.json"

@implementation VipUrlItem

```

2.线上配置json地址:(也可以使用本地包地址，有时间我就会更新)

[https://iodefog.github.io/text/viplist.json](https://iodefog.github.io/text/viplist.json)


---

## 软件功能介绍：
* 1.展示窗口
* 2.新建窗口
* 3.复制链接（用于分享或者浏览器播放）
* 4.GoBack
* 5.GoFoward
* 6切换vip接口
* 7.切换下一个（支持快捷键）
* 8.切换上一个（支持快捷键）
* 9.退出

---

### 主页
![](./images/home.jpeg)

### 功能位
![](./images/gongnengwei.png)

---

### 使用方法：

以vip电影《勇敢者游戏决战丛林》为例

* 1.搜索找到vip电影《勇敢者游戏决战丛林》
![](./images/WX20180530-145513@2x.jpeg)

* 2.进入播放页面, 可以看到需要vip或者劵
![](./images/WX20180530-145751@2x.jpeg) 

* 3.利用“切换接口”转换成vip播放地址
![](./images/WX20180530-145832@2x.jpeg) 

* 4.可以看到切换后播放器时间已经变味119分钟。尽情享受吧
![](./images/WX20180530-150004@2x.jpeg) 

---

### 源码需配置

* VipURLManager.m 中，设置平台信息及解析url。格式参考viplist.json 文件。也可以直接配置viplist.json，不走网络。


---

### 其他：
如果提示需要安装FlashPlayer才能播放。请先安装FlashPlayer及允许。

此外可能需要设置如下配置：
flash 配置环境比较久了，记不了太清。如果仍然不好使，请自行查找原因及解决问题。


![](./images/peizhi.png)
![](./images/peizhi2.jpg)
![](./images/erweima.png)

---

* 应大家的要求，放出源码，仅供交流使用。
* 这里仅仅给出源码，接口已经移除。有需要的请自行配置url路径。
* 如果有需要我这边出接口的，请适当给一些赞助。赞助后，定期下发给vip转换url或者dmg。


---


如需联系或者合作，请发送邮件 [iodefog@gmail.com](mailto:iodefog@gmail.com)

QQ群：567503018
