# BanditBot Qbox Discord Bot

A specialized Discord bot built for FiveM QBox servers, providing comprehensive ticket management, player information tracking, and moderation tools integration with txAdmin.

## Features

### Ticket System
- Multiple ticket categories:
  - General Support
  - Ban Appeals (with automatic ban history display)
  - Gang Reports
  - Tebex Support
  - Staff Reports
- Smart ticket management:
  - One ticket per user limit
  - Automatic ticket transcripts
  - User addition capability
  - Comprehensive ticket information tracking
- Customizable category settings through environment variables

### Player Management
- Detailed player information lookup:
  - Character data integration with QBox database
  - Multiple character support
  - Financial status tracking
  - Job and gang affiliations
- Complete moderation history:
  - Ban records with expiration tracking
  - Warning system integration
  - Kick history
  - Revocation status tracking

### Staff Tools
- Comprehensive moderation tools
- Database integration with both MySQL (QBox) and txAdmin
- Ticket transcript archiving
- Staff-only commands and features

## Prerequisites

- Node.js v16.9.0 or higher
- Discord.js v14
- TypeScript
- MySQL database (for QBox integration)
- txAdmin setup with accessible playersDB.json
- Discord Bot Token with proper intents

## Environment Variables

Create a `.env` file with the following variables:
```env
TOKEN=changeme

# This is the ID of the role that can use the bots commands that could be harmful or contain sensitive information to users.
STAFF_ROLE_ID=changeme

# This is the ID of the role that will get pinged when a new ticket is created. If not set, it will default to the STAFF_ROLE_ID
TICKET_PING_ROLE_ID=changeme

# Ticket category IDs - these are the parent categories where tickets will be created
GENERAL_TICKET_CATEGORY=changeme
BAN_APPEAL_TICKET_CATEGORY=changeme  ## THIS WILL AUTO SHOW TX BANS IN THE EMBED IF YOU USE TX IF THEIR IS NO DATA IT WONT SHOW ANYTHING
GANG_REPORT_TICKET_CATEGORY=changeme
TEBEX_SUPPORT_TICKET_CATEGORY=changeme
STAFF_REPORT_TICKET_CATEGORY=changeme

# Channel ID where ticket transcripts will be saved
TRANSCRIPT_CHANNEL_ID=changeme

# this is used for the mysql connection for the database create a read only user for the database in heidisql 
MYSQL_HOST=changeme
MYSQL_PORT=changeme
MYSQL_USER=changeme
MYSQL_PASSWORD=changeme
MYSQL_DATABASE=changeme

# Path to the txAdmin players database JSON file - update this to match your server setup || im unsure how you would do this if you are hosting the bot 
# on a seperate vps like linux or something like that but if you are hosting it locally on the same vps then this is the path to the txAdmin players database JSON file 
#commits are welcome to add support for other setups
TXADMIN_PLAYERS_DB_PATH=changeme
## EXAMPLE TXADMIN_PLAYERS_DB_PATH=c:/Users/61432/Desktop/txData/default/data/playersDB.json

# Custom color for embeds (hex format) - this is the colour of all embeds through out the bot - you can change this to any hex code you want using websites like https://htmlcolorcodes.com/
# DO NOT INCLUDE THE # OR IT WILL NOT WORK
# VERY IMPORTANT MAKE SURE YOU INCLUDE THE 0x IN FRONT OF THE HEX CODE AND NOT A HAS TAG OR NO 0x OR IT WILL NOT WORK so 0xhexcode
EMBED_COLOR=0x1d64e8 # blue defualt
```

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Set up your environment variables
4. Build and run:
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Usage

### Setting Up Tickets
Use the `/setup-tickets` command in the desired channel to create the ticket interface. Requires administrator permissions.

## Adding Custom Ticket Categories

To add new ticket categories, follow these steps:

1. Add the category ID to your `.env` file:
```env
NEW_CATEGORY_ID=your_discord_category_id
```

2. Add the category to the `TICKET_CATEGORIES` object in `src/tickets/ticketHandler.ts`:
```typescript
const TICKET_CATEGORIES = {
    // ...existing categories...
    your_category: process.env.NEW_CATEGORY_ID || "default_id",
};
```

3. Add a case to the `getTicketTypeName` function:
```typescript
function getTicketTypeName(type: string): string {
    switch (type) {
        // ...existing cases...
        case 'your_category':
            return 'Your Category Name';
        default:
            return 'Support';
    }
}
```

4. The ticket system will automatically:
- Create channels under your category
- Generate transcripts
- Handle permissions
- Manage ticket lifecycle
- Support all standard ticket features:
  - Close button
  - User info button
  - Add user button
  - Ticket transcripts

Note: All tickets will inherit the core functionality including:
- One ticket per user limit
- Staff-only controls
- Transcript generation
- Permission management

### Staff Commands
- `/userinfo` - Display comprehensive user information
- `/characterinfo` - View character details
- `/playerinventory` - Check player inventory
- `/vehicles` - Access vehicle information

### Utility Commands
- `/help` - Display command information
- `/purge` - Bulk message deletion

## Support

For support, issues, or contributions:
- Create an issue in the repository
- Join our Discord: https://discord.gg/WkCuKBjTZt

## License

This project is licensed under the MIT License.

