export function secondFormat(
  second: number,
  props?: { inputMillisecond?: boolean; hour?: boolean }
): string {
  second = Math.round(props?.inputMillisecond ? second / 1000 : second);
  if (second < 60) {
    const sStr = second < 10 ? `0${second}` : second;
    return `${sStr}s`;
  }
  if (props?.hour && second > 3600) {
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
