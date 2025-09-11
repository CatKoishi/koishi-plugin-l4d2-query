declare type Player = {
  index: number;
  name: string;
  score: number;
  timeOnline: {
    hours: number;
    minutes: number;
    seconds: number
    raw: number;
  };
};

declare type Info = {
  address: string;
  protocol: number;
  goldSource: boolean;
  name: string;
  map: string;
  folder: string;
  game: "Left 4 Dead 2" | string;
  appID: number;
  players: {
    online: number;
    max: number;
    bots: number;
  };
  type: string;
  OS: string;
  visibility: string;
  VAC: boolean;
  version: string;
  port: number;
  steamID: BigInt;
  keywords: string[];
  gameID: number;
};

declare type Rule = {
  l4d_ready_cfg_name: string;
}

export declare type A2SResult = {
  infoErr: number;
  info: Info | null;
  playerErr: number;
  players: Player[] | null;
  ruleErr: number;
  rules: Rule | null;
};

export declare type QueryServerInfo = (
  ip: string,
  port: number,
  allQuery: boolean = false
) => Promise<A2SResult>;
