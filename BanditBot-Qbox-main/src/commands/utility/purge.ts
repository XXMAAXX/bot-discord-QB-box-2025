import { SlashCommandBuilder, Client, TextChannel, ChannelType, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChatInputCommandInteraction } from "discord.js";
import dotenv from "dotenv";
import { EMBED_COLOR } from '../../utils/constants';

// this was a from a tempalte i didnt make this command it was to test the command handler and to make sure out dotenv worked/ It also helped with clearing messages from my test server so i kept it
// i will be removing this command in the future but for now it is useful for testing and clearing messages from my test server and maybe for yours. this is not a moderation 
// bot. maybe in future i will make a moderation side for this project

dotenv.config();

// Get the staff role ID from environment variables
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

export const data = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("Purge a specific number of messages")
  .addIntegerOption(option => 
    option.setName("amount")
      .setDescription("Number of messages to purge")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(100)
  )
  .setDefaultMemberPermissions(0x2000); 

export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  if (!interaction.member || !("cache" in interaction.member.roles) || !interaction.member.roles.cache.has(STAFF_ROLE_ID || "")) {
    return await interaction.reply({
      content: "You don't have permission to use this command. Only staff members can use it.",
      ephemeral: true
    });
  }

  if (!interaction.channel) {
    return await interaction.reply({
      content: "This command can only be used in a server channel!",
      ephemeral: true
    });
  }

  if (interaction.channel.type !== ChannelType.GuildText) {
    return await interaction.reply({
      content: "This command can only be used in a text channel!",
      ephemeral: true
    });
  }

  const amount = interaction.options.getInteger("amount");
  
  if (!amount) {
    return await interaction.reply({
      content: "Please specify the number of messages to delete.",
      ephemeral: true
    });
  }

  const confirmButton = new ButtonBuilder()
    .setCustomId("confirm-purge")
    .setLabel(`Confirm Delete ${amount} Messages`)
    .setStyle(ButtonStyle.Danger);

  const cancelButton = new ButtonBuilder()
    .setCustomId("cancel-purge")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(confirmButton, cancelButton);

  const response = await interaction.reply({
    content: `Are you sure you want to delete ${amount} messages?`,
    components: [row],
    ephemeral: true
  });

  try {
    const confirmation = await response.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 30_000 // 30 seconds
    });

    if (confirmation.customId === "confirm-purge") {
      await confirmation.update({
        content: `Purging ${amount} messages...`,
        components: []
      });

      const channel = interaction.channel as TextChannel;
      
      // Delete messages
      const messages = await channel.bulkDelete(amount, true);
      
      await confirmation.editReply({
        content: `Successfully deleted ${messages.size} messages.`
      });
    } else {
      await confirmation.update({
        content: "Purge cancelled.",
        components: []
      });
    }
  } catch (error) {
    await interaction.editReply({
      content: "Confirmation not received within 30 seconds, cancelling purge.",
      components: []
    });
  }
}