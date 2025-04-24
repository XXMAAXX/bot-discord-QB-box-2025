import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import dotenv from 'dotenv';
import { EMBED_COLOR } from '../../utils/constants';
import { splitTextToChunks, DISCORD_LIMITS, createPaginationButtons } from '../../utils/embedUtils';

dotenv.config();

// Get the staff role ID from environment variables
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

export const data = new SlashCommandBuilder()
  .setName("characterinfo")
  .setDescription("Retrieves character information from the database.")
  .addUserOption(option => 
    option.setName("user")
      .setDescription("Discord user to look up")
      .setRequired(false)
  );
  
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  // Check if the user has the staff role from the .env file if its not set it wont work as this is classessified as sensitive information
  if (!interaction.member || !("cache" in interaction.member.roles) || !interaction.member.roles.cache.has(STAFF_ROLE_ID || "")) {
    return await interaction.reply({
      content: "You don't have permission to use this command. Only staff members can use it.",
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: false });
  
  try {
    const mysqlConnection = client.mysqlConnection;
    if (!mysqlConnection) {
      return interaction.editReply("Database connection is not available.");
    }

    const targetUser = interaction.options.getUser("user") || interaction.user;
    
    let license: string | null = null;
    
    const discordIdWithPrefix = `discord:${targetUser.id}`;
    const [userRows] = await mysqlConnection.execute(
      'SELECT * FROM users WHERE discord = ?',
      [discordIdWithPrefix]
    );
    
    if (userRows && (userRows as any[]).length > 0) {
      license = (userRows as any[])[0].license2;
    } else {
      const [userRowsNoPrefix] = await mysqlConnection.execute(
        'SELECT * FROM users WHERE discord = ?',
        [targetUser.id]
      );
      
      if (userRowsNoPrefix && (userRowsNoPrefix as any[]).length > 0) {
        license = (userRowsNoPrefix as any[])[0].license2;
      }
    }
    
    if (!license) {
      return interaction.editReply(`No user found in database for ${targetUser.username}`);
    }
    
    const [characters] = await mysqlConnection.execute(
      'SELECT * FROM players WHERE license = ?',
      [license]
    );
    
    if (!characters || (characters as any[]).length === 0) {
      return interaction.editReply(`No characters found for ${targetUser.username}`);
    }
    
    const characterList = (characters as any[]).map((char, index) => {
      let charName = char.name;
      try {
        if (char.charinfo) {
          const charInfo = JSON.parse(char.charinfo);
          charName = `${charInfo.firstname} ${charInfo.lastname}`;
        }
      } catch (e) {}
      
      return `${index + 1}. ${charName} - \`${char.citizenid}\``;
    }).join('\n');
    
    const selectionEmbed = new EmbedBuilder()
      .setTitle(`Characters for ${targetUser.username}`)
      .setDescription(characterList)
      .addFields({ name: "Selection", value: "Choose a character that you want to view the information about" })
      .setColor(EMBED_COLOR)
      .setThumbnail(targetUser.displayAvatarURL())
      .setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      });
    
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let currentRow = new ActionRowBuilder<ButtonBuilder>();
    let buttonsInCurrentRow = 0;
    const maxButtonsPerRow = 5;
    
    (characters as any[]).forEach((char, index) => {
      if (buttonsInCurrentRow >= maxButtonsPerRow) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        buttonsInCurrentRow = 0;
      }
      
      let charName = char.name;
      try {
        if (char.charinfo) {
          const charInfo = JSON.parse(char.charinfo);
          charName = `${charInfo.firstname} ${charInfo.lastname}`;
        }
      } catch (e) {}
      
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`character-${char.citizenid}`)
          .setLabel(`${index + 1}. ${charName}`)
          .setStyle(ButtonStyle.Primary)
      );
      
      buttonsInCurrentRow++;
    });
    
    if (buttonsInCurrentRow > 0) {
      rows.push(currentRow);
    }
    
    const response = await interaction.editReply({
      embeds: [selectionEmbed],
      components: rows
    });
    
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000
    });
    
    collector.on('collect', async i => {
      if (i.user.id === interaction.user.id) {
        const selectedCharId = i.customId.replace('character-', '');
        await fetchAndDisplayCharacter(client, interaction, selectedCharId, i);
        collector.stop();
      } else {
        i.reply({ content: "You cannot use this menu.", ephemeral: true });
      }
    });
    
    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({
          content: "Character selection timed out.",
          embeds: [],
          components: []
        });
      }
    });
    
  } catch (error) {
    console.error(`Error in /characterinfo command: ${error.message}`);
    return interaction.editReply(`An error occurred: ${error.message}`);
  }
}

