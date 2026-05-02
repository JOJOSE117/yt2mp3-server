const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Buscar yt-dlp en todas las rutas posibles
function findYtDlp() {
    const paths = [
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        '/root/.local/bin/yt-dlp',
        '/home/user/.local/bin/yt-dlp',
        '/mise/installs/python/3.14.4/bin/yt-dlp',
        '/mise/installs/python/3.14.3/bin/yt-dlp',
        '/mise/installs/python/3.14.2/bin/yt-dlp',
        '/mise/installs/python/3.13.0/bin/yt-dlp',
    ];

    // Intentar which primero
    try {
        const result = execSync('find /mise -name "yt-dlp" 2>/dev/null | head -1')
            .toString().trim();
        if (result) {
            console.log(`yt-dlp encontrado via find: ${result}`);
            return result;
        }
    } catch(e) {}

    // Buscar en rutas conocidas
    for (const p of paths) {
        if (fs.existsSync(p)) {
            console.log(`yt-dlp encontrado en: ${p}`);
            return p;
        }
    }

    // Intentar con python -m yt_dlp
    console.log('Usando python3 -m yt_dlp como fallback');
    return null;
}

const ytdlpBin = findYtDlp();
const ytdlpCmd = ytdlpBin ? `"${ytdlpBin}"` : 'python3 -m yt_dlp';

console.log(`Usando comando: ${ytdlpCmd}`);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', cmd: ytdlpCmd });
});

app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'URL requerida' });

    const isYoutube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    if (!isYoutube) return res.status(400).json({ error: 'Solo URLs de YouTube' });

    const outputFile = `/tmp/audio_${Date.now()}.m4a`;
    const cmd = `${ytdlpCmd} -x --audio-format m4a --audio-quality 128K --no-playlist -o "${outputFile}" "${videoUrl}"`;

    console.log(`Ejecutando: ${cmd}`);

    exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', stderr);
            return res.status(500).json({ 
                error: 'Error al procesar', 
                details: stderr
            });
        }

        if (!fs.existsSync(outputFile)) {
            return res.status(500).json({ error: 'No se generó el archivo' });
        }

        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="audio.m4a"');

        const stream = fs.createReadStream(outputFile);
        stream.pipe(res);
        stream.on('end', () => { try { fs.unlinkSync(outputFile); } catch(e) {} });
        stream.on('error', () => res.status(500).json({ error: 'Error al enviar' }));
    });
});

app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
    console.log(`Comando yt-dlp: ${ytdlpCmd}`);
});
