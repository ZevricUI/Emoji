const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require("discord.js");

const http = require("http");

// ============================================================
// CONFIG
// ============================================================

const TOKEN = process.env.DISCORD_TOKEN;

const CLIENT_ID = "1552807901536714862";
const GUILD_ID = "1424741330315378700";

const PORT = process.env.PORT || 3000;

// ============================================================
// TOKEN CHECK
// ============================================================

if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN is missing from Render Environment Variables.");
    process.exit(1);
}

// ============================================================
// RENDER WEB SERVER
// ============================================================

http.createServer((req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/plain"
    });

    res.end("ZeHub Emoji Bot is online!");
}).listen(PORT, () => {
    console.log(`🌐 Web server listening on port ${PORT}`);
});

// ============================================================
// DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ============================================================
// SLASH COMMAND
// ============================================================

const commands = [
    new SlashCommandBuilder()
        .setName("massemoji")
        .setDescription("Add multiple custom emojis to this server.")
        .addStringOption(option =>
            option
                .setName("emojis")
                .setDescription("Custom emojis separated by spaces")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageGuildExpressions.toString()
        )
].map(command => command.toJSON());

// ============================================================
// DEPLOY COMMAND
// ============================================================

const rest = new REST({
    version: "10"
}).setToken(TOKEN);

async function deployCommands() {
    try {
        console.log("🔄 Deploying /massemoji...");

        await rest.put(
            Routes.applicationGuildCommands(
                CLIENT_ID,
                GUILD_ID
            ),
            {
                body: commands
            }
        );

        console.log("✅ Successfully deployed /massemoji.");
    } catch (error) {
        console.error("❌ Command deployment failed:");
        console.error(error);
    }
}

// ============================================================
// DOWNLOAD EMOJI
// ============================================================

