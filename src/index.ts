import dotenv from 'dotenv';
import { Client, IntentsBitField, Partials } from 'discord.js';
import eventHandler from './handlers/eventHandler';
import { initializeDatabase, getPool } from './utils/database';

dotenv.config();

declare module 'discord.js' {
  interface Client {
    mysqlConnection: any;
  }
}

const client: Client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.Reaction,
    Partials.User
  ],
});

(async () => {
  try {
    console.log('ializing database connection...');
    const dbInitialized = await initializeDatabase();
    if (!dbInitialized) {
      console.error('Failed to initialize database. Some features may not work properly. ensure you have a valid .env file and it is configured correctly.');
    } else {
      client.mysqlConnection = getPool();
      console.log('MySQL connection pool attached to client');
    }
    
    eventHandler(client);
    await client.login(process.env.TOKEN!);
  } catch (error) {
    console.error(`Error: ${error}`);
  }
})();

