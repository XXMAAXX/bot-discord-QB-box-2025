import { 
  Client, 
  StringSelectMenuInteraction, 
  ButtonInteraction,
  GuildMember,
  TextChannel,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  UserSelectMenuInteraction,
  AttachmentBuilder
} from "discord.js";
import { EMBED_COLOR } from "../utils/constants";
import dotenv from "dotenv";
import * as discordTranscripts from "discord-html-transcripts";
import fs from 'fs';

dotenv.config();

const TICKET_CATEGORIES = {
  general: process.env.GENERAL_TICKET_CATEGORY || "1364067273261711411",
  ban_appeal: process.env.BAN_APPEAL_TICKET_CATEGORY || "1364067474542428191",
  gang_report: process.env.GANG_REPORT_TICKET_CATEGORY || "1364067492049190982",
  tebex_support: process.env.TEBEX_SUPPORT_TICKET_CATEGORY || "1364067512404410520",
  staff_report: process.env.STAFF_REPORT_TICKET_CATEGORY || "1364067539063148604"
};

const TRANSCRIPT_CHANNEL_ID = process.env.TRANSCRIPT_CHANNEL_ID || "1364071155702698085";
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const TICKET_PING_ROLE_ID = process.env.TICKET_PING_ROLE_ID || STAFF_ROLE_ID;
const activeTickets = new Collection<string, string>();

