declare type Player = {
  index: number;
  name: string;
  score: number;
  duration: number;
};

declare type Info = {
  header: String;
  protocol: number;
  name: string;
  map: string;
  folder: string;
  game: "Left 4 Dead 2" | string;
  id: number;
  players: number;
  max_players: number;
  bots: number;
  server_type: string;
  environment: "l" | "w";
  visibility: number;
  vac: number;
  version: string;
  port: number;
  steamid: BigInt;
  keywords: string;
  gameid: BigInt;
};

export declare type A2SResult = {
  success: boolean;
  msg: {
    info: string;
    players: string;
  };
  info?: Info;
  players?: Player[];
};

declare module "source-server-query" {
  export class SourceQuerySocket {
    constructor();

    async info(
      address: string,
      port: string | number,
      timeout: number = 1000
    ): Promise<Info>;

    async players(
      address: string,
      port: string | number,
      timeout: number = 1000
    ): Promise<Player[]>;
  }
}

export declare type QueryServerInfo = (
  ip: string,
  port: string | number
) => Promise<
  | { code: 0; info: Info; players: Player[]; errMsg: null }
  | { code: 1; info: null; players: null; errMsg: Error }
>;
