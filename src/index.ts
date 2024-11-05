import { Context, Schema, h, Session, Logger, Bot } from 'koishi'

import {} from 'koishi-plugin-puppeteer';
import { Page } from 'puppeteer-core';
import {} from '@cordisjs/plugin-proxy-agent'
import {} from 'koishi-plugin-cron'

import { promises } from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

import { SourceQuerySocket } from 'source-server-query';
import mysql from 'mysql2/promise';
import Rcon from 'rcon-srcds';

import { Info, Player, QueryServerInfo } from './types/a2s';
import { secondFormat, time2Read, str2Time, timeFormat1 } from './utils/timeFormat';
import { _Reservation, platformUser, platformUserList, platformGroup, initDatabase } from './database';

export const name = 'l4d2-query'

// ToDo
// 群车预约, 报名接力(完善)
// 代码稳定性提升(缺少测试)
// 制作VTF(长期)

export const usage = `
## ⚠️从0.6.2之前旧版本升级需要移除配置后再添加新配置, 否则会有bug⚠️

## ⭐️求生之路群管理插件

灵感是来源于Agnes4m开发的基于nonebot的求生之路插件, 因为我是恋厨, 所以在部署了Koishi之后, 就想着把这个插件在Koishi上实现出来

## ⚙️功能

主要功能是connect查询服务器信息和一键查看群服状态

在此之外还添加了Anne查询, 服务器搜索的功能（可以关闭）

新增群车车功能, 目的是组织群友打三方图或者内战, 防止咕咕咕(⚠️未深度测试！！！

#### 代理
找服功能会使用steam api, 使用🪜连接会更加稳定\
以clash为例, 启动clash后, 需要允许局域网连接, 然后把对应端口的防火墙打开（如果是127.0.0.1则不需要）

#### 数据库
Anne官方数据库是不开放的, 我自己也不知道的啦\
如果你不知道怎么搭建Anne数据库, 就请将useAnne选项关闭\
如果你知道怎么搭建Anne数据库, 那应该也不需要我来解释吧（

#### Rcon
使用rcon可以帮助你远程执行服务器指令, 提醒一下, Minecraft也是支持Rcon的哦（

求生之路服务器Rcon会使用和游戏相同的端口, 只是协议更换为TCP, 对于某些使用特定网络配置的服务器, 会出现无法连接rcon的情况, 这是因为rcon服务监听到服务器本地环回地址, 使用端口转发工具即可解决问题

## ☎️联系方式
Github提issue | QQ：1194703727 | nyakoishi@qq.com
`

export const inject = {
  "required": [
    "database",
    "puppeteer",
    "cron",
    "logger"
  ]
}

const logger = new Logger('[l4d2]>> ');

export interface Config {
  servList?: {
    ip: string
    port: number
    rconEnable: boolean
    rconPort: number
    rconPassword: string
  }[],

  useSearch?: boolean,
  steamWebApi?: string,
  useProxy?: string | false,

  useAnne?: boolean,
  dbIp?: string,
  dbPort?: number,
  dbUser?: string,
  dbPassword?: string,
  dbName?: string,

  themeType?: string
  nightMode?: boolean
  nightConfig?: {
    nightStart: number
    nightEnd: number
    nightOLED: boolean
  },

  useEvent?: boolean,
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    themeType: Schema.union(['Normal', 'Dark', 'Neon', 'Wind']).default('Normal'),
    nightMode: Schema.boolean().default(false),
  }).description('主题设置'),
  Schema.union([
    Schema.object({
      nightMode: Schema.const(true).required(),
      nightConfig: Schema.array(Schema.object({
        nightStart: Schema.number().default(21).min(17).max(23),
        nightEnd: Schema.number().default(7).min(5).max(15),
        nightOLED: Schema.boolean().default(false),
      })).min(1).max(1).role('table'),
    }),
    Schema.object({}),
  ]),
  
  Schema.object({
    servList: Schema.array(Schema.object({
      ip: Schema.string().default('8.8.8.8'),
      port: Schema.number().default(27015).min(10).max(65535),
      rconEnable: Schema.boolean().default(false),
      rconPort: Schema.number().default(27015).min(10).max(65535),
      rconPassword: Schema.string().role('secret')
    })).role('table'),
  }).description('服务器订阅'),

  Schema.object({
    useSearch: Schema.boolean().default(false),
  }).description('找服设置'),
  Schema.union([
    Schema.object({
      useSearch: Schema.const(true).required(),
      steamWebApi: Schema.string().required(),
      useProxy: Schema.union([
        Schema.const(false).description('直连'),
        Schema.string().default('http://1.1.1.1:7897').description('使用代理')
      ]),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    useAnne: Schema.boolean().default(false),
  }).description('Anne数据库设置'),
  Schema.union([
    Schema.object({
      useAnne: Schema.const(true).required(),
      dbIp: Schema.string().required(),
      dbPort: Schema.number().min(10).max(65535).required(),
      dbUser: Schema.string().required(),
      dbPassword: Schema.string().role('secret').required(),
      dbName: Schema.string().required()
    }),
    Schema.object({}),
  ]).collapse(),

  Schema.object({
    useEvent: Schema.boolean().default(false).experimental(),
  }).description('开启事件系统')


]).i18n({ 
  'zh-CN': require('./locales/zh-CN'),
});