export async function handleTicketCreate(interaction: StringSelectMenuInteraction, client: Client) {
  try {
    const ticketType = interaction.values[0];
    const member = interaction.member as GuildMember;
    const guild = interaction.guild;
    if (!guild) {
      return interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    }
    if (activeTickets.has(member.id)) {
      return interaction.reply({ 
        content: `You already have an open ticket. Please use your existing ticket or close it before creating a new one.`, 
        ephemeral: true 
      });
    }
    const categoryId = TICKET_CATEGORIES[ticketType as keyof typeof TICKET_CATEGORIES];
    if (!categoryId) {
      return interaction.reply({ content: "Invalid ticket type selected.", ephemeral: true });
    }
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal_${ticketType}`)
      .setTitle(`${getTicketTypeName(ticketType)} Ticket`);
    const ticketSubjectInput = new TextInputBuilder()
      .setCustomId('ticketSubject')
      .setLabel('Brief subject of your ticket')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Account issue, In-game problem, etc.')
      .setRequired(true)
      .setMaxLength(100);
    const ticketDescriptionInput = new TextInputBuilder()
      .setCustomId('ticketDescription')
      .setLabel('Please describe your issue in detail')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Provide as much relevant information as possible...')
      .setRequired(true)
      .setMaxLength(1000);
    const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ticketSubjectInput);
    const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ticketDescriptionInput);
    modal.addComponents(firstActionRow, secondActionRow);
    await interaction.showModal(modal);
  } catch (error) {
    console.error("Error handling ticket creation:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: "An error occurred while creating your ticket.", 
        ephemeral: true 
      });
    }
  }
}

export async function handleTicketModalSubmit(interaction: ModalSubmitInteraction, client: Client) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const ticketType = interaction.customId.replace('ticket_modal_', '');
    const subject = interaction.fields.getTextInputValue('ticketSubject');
    const description = interaction.fields.getTextInputValue('ticketDescription');
    const member = interaction.member as GuildMember;
    const guild = interaction.guild;
    if (!guild) {
      return interaction.editReply("This command can only be used in a server.");
    }
    const categoryId = TICKET_CATEGORIES[ticketType as keyof typeof TICKET_CATEGORIES];
    if (!categoryId) {
      return interaction.editReply("Invalid ticket type selected.");
    }
    const ticketName = `${ticketType}-${member.user.username.toLowerCase()}`;
    const ticketChannel = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: ['ViewChannel']
        },
        {
          id: member.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        },
        {
          id: STAFF_ROLE_ID || "",
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels']
        },
        {
          id: client.user!.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels']
        }
      ]
    });
    activeTickets.set(member.id, ticketChannel.id);
    let banInfo = null;
    if (ticketType === 'ban_appeal') {
      try {
        const PLAYERS_DB_PATH = process.env.TXADMIN_PLAYERS_DB_PATH || 'c:/Users/61432/Desktop/txData/default/data/playersDB.json';
        if (fs.existsSync(PLAYERS_DB_PATH)) {
          const fileContent = fs.readFileSync(PLAYERS_DB_PATH, 'utf8');
          const playersDB = JSON.parse(fileContent);
          if (playersDB && playersDB.actions && Array.isArray(playersDB.actions)) {
            const identifier = `discord:${member.id}`;
            const bans: any[] = [];
            for (const action of playersDB.actions) {
              const matchesIdentifier = 
                (action.playerName && action.playerName.toLowerCase().includes(identifier)) ||
                (action.ids && Array.isArray(action.ids) && action.ids.some(id => id.toLowerCase().includes(identifier)));
              if (matchesIdentifier && action.type === 'ban') {
                bans.push(action);
              }
            }
            if (bans.length > 0) {
              bans.sort((a, b) => b.timestamp - a.timestamp);
              banInfo = bans[0];
            }
          }
        }
      } catch (error) {
        console.error("Error fetching ban info for ticket creation:", error);
      }
    }
    const ticketEmbed = new EmbedBuilder()
      .setTitle(`${getTicketTypeName(ticketType)} Support Ticket`)
      .setColor(EMBED_COLOR)
      .setDescription(`Thank you for creating a ticket. A staff member will assist you shortly.`)
      .addFields(
        { name: 'User', value: `<@${member.id}>`, inline: true },
        { name: 'Subject', value: subject, inline: true },
        { name: 'Type', value: getTicketTypeName(ticketType), inline: true },
        { name: 'Description', value: description }
      )
      .setFooter({ text: `Ticket ID: ${ticketChannel.id}` })
      .setTimestamp();
    if (ticketType === 'ban_appeal' && banInfo) {
      let banExpiry = "Permanent";
      if (banInfo.expiration) {
        const expiryDate = new Date(banInfo.expiration * 1000);
        banExpiry = expiryDate < new Date() ? 
          "Expired" : 
          `${expiryDate.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${expiryDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      }
      ticketEmbed.addFields({ 
        name: '🔴 Ban Information',
        value: `\`\`\`diff\n- Most Recent Ban\n+ By: ${banInfo.author || 'Unknown'}\n+ When: ${new Date(banInfo.timestamp * 1000).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n+ Expiration: ${banExpiry}\n+ Reason: ${banInfo.reason || 'No reason provided'}\n+ Revoked: ${banInfo.revocation && banInfo.revocation.timestamp ? 'Yes' : 'No'}\`\`\``, 
        inline: false
      });
    }
    const ticketButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('ticket_user_info')
          .setLabel('Player Information')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('👤'),
        new ButtonBuilder()
          .setCustomId('ticket_add_user')
          .setLabel('Add User')
          .setStyle(ButtonStyle.Success)
          .setEmoji('➕')
      );
    const pingRole = TICKET_PING_ROLE_ID || STAFF_ROLE_ID;
    await ticketChannel.send({ 
      content: `<@${member.id}> <@&${pingRole}>`, 
      embeds: [ticketEmbed],
      components: [ticketButtons]
    });
    if (ticketType === 'ban_appeal') {
      try {
        const PLAYERS_DB_PATH = process.env.TXADMIN_PLAYERS_DB_PATH || 'c:/Users/61432/Desktop/txData/default/data/playersDB.json';
        if (fs.existsSync(PLAYERS_DB_PATH)) {
          const fileContent = fs.readFileSync(PLAYERS_DB_PATH, 'utf8');
          const playersDB = JSON.parse(fileContent);
          if (playersDB && playersDB.actions && Array.isArray(playersDB.actions)) {
            const identifier = `discord:${member.id}`;
            const bans: any[] = [];
            for (const action of playersDB.actions) {
              const matchesIdentifier = 
                (action.playerName && action.playerName.toLowerCase().includes(identifier)) ||
                (action.ids && Array.isArray(action.ids) && action.ids.some(id => id.toLowerCase().includes(identifier)));
              if (matchesIdentifier && action.type === 'ban') {
                bans.push(action);
              }
            }
            if (bans.length > 1) {
              const banHistoryEmbed = new EmbedBuilder()
                .setTitle(`Ban History for ${member.user.tag}`)
                .setColor('Red')
                .setDescription(`Showing ${bans.length-1} additional ban record(s).`)
                .setFooter({ text: 'This information is displayed automatically for ban appeals.' })
                .setTimestamp();
              const maxBansToShow = Math.min(5, bans.length);
              for (let i = 1; i < maxBansToShow; i++) {
                const ban = bans[i];
                let banExpiry = "Permanent";
                if (ban.expiration) {
                  const expiryDate = new Date(ban.expiration * 1000);
                  banExpiry = expiryDate < new Date() ? 
                    "Expired" : 
                    `${expiryDate.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${expiryDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                }
                banHistoryEmbed.addFields({ 
                  name: `🔴 Ban #${i + 1}`,
                  value: `\`\`\`diff\n- Ban Details\n+ By: ${ban.author || 'Unknown'}\n+ When: ${new Date(ban.timestamp * 1000).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n+ Expiration: ${banExpiry}\n+ Reason: ${ban.reason || 'No reason provided'}\n+ Revoked: ${ban.revocation && ban.revocation.timestamp ? 'Yes' : 'No'}\`\`\``, 
                  inline: false
                });
              }
              if (bans.length > maxBansToShow) {
                banHistoryEmbed.addFields({
                  name: '⚠️ Additional Bans',
                  value: `There are ${bans.length - maxBansToShow} more ban records not shown here.`,
                  inline: false
                });
              }
              if (banHistoryEmbed.data.fields && banHistoryEmbed.data.fields.length > 0) {
                await ticketChannel.send({
                  content: `**Additional ban history:**`,
                  embeds: [banHistoryEmbed]
                });
              }
            }
          }
        } else if (!banInfo) {
          await ticketChannel.send({
            content: `<@${member.id}> <@&${STAFF_ROLE_ID}>`,
            embeds: [
              new EmbedBuilder()
                .setTitle('No Ban Records Found')
                .setDescription(`No ban records were found for <@${member.id}>. If you believe this is an error, please provide more information about your ban in this ticket.`)
                .setColor('Orange')
                .setTimestamp()
            ]
          });
        }
      } catch (error) {
        console.error("Error fetching ban history for ban appeal:", error);
        await ticketChannel.send({
          content: `<@&${STAFF_ROLE_ID}>`,
          embeds: [
            new EmbedBuilder()
              .setTitle('Error Fetching Ban History')
              .setDescription(`An error occurred while trying to fetch the ban history for <@${member.id}>. Please check the ban status manually.`)
              .setColor('Red')
              .setTimestamp()
          ]
        });
      }
    }
    return interaction.editReply(`Your ticket has been created: <#${ticketChannel.id}>`);
  } catch (error) {
    console.error("Error processing ticket modal:", error);
    return interaction.editReply("An error occurred while creating your ticket.");
  }
}

