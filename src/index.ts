import { Context, Schema, h, Session, Logger } from 'koishi'

import {} from 'koishi-plugin-puppeteer';
import { Page } from 'puppeteer-core';
import {} from '@cordisjs/plugin-proxy-agent'

import { promises } from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

import { SourceQuerySocket } from 'source-server-query';
import mysql from 'mysql2/promise';
import Rcon from 'rcon-srcds';

import { Info, Player, QueryServerInfo } from './types/a2s';
import { secondFormat, time2Read } from './utils/timeFormat';
import { _L4D2, _Reservation } from './database';

export const name = 'l4d2-query'

// ToDo
// 玩家游戏数据查询, 评分
// 群车预约, 报名接力
// 代码稳定性提升(缺少测试)
// 制作VTF(长期)

// 主键 是否过期 事件名称 事件时间 事件发起人 最大参与者人数 事件参加者 替补参加者
// 经验评分 = 对抗胜率*(0.55*真实游戏时长+TANK石头命中数*每小时中石头数+T1武器击杀数*0.005*(1+单发霰弹枪击杀在T1武器击杀占比))

export const usage = `
## 从0.6.2之前旧版本升级需要移除配置后再添加新配置, 否则会有bug

## 求生之路群管理插件

灵感是来源于Agnes4m开发的基于nonebot的求生之路插件, 因为我是恋厨, 所以在部署了Koishi之后, 就想着把这个插件在Koishi上实现出来

## 功能

主要功能是connect查询服务器信息和方便查看群服状态\
在此之外还添加了Anne查询, 服务器搜索的功能（可以关闭）

配置都有做汉化, 跟着走就行, 基本上就是开箱即用的样子

#### 代理
找服功能会使用steam api, 使用🪜连接会更加稳定\
以clash为例, 启动clash后, 需要允许局域网连接, 然后把对应端口的防火墙打开（如果是127.0.0.1则不需要）

#### 数据库
Anne官方数据库是不开放的, 我自己也不知道的啦\
如果你不知道怎么搭建Anne数据库, 就请将useAnne选项关闭\
如果你知道怎么搭建Anne数据库, 那应该也不需要我来解释吧（

## 联系方式
QQ：1194703727\
E-mail：nyakoishi@qq.com
`

export const inject = {
  "required": [
    "database",
    "puppeteer",
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
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    themeType: Schema.union(['Normal', 'Dark', 'Neon', 'Wind']).default('Normal').experimental(),
    nightMode: Schema.boolean().default(false).experimental(),
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
      ip: Schema.string().pattern(/^((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})(\.((2(5[0-5]|[0-4]\d))|[0-1]?\d{1,2})){3}$/).default('8.8.8.8'),
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
  ]),
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
  ctx.model.extend('l4d2', {
    id: 'string',
    steamid: 'string'
  })

  ctx.command('test')
  .action(async ({session}, _) => {
    console.log(session.userId);
  })

  ctx.command('l4d2', '查看求生之路指令详情')

  ctx.command('l4d2/connect <ip:string>', '输出服务器信息')
  .usage('填写IP/域名:端口 无端口号时默认使用27015')
  .example('connect 123.123.123.123:27015')
  .action(async ( {session}, address ) => {
    const addr = address.split(":");
    let ip = addr[0];
    let port:number | string = 27015;
    addr[1] && (port = addr[1]);

    if (!checkIpValid(ip)) {  // dns
      const resolver = new promises.Resolver();
      const addresses = await resolver.resolve4(ip);
      if (addresses.length) {
        ip = addresses[0];
      }
    }
    
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

      for(index=0; index<maxServNum; index++) {
        const { code, info, players } = await queryServerInfo(config.servList[index].ip, config.servList[index].port);
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
  

  if(config.useAnne) {
    ctx.command('l4d2/Anne查询 [name:text]', '查询玩家Anne药役数据')
    .usage('填写游戏内昵称, 或使用Anne绑定后直接查询')
    .example('Anne查询 koishi')
    .action(async ({session}, qName) => {
      const dbConn = await mysql.createConnection({
        host: config.dbIp,
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
          const userid = session.userId;
          const query = await ctx.database.get('l4d2', {id: userid});
          if( query[0] == null ) {
            return '未绑定SteamID, 请输入查询昵称或绑定SteamID'
          }
          steamid = query[0].steamid;
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

    ctx.command('l4d2/Anne绑定 <steamid:string>', '绑定Anne查询使用的SteamID')
    .usage('指令后填写您的SteamID')
    .example('Anne绑定 STEAM_0:1:123456')
    .action(async ({session}, bindid) => {
      const regServ = /^STEAM_\d:\d:\d+$/;
      if(!regServ.test(bindid))
        return '请检查STEAMID是否正确'

      const userid = session.userId;
      const query = await ctx.database.get('l4d2', {id: userid});
      if( query[0] != null ) { // set
        logger.info(`[l4d2 Info]: User Found, update steamid`);
        await ctx.database.set('l4d2', {id: userid}, {steamid: bindid});
        return '已更新您绑定的SteamID'
      } else { // create
        logger.info(`[l4d2 Info]: User Not Found, create data`);
        await ctx.database.create('l4d2', {id: userid, steamid: bindid});
        return '已绑定您的SteamID'
      }
    })

  }


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

function checkIpValid(ip:string)
{
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
