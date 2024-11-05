export function secondFormat(
  second: number,
  props?: { inputMillisecond?: boolean; onlyHour?: boolean }
): string {
  second = Math.round(props?.inputMillisecond ? second / 1000 : second);
  if (second < 60) {
    const sStr = second < 10 ? `0${second}` : second;
    return `${sStr}s`;
  }
  if ( props?.onlyHour ) {
    if( second < 3600 ) { return '< 1h' }
    const h = Math.floor(second / 3600);
    return `${h}h`
  }
  if (second >= 3600) {
    const h = Math.floor(second / 3600);
    const m = Math.floor((second % 3600) / 60);
    const s = second % 60;
    const hStr = h < 10 ? `0${h}` : h;
    const mStr = m < 10 ? `0${m}` : m;
    const sStr = s < 10 ? `0${s}` : s;
    return `${hStr}h ${mStr}m ${sStr}s`;
  } else {
    const m = Math.floor(second / 60);
    const s = second % 60;
    const mStr = m < 10 ? `0${m}` : m;
    const sStr = s < 10 ? `0${s}` : s;
    return `${mStr}m ${sStr}s`;
  }
}

export function time2Read (
  second: number,
  props?: {inputMillisecond?: boolean}
): string {
  second = Math.round(props?.inputMillisecond ? second / 1000 : second);
  if(second < 3600) {
    return "< 1小时"
  }
  else {
    const h = (second/3600).toFixed(1);
    return `${h}小时`;
  }
}

export function timeStringToSecond(str: string): number {
  const arr = str.split(":");
  if (/\d{1,2}:\d{1,2}:\d{1,2}(\.\d{2})?/.test(str)) {
    return parseInt(arr[0]) * 3600 + parseInt(arr[1]) * 60 + parseFloat(arr[2]);
  } else if (/\d{1,2}:\d{1,2}(\.\d{2})?/.test(str)) {
    return parseInt(arr[1]) * 60 + parseFloat(arr[2]);
  } else {
    return 0;
  }
}

export function str2Time(str: string): { valid:number, passed?:boolean, date?:Date } {
  var fromatDate = new Date();
  let sp:string[];
  let year:number, month:number, day:number, hour:number, minute:number;
  sp = str.split(/\/|\-| |:/);
  if (/^\d{4}(\/|\-)\d{1,2}\1\d{1,2}\s\d{1,2}:\d{1,2}$/.test(str)) { // 2024?04?05 18:26
    year = parseInt(sp[0]);
    month = parseInt(sp[1]);
    day = parseInt(sp[2]);
    hour = parseInt(sp[3]);
    minute = parseInt(sp[4]);
  } else if (/^\d{1,2}(\/|\-)\d{1,2}\s\d{1,2}:\d{1,2}$/.test(str)) { // 2/15 18:20
    year = fromatDate.getFullYear();
    month = parseInt(sp[0]);
    day = parseInt(sp[1]);
    hour = parseInt(sp[2]);
    minute = parseInt(sp[3]);
  } else { return { valid:1 } }

  if (month > 12 || day > 31 || hour > 23 || minute > 59)
    return { valid:1 }

  fromatDate.setFullYear(year, month-1, day);
  fromatDate.setHours(hour, minute, 0, 0);

  if ( (new Date().getTime()) - fromatDate.getTime() > 0 ) {
    return { valid:0, passed:true, date:fromatDate }
  } else {
    return { valid:0, passed:false, date:fromatDate }
  }
}


export function timeFormat1(date:Date) {  // YYYY/MM/DD HH:MM
  const year = date.getFullYear();
  const month =  date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  return year + '/' + month + '/' + day + ' ' + hour + ':' + minute;
}