// themeBG : fontColor : themeInner : themeBorder
const themeMap = new Map([
  ["Normal", "#FFFFFF:#000000:#F5F6F7:#E5E7EB"],
  ["Dark",   "#1F1F1F:#DDDDDD:#0B0B0B:#3E3E3E"],
  ["Neon",   "#34405A:#FFFFFF:#222C44:#36507E"],
  ["Wind",   "#FFFFFF:#000000:#F5F6F7:#E5E7EB"],
  ["OLED",   "#000000:#D6D6D6:#000000:#1F1F1F"],
]);

export function apply(ctx: Context, config: Config) {
  // write your plugin here
  // ctx.server.all('/test', item => {
  //   item.body = 'hello koishi'
  // })

  if(config.useEvent) {
    initDatabase(ctx);
    // 主键 是否过期 事件名称 事件时间 事件发起人 最大参与者人数 事件参加者 替补参加者
    ctx.command('Event', '查看群事件预约说明')

    ctx.command('event.add <eventName:string> <eventTimeBig:string> <eventTimeSmall:string> [maxPlayer:posint]', '创建群事件预约', { authority: 2 })
    .userFields(['id'])
    .channelFields(['id'])
    .example('创建事件 事件名称 2024/5/3 21:30 4 | 最后的4代表最大参加人数，可以不写')
    .action(async ({session}, eName, eDate1, eDate2, eMNum) => {
      // check valid
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      const dateStr = eDate1+' '+eDate2;
      const {valid:valid, passed:passed, date:date} = str2Time(dateStr);
      if(valid === 1)
        return '时间错误, 格式应为YYYY/MM/DD HH:MM'
      if(passed)
        return '时间已过期!'
      let MaxPlayer:number = (eMNum === undefined)? 10000:eMNum;
      const Initiator:platformUser = {uid:session.user.id, nickname:session.author.name};
      const Party:platformUserList = { user:[] };
      const groupInfo:platformGroup = { platform:session.platform, selfID:session.selfId, channelID:session.channel.id };
      const result:_Reservation = await ctx.database.create('gameReservation', {
        isExpired:false,
        isNoticed:0,
        eventName:eName,
        eventGroup:groupInfo,
        eventDate:date,
        eventMaxPp:MaxPlayer,
        eventInitiator:Initiator,
        eventParticipant:Party,
        extraParticipant:Party
      });
      return `已创建编号为 ${result.index} 的事件预约`
    })
  
    ctx.command('event.del <eventNum:integer>', '删除群事件', { authority: 2 })
    .channelFields(['id'])
    .usage('指令后加事件编号')
    .action(async ({session}, eid) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
  
      const eventList = await ctx.database.get('gameReservation',
        {index: eid},
        ['eventDate', 'eventName', 'eventGroup']
      );
      if( eventList.length === 0 ) {
        return `不存在编号为${eid}的事件`
      }
  
      if(eventList[0].eventGroup.channelID != session.channel.id) {
        return '该事件不属于此群'
      }
  
      await session.send(`是否删除${eid}.${eventList[0].eventName}-${timeFormat1(eventList[0].eventDate)}\r\n输入 y 确认`)
      // comfirm
      const input = await session.prompt(10000);
      if(!input) return '输入超时'
  
      if(input === 'y') {
        await ctx.database.remove('gameReservation', {index: eid});
        return '已删除'
      } else {
        return '已取消删除'
      }
    })
  
    ctx.command('Event/列举事件')
    .channelFields(['id'])
    .action(async ({session}) => {
      const eventList = await ctx.database.get('gameReservation',
        {isExpired: false},
        ['index', 'eventDate', 'eventName', 'eventGroup']
      );
  
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
  
      if( eventList.length === 0 ) {
        return '当前没有未完成的事件呢'
      }
      let output = h('message');
      let i: number;
      for(i=0; i<eventList.length; i++) {
        if(eventList[i].eventGroup.channelID === session.channel.id) {
          output.children.push(h('p', `${eventList[i].index}.${eventList[i].eventName}-${timeFormat1(eventList[i].eventDate)}`));
        }
      }
      if(output.children.length === 0) {
        return '本群没有未完成的事件~'
      }
      session.send(output);
    })

    ctx.command('event.chtime <eventNum:integer> <Time:text>', '更改事件时间', { authority: 2 })
    .userFields(['id'])
    .channelFields(['id'])
    .action(async ({session}, eid, eDate) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      const dateStr = eDate;
      const {valid:valid, passed:passed, date:date} = str2Time(dateStr);
      if(valid === 1)
        return '时间错误, 格式应为YYYY/MM/DD HH:MM'
      if(passed)
        return '时间已过期!'

      const eventList = await ctx.database.get('gameReservation',
        {index: eid},
        ['eventDate', 'isExpired', 'eventName']
      );
      if( eventList.length === 0 ) {
        return '未找到该事件ID!'
      } else if ( eventList[0].isExpired === true ) {
        return '事件已过期'
      }

      await ctx.database.set('gameReservation',
        { index: eid },
        { eventDate: date }
      )

      return `已将事件 ${eid}.${eventList[0].eventName} 的时间从 ${timeFormat1(eventList[0].eventDate)} 修改为 ${timeFormat1(date)}`

    })

    ctx.command('event.chname <eventNum:integer> <eventName:string>', '更改事件名称', { authority: 2 })
    .userFields(['id'])
    .channelFields(['id'])
    .action(async ({session}, eid, ename) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'

      const eventList = await ctx.database.get('gameReservation',
        {index: eid},
        ['eventName']
      );
      if( eventList.length === 0 ) {
        return '未找到该事件ID!'
      }

      await ctx.database.set('gameReservation',
        { index: eid },
        { eventName: ename }
      )

      return `已将事件 ${eid}.${eventList[0].eventName} 修改为 ${ename}`
    })

    ctx.command('event.desc <eventNum:integer> <description:text>', '添加事件说明', { authority: 2 })
    .userFields(['id'])
    .channelFields(['id'])
    .action(async ({session}, eid, edesc) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'

      const eventList = await ctx.database.get('gameReservation',
        {index: eid},
        ['eventName']
      );
      if( eventList.length === 0 ) {
        return '未找到该事件ID!'
      }

      await ctx.database.set('gameReservation',
        { index: eid },
        { eventDesc: edesc }
      )

      return `已更新事件 ${eid}.${eventList[0].eventName} 的说明`
    })



  
    ctx.command('Event/查看事件 <eventNum:integer>', '查看某编号的事件')
    .action(async ({session}, eid) => {
      const eventList = await ctx.database.get('gameReservation',
        {index: eid},
      );
      if( eventList.length === 0 ) {
        return `不存在编号为${eid}的事件`
      }
      let msg = h('message',
        h('p', `${eid}. ${eventList[0].eventName}`),
        h('p', `${timeFormat1(eventList[0].eventDate)}`)
      );
      
      if(eventList[0].eventDesc != '') {
        msg.children.push(h('p', `详情：${eventList[0].eventDesc}`));
      }
      
      if(eventList[0].eventParticipant.user.length > 0) {
        eventList[0].eventParticipant.user.forEach(item => {
          msg.children.push(h('p', `☑️${item.nickname}`));
        })
      }
      if(eventList[0].extraParticipant.user.length > 0) {
        eventList[0].extraParticipant.user.forEach(item => {
          msg.children.push(h('p', `🟪${item.nickname}`));
        })
      }
  
      session.send(msg);
    })
  
    ctx.command('Event/参加事件 <eventNum:integer>', '参加事件')
    .userFields(['id'])
    .channelFields(['id'])
    .action(async ({session}, eid) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
  
      const eventList = await ctx.database.get('gameReservation',
        {index: eid}
      );
      if( eventList.length === 0 ) {
        return '未找到该事件ID!'
      } else if ( eventList[0].isExpired === true ) {
        return '事件已过期'
      }
  
      if(eventList[0].eventGroup.channelID != session.channel.id) {
        return '该事件不属于本群'
      }
  
      let curUser:platformUser = { uid:session.user.id, nickname:session.author.name };
      
      if( (eventList[0].eventParticipant.user.find(obj => obj.uid == curUser.uid) != undefined) || (eventList[0].extraParticipant.user.find(obj => obj.uid == curUser.uid) != undefined)) {
        return '请勿重复参加'
      }

      if( eventList[0].eventParticipant.user.length >= eventList[0].eventMaxPp ) { // Full, Go to Extra Party
        eventList[0].extraParticipant.user.push(curUser);
        await ctx.database.set('gameReservation',
          { index: eid },
          { extraParticipant: eventList[0].extraParticipant }
        )
        return '事件已满人，已加入替补参与者'
      } else {
        eventList[0].eventParticipant.user.push(curUser);
        await ctx.database.set('gameReservation',
          { index: eid },
          { eventParticipant: eventList[0].eventParticipant }
        )
        return '成功加入事件'
      }
    })
  
    ctx.command('Event/退出事件 <eventNum:integer>', '退出事件')
    .userFields(['id'])
    .channelFields(['id'])
    .action(async ({session}, eid) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
  
      const eventList = await ctx.database.get('gameReservation',
        {index: eid}
      );
      if( eventList.length === 0 ) {
        return '未找到该事件ID!'
      } else if ( eventList[0].isExpired === true ) {
        return '事件已过期'
      }
  
      if(eventList[0].eventGroup.channelID != session.channel.id) {
        return '该事件不属于本群'
      }
  
      let curUser:platformUser = { uid:session.user.id, nickname:session.author.name };
      
      let indexA = eventList[0].eventParticipant.user.findIndex(item => item.uid === curUser.uid);
      if(indexA != -1) {
        eventList[0].eventParticipant.user.splice(indexA, 1);
        if(eventList[0].extraParticipant.user.length > 0) {  // 存在替补
          var shift:platformUser = eventList[0].extraParticipant.user.shift();
          eventList[0].eventParticipant.user.push(shift);
  
          await ctx.database.set('gameReservation',
            { index: eid },
            { eventParticipant: eventList[0].eventParticipant, extraParticipant:eventList[0].extraParticipant }
          )
  
          return `已退出该事件，替补@${shift.nickname} 已自动加入`
        } else {
          await ctx.database.set('gameReservation',
            { index: eid },
            { eventParticipant: eventList[0].eventParticipant }
          )
          
          return `已退出该事件`
        }
      }
      let indexB = eventList[0].extraParticipant.user.findIndex(item => item.uid === curUser.uid);
      if(indexB != -1) {
        eventList[0].extraParticipant.user.splice(indexB, 1);
        await ctx.database.set('gameReservation',
          { index: eid },
          { extraParticipant: eventList[0].extraParticipant }
        )
        return '已退出此事件替补'
      }
      return '未参加此事件'
    })
  
    /* Execute Every 10 minutes */
    ctx.cron('*/10 * * * *', async () => {
      // get not expired event notice
      const eventList = await ctx.database.get('gameReservation',
        {isExpired: false},
        ['index', 'isNoticed', 'eventDate', 'eventGroup', 'eventName']
      );
      let nowDate = new Date();
      eventList.forEach(async (item) => {
        if( item.eventDate.getTime() - nowDate.getTime() < 0 ) { // Expired
          await ctx.database.set('gameReservation',
            { index: item.index },
            { isExpired: true }
          )
        } else { // Not Expired, Check Notice
          if( (item.isNoticed === 0) && (item.eventDate.getTime()-nowDate.getTime() <= (30*60*1000)) ) {
            const bot = ctx.bots.find(bot => bot.selfId === item.eventGroup.selfID)
            bot.sendMessage(item.eventGroup.channelID, `事件 ${item.index}. ${item.eventName} 将于 ${item.eventDate.getHours()}:${item.eventDate.getMinutes()} 开始`);
            await ctx.database.set('gameReservation',
              { index: item.index },
              { isNoticed: 1 }
            )
          }
        }
      })
    })
  }




  ctx.command('l4d2', '查看求生之路指令详情')

  ctx.command('l4d2/connect <ip:string>', '输出服务器信息')
  .usage('填写IP/域名:端口 无端口号时默认使用27015')
  .example('connect 123.123.123.123:27015')
  .action(async ( {session}, address ) => {
    const { ip, port } = await convServerAddr(address);
    const { code, info, players } = await queryServerInfo(ip, port);
    session.send( servInfo2Text(code, info, players) );
  })
  

  ctx.command('l4d2/服务器', '输出订阅服务器的图片')
  .action(async ({session}, ) => {
    const maxServNum = config.servList.length;
    let page: Page;

    if(!maxServNum)
      return '好像, 还没有订阅服务器呢~'

    try {
      let templateHTML = fs.readFileSync(path.resolve(__dirname, "./html/template.txt"), "utf-8");
      let templateCELL = fs.readFileSync(path.resolve(__dirname, "./html/cell.txt"), "utf-8");
      let workhtml = templateHTML;

      var index:number;

      if ( maxServNum === 1 ) {
        workhtml = workhtml.replace("#{cellArrange}#", "auto");
      } else if ( maxServNum === 2 ) {
        workhtml = workhtml.replace("#{cellArrange}#", "auto auto");
      } else {
        workhtml = workhtml.replace("#{cellArrange}#", "auto auto auto");
      }
      const date = new Date();
      let theme:string[];
      if ( config.nightMode && (date.getHours() >= config.nightConfig.nightStart || date.getHours() <= config.nightConfig.nightEnd) ) {
        if ( config.nightConfig.nightOLED ) {
          theme = themeMap.get("OLED").split(':');
        } else {
          theme = themeMap.get("Dark").split(':');
        }
      } else {
        theme = themeMap.get(config.themeType).split(':');
      }
      
      workhtml = workhtml
      .replaceAll("#{themeBG}#", theme[0])
      .replaceAll("#{themeColor}#", theme[1])
      .replaceAll("#{themeInner}#", theme[2])
      .replaceAll("#{themeBorder}#", theme[3])

      for(index=0; index<maxServNum; index++) {
        const { ip, port } = await convServerAddr(config.servList[index].ip);
        const { code, info, players } = await queryServerInfo(ip, config.servList[index].port);
        if(code === 0) {
          workhtml = workhtml
          .replace("<!-- ##{SERVER_CELL}## -->", templateCELL)
          .replace("#{ServerName}#", `${index+1}. ${info.name}`)
          .replace("#{MapName}#", info.map)
          .replace("#{Player1}#", (players[0] === undefined)? " ":`${players[0].name} | ${secondFormat(players[0].duration)}`)
          .replace("#{Player2}#", (players[1] === undefined)? " ":`${players[1].name} | ${secondFormat(players[1].duration)}`)
          .replace("#{Player3}#", (players[2] === undefined)? " ":`${players[2].name} | ${secondFormat(players[2].duration)}`)
          .replace("#{Player4}#", (players[3] === undefined)? " ":`${players[3].name} | ${secondFormat(players[3].duration)}`)
          .replace("#{PlayerNum}#", info.players.toString())
          .replace("#{MaxPlayer}#", info.max_players.toString())
          .replace("#{SVG}#", `${info.environment}.svg`)
        } else {
          workhtml = workhtml
          .replace("<!-- ##{SERVER_CELL}## -->", templateCELL)
          .replace("#{ServerName}#", `${index+1}. 无响应`)
          .replace("#{MapName}#", " ")
          .replace("#{Player1}#", " ")
          .replace("#{Player2}#", " ")
          .replace("#{Player3}#", " ")
          .replace("#{Player4}#", " ")
          .replace("#{PlayerNum}#", "0")
          .replace("#{MaxPlayer}#", "0")
          .replace("#{SVG}#", "u.svg")
        }
      }
      
      fs.writeFileSync(path.resolve(__dirname, "./html/index.html"), workhtml);
      
      let pageWidthIndex:number[] = [428, 606, 898];
      let pageWidth:number;
      if(maxServNum <= 3)
        pageWidth = pageWidthIndex[maxServNum-1];
      else
        pageWidth = pageWidthIndex[2];
      page = await ctx.puppeteer.page();
      await page.setViewport({ width: pageWidth, height: 5000 });
      await page.goto(`file:///${path.resolve(__dirname, "./html/index.html")}`);
      await page.waitForSelector("#body");
      const element = await page.$("#body");
      let msg;
      if(element) {
        const imgBuf = await element.screenshot({encoding: "binary"});
        msg = h.image(imgBuf, 'image/png');
      } else {
        msg = "Fail to capture screenshot.";
      }
      await page.close();
      return msg;
      
    } catch(error) {
      logger.error(`[l4d2 Error]:\r\n`+error);
      return '出错了ww'
    }
    
  });
  
  const regexp = /^服务器[1-9]\d*$/;
  ctx.middleware( async (session, _) => {
    const input = session.content;
    if ( regexp.test(input) ) {
      const index = Number(input.substring(3));
      const maxServNum = config.servList.length;
      if( index <= maxServNum ) {
        const { code, info, players } = await queryServerInfo(config.servList[index-1].ip, config.servList[index-1].port);
        const output = servInfo2Text(code, info, players);
        output.children.push( h('p', `connect ${config.servList[index-1].ip}:${config.servList[index-1].port}`));
        session.send( output );
      }
    }
  })

  if(config.useSearch) {
    ctx.command('l4d2/找服', '找求生服')
    .option('servName', '-n <name:string>')
    .option('servIp', '-i <ip:string>')
    .option('servTag', '-t <tag:string>')
    .option('isEmpty', '-e', {fallback: false})  // 是否空服
    .option('ignorePlayer', '-a', {fallback: false})  // 不管是否存在玩家
    .option('region', '-r <region:number>', {fallback: null})  //没做
    .option('maxQuery', '-m <max:number>', {fallback: 5})
    .usage('后面加可选项 -n+服务器名称, *可做通配符; -i+服务器IP; -t+服务器tag; -a 寻找所有服; -e 寻找空服; -r+地区代码; -m+查询数量')
    .example('找服 anne -m 10 --> 返回最多10个tag含有“anne”的服务器')
    .action(async ({session, options}, _) => {
  
      if(!config.steamWebApi)
        return '请设置Steam API Key'
  
      const qUrlPre:string = `https://api.steampowered.com/IGameServersService/GetServerList/v1/?key=${config.steamWebApi}`;
      const qUrlSuf:string = `&limit=${options.maxQuery}`
      let qUrlFilter:string = '&filter=appid\\550'
  
      // 3个主要查询条件
      if('servTag' in options)
        qUrlFilter = qUrlFilter.concat(`\\gametype\\${options.servTag}`);
      if('servName' in options)
        qUrlFilter = qUrlFilter.concat(`\\name_match\\${options.servName}`);
      if('servIp' in options)
        qUrlFilter = qUrlFilter.concat(`\\gameaddr\\${options.servIp}`);
  
      // 2个可选查询条件
      if (!options.ignorePlayer) {
        if(options.isEmpty) {
          qUrlFilter = qUrlFilter.concat('\\noplayers\\1');
        } else {
          qUrlFilter = qUrlFilter.concat('\\empty\\1');
        }
      }
      if(options.region)
        qUrlFilter = qUrlFilter.concat(`\\region\\${options.region}`);
  
      const qUrl = qUrlPre+qUrlFilter+qUrlSuf;
      let qResponse;
  
      try {
        if( config.useProxy === false ) {
          qResponse = await ctx.http.get(qUrl);
        } else {
          qResponse = await ctx.http.get(qUrl, { proxyAgent: config.useProxy });
        }
      } catch (error) {
        logger.error(`[l4d2 Error]:\r\n`+error);
        return '网络错误！'
      }
  
      if(qResponse.response.servers === undefined)
        return '未找到符合条件的服务器'
  
      const result = h("figure");
      for( const serv of qResponse.response.servers) {
        const iServName:string = serv.name;
        const iServIP:string = serv.addr;
        const iServMap:string = serv.map;
        const iServPlayer:number = serv.players;
        const iServMaxP:number = serv.max_players;
        result.children.push(h("message", `${iServName}  ${iServMap}  ${iServPlayer}/${iServMaxP}\r\nsteam://connect/${iServIP}`));
      }
      await session.send(result);
    });
  }
  
  ctx.command('l4d2/Steam绑定 <steamid:string>', '绑定Anne查询,数据查询使用的SteamID')
  .userFields(['id', 'steamid'])
  .usage('指令后填写您的SteamID')
  .example('Anne绑定 STEAM_0:1:123456')
  .action(async ({session}, gameid) => {
    const regServ = /^STEAM_[0,1]:[0,1]:\d+$/;
    if(!regServ.test(gameid))
      return '请检查STEAMID是否正确'

    let userid = session.user.id;
    if( session.user.steamid == null ) { // set
      logger.info(`[l4d2 Info]: Bind SteamID`);
      await ctx.database.set('user', {id: userid}, {steamid: gameid});
      return '已绑定您的SteamID'
    } else { // create
      logger.info(`[l4d2 Info]: Update SteamID`);
      await ctx.database.set('user', {id: userid}, {steamid: gameid});
      return '已更新您的SteamID'
    }
  })

  if(config.useAnne) {
    ctx.command('l4d2/Anne查询 [name:text]', '查询玩家Anne药役数据')
    .userFields(['id', 'steamid'])
    .usage('填写游戏内昵称, 或使用Anne绑定后直接查询')
    .example('Anne查询 koishi')
    .action(async ({session}, qName) => {
      const { ip, port } = await convServerAddr(config.dbIp);
      const dbConn = await mysql.createConnection({
        host: ip,
        port: config.dbPort,
        user: config.dbUser,
        password: config.dbPassword,
        database: config.dbName
      });
      
      try {
        let players: mysql.QueryResult;
        let steamid: string;
        let name: string;
        if( qName === undefined ) { // Use SteamID
          if( session.user.steamid == '' ) {
            return '未绑定SteamID, 请输入查询昵称或绑定SteamID'
          }
          steamid = session.user.steamid;
          [ players, ] = await dbConn.execute(
            `select lastontime,playtime,points,name,rank from (select lastontime,playtime,points,steamid,name,@curRank:=@curRank+1 as rank from players s,(select @curRank:=0) q order by points desc) as tb1 where steamid="${steamid}"`
          );
          name = players[0].name;
        } else { // Use Nickname
          [ players, ] = await dbConn.execute(
            `select lastontime,playtime,points,steamid,rank from (select lastontime,playtime,points,steamid,name,@curRank:=@curRank+1 as rank from players s,(select @curRank:=0) q order by points desc) as tb1 where name="${qName}"`
          );
          steamid = players[0].steamid;
          name = qName;
        }
        const [ table, ] = await dbConn.execute( // Query Max Players
          `select table_rows from information_schema.tables where table_schema='${config.dbName}' and table_name='players';`
        );
        const [ rpg, ] = await dbConn.execute( // Query Tag
          `SELECT CHATTAG FROM rpg WHERE steamid = "${steamid}"`
        );
        const date = new Date(players[0].lastontime*1000);
        let anneInfo: h = h('message');
        if( rpg[0].CHATTAG != null ) {
          anneInfo.children.push( h('p', `玩家：[${rpg[0].CHATTAG}]${name}`) );
        } else {
          anneInfo.children.push( h('p', `玩家：${name}`) );
        }
        anneInfo.children.push(
          h('p', `分数：${players[0].points}    排名：${players[0].rank}/${table[0].table_rows}`),
          h('p', `游玩时间：${time2Read(players[0].playtime*60)}`),
          h('p', `最后上线：${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`)
        );
        session.send(anneInfo);
        
      } catch (error) {
        logger.error(`[l4d2 Error]:\r\n`+error);
        return '找不到qwq, 是不是输错啦?'
      }
    })
  }

  ctx.command('l4d2/求生数据 [steamid:string]', '查询求生之路玩家数据')
  .usage('参数填写SteamID或SteamID64, 或绑定ID后快速查询')
  .userFields(['id', 'steamid'])
  .action(async ({session}, sid) => {
    if(!config.steamWebApi)
      return '请设置Steam API Key'

    let steamid:string;
    if( sid === undefined ) { // use database bind steamid
      if( session.user.steamid == '' ) {
        return '未绑定SteamID, 请输入SteamID或绑定SteamID'
      }
      steamid = session.user.steamid
    } else { // use input steamid
      steamid = sid;
    }
    let {code:ret, sid64:steamid64} = convSteamID(steamid);
    if(ret != 0) {
      return 'SteamID格式错误'
    }

    let qUrl = `https://api.steampowered.com/ISteamUserStats/GetUserStatsForGame/v0002/?appid=550&key=${config.steamWebApi}&steamid=${steamid64}`; // get l4d2 stats
    let qUrlA = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${config.steamWebApi}&steamids=${steamid64}` // get user name

    let qResponse, qResponseA;
    try {
      if( config.useProxy === false ) {
        qResponse = await ctx.http.get(qUrl);
        qResponseA = await ctx.http.get(qUrlA);
      } else {
        qResponse = await ctx.http.get(qUrl, { proxyAgent: config.useProxy });
        qResponseA = await ctx.http.get(qUrlA, { proxyAgent: config.useProxy });
      }
    } catch (error) {
      logger.error(`[l4d2 Error]: `+error);
      return '网络错误！'
    }

    
    const sNickname = qResponseA.response.players[0].personaname;

    const sPlayTime = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.TotalPlayTime.Total'); // s

    const sVersusWon = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.GamesWon.Versus');
    const sVersusLost = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.GamesLost.Versus');

    const sPistolKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.pistol.Kills.Total'); 
    const sMagnumKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.pistol_magnum.Kills.Total');

    const sSmgKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.smg_silenced.Kills.Total');
    const sUziKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.smg.Kills.Total');

    const sPumpKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.pumpshotgun.Kills.Total');
    const sChromeKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.shotgun_chrome.Kills.Total');

    const sHuntingKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.hunting_rifle.Kills.Total');

    const sPumpHeadKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.pumpshotgun.Head.Total');
    const sChromeHeadKill = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.shotgun_chrome.Head.Total');

    const sTankRockDmg = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.SpecAttack.Tank');
    const sTankLifeSpan = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.TotalLifeSpan.Tank');
    const sTankSpawn = qResponse.playerstats.stats.find(obj => obj.name === 'Stat.TotalSpawns.Tank');

    const t1kill:number = sPistolKill.value+sMagnumKill.value+sSmgKill.value+sUziKill.value+sPumpKill.value+sChromeKill.value+sHuntingKill.value+sPumpHeadKill.value+sChromeHeadKill.value;
    const ExpRank:number = (sVersusWon.value / (sVersusWon.value + sVersusLost.value))*(0.55*sPlayTime.value/3600 + 0.005*t1kill);

    const msg = h('message',
      h('p', `玩家: ${sNickname}`),
      h('p', `求生时长: ${secondFormat(sPlayTime.value, {onlyHour: true})}`),
      h('p', `经验评分(伪): ${ExpRank.toFixed()}`),
    )

    session.send(msg);
  })




  ctx.command('l4d2/rcon <server:string> <cmd:text>', '使用Rcon控制服务器', { authority: 4 })
  .usage('rcon ?f cmd')
  .example('rcon 2f status 连接订阅的服务器2并发送status指令')
  .action( async ({session}, server, cmd) => {
    const regServ = /^[1-9]\d*f$/;
    if(!regServ.test(server))
      return '请检查服务器编号是否为：编号f (12f)'

    const sp = server.split('f');
    let index:number = Number(sp[0]);
    const maxServNum = config.servList.length;

    if(index > maxServNum || index < 1)
      return '没有这个服务器呢'
    if(config.servList[index-1].rconEnable === false)
      return '该服务器未开启RCON功能！'

    const remote = new Rcon({host: config.servList[index-1].ip, port: config.servList[index-1].rconPort, encoding: 'utf8'});
    try {
      await remote.authenticate(config.servList[index-1].rconPassword);
      let status = await remote.execute(cmd);
      session.send(`指令执行成功\r\n${status}`);
      remote.disconnect();
    } catch(error) {
      logger.error(`[l4d2 Error]:\r\n`+error);
      return 'rcon连不上喵qwq'
    }
  })
}

function checkIpValid(ip:string) {
  const ipReg = /^((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})(\.((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})){3}$/;
  return ipReg.test(ip);
}


const queryServerInfo: QueryServerInfo = async (ip, port) => {
  const query: SourceQuerySocket = new SourceQuerySocket();
  let errMsg: Error;
  const info = await query.info(ip, port).catch((err) => {
    logger.error(err);
    errMsg = err;
  });

  let players: Player[] | void;
  if (!errMsg) {
    players = await query.players(ip, port).catch((err) => {
      logger.error(err);
      errMsg = err;
    });
  }
  if (errMsg) {
    return { code: 1, info: null, players: null, errMsg };
  } else {
    return {
      code: 0,
      info: info as Info,
      players: players as Player[],
      errMsg: null,
    };
  }
};


function servInfo2Text( code: number, info: Info, players: Player[] ):h {
  let index:number;
  let servInfo: h;
  if (code === 0) {
    servInfo = h('message',
      h('p', `名称：${info.name}`),
      h('p', `地图：${info.map}`),
      h('p', `玩家：${info.players}/${info.max_players}`)
    );
    
    for(index = 0; index < info.players; index++) {
      servInfo.children.push( h('p', `[${players[index].score}] | ${secondFormat(players[index].duration)} | ${players[index].name}`) );
    }
  } else {
    servInfo = h.text("服务器无响应");
  }
  return servInfo;
}


function convSteamID( sid: string ) {
  const reg1 = /^STEAM_[0,1]:[0,1]:\d+$/;
  const reg2 = /^76561198[0-9]{9}$/;
  if( reg1.test(sid) ) { // SteamID
    const sp = sid.split(':');
    const iServer:bigint = BigInt(sp[1]);
    const iAuth:bigint = BigInt(sp[2]);
    const b64:bigint = 76561197960265728n
    const s64 = (iAuth*2n+b64+iServer).toString();
    return {code:0, sid64:s64}
  } else if( reg2.test(sid) ) {
    return {code:0, sid64:sid}
  } else {
    return {code:1, sid64:null};
  }
}

async function convServerAddr( url: string ) {
  const addr = url.split(":");
  let ip = addr[0];
  let port:number | string = 27015;
  addr[1] && (port = addr[1]);

  if (!checkIpValid(ip)) {  // dns
    const resolver = new promises.Resolver();
    const addresses = await resolver.resolve4(ip).catch(() => {logger.error(`[l4d2 Error]:DNS Resolve Failed`)});
    if (addresses && addresses.length) {
      ip = addresses[0];
    }
  }

  return {ip, port};
}
