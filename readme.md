<!-- markdownlint-disable MD026 MD028 MD033 MD041 -->

<div align="center">
  <a href="https://koishi.chat/" target="_blank">
    <img width="160" src="https://koishi.chat/logo.png" alt="logo">
  </a>

# koishi-plugin-l4d2-query

[![npm](https://img.shields.io/npm/v/koishi-plugin-l4d2-query?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-l4d2-query)

</div>

## 📖 介绍

求生之路群助手All in One，功能仿照[Agnes4m-nonebot插件](https://github.com/Agnes4m/nonebot_plugin_l4d2_server)

查询功能基于[wahaha216-a2s插件](https://github.com/wahaha216/koishi-plugin-a2s)

本人纯编程白痴，只会Ctrl C/V，有bug请见谅qwq

## 📦 功能

- [x] 查询任意支持A2S的求生之路服务器信息
- [x] 一键输出订阅的服务器信息
- [x] 寻找包含特定tag的服务器列表
- [x] 查询Anne药役玩家数据
- [x] 使用RCON管理服务器
- [x] 查询玩家游戏时长，经验评分(伪)
- [x] 群车车事件预约

功能说明请使用`help l4d2`获取

> 注意: Anne官方数据库不开放，此插件仅提供查询方法，不提供数据库

> 如何订阅服务器?\
> 后台插件配置找到`l4d2-query`\
> `servList`添加行 --> 填写`IP与端口` --> 保存配置

### 事件功能介绍

- [x] 预约/取消事件
- [x] 增改事件说明，时间，名称
- [x] 列举未完成事件
- [x] 查看/参加/退出事件
- [x] 事件开始前提醒

事件系统说明使用`help event`获取

---

## 📝 更新历史

### 1.1.1

控制不住包体积了，摆烂了（
订阅服务器输出增加纯文字(TEXT)和列表图片(LITE)样式
修复导致其它基于中间件的插件无法工作的bug

### 1.1.0

- 略微修改服务器订阅样式
- 服务器订阅支持并发查询(大幅减少查询时间)
- 修改服务器订阅图片字体(OPPO Sans 4.0)
- 修改设置描述

### 1.0.0

- 增加事件id输入校验
- 补充事件系统使用说明与帮助
- 事件小时分钟固定2位数字
- 修复"服务器x"指令不会进行域名解析的bug
- 调整服务器订阅图片
- 调整时间输出为只有分钟的样式
- 修复夜间模式无法启用的bug

<details>
<summary>测试版更新历史（点击展开）</summary>

### 1.0.0-alpha.0

- 修复重复参加事件bug
- 新增求生数据查询功能，经验评分功能
- 完善事件系统

### 0.8.0 ~ 0.8.3

- 初步完成群车车系统

### 0.7.0

- Anne查询支持绑定SteamID以快速查询
- Anne查询支持排名

### 0.6.2

- 合并管理插件指令
- "Anne查询" 和 "找服" 改为可选功能
- 更改设置样式, 请删除配置后再使用！

### 0.6.1

- 优化暗色背景下服务器图标的显示
- 搜索服务器时可以去除对服务器人数的限制条件
- 微调图像宽度

### 0.6.0

- 支持输入`服务器?`快速查询订阅的服务器信息
- 支持自定义夜间模式和图片主题 *目前只支持Normal和Dark*
- 调整只有2个订阅服务器时的显示效果

### 0.5.1

- 服务器订阅列表不会因为某一个服务器查询失败而无法输出
- 优化运行错误时的回复

### 0.5.0

- 增加RCON远程管理服务器功能

### 0.4.1

- 完善 找服玩 功能
- 添加 GitHub 链接与联系方式

### 0.4.0

- 支持Anne数据库查询啦

### 0.3.1

- 支持使用代理访问steam api

### 0.3.0

- 可以找服玩了？

### 0.2.1

- 优化订阅服务器数量小于3时订阅图的显示宽度\
- 删除“延迟”条目

### 0.2.0

- 支持订阅服务器并统一渲染

### 0.1.0

- 支持connect获取服务器信息

</details>
