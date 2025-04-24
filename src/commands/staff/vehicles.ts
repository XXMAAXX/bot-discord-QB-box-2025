import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Client, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import dotenv from 'dotenv';
import { EMBED_COLOR } from '../../utils/constants';

// Load environment variables
dotenv.config();

// Get the staff role ID from environment variables
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

export const data = new SlashCommandBuilder()
  .setName("vehicles")
  .setDescription("Retrieves vehicle information from the database.")
  .addUserOption(option => 
    option.setName("user")
      .setDescription("Discord user to look up vehicles for")
      .setRequired(false)
  );
  
export async function execute(
  client: Client,
  interaction: ChatInputCommandInteraction
) {
  // Check if the user has the staff role from the env file
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
    let citizenid: string | null = null;
    

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
    

    let allVehicles: any[] = [];
    
    for (const character of (characters as any[])) {
      citizenid = character.citizenid;
      

      const [vehicles] = await mysqlConnection.execute(
        'SELECT * FROM player_vehicles WHERE citizenid = ?',
        [citizenid]
      );
      
      if (vehicles && (vehicles as any[]).length > 0) {

        const vehiclesWithCharInfo = (vehicles as any[]).map(vehicle => {
          let charName = character.name;
          try {
            if (character.charinfo) {
              const charInfo = JSON.parse(character.charinfo);
              charName = `${charInfo.firstname} ${charInfo.lastname}`;
            }
          } catch (e) {}
          
          return {
            ...vehicle,
            ownerName: charName,
            citizenid: character.citizenid
          };
        });
        
        allVehicles = [...allVehicles, ...vehiclesWithCharInfo];
      }
    }
    
    if (allVehicles.length === 0) {
      return interaction.editReply(`No vehicles found for ${targetUser.username}'s characters.`);
    }
    

    const vehicleList = allVehicles.map((vehicle, index) => {
      return `${index + 1}. ${vehicle.vehicle || "Unknown"} - 🔑 Plate: \`${vehicle.plate}\` - 👤 Owner: ${vehicle.ownerName}`;
    }).join('\n');
    

    const selectionEmbed = new EmbedBuilder()
      .setTitle(`Vehicles for ${targetUser.username}`)
      .setDescription(vehicleList)
      .addFields({ name: "Selection", value: "Choose a vehicle to view its contents" })
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
    const maxRows = 5; 
    
    // Add numbered buttons for each vehicle (limit to 25 total buttons - 5 rows of 5)
    allVehicles.slice(0, maxButtonsPerRow * maxRows).forEach((vehicle, index) => {
      // If we've reached max buttons in this row, create a new row blame discords shitty api rate limiting
      if (buttonsInCurrentRow >= maxButtonsPerRow) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder<ButtonBuilder>();
        buttonsInCurrentRow = 0;
      }
      
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`vehicle-${vehicle.plate}`)
          .setLabel(`${index + 1}. ${vehicle.plate}`)
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
      time: 60000 // 1 minute timeout
    });
    
    collector.on('collect', async i => {
      if (i.user.id === interaction.user.id) {
        const selectedPlate = i.customId.replace('vehicle-', '');
        const selectedVehicle = allVehicles.find(v => v.plate === selectedPlate);
        if (selectedVehicle) {
          await fetchAndDisplayVehicle(client, interaction, selectedVehicle, i);
        } else {
          await i.reply({ content: "Vehicle not found.", ephemeral: true });
        }
        collector.stop();
      } else {
        i.reply({ content: "You cannot use this menu.", ephemeral: true });
      }
    });
    
    collector.on('end', collected => {
      if (collected.size === 0) {
        interaction.editReply({
          content: "Vehicle selection timed out.",
          embeds: [],
          components: []
        });
      }
    });
    
  } catch (error) {
    console.error(`Error in /vehicles command: ${error.message}`);
    return interaction.editReply(`An error occurred: ${error.message}`);
  }
}

