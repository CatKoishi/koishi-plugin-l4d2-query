#
<div align="center">
  <a href="https://github.com/initialencounter/mykoishi">
    <a href="https://koishi.chat/" target="_blank">
    <img width="160" src="https://koishi.chat/logo.png" alt="logo">
  </a>
  </a>
<h3 align="center">koishi-plugin-jrys-max</h3>

[![npm](https://img.shields.io/npm/v/koishi-plugin-l4d2-query?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-l4d2-query)
</div>

# koishi-plugin-l4d2-query

求生之路服务器管理与查询插件，功能仿照[Agnes4m的nonebot插件](https://github.com/Agnes4m/nonebot_plugin_l4d2_server)

查询功能基于[wahaha216的a2s插件](https://github.com/wahaha216/koishi-plugin-a2s#readme)开发

本人纯编程白痴，只会Ctrl C/V，有bug请见谅qwq

## 功能

查询任意支持A2S的求生之路服务器信息，一键查询订阅的服务器信息，寻找包含特定tag的服务器

## 快速开始

​插件市场搜索l4d2-query安装

使用connect ip:port查询求生服务器
使用 “服务器” 指令查询订阅的服务器
使用 “找服玩 tag” 指令查找服务器 [需要API KEY]
使用 “Anne查询 游戏昵称” 指令查询Anne数据库信息

更多说明请使用help指令获取

#### 添加订阅服务器

后台插件配置找到l4d2-query
servList添加行-填写IP与端口-保存配置

### 更新历史
0.1.0
支持connect获取服务器信息

0.2.0
支持订阅服务器并统一渲染

0.2.1
优化订阅服务器数量小于3时订阅图的显示宽度
删除“延迟”条目

0.3.0
可以找服玩了？

0.3.1
支持使用代理访问steam api

0.4.0
支持Anne数据库查询啦
