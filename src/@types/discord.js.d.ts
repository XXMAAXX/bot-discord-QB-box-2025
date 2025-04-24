import { Collection, Client as BaseClient, SlashCommandBuilder, CommandInteraction } from "discord.js";
import mysql from 'mysql2/promise';

export interface CommandModule {
  data: SlashCommandBuilder;
  execute: (client: BaseClient, interaction: CommandInteraction) => Promise<void>;
}

declare module "discord.js" {
  interface Client {
    commands: Collection<string, CommandModule>;
    mysqlConnection: mysql.Pool;
  }
}
