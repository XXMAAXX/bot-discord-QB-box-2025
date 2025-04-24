import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client } from "discord.js";
import dotenv from 'dotenv';
import { EMBED_COLOR } from '../../utils/constants';

dotenv.config();

const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Retrieves a user's character information from the database.")
  .addUserOption(option => 
    option.setName("user")
      .setDescription("The user to look up")
      .setRequired(true)
  );
  
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  // Check if the user has the staff role from .env file
  if (!interaction.member || !("cache" in interaction.member.roles) || !interaction.member.roles.cache.has(STAFF_ROLE_ID || "")) {
    return await interaction.reply({
      content: "You don't have permission to use this command. Only staff members can use it.",
      ephemeral: true
    });
  }

  await interaction.deferReply();
  
  try {
    const targetUser = interaction.options.getUser("user");
    
    if (!targetUser) {
      return interaction.editReply("User not found.");
    }
    
    // Check if we have a MySQL connection
    const mysqlConnection = client.mysqlConnection;
    if (!mysqlConnection) {
      return interaction.editReply("Database connection is not available.");
    }
     
    const discordIdWithPrefix = `discord:${targetUser.id}`;
    
    // First try with discord: prefix
    const [rows] = await mysqlConnection.execute(
      'SELECT * FROM users WHERE discord = ?',
      [discordIdWithPrefix]
    );
    
    let userData;
    if (!rows || (rows as any[]).length === 0) {
      const [rowsNoPrefix] = await mysqlConnection.execute(
        'SELECT * FROM users WHERE discord = ?',
        [targetUser.id]
      );
      
      if (!rowsNoPrefix || (rowsNoPrefix as any[]).length === 0) {
        return interaction.editReply(`No database records found for user ${targetUser.username}. (ID: ${targetUser.id})`);
      }
      
      userData = (rowsNoPrefix as any[])[0];
    } else {
      userData = (rows as any[])[0];
    }
    
    // Get character information from the database if this dont work ill crash the fuck out
    let charactersInfo = '';
    try {
      const [characters] = await mysqlConnection.execute(
        'SELECT id, citizenid, name, charinfo FROM players WHERE license = ?',
        [userData.license2]
      );
      
      if (characters && (characters as any[]).length > 0) {
        charactersInfo = `\`\`\`diff\n`;
        (characters as any[]).forEach((character) => {
          try {
            const charInfo = JSON.parse(character.charinfo);
            charactersInfo += `ID: ${character.citizenid} | ${charInfo.firstname} ${charInfo.lastname}\n`;
          } catch (e) {
            charactersInfo += `ID: ${character.citizenid} | ${character.name}\n`;
          }
        });
        charactersInfo += `\`\`\``;
      } else {
        charactersInfo = '```No characters found```';
      }
    } catch (error) {
      console.error(`Error fetching characters: ${error.message}`);
      charactersInfo = '```Error retrieving character data```';
    }
    
    const formatField = (value: any): string => {
      return (!value || value === "Not set") ? "Not set" : value;
    };
    
    const accountDetails = `\`\`\`diff
+ Account ID: ${formatField(userData.userId)}
+ Username: ${formatField(userData.username)}
\`\`\``;

    const identifiers = `\`\`\`css
${formatField(userData.discord)}
${formatField(userData.license2)}
${formatField(userData.fivem)}
\`\`\``;
    
    const embed = new EmbedBuilder()
      .setTitle(`Character Information for: ${targetUser.username}`)
      .setColor(EMBED_COLOR)
      .setThumbnail(targetUser.displayAvatarURL())
      .setDescription(`
**📋 Account Details**
${accountDetails}

**🔑 Identifiers**
${identifiers}

**👤 Characters**
${charactersInfo}
      `)
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error(`Error in /charinfo command: ${error.message}`);
    return interaction.editReply(`An error occurred while retrieving character information: ${error.message}`);
  }
}