async function downloadEmoji(url) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 15000);

    try {
        const response = await fetch(url, {
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(
                `Discord CDN returned HTTP ${response.status}`
            );
        }

        const arrayBuffer = await response.arrayBuffer();

        return Buffer.from(arrayBuffer);

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error(
                "Emoji download timed out after 15 seconds."
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// ============================================================
// PARSE CUSTOM EMOJIS
// ============================================================

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

// ============================================================
// BOT READY
// ============================================================

client.once("clientReady", readyClient => {

    console.log(
        `🤖 Logged in as ${readyClient.user.tag}`
    );

    console.log(
        `🏠 Server: ${GUILD_ID}`
    );

    console.log(
        "✅ /massemoji is ready."
    );

});

// ============================================================
// COMMAND HANDLER
// ============================================================

client.on("interactionCreate", async interaction => {

    if (!interaction.isChatInputCommand()) {
        return;
    }

    if (interaction.commandName !== "massemoji") {
        return;
    }

    // ========================================================
    // PERMISSION CHECK
    // ========================================================

    if (
        !interaction.memberPermissions ||
        !interaction.memberPermissions.has(
            PermissionFlagsBits.ManageGuildExpressions
        )
    ) {

        return interaction.reply({
            content:
                "❌ You need the **Manage Expressions** permission to use this command.",
            ephemeral: true
        });

    }

    // ========================================================
    // GET EMOJIS
    // ========================================================

    const input = interaction.options.getString(
        "emojis",
        true
    );

    const emojis = parseEmojis(input);

    // ========================================================
    // NO EMOJIS FOUND
    // ========================================================

    if (!emojis.length) {

        return interaction.reply({
            content:
                "❌ I couldn't find any custom Discord emojis.\n\n" +
                "**Static:**\n" +
                "`<:emoji_name:123456789012345678>`\n\n" +
                "**Animated:**\n" +
                "`<a:emoji_name:123456789012345678>`",
            ephemeral: true
        });

    }

    // ========================================================
    // DEFER IMMEDIATELY
    // ========================================================

    await interaction.deferReply();

    // ========================================================
    // STATUS
    // ========================================================

    await interaction.editReply({
        content:
            `⏳ Importing **${emojis.length}** emoji` +
            `${emojis.length === 1 ? "" : "s"}...`
    });

    const added = [];
    const failed = [];
    const skipped = [];

    // ========================================================
    // IMPORT EMOJIS
    // ========================================================

    for (const emoji of emojis) {

        try {

            // ------------------------------------------------
            // Check exact emoji ID
            // ------------------------------------------------

            const existingById =
                interaction.guild.emojis.cache.get(
                    emoji.id
                );

            if (existingById) {

                skipped.push(
                    `\`${emoji.name}\` — already exists`
                );

                continue;
            }

            // ------------------------------------------------
            // Check duplicate name
            // ------------------------------------------------

            const existingByName =
                interaction.guild.emojis.cache.find(
                    existing => existing.name === emoji.name
                );

            if (existingByName) {

                skipped.push(
                    `\`${emoji.name}\` — name already exists`
                );

                continue;
            }

            // ------------------------------------------------
            // Emoji file type
            // ------------------------------------------------

            const extension = emoji.animated
                ? "gif"
                : "png";

            // ------------------------------------------------
            // Discord CDN URL
            // ------------------------------------------------

            const url =
                `https://cdn.discordapp.com/emojis/` +
                `${emoji.id}.${extension}` +
                `?size=256&quality=lossless`;

            console.log(
                `⬇️ Downloading ${emoji.name} (${emoji.id})`
            );

            // ------------------------------------------------
            // Download
            // ------------------------------------------------

            const image = await downloadEmoji(url);

            console.log(
                `⬆️ Adding ${emoji.name} to server`
            );

            // ------------------------------------------------
            // Create emoji
            // ------------------------------------------------

            const created =
                await interaction.guild.emojis.create({
                    attachment: image,
                    name: emoji.name,
                    reason:
                        `Mass emoji import by ${interaction.user.tag}`
                });

            added.push(
                `${created} \`${emoji.name}\``
            );

            console.log(
                `✅ Added ${emoji.name}`
            );

        } catch (error) {

            console.error(
                `❌ Failed to add ${emoji.name}:`,
                error
            );

            failed.push(
                `\`${emoji.name}\` — ${
                    error.message || "Unknown error"
                }`
            );

        }

    }

    // ========================================================
    // RESULT EMBED
    // ========================================================

    const embed = new EmbedBuilder()

        .setTitle(
            "🎨 ZeHub • Mass Emoji Import"
        )

        .setColor(0x5865F2)

        .setDescription(
            `Finished importing **${emojis.length}** emoji` +
            `${emojis.length === 1 ? "" : "s"}.`
        )

        .addFields(
            {
                name: "🟢 Added",
                value: String(added.length),
                inline: true
            },
            {
                name: "🟡 Skipped",
                value: String(skipped.length),
                inline: true
            },
            {
                name: "🔴 Failed",
                value: String(failed.length),
                inline: true
            }
        )

        .setTimestamp()

        .setFooter({
            text: "ZeHub • Emoji Manager"
        });

    // ========================================================
    // ADDED
    // ========================================================

    if (added.length) {

        embed.addFields({
            name: "🟢 Added Emojis",
            value: added
                .slice(0, 25)
                .join("\n")
                .slice(0, 1024)
        });

    }

    // ========================================================
    // SKIPPED
    // ========================================================

    if (skipped.length) {

        embed.addFields({
            name: "🟡 Skipped",
            value: skipped
                .slice(0, 25)
                .join("\n")
                .slice(0, 1024)
        });

    }

    // ========================================================
    // FAILED
    // ========================================================

    if (failed.length) {

        embed.addFields({
            name: "🔴 Failed",
            value: failed
                .slice(0, 25)
                .join("\n")
                .slice(0, 1024)
        });

    }

    // ========================================================
    // SEND RESULT
    // ========================================================

    await interaction.editReply({
        content: "",
        embeds: [embed]
    });

});

// ============================================================
// DISCORD ERRORS
// ============================================================

client.on("error", error => {

    console.error(
        "❌ Discord client error:",
        error
    );

});

// ============================================================
// UNHANDLED ERRORS
// ============================================================

process.on("unhandledRejection", error => {

    console.error(
        "❌ Unhandled promise rejection:",
        error
    );

});

process.on("uncaughtException", error => {

    console.error(
        "❌ Uncaught exception:",
        error
    );

});

// ============================================================
// START BOT
// ============================================================

(async () => {

    await deployCommands();

    try {

        await client.login(TOKEN);

    } catch (error) {

        console.error(
            "❌ Discord login failed:"
        );

        console.error(error);

        process.exit(1);

    }

})();