export async function handleTicketClose(interaction: ButtonInteraction) {
  await interaction.deferReply();
  try {
    const channel = interaction.channel as TextChannel;
    const confirmButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close_confirm')
          .setLabel('Confirm Close')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket_close_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );
    await interaction.editReply({
      content: 'Are you sure you want to close this ticket?',
      components: [confirmButtons]
    });
  } catch (error) {
    console.error("Error handling ticket close:", error);
    return interaction.editReply("An error occurred while trying to close the ticket.");
  }
}

export async function handleTicketCloseConfirm(interaction: ButtonInteraction) {
  await interaction.deferReply();
  try {
    const channel = interaction.channel as TextChannel;
    let ticketCreatorId = null;
    for (const [userId, channelId] of activeTickets.entries()) {
      if (channelId === channel.id) {
        ticketCreatorId = userId;
        activeTickets.delete(userId);
        break;
      }
    }
    const closedEmbed = new EmbedBuilder()
      .setTitle("Ticket Closed")
      .setDescription(`This ticket has been closed by <@${interaction.user.id}>`)
      .setColor('Red')
      .setTimestamp();
    await interaction.editReply({
      content: 'Saving transcript and closing ticket in 5 seconds...',
      embeds: [closedEmbed],
      components: []
    });
    await saveTicketTranscript(channel, interaction.client, ticketCreatorId);
    setTimeout(async () => {
      try {
        await channel.delete(`Ticket closed by ${interaction.user.tag}`);
      } catch (e) {
        console.error("Error deleting ticket channel:", e);
      }
    }, 5000);
  } catch (error) {
    console.error("Error confirming ticket close:", error);
    return interaction.editReply("An error occurred while closing the ticket.");
  }
}

