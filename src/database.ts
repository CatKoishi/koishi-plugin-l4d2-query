import { Context } from 'koishi'
// import { platformUser } from './types/platform'

export declare type platformGroup = {
  platform: string;
  selfID: string;
  channelID: string;
}

export declare type platformUser = {
  uid: number;
  nickname: string;
}

export declare type platformUserList = {
  user:platformUser[]
}

declare module 'koishi' {
  interface Tables {
    gameReservation: _Reservation
  }
  interface User {
    steamid: string
  }
}

export interface _Reservation {
  index: number
  isExpired: boolean
  isNoticed: number
  eventName: string
  eventGroup: platformGroup
  eventDate: Date
  eventMaxPp: number
  eventInitiator: platformUser
  eventParticipant: platformUserList
  extraParticipant: platformUserList
}

export const initDatabase = (ctx: Context) => {
  ctx.model.extend('user', {
    steamid: { type: 'string' }
  })

  ctx.model.extend('gameReservation', {
    index: 'unsigned',
    isExpired: 'boolean',
    isNoticed: 'integer',
    eventName: 'string',
    eventGroup: 'json',
    eventDate: 'timestamp',
    eventMaxPp: 'unsigned',
    eventInitiator: 'json',
    eventParticipant: 'json',
    extraParticipant: 'json'
  },{
    autoInc: true,
    primary: 'index'
  })
}