async function fetchAndDisplayVehicle(
  client: Client, 
  interaction: ChatInputCommandInteraction, 
  vehicle: any,
  componentInteraction?: any
) {
  try {
    let trunkItems = "Empty";
    try {
      if (vehicle.trunk) {
        const trunk = JSON.parse(vehicle.trunk);
        if (trunk && Array.isArray(trunk) && trunk.length > 0) {
          trunkItems = trunk
            .map((item) => {
              if (item && item.name) {
                return `${item.name} x${item.count || 1}${item.metadata ? " (Has metadata)" : ""}`;
              }
              return null;
            })
            .filter(Boolean)
            .join('\n');
          
          if (!trunkItems) {
            trunkItems = "Empty";
          }
        }
      }
    } catch (e) {
      trunkItems = "Error parsing trunk data";
    }
    
    let gloveboxItems = "Empty";
    try {
      if (vehicle.glovebox) {
        const glovebox = JSON.parse(vehicle.glovebox);
        if (glovebox && Array.isArray(glovebox) && glovebox.length > 0) {
          gloveboxItems = glovebox
            .map((item) => {
              if (item && item.name) {
                return `${item.name} x${item.count || 1}${item.metadata ? " (Has metadata)" : ""}`;
              }
              return null;
            })
            .filter(Boolean)
            .join('\n');
          
          if (!gloveboxItems) {
            gloveboxItems = "Empty";
          }
        }
      }
    } catch (e) {
      gloveboxItems = "Error parsing glovebox data";
    }
    
    const vehicleDetails = `\`\`\`diff
+ Vehicle: ${vehicle.vehicle || "Unknown"}
+ License Plate: ${vehicle.plate}
+ Garage: ${vehicle.garage || "Unknown"}
+ State: ${vehicle.state === 1 ? "Garaged" : vehicle.state === 0 ? "Out" : vehicle.state}
+ Owner: ${vehicle.ownerName} (${vehicle.citizenid})
\`\`\``;

    const vehicleStatus = `\`\`\`diff
+ Fuel: ${vehicle.fuel || 0}%
+ Engine Health: ${vehicle.engine ? ((vehicle.engine / 1000) * 100).toFixed(1) + '%' : 'Unknown'}
+ Body Health: ${vehicle.body ? ((vehicle.body / 1000) * 100).toFixed(1) + '%' : 'Unknown'}
+ Driving Distance: ${vehicle.drivingdistance ? vehicle.drivingdistance.toLocaleString() + ' m' : 'Unknown'}
\`\`\``;
    
    const trunkContent = `\`\`\`diff
${trunkItems === "Empty" ? "- Empty" : trunkItems.split('\n').map(item => `+ ${item}`).join('\n')}
\`\`\``;
    
    const gloveboxContent = `\`\`\`diff
${gloveboxItems === "Empty" ? "- Empty" : gloveboxItems.split('\n').map(item => `+ ${item}`).join('\n')}
\`\`\``;
    
    const embed = new EmbedBuilder()
      .setTitle(`Vehicle: ${vehicle.vehicle || "Unknown"} (${vehicle.plate})`)
      .setColor(EMBED_COLOR)
      .addFields(
        { name: "🚗 Vehicle Details", value: vehicleDetails, inline: false },
        { name: "📊 Vehicle Status", value: vehicleStatus, inline: false },
        { name: "🧰 Trunk Contents", value: trunkContent, inline: false },
        { name: "🧤 Glovebox Contents", value: gloveboxContent, inline: false }
      )
      .setFooter({ 
        text: `Requested by ${interaction.user.tag} • Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        iconURL: interaction.user.displayAvatarURL() 
      })
      .setTimestamp();
    
    const reply = { embeds: [embed], components: [], ephemeral: false };
    if (componentInteraction) {
      return componentInteraction.update(reply);
    } else {
      return interaction.editReply(reply);
    }
    
  } catch (error) {
    console.error(`Error fetching vehicle: ${error.message}`);
    const errorReply = { 
      content: `An error occurred while fetching vehicle information: ${error.message}`,
      ephemeral: true 
    };
    
    if (componentInteraction) {
      return componentInteraction.update(errorReply);
    } else {
      return interaction.editReply(errorReply);
    }
  }
}