// filepath: c:\Users\61432\Desktop\banditbot_ts\src\commands\staff\playerinventory.ts
import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import dotenv from 'dotenv';
import { EMBED_COLOR } from '../../utils/constants';
import { DISCORD_LIMITS, splitTextToChunks, createPaginationButtons } from '../../utils/embedUtils';

// Load environment variables
dotenv.config();

// Get the staff role ID from environment variables
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

export const data = new SlashCommandBuilder()
  .setName("playerinventory")
  .setDescription("Retrieves a character's inventory from the database.")
  .addUserOption(option => 
    option.setName("user")
      .setDescription("Discord user to look up")
      .setRequired(false)
  );
  
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  // Check if the user has the staff role 
  if (!interaction.member || !("cache" in interaction.member.roles) || !interaction.member.roles.cache.has(STAFF_ROLE_ID || "")) {
    return await interaction.reply({
      content: "You don't have permission to use this command. Only staff members can use it.",
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: false });
  
  try {
    // Check if we have a MySQL connection
    const mysqlConnection = client.mysqlConnection;
    if (!mysqlConnection) {
      return interaction.editReply("Database connection is not available.");
    }

    const targetUser = interaction.options.getUser("user") || interaction.user;
    
    // Variables to store user data
    let license: string | null = null;
    
    // Try to find the user in the database
    const discordIdWithPrefix = `discord:${targetUser.id}`;
    const [userRows] = await mysqlConnection.execute(
      'SELECT * FROM users WHERE discord = ?',
      [discordIdWithPrefix]
    );
    
    if (userRows && (userRows as any[]).length > 0) {
      license = (userRows as any[])[0].license2;
    } else {
      // Try without prefix if the first query failed
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
    
    // Get the characters for this user
    const [characters] = await mysqlConnection.execute(
      'SELECT * FROM players WHERE license = ?',
      [license]
    );
    
    if (!characters || (characters as any[]).length === 0) {
      return interaction.editReply(`No characters found for ${targetUser.username}`);
    }
    
    // Create a list of characters
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
    
    // Create a selection embed
    const selectionEmbed = new EmbedBuilder()
      .setTitle(`Characters for ${targetUser.username}`)
      .setDescription(characterList)
      .addFields({ name: "Selection", value: "Choose a character to view their inventory" })
      .setColor(EMBED_COLOR)
      .setThumbnail(targetUser.displayAvatarURL())
      .setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      });
    
    // Create buttons for character selection
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
          .setCustomId(`inventory-${char.citizenid}`)
          .setLabel(`${index + 1}. ${charName}`)
          .setStyle(ButtonStyle.Primary)
      );
      
      buttonsInCurrentRow++;
    });
    
    // Add the last row if it has any buttons
    if (buttonsInCurrentRow > 0) {
      rows.push(currentRow);
    }
    
    // Send the selection menu
    const response = await interaction.editReply({
      embeds: [selectionEmbed],
      components: rows
    });
    
    // Create a collector for button interactions
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000 // 1 minute timeout
    });
    
    collector.on('collect', async i => {
      if (i.user.id === interaction.user.id) {
        const selectedCharId = i.customId.replace('inventory-', '');
        await fetchAndDisplayInventory(client, interaction, selectedCharId, i);
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
    console.error(`Error in /playerinventory command: ${error.message}`);
    return interaction.editReply(`An error occurred: ${error.message}`);
  }
}

/**
 * Fetches and displays character inventory information
 */
async function fetchAndDisplayInventory(
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
    
    // Parse character info for display
    let charInfo;
    try {
      charInfo = JSON.parse(character.charinfo);
    } catch (e) {
      charInfo = {
        firstname: "Unknown",
        lastname: "Unknown"
      };
    }
    
    // Parse inventory data
    let inventoryItems = "No items found";
    let categorizedItems: {[key: string]: any[]} = {
      "Weapons": [],
      "Food & Drinks": [],
      "Medical": [],
      "Documents": [],
      "Items": []
    };
    
    try {
      if (character.inventory) {
        const inventory = JSON.parse(character.inventory);
        
        if (inventory && Array.isArray(inventory) && inventory.length > 0) {
          // Categorize items
          inventory.forEach(item => {
            if (!item || !item.name) return;
            
            const name = item.name;
            const count = item.count || 1;
            const metadata = item.metadata ? true : false;
            const slot = item.slot;
            
            // Basic categorization - can be expanded
            if (name.includes('weapon') || name.includes('gun') || name.includes('knife') || name.includes('ammo')) {
              categorizedItems["Weapons"].push({ name, count, metadata, slot });
            } 
            else if (name.includes('food') || name.includes('drink') || name.includes('water') || name.includes('sandwich')) {
              categorizedItems["Food & Drinks"].push({ name, count, metadata, slot });
            }
            else if (name.includes('bandage') || name.includes('medkit') || name.includes('pill') || name.includes('firstaid')) {
              categorizedItems["Medical"].push({ name, count, metadata, slot });
            }
            else if (name.includes('id') || name.includes('license') || name.includes('card') || name.includes('document')) {
              categorizedItems["Documents"].push({ name, count, metadata, slot });
            }
            else {
              categorizedItems["Items"].push({ name, count, metadata, slot });
            }
          });
          
          // If no items, the inventory is empty
          if (inventory.length === 0) {
            inventoryItems = "Empty inventory";
          }
        } else {
          inventoryItems = "Empty inventory";
        }
      } else {
        inventoryItems = "No inventory data";
      }
    } catch (e) {
      inventoryItems = "Error parsing inventory data";
      console.error(`Error parsing inventory for ${citizenId}:`, e);
    }
    
    // Create the base embed for displaying inventory
    const baseEmbed = new EmbedBuilder()
      .setTitle(`Inventory: ${charInfo.firstname} ${charInfo.lastname} (${citizenId})`)
      .setColor(EMBED_COLOR)
      .setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .setTimestamp();
    
    // Prepare embeds array in case we need pagination
    const embeds: EmbedBuilder[] = [baseEmbed];
    let currentEmbed = baseEmbed;
    let totalSize = baseEmbed.data.title?.length || 0;
    totalSize += baseEmbed.data.footer?.text?.length || 0;
    
    // Handle inventory sections
    for (const [category, items] of Object.entries(categorizedItems)) {
      if (items.length > 0) {
        // Format the items list
        const itemList = items.map(item => 
          `${item.name} x${item.count}${item.metadata ? " (Has metadata)" : ""} [Slot: ${item.slot}]`
        ).join('\n');
        
        // Check if this category list would be too long
        if (itemList.length > DISCORD_LIMITS.FIELD_VALUE) {
          // Split the large field into chunks
          const chunks = splitTextToChunks(itemList);
          
          for (let i = 0; i < chunks.length; i++) {
            const fieldName = chunks.length > 1 ? 
              `📦 ${category} (${items.length}) - Part ${i + 1}/${chunks.length}` : 
              `📦 ${category} (${items.length})`;
              
            const fieldValue = `\`\`\`${chunks[i]}\`\`\``;
            
            // Check if adding this field would exceed limits
            const fieldSize = fieldName.length + fieldValue.length;
            
            if (currentEmbed.data.fields && currentEmbed.data.fields.length >= DISCORD_LIMITS.MAX_FIELDS ||
                totalSize + fieldSize > DISCORD_LIMITS.TOTAL) {
              // Create a new embed for the overflow
              const newEmbed = new EmbedBuilder()
                .setColor(EMBED_COLOR)
                .setFooter({ 
                  text: `${baseEmbed.data.footer?.text || ''} • Page ${embeds.length + 1}`,
                  iconURL: baseEmbed.data.footer?.icon_url
                })
                .setTimestamp();
              
              embeds.push(newEmbed);
              currentEmbed = newEmbed;
              totalSize = newEmbed.data.footer?.text?.length || 0;
            }
            
            // Add the field to the current embed
            currentEmbed.addFields({ 
              name: fieldName, 
              value: fieldValue,
              inline: false 
            });
            
            totalSize += fieldSize;
          }
        } else {
          // Field fits within limit
          const fieldName = `📦 ${category} (${items.length})`;
          const fieldValue = `\`\`\`${itemList}\`\`\``;
          
          // Check if adding this field would exceed limits
          const fieldSize = fieldName.length + fieldValue.length;
          
          if (currentEmbed.data.fields && currentEmbed.data.fields.length >= DISCORD_LIMITS.MAX_FIELDS ||
              totalSize + fieldSize > DISCORD_LIMITS.TOTAL) {
            // Create a new embed for the overflow
            const newEmbed = new EmbedBuilder()
              .setColor(EMBED_COLOR)
              .setFooter({ 
                text: `${baseEmbed.data.footer?.text || ''} • Page ${embeds.length + 1}`,
                iconURL: baseEmbed.data.footer?.icon_url
              })
              .setTimestamp();
            
            embeds.push(newEmbed);
            currentEmbed = newEmbed;
            totalSize = newEmbed.data.footer?.text?.length || 0;
          }
          
          // Add the field to the current embed
          currentEmbed.addFields({ 
            name: fieldName, 
            value: fieldValue,
            inline: false 
          });
          
          totalSize += fieldSize;
        }
      }
    }
    
    // If no items were added to any category
    if (embeds[0].data.fields?.length === 0) {
      embeds[0].setDescription("This character has no items in their inventory.");
    }
    
    // Update page numbers in footers if multiple pages
    if (embeds.length > 1) {
      embeds.forEach((embed, index) => {
        embed.setFooter({
          text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Page ${index + 1}/${embeds.length}`,
          iconURL: interaction.user.displayAvatarURL()
        });
      });
    }
    
    // If we have multiple embeds, set up pagination
    if (embeds.length > 1) {
      // Set up pagination
      let currentPage = 0;
      
      // Create pagination buttons
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
        if (componentInteraction && !componentInteraction.replied) {
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
    console.error(`Error fetching inventory: ${error.message}`);
    const errorReply = { 
      content: `An error occurred while fetching inventory information: ${error.message}`,
      ephemeral: true 
    };
    
    if (componentInteraction) {
      return componentInteraction.update(errorReply);
    } else {
      return interaction.editReply(errorReply);
    }
  }
}