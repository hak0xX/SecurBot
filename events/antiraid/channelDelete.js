const { AuditLogEvent } = require("discord.js");
const axios = require('axios');
const header = require("../../util/headers.js");
const logs = require("../../util/logs.js");

module.exports = async (client, channel) => {
    try {
        const guild = channel.guild;
        const dbname = "channeldelete";
        const name = "Suppression de salon";
        const raison = `Antiraid | ${name}`;
        const head = header(client.token);
        const base = `https://discord.com/api/v10/guilds/${guild.id}`;
        
        const r = await axios.get(`${base}/audit-logs?limit=1&action_type=${AuditLogEvent.ChannelDelete}`, { headers: head });
        if (!r || !r.data.audit_log_entries.length) return;
        
        const executor = await guild.members.fetch(r.data.audit_log_entries[0].user_id).catch(() => null);
        if (!executor) return;

        const [antiraidResult] = await client.db.promise().query('SELECT status, whitelist, sanction FROM antiraid WHERE guild_id = ? AND event = ?', [guild.id, dbname]);
        if (!antiraidResult.length || !antiraidResult[0].status) return;

        const [whitelistResult] = await client.db.promise().query('SELECT * FROM whitelist WHERE guild_id = ? AND user_id = ?', [guild.id, executor.id]);
        const [ownerResult] = await client.db.promise().query('SELECT * FROM bot_owners WHERE user_id = ?', [executor.id]);

        let perm = client.user.id === executor.id || guild.ownerId === executor.id || 
                   client.config.owner.includes(executor.id) || ownerResult.length > 0 || 
                   (!antiraidResult[0].whitelist && whitelistResult.length > 0);

        if (!perm) {
            let punish = antiraidResult[0].sanction || "kick";
            let user_punish = false;

            const newChannel = await channel.clone({
                name: channel.name,
                type: channel.type,
                parent: channel.parent,
                topic: channel.topic,
                nsfw: channel.nsfw,
                bitrate: channel.bitrate,
                userLimit: channel.userLimit,
                rateLimitPerUser: channel.rateLimitPerUser,
                position: channel.position,
                permissionOverwrites: channel.permissionOverwrites.cache,
                reason: raison
            });

            if (punish === "ban") {
                user_punish = await executor.ban({ reason: raison }).then(() => true).catch(() => false);
            } else if (punish === "kick") {
                user_punish = await executor.kick(raison).then(() => true).catch(() => false);
            } else if (punish === "derank") {
                user_punish = await executor.roles.set([], raison).then(() => true).catch(() => false);
            }

            const logObj = {
                client: client,
                guild: guild,
                executor: executor.id,
                punish: user_punish ? `🟢 ${punish}` : `🔴 ${punish}`,
                name: name,
                salon: channel.name
            };

            logs(logObj);
        }
    } catch (error) {
        console.error("Erreur dans l'événement channelDelete:", error);
    }
};