/**
 * Fetches and displays character information
 */
async function fetchAndDisplayCharacter(
  client: Client, 
  interaction: ChatInputCommandInteraction, 
  citizenId: string,
  componentInteraction?: any
) {
  try {
    const mysqlConnection = client.mysqlConnection;
    
    // Get character data
    const [characters] = await mysqlConnection.execute(
      'SELECT * FROM players WHERE citizenid = ?',
      [citizenId]
    );
    
    if (!characters || (characters as any[]).length === 0) {
      const reply = { content: `Character with ID \`${citizenId}\` not found.`, ephemeral: true };
      if (componentInteraction) {
        return componentInteraction.update(reply);
      } else {
        return interaction.editReply(reply);
      }
    }
    
    const character = (characters as any[])[0];
    
    // Parse character info
    let charInfo;
    try {
      charInfo = JSON.parse(character.charinfo);
    } catch (e) {
      charInfo = {
        firstname: "Unknown",
        lastname: "Unknown",
        birthdate: "Unknown",
        gender: "Unknown",
        nationality: "Unknown",
        phone: "Not set"
      };
    }
    
    // Parse money info
    let money;
    try {
      money = JSON.parse(character.money);
    } catch (e) {
      money = {
        cash: 0,
        bank: 0,
        crypto: 0
      };
    }
    
    // Parse job info
    let job;
    try {
      job = JSON.parse(character.job);
    } catch (e) {
      job = {
        name: "unemployed",
        label: "Civilian",
        grade: {
          name: "Freelancer",
          level: 0
        }
      };
    }
    
    // Parse gang info
    let gang = "None";
    try {
      const gangData = JSON.parse(character.gang);
      if (gangData && gangData.name && gangData.name !== "none") {
        gang = `${gangData.label} (${gangData.name})`;
      }
    } catch (e) {
      // Keep as "None"
    }
    
    // Parse position
    let position = { x: 0, y: 0, z: 0 };
    try {
      position = JSON.parse(character.position);
    } catch (e) {
      // Keep default
    }
    
    // Create character details section in code block format
    const characterDetailsBlock = `\`\`\`
Character: ${charInfo.firstname} ${charInfo.lastname}
👤 Character Details

+ Character ID: ${character.citizenid}
+ CID: ${character.cid || 1}
+ First Name: ${charInfo.firstname}
+ Last Name: ${charInfo.lastname}
+ Birthdate: ${charInfo.birthdate || "2003-01-31"}
+ Gender: ${charInfo.gender === 0 ? "Male" : "Female"}
+ Nationality: ${charInfo.nationality || "American"}
+ Phone Number: ${character.phone_number || charInfo.phone || "3454278320"}
\`\`\``;

    // Create financial information section in code block format
    const financialInfoBlock = `\`\`\`
💰 Financial Information

+ Bank: $${money.bank.toLocaleString()}
+ Cash: $${money.cash.toLocaleString()}
+ Crypto: ${money.crypto || 0}
\`\`\``;
    
    // Create job information section in code block format
    const jobInfoBlock = `\`\`\`
🧑‍💼 Job

+ ${job.label} (${job.name}) - ${job.grade.name}
\`\`\``;
    
    // Create gang information section in code block format
    const gangInfoBlock = `\`\`\`
👥 Gang

+ ${gang}
\`\`\``;
    
    // Create position information in code block format
    const positionInfoBlock = `\`\`\`
📍 Last Position

+ X: ${position.x.toFixed(2)}
+ Y: ${position.y.toFixed(2)}
+ Z: ${position.z.toFixed(2)}

+ Last Updated: ${new Date(character.last_updated).toLocaleString()}
\`\`\``;
    
    // Check if any sections are too large for discord embed limits
    const fieldData = [
      { name: "Character Details", value: characterDetailsBlock },
      { name: "Financial Information", value: financialInfoBlock },
      { name: "Job & Gang", value: `${jobInfoBlock}\n${gangInfoBlock}` },
      { name: "Last Position", value: positionInfoBlock }
    ];
    
    // Create and send embed - handling potential size limits
    const embed = new EmbedBuilder()
      .setTitle(`Character: ${charInfo.firstname} ${charInfo.lastname}`)
      .setColor(EMBED_COLOR)
      .setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .setTimestamp();
    
    // Check total size of all fields combined
    let totalSize = embed.data.title?.length || 0;
    totalSize += embed.data.footer?.text?.length || 0;
    
    const embeds: EmbedBuilder[] = [embed];
    let currentEmbed = embed;
    
    // Add fields, creating new embeds if needed
    for (const field of fieldData) {
      // Check if adding this field would exceed the Discord limit
      if (field.value.length > DISCORD_LIMITS.FIELD_VALUE) {
        // Field value is too large, need to split it
        const chunks = splitTextToChunks(field.value);
        
        for (let i = 0; i < chunks.length; i++) {
          const fieldName = chunks.length > 1 ? 
            `${field.name} (${i + 1}/${chunks.length})` : 
            field.name;
          
          // Check if adding this chunk would exceed the total embed size
          const chunkSize = fieldName.length + chunks[i].length;
          
          if (totalSize + chunkSize > DISCORD_LIMITS.TOTAL || 
              currentEmbed.data.fields && currentEmbed.data.fields.length >= DISCORD_LIMITS.MAX_FIELDS) {
            // Create a new embed for the overflow
            const newEmbed = new EmbedBuilder()
              .setColor(EMBED_COLOR)
              .setFooter({ 
                text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                iconURL: interaction.user.displayAvatarURL() 
              })
              .setTimestamp();
            
            embeds.push(newEmbed);
            currentEmbed = newEmbed;
            totalSize = newEmbed.data.footer?.text?.length || 0;
          }
          
          // Add the field to the current embed
          currentEmbed.addFields({ name: fieldName, value: chunks[i], inline: false });
          totalSize += chunkSize;
        }
      } else {
        // Field fits within limit, check if it would overflow the current embed
        const fieldSize = field.name.length + field.value.length;
        
        if (totalSize + fieldSize > DISCORD_LIMITS.TOTAL ||
            currentEmbed.data.fields && currentEmbed.data.fields.length >= DISCORD_LIMITS.MAX_FIELDS) {
          // Create a new embed for the overflow
          const newEmbed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setFooter({ 
              text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();
          
          embeds.push(newEmbed);
          currentEmbed = newEmbed;
          totalSize = newEmbed.data.footer?.text?.length || 0;
        }
        
        // Add the field to the current embed
        currentEmbed.addFields({ name: field.name, value: field.value, inline: false });
        totalSize += fieldSize;
      }
    }
    
    // If we have multiple embeds, set up pagination
    if (embeds.length > 1) {
      // Set up pagination
      let currentPage = 0;
      
      // Add page numbers to embeds
      embeds.forEach((embed, index) => {
        const existingFooter = embed.data.footer?.text || '';
        embed.setFooter({
          text: `${existingFooter} • Page ${index + 1}/${embeds.length}`,
          iconURL: embed.data.footer?.icon_url
        });
      });
      
      const paginationRow = createPaginationButtons(currentPage, embeds.length);
      
      // Send the initial embed with pagination buttons
      const reply = { 
        embeds: [embeds[currentPage]], 
        components: [paginationRow], 
        ephemeral: false 
      };
      
      let message;
      if (componentInteraction) {
        message = await componentInteraction.update({ ...reply, fetchReply: true });
      } else {
        message = await interaction.editReply(reply);
      }
      
      // Create a collector for pagination buttons
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 180000 // 3 minutes timeout
      });
      
      collector.on('collect', async i => {
        if (i.user.id === interaction.user.id) {
          switch (i.customId) {
            case 'first-page':
              currentPage = 0;
              break;
            case 'prev-page':
              currentPage = Math.max(0, currentPage - 1);
              break;
            case 'next-page':
              currentPage = Math.min(embeds.length - 1, currentPage + 1);
              break;
            case 'last-page':
              currentPage = embeds.length - 1;
              break;
          }
          
          const updatedRow = createPaginationButtons(currentPage, embeds.length);
          await i.update({ 
            embeds: [embeds[currentPage]], 
            components: [updatedRow] 
          });
        } else {
          i.reply({ content: "You cannot use these buttons.", ephemeral: true });
        }
      });
      
      collector.on('end', () => {
        // Remove buttons when collector expires
        if (componentInteraction) {
          componentInteraction.editReply({ 
            embeds: [embeds[currentPage]], 
            components: [] 
          }).catch(() => {});
        } else {
          interaction.editReply({ 
            embeds: [embeds[currentPage]], 
            components: [] 
          }).catch(() => {});
        }
      });
    } else {
      // Single embed, no pagination needed
      const reply = { embeds: embeds, components: [], ephemeral: false };
      if (componentInteraction) {
        return componentInteraction.update(reply);
      } else {
        return interaction.editReply(reply);
      }
    }
    
  } catch (error) {
    console.error(`Error fetching character: ${error.message}`);
    const errorReply = { 
      content: `An error occurred while fetching character information: ${error.message}`,
      ephemeral: true 
    };
    
    if (componentInteraction) {
      return componentInteraction.update(errorReply);
    } else {
      return interaction.editReply(errorReply);
    }
  }
}