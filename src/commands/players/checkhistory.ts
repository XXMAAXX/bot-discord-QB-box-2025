import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import dotenv from 'dotenv';
import { EMBED_COLOR } from '../../utils/constants';
import { DISCORD_LIMITS, splitTextToChunks, createPaginationButtons } from '../../utils/embedUtils';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Path to the txAdmin playersDB.json file
const PLAYERS_DB_PATH = process.env.TXADMIN_PLAYERS_DB_PATH || 'c:/Users/61432/Desktop/txData/default/data/playersDB.json';
export const data = new SlashCommandBuilder()
  .setName("checkhistory")
  .setDescription("Check player history of bans, warns, kicks from txAdmin.");
  
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const identifier = `discord:${interaction.user.id}`;
    const isPersonalCheck = true;
    
    await interaction.editReply(`Searching for your player history. Results will be sent to your DMs.`);
    
    if (!fs.existsSync(PLAYERS_DB_PATH)) {
      return interaction.editReply(`Error: Could not find the txAdmin players database at ${PLAYERS_DB_PATH}. Please check the configuration.`);
    }
    
    const fileContent = fs.readFileSync(PLAYERS_DB_PATH, 'utf8');
    const playersDB = JSON.parse(fileContent);
    
    if (!playersDB || !playersDB.actions || !Array.isArray(playersDB.actions)) {
      return interaction.editReply('Error: The txAdmin players database has an invalid format.');
    }

    const bans: any[] = [];
    const warns: any[] = [];
    const kicks: any[] = [];
    
    for (const action of playersDB.actions) {
      const matchesIdentifier = 
        (action.playerName && action.playerName.toLowerCase().includes(identifier)) ||
        (action.ids && Array.isArray(action.ids) && action.ids.some(id => id.toLowerCase().includes(identifier)));
      
      if (matchesIdentifier) {
        if (action.type === 'ban') {
          bans.push(action);
        } else if (action.type === 'warn') {
          warns.push(action);
        } else if (action.type === 'kick') {
          kicks.push(action);
        }
      }
    }
    
    const totalRecords = bans.length + warns.length + kicks.length;
    if (totalRecords === 0) {
      try {
        const noRecordsMessage = isPersonalCheck
          ? "You have no ban, warn, or kick records in txAdmin."
          : `No ban, warn, or kick records were found for identifier: \`${identifier}\`.`;
        
        await interaction.user.send(noRecordsMessage);
        
        const replyUpdate = isPersonalCheck
          ? "No history records found. A message has been sent to your DMs."
          : `No history records were found for identifier: \`${identifier}\`. A message has been sent to your DMs.`;
        
        return interaction.editReply(replyUpdate);
      } catch (error) {
        return interaction.editReply("No records found, and I couldn't send you a DM. Please make sure you have DMs enabled for this server.");
      }
    }
    
    const title = isPersonalCheck ? "Your Player History" : `Player History`;
    const description = isPersonalCheck 
      ? "Here's a summary of your history records."
      : `Here's a summary of the history records.`;
    
    const overviewEmbed = new EmbedBuilder()
      .setTitle(title)
      .setColor(EMBED_COLOR)
      .setDescription(description)
      .addFields(
        { name: '🛑 Bans', value: `${bans.length} record(s)`, inline: true },
        { name: '⚠️ Warnings', value: `${warns.length} record(s)`, inline: true },
        { name: '👢 Kicks', value: `${kicks.length} record(s)`, inline: true }
      )
      .setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .setTimestamp();
    
    const row = new ActionRowBuilder<ButtonBuilder>()
    
    if (warns.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('view-warns')
          .setLabel(`View Warnings (${warns.length})`)
          .setEmoji('⚠️')
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    if (bans.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('view-bans')
          .setLabel(`View Bans (${bans.length})`)
          .setEmoji('🛑')
          .setStyle(ButtonStyle.Danger)
      );
    }
    
    if (kicks.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('view-kicks')
          .setLabel(`View Kicks (${kicks.length})`)
          .setEmoji('👢')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    try {
      const dmMessage = await interaction.user.send({
        embeds: [overviewEmbed],
        components: row.components.length > 0 ? [row] : []
      });
      
      const successMessage = isPersonalCheck
        ? "Your history records have been sent to your DMs!"
        : "History records have been sent to your DMs!";
      
      await interaction.editReply(successMessage);
      
      const collector = dmMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minutes
      });
      
      collector.on('collect', async i => {
        switch (i.customId) {
          case 'view-warns':
            await sendDetailedEmbed(i, warns, 'Warnings', '⚠️', identifier, isPersonalCheck);
            break;
          case 'view-bans':
            await sendDetailedEmbed(i, bans, 'Bans', '🛑', identifier, isPersonalCheck);
            break;
          case 'view-kicks':
            await sendDetailedEmbed(i, kicks, 'Kicks', '👢', identifier, isPersonalCheck);
            break;
          case 'back-to-overview':
            await i.update({
              embeds: [overviewEmbed],
              components: row.components.length > 0 ? [row] : []
            });
            break;
          case 'prev-page':
          case 'next-page':
          case 'first-page':
          case 'last-page':
            // These are handled by the collector in sendDetailedEmbed
            break;
        }
      });
      
      collector.on('end', () => {
        dmMessage.edit({
          components: []
        }).catch(() => {});
      });
    } catch (error) {
      console.error('Error sending DM:', error);
      return interaction.editReply("I couldn't send you a DM. Please make sure you have DMs enabled for this server.");
    }
    
  } catch (error) {
    console.error(`Error in /checkhistory command: ${error.message}`);
    return interaction.editReply(`An error occurred: ${error.message}`);
  }
}