export async function handleTicketCloseCancel(interaction: ButtonInteraction) {
  await interaction.update({
    content: 'Ticket close cancelled.',
    components: []
  });
}

async function saveTicketTranscript(channel: TextChannel, client: Client, ticketCreatorId: string | null = null) {
  try {
    const transcriptChannel = await client.channels.fetch(TRANSCRIPT_CHANNEL_ID) as TextChannel;
    if (!transcriptChannel) {
      console.error("Transcript channel not found!");
      return;
    }
    const transcript = await discordTranscripts.createTranscript(channel, {
      limit: 100,
      filename: `transcript-${channel.name}-${Date.now()}.html`,
      poweredBy: false,
      saveImages: true,
      footerText: `Transcript created for ticket ${channel.name}`
    });
    let ticketType = "unknown";
    const channelName = channel.name;
    if (channelName.includes("general")) {
      ticketType = "General Support";
    } else if (channelName.includes("ban_appeal")) {
      ticketType = "Ban Appeal";
    } else if (channelName.includes("gang_report")) {
      ticketType = "Gang Report";
    } else if (channelName.includes("tebex_support")) {
      ticketType = "Tebex Support";
    } else if (channelName.includes("staff_report")) {
      ticketType = "Staff Report";
    }
    const transcriptEmbed = new EmbedBuilder()
      .setTitle(`Transcript for ${channel.name}`)
      .setDescription(`Ticket type: **${ticketType}**\nClosed by: <@${client.user!.id}>`)
      .setColor(EMBED_COLOR)
      .setTimestamp();
    if (ticketCreatorId) {
      transcriptEmbed.addFields({ name: 'Ticket Creator', value: `<@${ticketCreatorId}>` });
      try {
        const guild = channel.guild;
        const member = await guild.members.fetch(ticketCreatorId);
        if (member) {
          transcriptEmbed.addFields(
            { name: 'User Tag', value: member.user.tag, inline: true },
            { name: 'User ID', value: member.id, inline: true },
            { name: 'Joined Server', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true }
          );
        }
      } catch (error) {
        console.log("Could not fetch ticket creator details:", error);
      }
    }
    await transcriptChannel.send({
      embeds: [transcriptEmbed],
      files: [transcript]
    });
  } catch (error) {
    console.error("Error saving ticket transcript:", error);
  }
}

