import { Context, Schema, h, Logger } from 'koishi'

import {} from 'koishi-plugin-puppeteer';
import {} from '@cordisjs/plugin-proxy-agent'
import {} from 'koishi-plugin-cron'

import { promises } from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

import * as a2s from '@fabricio-191/valve-server-query';
import mysql from 'mysql2/promise';
import Rcon from 'rcon-srcds';

import { A2SResult, QueryServerInfo } from './types/a2s';
import { renderHtml } from './utils/render'
import { secondFormat, str2Time, timeFormat1 } from './utils/timeFormat';
import { _Reservation, platformUser, platformUserList, platformGroup, initDatabase, initGameReserveDB } from './database';

export const name = 'l4d2-query'

// ToDo
// 代码稳定性提升(缺少测试)
// 制作VTF(长期)

export const usage = `
## ⚠️从0.6.2之前旧版本升级需要移除配置后再添加新配置, 否则会有bug⚠️

## ⭐️求生之路群管理插件

灵感源于[Agnes4m的求生之路插件](https://github.com/Agnes4m/nonebot_plugin_l4d2_server)和毛茸茸的Pure服插件, 基于[@wahaha216/a2s](https://github.com/wahaha216/koishi-plugin-a2s), 附加一些奇奇怪怪的小功能

插件需要 puppeteer, cron, database 服务

<details>
<summary>查看详情</summary>

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
</details>
`

export const inject = {
  "required": [
    "database",
    "puppeteer",
    "cron",
    "logger"
  ]
}

declare type SVINFO = {
  index: number;
  group: string;
  ip: string;
  port: number;
  rconPort: number;
  rconPassword: string;
}

declare type SVGROUP = {
  groupName: string;
  servList: SVINFO[];
}


const logger = new Logger('[L4D2]>> ');

export interface Config {
  queryLimit?: number,
  outputIP?: boolean,
  listStyle?: string,
  maxShowPlayer?: number,
  servList?: SVINFO[],

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
    themeType: Schema.union(['Normal', 'Dark', 'Neon', 'Wind']).default('Normal').description('主题样式'),
    nightMode: Schema.boolean().default(false).description('自动夜间模式'),
  }).description('主题设置'),
  Schema.union([
    Schema.object({
      nightMode: Schema.const(true).required(),
      nightConfig: Schema.array(Schema.object({
        nightStart: Schema.number().default(21).min(17).max(23).description('开始时间'),
        nightEnd: Schema.number().default(7).min(5).max(15).description('结束时间'),
        nightOLED: Schema.boolean().default(false).description('启用OLED夜间模式'),
      })).min(1).max(1).role('table').description('自定义夜间模式'),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    listStyle: Schema.union(['normal', 'lite', 'text']).default('normal').description('服务器列表输出样式'),
    maxShowPlayer: Schema.number().min(2).max(16).default(4).description('服务器图片最大显示人数'),
    outputIP: Schema.boolean().default(true).description('查询服务器详情时是否输出服务器IP'),
    queryLimit: Schema.number().min(1).max(32).default(4).description('并发查询限制'),
    servList: Schema.array(Schema.object({
      group: Schema.string().description('服务器分组名'),
      ip: Schema.string().default('8.8.8.8').description('服务器IP'),
      port: Schema.number().default(27015).min(0).max(65535).description('服务器端口'),
      rconPort: Schema.number().default(-1).min(-1).max(65535).description('RCON端口(-1关闭)'),
      rconPassword: Schema.string().role('secret').description('RCON密码')
    })).role('table').description('订阅服务器列表'),
  }).description('服务器订阅'),

  Schema.object({
    useAnne: Schema.boolean().default(false).description('启用Anne药役查询功能'),
  }).description('Anne查询设置'),
  Schema.union([
    Schema.object({
      useAnne: Schema.const(true).required(),
      dbIp: Schema.string().required().description('Anne数据库地址'),
      dbPort: Schema.number().min(10).max(65535).required().description('Anne数据库端口'),
      dbUser: Schema.string().required().description('数据库用户名'),
      dbPassword: Schema.string().role('secret').required().description('数据库密码'),
      dbName: Schema.string().required().description('表名')
    }),
    Schema.object({}),
  ]).collapse(),

  Schema.object({
    steamWebApi: Schema.string().description('点击[->此处<-](https://steamcommunity.com/dev/apikey)获取'),
    useProxy: Schema.union([
      Schema.const(false).description('直连'),
      Schema.string().default('http://1.1.1.1:7897').description('使用代理')
    ]).description('API连接方式'),
    useSearch: Schema.boolean().default(false).description('启用找服功能(基于转发消息, QQ官方Bot慎用)'),
    useEvent: Schema.boolean().default(false).description('启用事件系统(不支持QQ官方Bot)'),
  }).description('其他设置')
]);


