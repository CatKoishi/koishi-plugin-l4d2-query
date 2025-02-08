import { A2SResult } from '../types/a2s';
import { secondFormat } from './timeFormat';

//   normal : lite : text                                     themeBG : fontColor : themeInner : themeBorder
export function renderHtml(style: string, theme: string[] = ['#FFFFFF', '#000000', '#F5F6F7', '#E5E7EB'], groupName: string, maxPlayer: number, a2s: A2SResult[]):string {
  const servCount = a2s.length;
  if(style === 'normal') {
    let cellArrange;
    if ( servCount === 1 ) { cellArrange = 'auto' }
    else if ( servCount === 2 ) { cellArrange = 'auto auto' }
    else { cellArrange = 'auto auto auto' }

    const defaultHead = `
<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=max-content, initial-scale=1.0">
    <title>求生之路服务器列表</title>
    <style>
        @font-face {
            font-family: 'osans4';
            src: url("osans4.gb2312.woff2") format("woff2");
        }

        body {
            font-family: osans4, Arial, sans-serif;
            margin: 0px;
            zoom: 100%;
            background-color: ${theme[0]};
            color : ${theme[1]};
            width: max-content;
        }

        .main {
            display: flex;
            flex-direction: column;
            padding: 10px;
        }

        .banner {
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            padding-left: 10px;
            padding-right: 10px;
            padding-top: 5px;
            padding-bottom: 5px;
            background-color: ${theme[2]};
            border: 2px solid ${theme[3]};
            border-radius: 0.5em;
            margin-bottom: 10px;
            font-size: 16px;
        }

        .roll {
            display: grid;
            grid-template-columns: ${cellArrange};
            row-gap: 10px;
            column-gap: 10px;
            margin-bottom: 10px;
        }

        .cell {
            display: flex;
            padding: 5px;
            border-radius: 5px;
            border: 2px solid ${theme[3]};
            background-color: ${theme[2]};
            max-width: 260px;
        }

        .cellinside {
            display: flex;
            flex-direction: column;
            padding: 5px;
            width: 250px;
            justify-content: space-between;
        }

        .servTitle {
            display: flex;
            flex-direction: row;
            font-size: 20px;
            line-height: 110%;
        }

        .servInfo {
            display: flex;
            flex-direction: row;
            margin-top: 4px;
            margin-bottom: 4px;
        }

        .servInfo span {
            line-height: 110%;
            font-size: 16px;
            color: rgb(55, 103, 55);
            white-space: pre-wrap;
        }

        .servStatus {
            margin-bottom: -5px;
            display: flex;
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
        }

        .servStatus span {
            line-height: 100%;
            font-size: 14px;
            height: 16px;
            text-overflow: ellipsis;
            white-space: nowrap;
            overflow: hidden;
        }

    </style>
</head>

<body id="body">
<div class="main">

    <div class="banner">
        <span><b>组名：${groupName}</b></span>
        <span>发送 "<b>组名+序号</b>" 查看详情</span>
    </div>

    <div class="roll">
  `

    const defaultTail = `
    </div>

    <div class="banner">
        <span><b>© NyaKoishi</b></span>
        <span>https://github.com/CatKoishi</span>
    </div>

</div>
</body>

</html>
  `
    let html = defaultHead;
    let player: string[] = [];
    for( let i=0; i<servCount; i++ ) {
      if( a2s[i].code === 0 ) {

        let loop = 0;
        const minPlayer = maxPlayer < 4? maxPlayer:4
        if( a2s[i].players.length < minPlayer ) {
          loop = minPlayer;
        } else if ( a2s[i].players.length > maxPlayer ) {
          loop = maxPlayer;
        } else {
          loop = a2s[i].players.length;
        }

        for( let j=0; j<loop; j++ ) {
          player[j] = (a2s[i].players[j] === undefined)? " ":`${a2s[i].players[j].name} | ${secondFormat(a2s[i].players[j].duration)}`
        }

        let playerStr = '';
        player.map( info => {
          playerStr += '<br>' + info;
        })
        playerStr = playerStr.substring(4);

        html = html + `
    <div class="cell">
        <div class="cellinside">
            <div class="servTitle">${i+1}. ${a2s[i].info.name}</div>
            <div class="servInfo">
                <span>${playerStr}</span>
            </div>
            <div class="servStatus">
                <span style="color: #a9a9a9;">${a2s[i].info.players}/${a2s[i].info.max_players}</span>
                <span style="color: rgb(25, 68, 161)">${a2s[i].info.map}</span>
                <img src="${a2s[i].info.environment}.svg" style="width: 16px;">
            </div>
        </div>
    </div>
        `
    } else {
        html = html + `
    <div class="cell">
        <div class="cellinside">
            <div class="servTitle">${i+1}. 无响应</div>
            <div class="servInfo">
                <span> <br> <br> <br> </span>
            </div>
            <div class="servStatus">
                <span style="color: #a9a9a9;">0/0</span>
                <span style="color: rgb(25, 68, 161)"> </span>
                <img src="u.svg" style="width: 16px;">
            </div>
        </div>
    </div>
        `
      }

    }
    html = html + defaultTail;

    return html;
  } else if (style === 'lite') {
    const head = `
<!DOCTYPE html>
<html lang="zh-CN">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=max-content, initial-scale=1.0">
    <title>求生之路服务器列表</title>
    <style>
        @font-face {
            font-family: 'osans4';
            src: url("osans4.gb2312.woff2") format("woff2");
        }

        body {
            font-family: osans4, Arial, sans-serif;
            margin: 0px;
            zoom: 100%;
            color: ${theme[1]};
            width: max-content;
        }

        .main {
            display: flex;
            flex-direction: column;
        }

        .banner {
            display: flex;
            flex-direction: row;
            padding: 5px;
            border-top: 1px solid #aaaaaa;
            background-color: ${theme[3]};
            justify-content: space-between;
        }

        .cell {
            display: flex;
            flex-direction: row;
            padding: 5px;
            border-top: 1px solid #aaaaaa;
            background-color: ${theme[2]};
            white-space: nowrap;
        }

        .index {
            width: 40px;
        }

        .name {
            width: 400px;
            text-overflow: ellipsis;
            overflow: hidden;
        }

        .map {
            width: 200px;
            text-overflow: ellipsis;
            overflow: hidden;
        }

        .player {
            width: 50px;
            text-align: end;
        }


    </style>
</head>

<body id="body">
<div class="main">
    <div class="banner">
        <span><b>已加载服务器</b></span>
        <span>发送 "<b>服务器+序号</b>" 查看详情</span>
    </div>

    <div class="cell">
        <span class="index"><b>序号</b></span>
        <span class="name"><b>服务器名称</b></span>
        <span class="map"><b>地图</b></span>
        <span class="player"><b>人数</b></span>
    </div>
`
    const tail = `
    <div class="banner">
        <span><b>© NyaKoishi</b></span>
        <span>https://github.com/CatKoishi</span>
    </div>
</div>
</body>

</html>
    `
    let html = head;
    for( let i=0; i<servCount; i++ ) {
      if( a2s[i].code === 0 ) {
        html = html + `
    <div class="cell">
        <span class="index">${i+1}.</span>
        <span class="name">${a2s[i].info.name}</span>
        <span class="map">${a2s[i].info.map}</span>
        <span class="player">${a2s[i].info.players}/${a2s[i].info.max_players}</span>
    </div>
        `
      } else {
        html = html + `
    <div class="cell">
        <span class="index">${i+1}.</span>
        <span class="name">服务器无响应</span>
        <span class="map">???</span>
        <span class="player">0/0</span>
    </div>
        `
      }

    }
    html = html + tail;

    return html;

  } else if (style === 'text') {
    let html = '';

    for( let i=0; i<servCount; i++ ) {
      if( a2s[i].code === 0 ) {
        html = html + `${i+1}服: ${a2s[i].info.name}\r\n地图: ${a2s[i].info.map}\r\n人数: ${a2s[i].info.players}/${a2s[i].info.max_players}\r\n\r\n`;
      } else {
        html = html + `${i+1}服: 无响应\r\n\r\n`
      }
    }

    return html;
  }
}