export async function handleTicketUserInfo(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: false });
  try {
    const member = interaction.member as GuildMember;
    const hasStaffRole = member.roles.cache.has(STAFF_ROLE_ID || "");
    if (!hasStaffRole) {
      return interaction.editReply("You do not have permission to view user information. Only staff members can use this feature.");
    }
    const channel = interaction.channel as TextChannel;
    let ticketCreatorId = null;
    for (const [userId, channelId] of activeTickets.entries()) {
      if (channelId === channel.id) {
        ticketCreatorId = userId;
        break;
      }
    }
    if (!ticketCreatorId) {
      return interaction.editReply("Could not find the ticket creator. The ticket may not be properly tracked.");
    }
    try {
      const guild = interaction.guild;
      const member = await guild?.members.fetch(ticketCreatorId);
      if (!member) {
        return interaction.editReply("Could not fetch the user information. The user may have left the server.");
      }
      const mysqlConnection = interaction.client.mysqlConnection;
      if (!mysqlConnection) {
        return interaction.editReply("Database connection is not available.");
      }
      const userInfoEmbed = new EmbedBuilder()
        .setTitle(`Character Information for: ${member.user.tag}`)
        .setColor(EMBED_COLOR)
        .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
      userInfoEmbed.addFields({
        name: '**Account Details**',
        value: `\`\`\`diff\n+ Account ID: ${member.id}\n+ Username: ${member.user.username}\`\`\``, 
        inline: false
      });
      const discordIdWithPrefix = `discord:${member.id}`;
      const [userRows] = await mysqlConnection.execute(
        'SELECT * FROM users WHERE discord = ?',
        [discordIdWithPrefix]
      );
      let license: string | null = null;
      if (userRows && (userRows as any[]).length > 0) {
        license = (userRows as any[])[0].license2;
      } else {
        const [userRowsNoPrefix] = await mysqlConnection.execute(
          'SELECT * FROM users WHERE discord = ?',
          [member.id]
        );
        if (userRowsNoPrefix && (userRowsNoPrefix as any[]).length > 0) {
          license = (userRowsNoPrefix as any[])[0].license2;
        }
      }
      let identifiersValue = `\`\`\`\ndiscord:${member.id}\n`;
      if (license) {
        identifiersValue += `license2:${license}\n`;
      }
      identifiersValue += `\`\`\``;
      userInfoEmbed.addFields({
        name: '**Identifiers**',
        value: identifiersValue,
        inline: false
      });
      if (license) {
        const [characters] = await mysqlConnection.execute(
          'SELECT * FROM players WHERE license = ?',
          [license]
        );
        if (characters && (characters as any[]).length > 0) {
          const characterList = (characters as any[]).map((char) => {
            let charName = char.name;
            try {
              if (char.charinfo) {
                const charInfo = JSON.parse(char.charinfo);
                charName = `${charInfo.firstname} ${charInfo.lastname}`;
              }
            } catch (e) {}
            return `ID: ${char.citizenid} | ${charName}`;
          }).join('\n');
          userInfoEmbed.addFields({
            name: '**👤 Characters**',
            value: `\`\`\`\n${characterList}\`\`\``, 
            inline: false
          });
          const char = (characters as any[])[0];
          let charInfo;
          try {
            charInfo = JSON.parse(char.charinfo);
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
          let money;
          try {
            money = JSON.parse(char.money);
          } catch (e) {
            money = {
              cash: 0,
              bank: 0,
              crypto: 0
            };
          }
          let job;
          try {
            job = JSON.parse(char.job);
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
          let gang = "None";
          try {
            const gangData = JSON.parse(char.gang);
            if (gangData && gangData.name && gangData.name !== "none") {
              gang = `${gangData.label} (${gangData.name})`;
            }
          } catch (e) {}
          userInfoEmbed.addFields({
            name: `**Main Character: ${charInfo.firstname} ${charInfo.lastname}**`,
            value: `\`\`\`diff\n+ Gender: ${charInfo.gender === 0 ? "Male" : "Female"}\n+ Birthdate: ${charInfo.birthdate}\n+ Job: ${job.label} (${job.grade.name})\n+ Gang: ${gang}\n+ Cash: $${money.cash.toLocaleString()}\n+ Bank: $${money.bank.toLocaleString()}\`\`\``, 
            inline: false
          });
        } else {
          userInfoEmbed.addFields({
            name: '**Characters**',
            value: 'No characters found',
            inline: false
          });
        }
      }
      let bans: any[] = [];
      let warns: any[] = [];
      let kicks: any[] = [];
      try {
        const PLAYERS_DB_PATH = process.env.TXADMIN_PLAYERS_DB_PATH || 'c:/Users/61432/Desktop/txData/default/data/playersDB.json';
        if (fs.existsSync(PLAYERS_DB_PATH)) {
          const fileContent = fs.readFileSync(PLAYERS_DB_PATH, 'utf8');
          const playersDB = JSON.parse(fileContent);
          if (playersDB && playersDB.actions && Array.isArray(playersDB.actions)) {
            const identifier = `discord:${member.id}`;
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
            bans.sort((a, b) => b.timestamp - a.timestamp);
            warns.sort((a, b) => b.timestamp - a.timestamp);
            kicks.sort((a, b) => b.timestamp - a.timestamp);
          }
        }
      } catch (error) {
        console.error("Error loading TxAdmin history:", error);
      }
      userInfoEmbed.addFields({ 
        name: '**Moderation History**', 
        value: [
          bans.length > 0 ? `🛑 Bans: ${bans.length}` : '',
          warns.length > 0 ? `⚠️ Warnings: ${warns.length}` : '',
          kicks.length > 0 ? `🔵 Kicks: ${kicks.length}` : '',
          (bans.length === 0 && warns.length === 0 && kicks.length === 0) ? 'No moderation history found' : ''
        ].filter(Boolean).join('\n'),
        inline: false 
      });
      userInfoEmbed.setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      });
      const buttons = new ActionRowBuilder<ButtonBuilder>();
      if (bans.length > 0) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`view_bans_${member.id}`)
            .setLabel(`View Bans (${bans.length})`)
            .setEmoji('🛑')
            .setStyle(ButtonStyle.Danger)
        );
      }
      if (warns.length > 0) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`view_warnings_${member.id}`)
            .setLabel(`View Warnings (${warns.length})`)
            .setEmoji('⚠️')
            .setStyle(ButtonStyle.Primary)
        );
      }
      if (kicks.length > 0) {
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`view_kicks_${member.id}`)
            .setLabel(`View Kicks (${kicks.length})`)
            .setEmoji('🔵')
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (buttons.components.length > 0) {
        await interaction.editReply({
          embeds: [userInfoEmbed],
          components: [buttons]
        });
      } else {
        await interaction.editReply({
          embeds: [userInfoEmbed]
        });
      }
    } catch (error) {
      console.error("Error fetching user info:", error);
      await interaction.editReply("An error occurred while fetching user information.");
    }
  } catch (error) {
    console.error("Error handling user info:", error);
    return interaction.editReply("An error occurred while processing the user info request.");
  }
}

