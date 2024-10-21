import { Context, Schema, h, Session, Logger } from 'koishi'
import {} from '@cordisjs/plugin-proxy-agent'

import {} from 'koishi-plugin-puppeteer';
import { Page } from 'puppeteer-core';

import { promises } from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';

import { SourceQuerySocket } from 'source-server-query';
import mysql from 'mysql2/promise';
import Rcon from 'rcon-srcds';

import { Info, Player, QueryServerInfo } from './types/a2s';
import { secondFormat, time2Read } from './utils/timeFormat';

export const name = 'l4d2-query'
// ToDo
// 指令开启或关闭
// 代码安全性提升
// 制作VTF

export const inject = {
  "required": [
    "puppeteer",
    "logger",
    "http"
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
  steamWebApi?: string,
  useProxy?: boolean,
  proxyAddress?: string,
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
  }),
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
  }),

  Schema.object({
    steamWebApi: Schema.string(),
    useProxy: Schema.boolean().default(false),
  }),
  Schema.union([
    Schema.object({
      useProxy: Schema.const(true).required(),
      proxyAddress: Schema.string().default('http://1.1.1.1:7897').required(),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    useAnne: Schema.boolean().default(false),
  }),
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
]).i18n({ 'zh-CN': require('./locales/zh-CN') });

// themeBG : themeColor : themeInner : themeBorder
const themeMap = new Map([
  ["Normal", "#FFFFFF:#000000:#F5F6F7:#E5E7EB"],
  ["Dark",   "#1F1F1F:#DDDDDD:#0B0B0B:#3E3E3E"],
  ["Neon",   "#FFFFFF:#000000:#F5F6F7:#E5E7EB"],
  ["Wind",   "#FFFFFF:#000000:#F5F6F7:#E5E7EB"],
  ["OLED",   "#000000:#D6D6D6:#000000:#1F1F1F"],
]);






export function apply(ctx: Context, config: Config) {
  // write your plugin here
  ctx.command('connect <ip:string>', '输出服务器信息')
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
  

  ctx.command('服务器', '输出订阅服务器的图片')
  .action(async ({session}, ) => {
    const maxServNum = config.servList.length;
    let page: Page;

    if(!maxServNum)
      return '好像，还没有订阅服务器呢~'

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


  ctx.command('找服', '找求生服')
  .option('servName', '-n <name:string>')
  .option('servIp', '-i <ip:string>')
  .option('servTag', '-t <tag:string>')
  .option('isEmpty', '-e', {fallback: false})  // 是否空服
  .option('ignorePlayer', '-a', {fallback: false})  // 不管是否存在玩家
  .option('region', '-r <region:number>', {fallback: null})  //没做
  .option('maxQuery', '-m <max:number>', {fallback: 5})
  .usage('后面加可选项 -n+服务器名称, *可做通配符; -i+服务器IP; -t+服务器tag; -a 寻找所有服; -e 寻找空服; -r+地区代码; -m+查询数量')
  .example('找服玩 anne -m 10 --> 返回最多10个tag含有“anne”的服务器')
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
      if(config.useProxy) {
        qResponse = await ctx.http.get(qUrl, { proxyAgent: config.proxyAddress });
      } else {
        qResponse = await ctx.http.get(qUrl);
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

  
  ctx.command('Anne查询 <name:text>', '查询玩家Anne服务器信息')
  .usage('填写游戏内昵称')
  .example('Anne查询 koishi')
  .action( async({session}, qName) => {

    const dbConn = await mysql.createConnection({
      host: config.dbIp,
      port: config.dbPort,
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName
    });

    try {
      const [ result, field ] = await dbConn.execute(
        `SELECT lastontime,playtime,points FROM players WHERE name = "${qName}"`
      );

      const date = new Date(result[0].lastontime*1000);
      const anneInfo = h('message',
        h('p', `玩家：${qName}`),
        h('p', `分数：${result[0].points}`),
        h('p', `游玩时间：${time2Read(result[0].playtime*60)}`),
        h('p', `最后上线：${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`)
      );
      session.send(anneInfo);
      
    } catch (error) {
      logger.error(`[l4d2 Error]:\r\n`+error);
      return '找不到qwq, 是不是输错啦?'
    }

  })


  ctx.command('rcon <server:string> <cmd:text>', '使用Rcon控制服务器', { authority: 4 })
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
