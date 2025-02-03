const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const xml2js = require('xml2js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const PUBLIC_CHANNEL = "1335888194230681664"; // Public BINs
const PRIVATE_CHANNEL = "1335888215219109908"; // Private BINs
const INVALID_CHANNEL = "1335890420802129951"; // Invalid BINs Channel
const STATUS_CHANNEL = "1335890667322216471"; // Start/Off Channel
const BIN_API_KEY = "eec8c471edeb5cd7f619f0a98f306ba2"; // Bincodes API Key

let botStatus = 'off'; // Default status
let isCheckingActive = true; // Default is that BIN checking is active

// Generate 6-digit Visa BIN (Visa starts with 4)
function generateVisaBIN() {
    // Generate a 6-digit Visa BIN starting with '4' 
    return `4${Math.floor(10000 + Math.random() * 89999)}`; // 6-digit Visa BIN, starting with '4'
}

// Function to check BIN details
async function checkBIN(bin) {
    const apiURL = `https://api.bincodes.com/bin/xml/${BIN_API_KEY}/${bin}/`;
    console.log(`🔍 Checking BIN: ${bin}`);

    try {
        const response = await axios.get(apiURL);
        console.log(`✅ API Response Received for ${bin}`);

        const result = await xml2js.parseStringPromise(response.data);
        if (!result.result || result.result.valid[0] !== "true") {
            console.log(`❌ Invalid BIN: ${bin}`);
            return { bin, invalid: true }; // Mark BIN as invalid
        }

        return {
            bin: result.result.bin[0],
            bank: result.result.bank[0] || "Unknown",
            card: result.result.card[0] || "Unknown",
            type: result.result.type[0] || "Unknown",
            level: result.result.level[0] || "Unknown",
            country: result.result.country[0] || "Unknown",
            private: result.result.level[0]?.toLowerCase().includes("corporate"),
            invalid: false
        };

    } catch (error) {
        console.error(`🚨 API Error for BIN ${bin}:`, error.message);
        return { bin, invalid: true }; // Mark BIN as invalid in case of API failure
    }
}

// Function to send BIN details to the correct channel
async function sendBINToChannel(binData) {
    let channelID;

    if (binData.invalid) {
        channelID = INVALID_CHANNEL; // Send invalid BINs here
    } else {
        channelID = binData.private ? PRIVATE_CHANNEL : PUBLIC_CHANNEL;
    }

    const channel = await client.channels.fetch(channelID).catch(() => null);

    if (!channel) {
        console.error(`❌ Channel ID ${channelID} not found or bot has no permission!`);
        return;
    }

    const embed = {
        color: binData.invalid ? 0xffa500 : binData.private ? 0xff0000 : 0x00ff00,
        title: binData.invalid ? `❌ Invalid BIN: ${binData.bin}` : `💳 Visa BIN Info: ${binData.bin}`,
        fields: binData.invalid
            ? [{ name: "⚠️ Status", value: "Invalid BIN", inline: false }]
            : [
                { name: "🏦 Bank", value: binData.bank, inline: false },
                { name: "💳 Card Type", value: binData.type, inline: true },
                { name: "🏷️ Card Brand", value: binData.card, inline: true },
                { name: "🌍 Country", value: binData.country, inline: false },
                { name: "⚡ Level", value: binData.level, inline: true }
            ],
        footer: { text: "🔥 Powered by Bincodes API" }
    };

    try {
        await channel.send({ embeds: [embed] });
        console.log(`📩 Sent BIN ${binData.bin} to channel ${channelID}`);
    } catch (err) {
        console.error(`❌ Error sending message to ${channelID}:`, err.message);
    }
}

// Function to send Start or Off status to the status channel
async function sendStatus() {
    const channel = await client.channels.fetch(STATUS_CHANNEL).catch(() => null);

    if (!channel) {
        console.error(`❌ Status channel ${STATUS_CHANNEL} not found or bot has no permission!`);
        return;
    }

    const embed = {
        color: botStatus === 'off' ? 0xff0000 : 0x00ff00,
        title: botStatus === 'off' ? "🔴 Bot is OFF" : "🟢 Bot is STARTED",
        description: `The bot is currently **${botStatus}**.`,
        footer: { text: "Bot status update" }
    };

    // Delete previous messages
    const messages = await channel.messages.fetch({ limit: 100 });
    messages.forEach(message => message.delete());

    // Send the status embed
    try {
        await channel.send({ embeds: [embed] });
        console.log(`📩 Sent status to channel ${STATUS_CHANNEL}`);
    } catch (err) {
        console.error(`❌ Error sending status to ${STATUS_CHANNEL}:`, err.message);
    }
}

// Function to generate and check BINs automatically (Visa Only)
async function generateAndCheckBINs() {
    if (!isCheckingActive) return; // Stop checking if flag is false

    const bin = generateVisaBIN();
    const binData = await checkBIN(bin);

    if (binData) {
        await sendBINToChannel(binData);
    }
}

// Run every 5 seconds for BINs
setInterval(generateAndCheckBINs, 5000);

// Listen for the command to stop BIN checking
client.on('messageCreate', async (message) => {
    if (message.channel.id === STATUS_CHANNEL && message.content.toLowerCase() === "!stopbin") {
        isCheckingActive = false; // Stop BIN checking
        await message.reply("BIN checking has been **stopped**.");
    }
});

// Run every 10 minutes to update status
setInterval(() => {
    botStatus = botStatus === 'off' ? 'on' : 'off'; // Toggle status
    sendStatus();
}, 600000); // 10 minutes

// Send initial status when bot starts
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    botStatus = 'on'; // Set the status to 'on' when bot starts
    sendStatus(); // Send the initial status when bot starts
});

client.login(process.env.TOKEN);