export async function handleTicketAddUser(interaction: ButtonInteraction) {
  try {
    const member = interaction.member as GuildMember;
    const hasStaffRole = member.roles.cache.has(STAFF_ROLE_ID || "");
    if (!hasStaffRole) {
      return interaction.reply({ content: "You do not have permission to add users to this ticket.", ephemeral: true });
    }
    const userSelect = new ActionRowBuilder<UserSelectMenuBuilder>()
      .addComponents(
        new UserSelectMenuBuilder()
          .setCustomId('ticket_add_user_select')
          .setPlaceholder('Select a user to add to the ticket')
          .setMaxValues(1)
      );
    await interaction.reply({
      content: "Please select a user to add to the ticket:",
      components: [userSelect],
      ephemeral: true
    });
  } catch (error) {
    console.error("Error handling add user:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: "An error occurred while trying to add a user to the ticket.", 
        ephemeral: true 
      });
    }
  }
}

export async function handleTicketAddUserSelect(interaction: UserSelectMenuInteraction) {
  await interaction.deferUpdate();
  try {
    const channel = interaction.channel as TextChannel;
    const selectedUserId = interaction.values[0];
    await channel.permissionOverwrites.create(selectedUserId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    });
    await channel.send({
      content: `<@${selectedUserId}> has been added to the ticket by <@${interaction.user.id}>.`
    });
    await interaction.editReply({
      content: `Successfully added <@${selectedUserId}> to the ticket.`,
      components: []
    });
  } catch (error) {
    console.error("Error adding user to ticket:", error);
    await interaction.editReply({
      content: "An error occurred while adding the user to the ticket.",
      components: []
    });
  }
}

