import { Context } from 'koishi'
import { Config } from '.'

declare module 'koishi' {
  interface Tables {
    l4d2: _L4D2
    gameReservation: _Reservation
  }
}

export interface _L4D2 {
  id: string
  steamid: string
}

export interface _Reservation {
  index: number
  isExpired: boolean
  eventName: string
  eventDate: Date
  eventMaxPp: number
  eventInitiator: object
  eventParticipant: object
  extraParticipant: object
}


export function apply(ctx: Context, config: Config) {
  ctx.database.extend('l4d2', {
    id: 'string',
    steamid: 'string'
  },{
    autoInc: false,
    primary: 'id'
  })

  ctx.database.extend('gameReservation', {
    index: 'unsigned',
    isExpired: 'boolean',
    eventName: 'string',
    eventDate: 'date',
    eventMaxPp: 'unsigned',
    eventInitiator: 'json',
    eventParticipant: 'json',
    extraParticipant: 'json'
  },{
    autoInc: true,
    primary: 'index'
  })
}