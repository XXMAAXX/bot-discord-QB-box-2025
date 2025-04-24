import { Client, Events, Interaction } from "discord.js";
import { 
  handleTicketCreate, 
  handleTicketModalSubmit, 
  handleTicketClose, 
  handleTicketCloseConfirm, 
  handleTicketCloseCancel,
  handleTicketUserInfo,
  handleTicketAddUser,
  handleTicketAddUserSelect,
  handleViewBans,
  handleViewWarnings,
  handleViewKicks,
  handleBackToInfo
} from "../../tickets/ticketHandler";

export default async function (client: Client, interaction: Interaction) {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === 'create_ticket') {
      await handleTicketCreate(interaction, client);
      return;
    }
    
    if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_add_user_select') {
      await handleTicketAddUserSelect(interaction);
      return;
    }
    
    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_modal_')) {
      await handleTicketModalSubmit(interaction, client);
      return;
    }
    
    if (!interaction.isButton()) return;
    
    if (interaction.customId.startsWith('view_bans_')) {
      await handleViewBans(interaction);
      return;
    }
    
    if (interaction.customId.startsWith('view_warnings_')) {
      await handleViewWarnings(interaction);
      return;
    }
    
    if (interaction.customId.startsWith('view_kicks_')) {
      await handleViewKicks(interaction);
      return;
    }
    
    if (interaction.customId.startsWith('back_to_info_')) {
      await handleBackToInfo(interaction);
      return;
    }
    
    switch (interaction.customId) {
      case 'ticket_close':
        await handleTicketClose(interaction);
        break;
      case 'ticket_close_confirm':
        await handleTicketCloseConfirm(interaction);
        break;
      case 'ticket_close_cancel':
        await handleTicketCloseCancel(interaction);
        break;
      case 'ticket_user_info':
        await handleTicketUserInfo(interaction);
        break;
      case 'ticket_add_user':
        await handleTicketAddUser(interaction);
        break;
    }
  } catch (error) {
    console.error("Error in ticket interaction handler:", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "An error occurred while processing your request.",
        ephemeral: true
      });
    } else if (interaction.isRepliable() && !interaction.replied && interaction.deferred) {
      await interaction.editReply("An error occurred while processing your request.");
    }
  }
}