export async function handleViewBans(interaction: ButtonInteraction) {
  await interaction.deferReply();
  try {
    const userId = interaction.customId.split('_')[2];
    const PLAYERS_DB_PATH = process.env.TXADMIN_PLAYERS_DB_PATH || 'c:/Users/61432/Desktop/txData/default/data/playersDB.json';
    if (!fs.existsSync(PLAYERS_DB_PATH)) {
      return interaction.editReply("Error: Could not find the txAdmin players database.");
    }
    const fileContent = fs.readFileSync(PLAYERS_DB_PATH, 'utf8');
    const playersDB = JSON.parse(fileContent);
    if (!playersDB || !playersDB.actions || !Array.isArray(playersDB.actions)) {
      return interaction.editReply('Error: The txAdmin players database has an invalid format.');
    }
    const identifier = `discord:${userId}`;
    const bans: any[] = [];
    for (const action of playersDB.actions) {
      const matchesIdentifier = 
        (action.playerName && action.playerName.toLowerCase().includes(identifier)) ||
        (action.ids && Array.isArray(action.ids) && action.ids.some(id => id.toLowerCase().includes(identifier)));
      if (matchesIdentifier && action.type === 'ban') {
        bans.push(action);
      }
    }
    if (bans.length === 0) {
      return interaction.editReply("No ban records found for this user.");
    }
    bans.sort((a, b) => b.timestamp - a.timestamp);
    const banHistoryEmbed = new EmbedBuilder()
      .setTitle(`Ban History`)
      .setColor('Red')
      .setDescription(`Showing ${bans.length} ban record(s).`)
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();
    const maxBansToShow = Math.min(5, bans.length);
    for (let i = 0; i < maxBansToShow; i++) {
      const ban = bans[i];
      let banExpiry = "Permanent";
      if (ban.expiration) {
        const expiryDate = new Date(ban.expiration * 1000);
        banExpiry = expiryDate < new Date() ? 
          "Expired" : 
          `${expiryDate.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${expiryDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
      }
      banHistoryEmbed.addFields({ 
        name: `🔴 **${i === 0 ? 'Most Recent Ban' : `Ban #${i + 1}`}**`,
        value: `\`\`\`diff\n- Ban Details\n+ By: ${ban.author || 'Unknown'}\n+ When: ${new Date(ban.timestamp * 1000).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n+ Expiration: ${banExpiry}\n+ Reason: ${ban.reason || 'No reason provided'}\n+ Revoked: ${ban.revocation && ban.revocation.timestamp ? 'Yes' : 'No'}\`\`\``,
        inline: false
      });
    }
    if (bans.length > maxBansToShow) {
      banHistoryEmbed.addFields({
        name: '⚠️ Additional Bans',
        value: `There are ${bans.length - maxBansToShow} more ban records not shown here.`,
        inline: false
      });
    }
    const backButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`back_to_info_${userId}`)
          .setLabel('Back to Player Info')
          .setStyle(ButtonStyle.Secondary)
      );
    await interaction.editReply({
      embeds: [banHistoryEmbed],
      components: [backButton]
    });
  } catch (error) {
    console.error("Error handling view bans:", error);
    return interaction.editReply("An error occurred while retrieving ban records.");
  }
}

export async function handleViewWarnings(interaction: ButtonInteraction) {
  await interaction.deferReply();
  try {
    const userId = interaction.customId.split('_')[2];
    const PLAYERS_DB_PATH = process.env.TXADMIN_PLAYERS_DB_PATH || 'c:/Users/61432/Desktop/txData/default/data/playersDB.json';
    if (!fs.existsSync(PLAYERS_DB_PATH)) {
      return interaction.editReply("Error: Could not find the txAdmin players database.");
    }
    const fileContent = fs.readFileSync(PLAYERS_DB_PATH, 'utf8');
    const playersDB = JSON.parse(fileContent);
    if (!playersDB || !playersDB.actions || !Array.isArray(playersDB.actions)) {
      return interaction.editReply('Error: The txAdmin players database has an invalid format.');
    }
    const identifier = `discord:${userId}`;
    const warnings: any[] = [];
    for (const action of playersDB.actions) {
      const matchesIdentifier = 
        (action.playerName && action.playerName.toLowerCase().includes(identifier)) ||
        (action.ids && Array.isArray(action.ids) && action.ids.some(id => id.toLowerCase().includes(identifier)));
      if (matchesIdentifier && action.type === 'warn') {
        warnings.push(action);
      }
    }
    if (warnings.length === 0) {
      return interaction.editReply("No warning records found for this user.");
    }
    warnings.sort((a, b) => b.timestamp - a.timestamp);
    const warningHistoryEmbed = new EmbedBuilder()
      .setTitle(`Warning History`)
      .setColor('Yellow')
      .setDescription(`Showing ${warnings.length} warning record(s).`)
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();
    const maxWarnsToShow = Math.min(5, warnings.length);
    for (let i = 0; i < maxWarnsToShow; i++) {
      const warning = warnings[i];
      warningHistoryEmbed.addFields({ 
        name: `⚠️ **${i === 0 ? 'Most Recent Warning' : `Warning #${i + 1}`}**`,
        value: `\`\`\`diff\n- Warning Details\n+ By: ${warning.author || 'Unknown'}\n+ When: ${new Date(warning.timestamp * 1000).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n+ Reason: ${warning.reason || 'No reason provided'}\n+ Revoked: ${warning.revocation && warning.revocation.timestamp ? 'Yes' : 'No'}\`\`\``,
        inline: false
      });
    }
    if (warnings.length > maxWarnsToShow) {
      warningHistoryEmbed.addFields({
        name: '⚠️ Additional Warnings',
        value: `There are ${warnings.length - maxWarnsToShow} more warning records not shown here.`,
        inline: false
      });
    }
    const backButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`back_to_info_${userId}`)
          .setLabel('Back to Player Info')
          .setStyle(ButtonStyle.Secondary)
      );
    await interaction.editReply({
      embeds: [warningHistoryEmbed],
      components: [backButton]
    });
  } catch (error) {
    console.error("Error handling view warnings:", error);
    return interaction.editReply("An error occurred while retrieving warning records.");
  }
}

