import { A2SResult } from '../types/a2s';
import { secondFormat } from './timeFormat';

export function renderHtml(theme: string[] = ['#FFFFFF', '#000000', '#F5F6F7', '#E5E7EB'], servCount: number, a2s: A2SResult[]):string {
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
            src: url("osans4.subset.woff2") format("woff2");
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
            padding: 10px;
            background-color: ${theme[2]};
            border: 2px solid ${theme[3]};
            border-radius: 0.5em;
            margin-bottom: 10px;
            font-size: 16px;
        }

        .roll {
            display: grid;
            grid-template-columns: ${cellArrange};
            row-gap: 20px;
            column-gap: 20px;
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
        }

        .servInfo span {
            line-height: 110%;
            font-size: 16px;
            color: rgb(55, 103, 55);
            margin-top: 2px;
            margin-bottom: 2px;
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
        <span><b>已加载服务器</b></span>
        <span>发送 "<b>服务器+序号</b>" 查看详情</span>
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
      for( let j=0; j<4; j++ ) {
        player[j] = (a2s[i].players[j] === undefined)? " ":`${a2s[i].players[j].name} | ${secondFormat(a2s[i].players[j].duration)}`
      }
      
      html = html + `
    <div class="cell">
        <div class="cellinside">
            <div class="servTitle">${i+1}. ${a2s[i].info.name}</div>
            <div class="servInfo">
                <span>${player[0]}<br>${player[1]}<br>${player[2]}<br>${player[3]}</span>
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
}
