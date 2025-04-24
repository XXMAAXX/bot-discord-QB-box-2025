import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// Discord API Embed limits i decided to check for these incase of large communities or large messages thanks lion for the reminder
export const DISCORD_LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FOOTER: 2048,
  TOTAL: 6000,
  MAX_FIELDS: 25
};

/**
 * Splits text into chunks that fit within Discord's field value limit
 * @param text The text to split
 * @param maxLength Maximum length for each chunk (defaults to Discord's field value limit)
 * @param separator The separator to use for splitting (defaults to newline)
 * @returns An array of text chunks
 */
export function splitTextToChunks(text: string, maxLength: number = DISCORD_LIMITS.FIELD_VALUE, separator: string = '\n'): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  const lines = text.split(separator);
  
  for (const line of lines) {
    if (line.length > maxLength) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }

      let remainingText = line;
      while (remainingText.length > 0) {
        const chunk = remainingText.substring(0, maxLength);
        chunks.push(chunk);
        remainingText = remainingText.substring(maxLength);
      }
    } 
    else if (currentChunk.length + line.length + separator.length > maxLength) {
      chunks.push(currentChunk);
      currentChunk = line;
    } 
    else {
      if (currentChunk.length > 0) {
        currentChunk += separator;
      }
      currentChunk += line;
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

/**
 * Creates paginated embeds from a large content
 * @param baseEmbed The base embed to use as a template
 * @param contentFieldName The name of the field to paginate
 * @param content The content to paginate
 * @param pageSize Maximum number of items per page
 * @returns Array of embeds (pages)
 */
export function createPaginatedEmbeds(
  baseEmbed: EmbedBuilder, 
  contentFieldName: string, 
  content: string, 
  codeBlock: boolean = true
): EmbedBuilder[] {

  const chunks = splitTextToChunks(content);
  

  if (chunks.length === 1) {
    return [
      baseEmbed.addFields({ 
        name: contentFieldName, 
        value: codeBlock ? `\`\`\`\n${chunks[0]}\`\`\`` : chunks[0],
        inline: false
      })
    ];
  }
  

  return chunks.map((chunk, index) => {
    const newEmbed = EmbedBuilder.from(baseEmbed);
    newEmbed.setFooter({
      text: `${baseEmbed.data.footer?.text || ''} • Page ${index + 1}/${chunks.length}`,
      iconURL: baseEmbed.data.footer?.icon_url
    });
    
    return newEmbed.addFields({ 
      name: `${contentFieldName} (Page ${index + 1}/${chunks.length})`, 
      value: codeBlock ? `\`\`\`\n${chunk}\`\`\`` : chunk,
      inline: false
    });
  });
}

/**
 * Checks if an embed field would exceed Discord's limits
 * @param name Field name
 * @param value Field value
 * @returns True if the field would exceed limits
 */
export function wouldExceedLimit(name: string, value: string): boolean {
  return name.length > DISCORD_LIMITS.FIELD_NAME || value.length > DISCORD_LIMITS.FIELD_VALUE;
}

/**
 * Creates pagination buttons for navigating through multiple embeds
 * @returns ActionRowBuilder with pagination buttons
 */
export function createPaginationButtons(
  currentPage: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  // First page button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('first-page')
      .setLabel('First')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0)
  );
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('prev-page')
      .setLabel('Prev')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === 0)
  );
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('page-indicator')
      .setLabel(`${currentPage + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('next-page')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage === totalPages - 1)
  );
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('last-page')
      .setLabel('Last')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === totalPages - 1)
  );
  
  return row;
}