import { SlashCommandBuilder, ChatInputCommandInteraction, Client, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { EMBED_COLOR } from "../../utils/constants";

export const data = new SlashCommandBuilder()
  .setName("setup-tickets")
  .setDescription("Setup the ticket system in the current channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const ticketEmbed = new EmbedBuilder()
      .setTitle("🎫 Support Tickets")
      .setDescription("Select a category from the dropdown menu below to create a support ticket.")
      .setColor(EMBED_COLOR)
      .addFields(
        { name: "General Support", value: "`Questions about the server or any rule breaches`", inline: true },
        { name: "Ban Appeal", value: "`Appeal a ban from the server`", inline: true },
        { name: "Gang Report", value: "`Report gang-related issues`", inline: true },
        { name: "Tebex Support", value: "`Issues with donations or purchases`", inline: true },
        { name: "Staff Report", value: "`Report a staff member`", inline: true }
      )
      .setFooter({ text: "Bandit's Support System" })
      .setTimestamp();

    const ticketTypes = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("create_ticket")
          .setPlaceholder("Select a ticket type")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("General Support")
              .setDescription("Questions about the server, gameplay, etc.")
              .setValue("general")
              .setEmoji("❓"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Ban Appeal")
              .setDescription("Appeal a ban from the server")
              .setValue("ban_appeal")
              .setEmoji("🔨"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Gang Report")
              .setDescription("Report gang-related issues")
              .setValue("gang_report")
              .setEmoji("👥"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Tebex Support")
              .setDescription("Issues with donations or purchases")
              .setValue("tebex_support")
              .setEmoji("💰"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Staff Report")
              .setDescription("Report a staff member")
              .setValue("staff_report")
              .setEmoji("🛡️")
          )
      );

    await interaction.channel?.send({
      embeds: [ticketEmbed],
      components: [ticketTypes]
    });

    return interaction.editReply("Ticket system has been set up successfully in this channel!");
  } catch (error) {
    console.error("Error setting up ticket system:", error);
    return interaction.editReply("An error occurred while setting up the ticket system.");
  }
}