async function sendDetailedEmbed(
  interaction: any,
  records: any[],
  recordType: string,
  emoji: string,
  identifier: string,
  isPersonalCheck: boolean = false
) {
  // Create base embed for this record type
  const title = isPersonalCheck
    ? `${emoji} Your ${recordType}`
    : `${emoji} ${recordType} History`;
  
  const baseEmbed = new EmbedBuilder()
    .setTitle(title)
    .setColor(EMBED_COLOR)
    .setDescription(`Showing ${records.length} ${recordType.toLowerCase()} record(s).`)
    .setTimestamp();
  
  // Array to hold multiple embeds if needed
  const embeds: EmbedBuilder[] = [];
  let currentEmbed = EmbedBuilder.from(baseEmbed);
  let currentEmbedSize = title.length + baseEmbed.data.description!.length;
  let totalFieldsInCurrentEmbed = 0;
  
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    
    // Create formatted info for this record
    let recordInfo = '';
    let reasonText = '';
    
    if (recordType === 'Bans') {
      let banExpiry = "Permanent";
      if (record.expiration) {
        const expiryDate = new Date(record.expiration * 1000);
        banExpiry = expiryDate < new Date() ? 
          "Expired" : 
          expiryDate.toLocaleString();
      }
      
      recordInfo = `\`\`\`diff
- Your Bans

+ Action ID: ${record.id}
+ By: ${record.author || 'Unknown Admin'}
+ When: ${new Date(record.timestamp * 1000).toLocaleString()}
+ Expiration: ${banExpiry}
+ Player: ${record.playerName || 'Unknown'}
+ Revoked: ${record.revocation && record.revocation.timestamp ? 'Yes' : 'No'}
\`\`\``;

      reasonText = `**Reason:**\n\`\`\`${record.reason || 'No reason provided'}\`\`\``;
      
    } else if (recordType === 'Warnings') {
      recordInfo = `\`\`\`diff
- Your Warns

+ Action ID: ${record.id}
+ By: ${record.author || 'Unknown Admin'}
+ When: ${new Date(record.timestamp * 1000).toLocaleString()}
+ Player: ${record.playerName || 'Unknown'}
+ Revoked: ${record.revocation && record.revocation.timestamp ? 'Yes' : 'No'}
\`\`\``;

      reasonText = `**Reason:**\n\`\`\`${record.reason || 'No reason provided'}\`\`\``;
      
    } else if (recordType === 'Kicks') {
      recordInfo = `\`\`\`diff
- Your Kicks

+ Action ID: ${record.id}
+ By: ${record.author || 'Unknown Admin'}
+ When: ${new Date(record.timestamp * 1000).toLocaleString()}
+ Player: ${record.playerName || 'Unknown'}
+ Revoked: ${record.revocation && record.revocation.timestamp ? 'Yes' : 'No'}
\`\`\``;

      reasonText = `**Reason:**\n\`\`\`${record.reason || 'No reason provided'}\`\`\``;
    }
    
    // Check if the record info or reason text is too long for a field
    const fieldName = `${recordType} Record: ${record.id}`;
    
    // Calculate sizes
    const fieldInfoSize = fieldName.length + recordInfo.length;
    const reasonSize = ' '.length + reasonText.length; // Field name for reason is just a space
    
    // Check if we need to split the record info or reason
    if (recordInfo.length > DISCORD_LIMITS.FIELD_VALUE) {
      const infoChunks = splitTextToChunks(recordInfo);
      for (let j = 0; j < infoChunks.length; j++) {
        const chunkName = infoChunks.length > 1 ? 
          `${fieldName} - Part ${j + 1}/${infoChunks.length}` : 
          fieldName;
          
        // Check if adding this field would exceed limits
        if (totalFieldsInCurrentEmbed >= DISCORD_LIMITS.MAX_FIELDS || 
            currentEmbedSize + chunkName.length + infoChunks[j].length > DISCORD_LIMITS.TOTAL) {
          // Start a new embed
          embeds.push(currentEmbed);
          currentEmbed = EmbedBuilder.from(baseEmbed);
          currentEmbedSize = title.length + baseEmbed.data.description!.length;
          totalFieldsInCurrentEmbed = 0;
        }
        
        // Add field to current embed
        currentEmbed.addFields({ name: chunkName, value: infoChunks[j] });
        currentEmbedSize += chunkName.length + infoChunks[j].length;
        totalFieldsInCurrentEmbed++;
      }
    } else {
      // Check if adding this field would exceed limits
      if (totalFieldsInCurrentEmbed >= DISCORD_LIMITS.MAX_FIELDS || 
          currentEmbedSize + fieldInfoSize > DISCORD_LIMITS.TOTAL) {
        // Start a new embed
        embeds.push(currentEmbed);
        currentEmbed = EmbedBuilder.from(baseEmbed);
        currentEmbedSize = title.length + baseEmbed.data.description!.length;
        totalFieldsInCurrentEmbed = 0;
      }
      
      // Add field to current embed
      currentEmbed.addFields({ name: fieldName, value: recordInfo });
      currentEmbedSize += fieldInfoSize;
      totalFieldsInCurrentEmbed++;
    }
    
    // Handle reason text similarly
    if (reasonText.length > DISCORD_LIMITS.FIELD_VALUE) {
      const reasonChunks = splitTextToChunks(reasonText);
      for (let j = 0; j < reasonChunks.length; j++) {
        const chunkName = reasonChunks.length > 1 ? 
          `Reason - Part ${j + 1}/${reasonChunks.length}` : 
          ' ';
          
        // Check if adding this field would exceed limits
        if (totalFieldsInCurrentEmbed >= DISCORD_LIMITS.MAX_FIELDS || 
            currentEmbedSize + chunkName.length + reasonChunks[j].length > DISCORD_LIMITS.TOTAL) {
          // Start a new embed
          embeds.push(currentEmbed);
          currentEmbed = EmbedBuilder.from(baseEmbed);
          currentEmbedSize = title.length + baseEmbed.data.description!.length;
          totalFieldsInCurrentEmbed = 0;
        }
        
        // Add field to current embed
        currentEmbed.addFields({ name: chunkName, value: reasonChunks[j] });
        currentEmbedSize += chunkName.length + reasonChunks[j].length;
        totalFieldsInCurrentEmbed++;
      }
    } else {
      // Check if adding this field would exceed limits
      if (totalFieldsInCurrentEmbed >= DISCORD_LIMITS.MAX_FIELDS || 
          currentEmbedSize + reasonSize > DISCORD_LIMITS.TOTAL) {
        // Start a new embed
        embeds.push(currentEmbed);
        currentEmbed = EmbedBuilder.from(baseEmbed);
        currentEmbedSize = title.length + baseEmbed.data.description!.length;
        totalFieldsInCurrentEmbed = 0;
      }
      
      // Add field to current embed
      currentEmbed.addFields({ name: ' ', value: reasonText });
      currentEmbedSize += reasonSize;
      totalFieldsInCurrentEmbed++;
    }
  }
  
  // Add the last embed if it has fields
  if (totalFieldsInCurrentEmbed > 0) {
    embeds.push(currentEmbed);
  }
  
  // If there are no embeds (shouldn't happen), create an empty one
  if (embeds.length === 0) {
    embeds.push(baseEmbed.setDescription(`No ${recordType.toLowerCase()} records to display.`));
  }
  
  // Add page numbers to embeds if multiple pages
  if (embeds.length > 1) {
    for (let i = 0; i < embeds.length; i++) {
      embeds[i].setFooter({
        text: `Page ${i + 1}/${embeds.length}`
      });
    }
  }
  
  // Back button
  const backButton = new ButtonBuilder()
    .setCustomId('back-to-overview')
    .setLabel('Back to Overview')
    .setStyle(ButtonStyle.Secondary);
  
  if (embeds.length === 1) {
    // Just one embed, no pagination needed
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton);
    
    await interaction.update({
      embeds: embeds,
      components: [row]
    });
  } else {
    // Multiple embeds, set up pagination
    let currentPage = 0;
    const paginationRow = createPaginationButtons(currentPage, embeds.length);
    
    // Add back button to pagination row if there's room
    if (paginationRow.components.length < 5) {
      paginationRow.addComponents(backButton);
    } else {
      // Create a second row for the back button
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(backButton);
      
      // Send initial response with both rows
      const message = await interaction.update({
        embeds: [embeds[currentPage]],
        components: [paginationRow, backRow],
        fetchReply: true
      });
      
      // Create collector for pagination
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 180000 // 3 minutes
      });
      
      collector.on('collect', async i => {
        if (i.customId === 'back-to-overview') {
          // This will be handled by the parent collector
          return;
        }
        
        // Handle pagination
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
        
        // Update pagination buttons
        const updatedRow = createPaginationButtons(currentPage, embeds.length);
        if (updatedRow.components.length < 5) {
          updatedRow.addComponents(backButton);
          
          await i.update({
            embeds: [embeds[currentPage]],
            components: [updatedRow]
          });
        } else {
          await i.update({
            embeds: [embeds[currentPage]],
            components: [updatedRow, backRow]
          });
        }
      });
      
      return; // Return here to avoid the code below
    }
    
    // Send initial response with only one row
    const message = await interaction.update({
      embeds: [embeds[currentPage]],
      components: [paginationRow],
      fetchReply: true
    });
    
    // Create collector for pagination
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 180000 // 3 minutes
    });
    
    collector.on('collect', async i => {
      if (i.customId === 'back-to-overview') {
        // This will be handled by the parent collector
        return;
      }
      
      // Handle pagination
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
      
      // Update pagination buttons
      const updatedRow = createPaginationButtons(currentPage, embeds.length);
      if (updatedRow.components.length < 5) {
        updatedRow.addComponents(backButton);
      }
      
      await i.update({
        embeds: [embeds[currentPage]],
        components: [updatedRow]
      });
    });
  }
}