// themeBG : fontColor : themeInner : themeBorder
const themeMap = new Map([
  ["Normal", "#FFFFFF:#000000:#F5F6F7:#E5E7EB"],
  ["Dark",   "#1F1F1F:#DDDDDD:#0B0B0B:#3E3E3E"],
  ["Neon",   "#34405A:#FFFFFF:#222C44:#36507E"],
  ["Wind",   "#FFFFFF:#000000:#F5F6F7:#E5E7EB"],
  ["OLED",   "#000000:#D6D6D6:#000000:#1F1F1F"],
]);

export async function apply(ctx: Context, config: Config) {
  // write your plugin here
  // ctx.server.all('/test', item => {
  //   item.body = 'hello koishi'
  // })
  initDatabase(ctx);

  if(config.useEvent) {
    initGameReserveDB(ctx);

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

    ctx.command('event.del <eventNum:posint>', '删除某编号事件', { authority: 2 })
    .channelFields(['id'])
    .usage('指令后加事件编号')
    .example('event.del 3 | 删除3号事件')
    .action(async ({session}, eid) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      if(eid === undefined)
        return '未输入事件编号 请输入 help 指令名称 查看使用说明'

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

      if(input.includes('y')) {
        await ctx.database.remove('gameReservation', {index: eid});
        return '已删除'
      } else {
        return '已取消删除'
      }
    })

    ctx.command('Event/列举事件', '输出未完成的事件列表')
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

    ctx.command('event.chtime <eventNum:posint> <Time:text>', '更改事件时间', { authority: 2 })
    .userFields(['id'])
    .channelFields(['id'])
    .usage('指令后加事件编号与新的时间')
    .example('event.chtime 3 2024/11/11 11:11 | 修改3号事件的时间')
    .action(async ({session}, eid, eDate) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      if(eid === undefined)
        return '未输入事件编号 请输入 help 指令名称 查看使用说明'

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

    ctx.command('event.chname <eventNum:posint> <eventName:string>', '更改事件名称', { authority: 2 })
    .userFields(['id'])
    .channelFields(['id'])
    .usage('指令后加事件编号与新的事件名称')
    .example('event.chname 3 这是新的名称 | 修改3号事件的名称')
    .action(async ({session}, eid, ename) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      if(eid === undefined)
        return '未输入事件编号 请输入 help 指令名称 查看使用说明'

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

    ctx.command('event.desc <eventNum:posint> <description:text>', '添加事件说明', { authority: 2 })
    .userFields(['id'])
    .channelFields(['id'])
    .usage('指令后加事件编号与事件描述')
    .example('event.desc 3 这是一段事件详情描述 | 增改3号事件的描述')
    .action(async ({session}, eid, edesc) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      if(eid === undefined)
        return '未输入事件编号 请输入 help 指令名称 查看使用说明'

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

    ctx.command('Event/查看事件 <eventNum:posint>', '输出某编号事件的详情')
    .usage('指令后加事件编号')
    .example('查看事件 3 | 查看3号事件的信息')
    .action(async ({session}, eid) => {
      if(eid === undefined)
        return '未输入事件编号 请输入 help 指令名称 查看使用说明'

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

    ctx.command('Event/参加事件 <eventNum:posint>', '参加事件')
    .userFields(['id'])
    .channelFields(['id'])
    .usage('指令后加事件编号')
    .example('参加事件 3 | 参加3号事件')
    .action(async ({session}, eid) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      if(eid === undefined)
        return '未输入事件编号 请输入 help 指令名称 查看使用说明'

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

    ctx.command('Event/退出事件 <eventNum:posint>', '退出事件')
    .userFields(['id'])
    .channelFields(['id'])
    .usage('指令后加事件编号')
    .example('退出事件 3 | 退出3号事件')
    .action(async ({session}, eid) => {
      if(session.channel === undefined)
        return '请在群聊中使用本指令'
      if(eid === undefined)
        return '未输入事件编号 请输入 help 指令名称 查看使用说明'

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


  /*****************************************************************************************************************/

  let groupList: SVGROUP[] = [{groupName:"服务器", servList:config.servList}];
  groupList[0].servList.map( (info, index) => {
    info.index = index;
  })

  groupList[0].servList.map( info => {
    if ( info.group ) {
      const nickname = info.group.replace(/\s+/g, '');
      if ( nickname != "" ) {
        const index = groupList.findIndex( obj => obj.groupName === nickname );

        if( index != -1 ) {
          groupList[index].servList.push(info);
        } else {
          groupList.push({ groupName: nickname, servList: [info] });
        }
      }
    }
  })

  ctx.command('l4d2', '查看求生之路指令详情')

  ctx.command('l4d2/connect <ip:string>', '输出服务器信息')
  .usage('填写IP/域名:端口 无端口号时默认使用27015')
  .example('connect 123.123.123.123:27015')
  .action(async ( {session}, address ) => {
    if(address === undefined)
      return '服务器地址未输入！'
    const { ip, port } = await convServerAddr(address);
    const sv = await queryServerInfo(ip, port, true);
    session.send( servInfo2Text(sv) );
  })

  groupList.map( group => {
    ctx.command(`l4d2/${group.groupName} [index:number]`, '输出订阅组服务器信息')
    .usage('指令名后可加序号查询特定服务器详情')
    .example(`${group.groupName} | ${group.groupName} 1`)
    .action(async ( {session}, index ) => {
      const msg = await servInfo2Pic(ctx, config, group, index);
      session.send(msg);
    })
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
        logger.error(`Error:\r\n`+error);
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
          h('p', `游玩时间：${secondFormat(players[0].playtime*60, {onlyHour: true})}`),
          h('p', `最后上线：${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`)
        );
        session.send(anneInfo);

      } catch (error) {
        logger.error(`[Error]:\r\n`+error);
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
      logger.error(`Error: `+error);
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
    if(config.servList[index-1].rconPort < 0)
      return '该服务器未开启RCON功能！'

    const remote = new Rcon({host: config.servList[index-1].ip, port: config.servList[index-1].rconPort, encoding: 'utf8'});
    try {
      await remote.authenticate(config.servList[index-1].rconPassword);
      let status = await remote.execute(cmd);
      session.send(`指令执行成功\r\n${status}`);
      remote.disconnect();
    } catch(error) {
      logger.error(`Error:\r\n`+error);
      return 'rcon连不上喵qwq'
    }
  })
}

const queryServerInfo: QueryServerInfo = async (ip, port, allQuery = false) => {

  let result: A2SResult = {
    infoErr: 1,
    info: null,
    playerErr: 1,
    players: null,
    ruleErr: 1,
    rules: null,
  };

  return a2s.Server({
    ip: ip,
    port: port,
    timeout: 1000
  }).then( async sv => {
    if( !allQuery ) {
      result.info = await sv.getInfo().then(() => {result.infoErr = 0;}).catch( result.infoErr = 1 );
    } else {
      [ result.info, result.players, result.rules ] = await Promise.all([
        sv.getInfo().then( info => {
          result.infoErr = 0;
          return info;
        }).catch(e => { }),
        
        sv.getPlayers().then(players => {
          result.playerErr = 0;
          return players;
        }).catch(e => { }),

        sv.getRules().then(rules => {
          result.ruleErr = 0;
          return rules;
        }).catch(e => { }),
      ]);
    }
    return result;
  }).catch( e => {
    logger.error(e);
    return result;
  });
};


function servInfo2Text( sv: A2SResult ):h {
  let index:number;
  let servInfo: h;
  if( (sv.infoErr + sv.playerErr) == 2 ) {
    return h.text("服务器无响应");
  }

  if (sv.infoErr == 0) {
    servInfo = h('message',
      h('p', `名称:${sv.info.name}`),
      h('p', `游戏:${sv.info.game}`),
    );
    if(sv.ruleErr == 0 && sv.rules.l4d_ready_cfg_name) {
      servInfo.children.push( h('p', `模式:${sv.rules.l4d_ready_cfg_name}`) );
    }
    servInfo.children.push( h('p', `地图:${sv.info.map}`) );
    servInfo.children.push( h('p', `玩家:${sv.info.players.online}/${sv.info.players.max}`) );

  } else {
    servInfo = h('message', h('p', '服务器信息获取失败'));
  }

  if( sv.playerErr == 0 ) {
    for(index = 0; index < sv.info.players.online; index++) {
      servInfo.children.push( h('p', `[${sv.players[index].score}] | ${secondFormat(sv.players[index].timeOnline.raw)} | ${sv.players[index].name}`) );
    }
  } else {
    servInfo.children.push( h('p', "服务器玩家获取失败") );
  }
  return servInfo;
}


async function servInfo2Pic( ctx: Context, config: Config, group: SVGROUP, inputNumber: number ) {

  const { default: pLimit } = await import('p-limit')

  const maxServNum = group.servList.length;

  if( !maxServNum ) {
    return '此分组还没有订阅的服务器呢~';
  }

  if( inputNumber ) {
    const index = Math.round(inputNumber);
    if( index <= maxServNum && index > 0 ) {
      const { ip, port } = await convServerAddr(group.servList[index-1].ip);
      const sv = await queryServerInfo(ip, group.servList[index-1].port, true);
      const output = servInfo2Text(sv);
      if(config.outputIP) {
        output.children.push( h('p', `connect ${group.servList[index-1].ip}:${group.servList[index-1].port}`));
      }
      //session.send( output );
      return output;
    }
  }

  try {
    const date = new Date();
    let theme:string[];
    if ( config.nightMode && (date.getHours() >= config.nightConfig[0].nightStart || date.getHours() <= config.nightConfig[0].nightEnd) ) {
      if ( config.nightConfig[0].nightOLED ) {
        theme = themeMap.get("OLED").split(':');
      } else {
        theme = themeMap.get("Dark").split(':');
      }
    } else {
      theme = themeMap.get(config.themeType).split(':');
    }

    let qPlayers = (config.listStyle === 'normal');
    const limit = pLimit(config.queryLimit);
    const a2s:A2SResult[] = await Promise.all( group.servList.map((server, index) => limit(async ()=>{
      const resolve = await convServerAddr(server.ip, true);
      return await queryServerInfo(resolve.ip, group.servList[index].port, qPlayers);
    })));

    const servIndex: number[] = [];
    group.servList.map( (info, index) => servIndex[index] = info.index);
    const html = renderHtml(config.listStyle, theme, group.groupName, config.maxShowPlayer, a2s);

    if(config.listStyle === 'text') {
      const msg = h("figure");
      msg.children.push(h("message", html));
      //await session.send(msg);
      return msg;
    }

    fs.writeFileSync(path.resolve(__dirname, "./html/index.html"), html);

    let page = await ctx.puppeteer.page();
    await page.setViewport({ width: 1000, height: 5000 });
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
    logger.error(error);
    return '出错了ww';
  }

}


function convSteamID( sid: string ) {
  const reg1 = /^STEAM_[0,1]:[0,1]:\d+$/;
  const reg2 = /^7656119[0-9]{10}$/;
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

async function convServerAddr( url: string, noPort: boolean = false) {
  const ipReg = /^((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})(\.((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})){3}$/;
  let ip = url;
  let port:number = 27015;
  if( !noPort ) {
    const addr = url.split(":");
    ip = addr[0];
    addr[1] && (port = Number(addr[1]));
  }

  if (!ipReg.test(ip)) { // dns
    const resolver = new promises.Resolver();
    const addresses = await resolver.resolve4(ip).catch(() => {logger.error(`[l4d2 Error]:DNS Resolve Failed`)});
    if (addresses && addresses.length) {
      ip = addresses[0];
    }
  }

  return {ip, port};
}