export async function handleViewKicks(interaction: ButtonInteraction) {
  await interaction.deferReply();
  try {
    const userId = interaction.customId.split('_')[2];
    const PLAYERS_DB_PATH = process.env.TXADMIN_PLAYERS_DB_PATH || 'c:/Users/61432/Desktop/txData/default/data/playersDB.json';
    if (!fs.existsSync(PLAYERS_DB_PATH)) {
      return interaction.editReply("Error: Could not find the txAdmin players database.");
    }
    const fileContent = fs.readFileSync(PLAYERS_DB_PATH, 'utf8');
    const playersDB = JSON.parse(fileContent);
    if (!playersDB || !playersDB.actions || !Array.isArray(playersDB.actions)) {
      return interaction.editReply('Error: The txAdmin players database has an invalid format.');
    }
    const identifier = `discord:${userId}`;
    const kicks: any[] = [];
    for (const action of playersDB.actions) {
      const matchesIdentifier = 
        (action.playerName && action.playerName.toLowerCase().includes(identifier)) ||
        (action.ids && Array.isArray(action.ids) && action.ids.some(id => id.toLowerCase().includes(identifier)));
      if (matchesIdentifier && action.type === 'kick') {
        kicks.push(action);
      }
    }
    if (kicks.length === 0) {
      return interaction.editReply("No kick records found for this user.");
    }
    kicks.sort((a, b) => b.timestamp - a.timestamp);
    const kickHistoryEmbed = new EmbedBuilder()
      .setTitle(`Kick History`)
      .setColor('Blue')
      .setDescription(`Showing ${kicks.length} kick record(s).`)
      .setFooter({ text: `Requested by ${interaction.user.tag}` })
      .setTimestamp();
    const maxKicksToShow = Math.min(5, kicks.length);
    for (let i = 0; i < maxKicksToShow; i++) {
      const kick = kicks[i];
      kickHistoryEmbed.addFields({ 
        name: `🔵 **${i === 0 ? 'Most Recent Kick' : `Kick #${i + 1}`}**`,
        value: `\`\`\`diff\n- Kick Details\n+ By: ${kick.author || 'Unknown'}\n+ When: ${new Date(kick.timestamp * 1000).toLocaleString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}\n+ Reason: ${kick.reason || 'No reason provided'}\n+ Revoked: ${kick.revocation && kick.revocation.timestamp ? 'Yes' : 'No'}\`\`\``,
        inline: false
      });
    }
    if (kicks.length > maxKicksToShow) {
      kickHistoryEmbed.addFields({
        name: '⚠️ Additional Kicks',
        value: `There are ${kicks.length - maxKicksToShow} more kick records not shown here.`,
        inline: false
      });
    }
    const backButton = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`back_to_info_${userId}`)
          .setLabel('Back to Player Info')
          .setStyle(ButtonStyle.Secondary)
      );
    await interaction.editReply({
      embeds: [kickHistoryEmbed],
      components: [backButton]
    });
  } catch (error) {
    console.error("Error handling view kicks:", error);
    return interaction.editReply("An error occurred while retrieving kick records.");
  }
}

export async function handleBackToInfo(interaction: ButtonInteraction) {
  await interaction.deferUpdate();
  try {
    await handleTicketUserInfo(interaction);
  } catch (error) {
    console.error("Error handling back to info:", error);
    await interaction.followUp({
      content: "An error occurred while returning to player information.",
      ephemeral: true
    });
  }
}

function getTicketTypeName(type: string): string {
  switch (type) {
    case 'general':
      return 'General Support';
    case 'ban_appeal':
      return 'Ban Appeal';
    case 'gang_report':
      return 'Gang Report';
    case 'tebex_support':
      return 'Tebex Support';
    case 'staff_report':
      return 'Staff Report';
    default:
      return 'Support';
  }
}