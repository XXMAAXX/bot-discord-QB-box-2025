import dotenv from 'dotenv';

dotenv.config();

// Default embed color: light red so it shows you didnt set it right (#e81d1d)
export const DEFAULT_EMBED_COLOR = 0xe81d1d;


export const EMBED_COLOR = process.env.EMBED_COLOR 
  ? parseInt(process.env.EMBED_COLOR, 16) 
  : DEFAULT_EMBED_COLOR;

