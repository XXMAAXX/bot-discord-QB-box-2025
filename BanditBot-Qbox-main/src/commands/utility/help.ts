import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client, Collection, ApplicationCommandOptionBase } from "discord.js";
import { EMBED_COLOR } from '../../utils/constants';
import { CommandModule } from "../../@types/discord.js.js";
import fs from "fs";
import path from "path";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Displays information about available commands")
  .addStringOption(option => 
    option.setName("command")
      .setDescription("Get detailed information about a specific command")
      .setRequired(false)
  );
  
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  await interaction.deferReply({ ephemeral: false });
  
  try {
    const commandName = interaction.options.getString("command")?.toLowerCase();
    
    if (commandName) {
      const command = client.commands.get(commandName);
      
      if (!command) {
        return await interaction.editReply(`No command found with the name \`${commandName}\`.`);
      }
      
      const commandEmbed = new EmbedBuilder()
        .setTitle(`Command: /${command.data.name}`)
        .setColor(EMBED_COLOR)
        .addFields(
          { 
            name: '📋 Command Details', 
            value: `- **Name:** ${command.data.name}\n+ **Description:** ${command.data.description}` 
          }
        )
        .setFooter({ 
          text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          iconURL: interaction.user.displayAvatarURL() 
        })
        .setTimestamp();
      
      const options = command.data.options;
      if (options && options.length > 0) {
        let optionsField = '';
        
        for (const option of options) {
          const optionJson = option.toJSON();
          const required = optionJson.required ? '(Required)' : '(Optional)';
          optionsField += `+ **${optionJson.name}:** ${optionJson.description} ${required}\n`;
        }
        
        commandEmbed.addFields({ name: '🔧 Options', value: optionsField });
      }
      
      return await interaction.editReply({ embeds: [commandEmbed] });
    }
    
    const categories = new Collection<string, CommandModule[]>();
    const commandsRoot = path.join(__dirname, "..", "..");
    const commandsDir = path.join(commandsRoot, "commands");
    
    if (fs.existsSync(commandsDir)) {
      const categoryFolders = fs.readdirSync(commandsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
      
      categoryFolders.forEach(category => {
        categories.set(category.charAt(0).toUpperCase() + category.slice(1), []);
      });
    }
    
    client.commands.forEach(command => {
      let foundCategory = "Other";
      
      for (const [category] of categories) {
        const categoryLower = category.toLowerCase();
        const commandFiles = fs.existsSync(path.join(commandsDir, categoryLower)) ? 
          fs.readdirSync(path.join(commandsDir, categoryLower)) : [];
          
        if (commandFiles.some(file => file.includes(command.data.name))) {
          foundCategory = category;
          break;
        }
      }
      
      if (!categories.has(foundCategory)) {
        categories.set(foundCategory, []);
      }
      
      categories.get(foundCategory)?.push(command);
    });
    
    const helpEmbed = new EmbedBuilder()
      .setTitle('BanditBot Command Help')
      .setColor(EMBED_COLOR)
      .setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .setTimestamp();
    
    const categoryIcons = {
      'Utility': '🔧',
      'Players': '👤',
      'Staff': '🔑',
      'Other': '📚'
    };
    
    categories.forEach((commands, category) => {
      if (commands.length > 0) {
        const icon = categoryIcons[category] || '📁';
        let commandList = '';
        
        commands.forEach(cmd => {
          commandList += `+ \`/${cmd.data.name}\` - ${cmd.data.description}\n`;
        });
        
        helpEmbed.addFields({ 
          name: `${icon} ${category} Commands`, 
          value: commandList
        });
      }
    });
    
    helpEmbed.addFields({
      name: ' ',
      value: `- Use \`/help <command>\` for more information about a specific command.`
    });
    
    return interaction.editReply({ embeds: [helpEmbed] });
    
  } catch (error) {
    console.error(`Error in /help command:`, error);
    return interaction.editReply(`An error occurred while processing your request: ${error.message}`);
  }
}