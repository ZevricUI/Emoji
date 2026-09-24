const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const https = require("https");

// ==============================
// CONFIG
// ==============================

const TOKEN = process.env.DISCORD_TOKEN;

const CLIENT_ID = "1552807901536714862";
const GUILD_ID = "1424741330315378700";

// ==============================
// CLIENT
// ==============================

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ==============================
// COMMAND
// ==============================

const commands = [
    new SlashCommandBuilder()
        .setName("massemoji")
        .setDescription("Add multiple custom emojis to the server.")
        .setStringOption(option =>
            option
                .setName("emojis")
                .setDescription("Custom emojis separated by spaces")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuildExpressions.toString()
        )
].map(command => command.toJSON());

// ==============================
// DEPLOY COMMAND
// ==============================

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function deployCommands() {
    try {
        console.log("Deploying /massemoji...");

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            {
                body: commands
            }
        );

        console.log("Successfully deployed /massemoji.");
    } catch (error) {
        console.error("Command deployment failed:", error);
    }
}

// ==============================
// DOWNLOAD EMOJI
// ==============================

function downloadEmoji(url) {
    return new Promise((resolve, reject) => {
        https.get(url, response => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadEmoji(response.headers.location)
                    .then(resolve)
                    .catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const chunks = [];

            response.on("data", chunk => chunks.push(chunk));

            response.on("end", () => {
                resolve(Buffer.concat(chunks));
            });

            response.on("error", reject);
        }).on("error", reject);
    });
}

// ==============================
// PARSE EMOJIS
// ==============================

function parseEmojis(input) {
    const regex = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;

    const emojis = [];
    let match;

    while ((match = regex.exec(input)) !== null) {
        emojis.push({
            animated: match[1] === "a",
            name: match[2],
            id: match[3]
        });
    }

    return emojis;
}

// ==============================
// BOT READY
// ==============================

client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Server: ${GUILD_ID}`);
    console.log("/massemoji is ready.");
});

// ==============================
// COMMAND HANDLER
// ==============================

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName !== "massemoji") return;

    if (!interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuildExpressions
    )) {
        return interaction.reply({
            content: "❌ You need **Manage Expressions** permission to use this command.",
            ephemeral: true
        });
    }

    const input = interaction.options.getString("emojis");

    const emojis = parseEmojis(input);

    if (!emojis.length) {
        return interaction.reply({
            content:
                "❌ I couldn't find any custom emojis.\n\n" +
                "Example:\n" +
                "`/massemoji emojis: <:check:123456789> <:star:987654321>`",
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const added = [];
    const failed = [];
    const skipped = [];

    for (const emoji of emojis) {
        try {
            // Check if the name already exists
            const existing = interaction.guild.emojis.cache.find(
                e => e.name === emoji.name
            );

            if (existing) {
                skipped.push(`${emoji.name} — name already exists`);
                continue;
            }

            const extension = emoji.animated ? "gif" : "png";

            const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}?size=256&quality=lossless`;

            const image = await downloadEmoji(url);

            const created = await interaction.guild.emojis.create({
                attachment: image,
                name: emoji.name,
                reason: `Mass emoji import by ${interaction.user.tag}`
            });

            added.push(`${created} \`${emoji.name}\``);

        } catch (error) {
            console.error(`Failed to add ${emoji.name}:`, error);

            failed.push(
                `\`${emoji.name}\` — ${error.message || "Unknown error"}`
            );
        }
    }

    // ==============================
    // RESULT EMBED
    // ==============================

    const embed = new EmbedBuilder()
        .setTitle("🎨 Mass Emoji Import")
        .setColor(0x5865F2)
        .setTimestamp()
        .setFooter({
            text: "ZeHub • Emoji Manager"
        });

    embed.setDescription(
        `**Completed emoji import.**\n\n` +
        `🟢 **Added:** ${added.length}\n` +
        `🟡 **Skipped:** ${skipped.length}\n` +
        `🔴 **Failed:** ${failed.length}`
    );

    if (added.length) {
        embed.addFields({
            name: "🟢 Added",
            value: added.slice(0, 25).join("\n").slice(0, 1024)
        });
    }

    if (skipped.length) {
        embed.addFields({
            name: "🟡 Skipped",
            value: skipped.slice(0, 25).join("\n").slice(0, 1024)
        });
    }

    if (failed.length) {
        embed.addFields({
            name: "🔴 Failed",
            value: failed.slice(0, 25).join("\n").slice(0, 1024)
        });
    }

    await interaction.editReply({
        embeds: [embed]
    });
});

// ==============================
// START
// ==============================

(async () => {
    await deployCommands();

    client.login(TOKEN);
})();
